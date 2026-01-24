// Package docker provides Docker container lifecycle management.
package docker

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// ContainerInfo holds information about a running container.
type ContainerInfo struct {
	ContainerID string
	Port        int
	URL         string
}

// AgentResponse represents the response from forwarding to an agent.
type AgentResponse struct {
	Status  int
	Body    []byte
	Receipt map[string]interface{}
}

// Manager manages Docker containers for agents.
type Manager struct {
	client            *client.Client
	runningContainers map[string]*ContainerInfo
	containersMutex   sync.RWMutex
	nextPort          int
	portMutex         sync.Mutex
	imageCacheDir     string
	containerRuntime  string
}

// NewManager creates a new Docker Manager.
func NewManager(cacheDir string, startPort int, runtime string) (*Manager, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	// Verify Docker daemon is running
	ctx := context.Background()
	_, err = dockerClient.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf(`Docker daemon is not running.

To fix this:
  - macOS: Open Docker Desktop application
  - Linux: Run 'sudo systemctl start docker' or 'sudo service docker start'
  - Windows: Start Docker Desktop from the Start menu

If Docker is not installed:
  - macOS: brew install --cask docker
  - Linux: https://docs.docker.com/engine/install/
  - Windows: https://docs.docker.com/desktop/install/windows-install/

Underlying error: %w`, err)
	}

	return &Manager{
		client:            dockerClient,
		runningContainers: make(map[string]*ContainerInfo),
		nextPort:          startPort,
		imageCacheDir:     cacheDir,
		containerRuntime:  runtime,
	}, nil
}

// getVersionHash fetches HEAD from URL and creates a version hash from the response headers.
func (m *Manager) getVersionHash(url string) (string, error) {
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HEAD request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HEAD request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HEAD request failed: %d %s", resp.StatusCode, resp.Status)
	}

	// Build version string from available headers (prefer ETag > Last-Modified > Content-Length)
	var versionString string
	if etag := resp.Header.Get("ETag"); etag != "" {
		versionString = "etag:" + etag
	} else if lastModified := resp.Header.Get("Last-Modified"); lastModified != "" {
		versionString = "modified:" + lastModified
	} else if contentLength := resp.Header.Get("Content-Length"); contentLength != "" {
		versionString = "size:" + contentLength
	} else {
		versionString = "url:" + url
	}

	slog.Debug("Version identifier resolved", "url", url, "version", versionString)

	hash := sha256.Sum256([]byte(versionString))
	return hex.EncodeToString(hash[:8]), nil
}

// downloadImage downloads a container image from a URL.
func (m *Manager) downloadImage(url, versionHash string) (string, error) {
	if err := os.MkdirAll(m.imageCacheDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create cache directory: %w", err)
	}

	filePath := filepath.Join(m.imageCacheDir, versionHash+".tar")

	slog.Info("Downloading image", "url", url)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create GET request: %w", err)
	}
	req.Header.Set("Accept", "application/x-tar, application/octet-stream, */*")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download image: %d %s", resp.StatusCode, resp.Status)
	}

	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create cache file: %w", err)
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to write cache file: %w", err)
	}

	slog.Debug("Downloaded image", "path", filePath)
	return filePath, nil
}

// loadImage loads a Docker image from a tar file.
func (m *Manager) loadImage(tarPath string) (string, error) {
	slog.Debug("Loading Docker image", "path", tarPath)

	file, err := os.Open(tarPath)
	if err != nil {
		return "", fmt.Errorf("failed to open tar file: %w", err)
	}
	defer file.Close()

	ctx := context.Background()
	resp, err := m.client.ImageLoad(ctx, file, true)
	if err != nil {
		return "", fmt.Errorf("failed to load image: %w", err)
	}
	defer resp.Body.Close()

	var output bytes.Buffer
	io.Copy(&output, resp.Body)
	outputStr := output.String()

	re := regexp.MustCompile(`Loaded image[: ]+([^\s"\\]+)`)
	if match := re.FindStringSubmatch(outputStr); match != nil {
		return match[1], nil
	}

	scanner := bufio.NewScanner(strings.NewReader(outputStr))
	for scanner.Scan() {
		line := scanner.Text()
		var jsonLine struct {
			Stream string `json:"stream"`
		}
		if err := json.Unmarshal([]byte(line), &jsonLine); err == nil && jsonLine.Stream != "" {
			if match := re.FindStringSubmatch(jsonLine.Stream); match != nil {
				return match[1], nil
			}
		}
	}

	return "", fmt.Errorf("could not parse image name from: %s", outputStr)
}

// waitForContainerReady waits for a container to be ready to accept requests.
func (m *Manager) waitForContainerReady(port int, maxAttempts int, delayMs int) error {
	slog.Debug("Waiting for container", "port", port)

	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		url := fmt.Sprintf("http://localhost:%d/", port)
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			slog.Debug("Container ready", "port", port, "attempts", attempt)
			return nil
		}

		if attempt == maxAttempts {
			return fmt.Errorf("container did not become ready after %d attempts", maxAttempts)
		}

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	return nil
}

// stopContainer stops and removes a container by version hash.
func (m *Manager) stopContainer(versionHash string) error {
	m.containersMutex.Lock()
	info, exists := m.runningContainers[versionHash]
	if !exists {
		m.containersMutex.Unlock()
		return nil
	}
	delete(m.runningContainers, versionHash)
	m.containersMutex.Unlock()

	ctx := context.Background()
	slog.Info("Stopping container", "version", versionHash)

	timeout := 10
	if err := m.client.ContainerStop(ctx, info.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		slog.Warn("Failed to stop container", "version", versionHash, "error", err)
	}

	if err := m.client.ContainerRemove(ctx, info.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		slog.Error("Failed to remove container", "version", versionHash, "error", err)
		return err
	}

	slog.Info("Removed container", "version", versionHash)
	return nil
}

// EnsureAgentRunning ensures a container is running for the given agent URL and version.
func (m *Manager) EnsureAgentRunning(agentURL string) (int, bool, error) {
	versionHash, err := m.getVersionHash(agentURL)
	if err != nil {
		return 0, false, err
	}

	// Check if already running this exact version
	m.containersMutex.RLock()
	info, exists := m.runningContainers[versionHash]
	m.containersMutex.RUnlock()

	if exists {
		ctx := context.Background()
		containerJSON, err := m.client.ContainerInspect(ctx, info.ContainerID)
		if err == nil && containerJSON.State.Running {
			slog.Debug("Container already running", "version", versionHash, "port", info.Port)
			return info.Port, false, nil
		}
		m.containersMutex.Lock()
		delete(m.runningContainers, versionHash)
		m.containersMutex.Unlock()
	}

	// Check if there's an old version running for this URL and stop it
	m.containersMutex.RLock()
	var hashesToStop []string
	for hash, info := range m.runningContainers {
		if info.URL == agentURL && hash != versionHash {
			hashesToStop = append(hashesToStop, hash)
		}
	}
	m.containersMutex.RUnlock()

	for _, hash := range hashesToStop {
		slog.Info("Stopping outdated container", "agent_url", agentURL, "version", hash)
		m.stopContainer(hash)
	}

	// Download and load the image
	tarPath, err := m.downloadImage(agentURL, versionHash)
	if err != nil {
		return 0, false, err
	}

	imageName, err := m.loadImage(tarPath)
	if err != nil {
		return 0, false, err
	}
	slog.Info("Loaded image", "name", imageName)

	// Allocate port
	m.portMutex.Lock()
	hostPort := m.nextPort
	m.nextPort++
	m.portMutex.Unlock()

	containerName := fmt.Sprintf("agent-%s", versionHash)
	ctx := context.Background()

	// Cleanup orphaned container if exists
	if existingContainer, err := m.client.ContainerInspect(ctx, containerName); err == nil {
		slog.Info("Removing orphaned container", "name", containerName)
		m.client.ContainerRemove(ctx, existingContainer.ID, container.RemoveOptions{Force: true})
	}

	slog.Info("Starting container", "agent_url", agentURL, "version", versionHash, "port", hostPort)

	hostPortStr := fmt.Sprintf("%d", hostPort)
	containerConfig := &container.Config{
		Image: imageName,
		ExposedPorts: nat.PortSet{
			"80/tcp": struct{}{},
		},
		Labels: map[string]string{
			"agent-host.version-hash": versionHash,
			"agent-host.url":          agentURL,
		},
	}

	hostConfig := &container.HostConfig{
		PortBindings: nat.PortMap{
			"80/tcp": []nat.PortBinding{
				{HostIP: "0.0.0.0", HostPort: hostPortStr},
			},
		},
		Runtime: m.containerRuntime,
	}

	resp, err := m.client.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, containerName)
	if err != nil {
		return 0, false, fmt.Errorf("failed to create container: %w", err)
	}

	if err := m.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return 0, false, fmt.Errorf("failed to start container: %w", err)
	}

	m.containersMutex.Lock()
	m.runningContainers[versionHash] = &ContainerInfo{
		ContainerID: resp.ID,
		Port:        hostPort,
		URL:         agentURL,
	}
	m.containersMutex.Unlock()

	slog.Info("Container started", "url", fmt.Sprintf("http://localhost:%d", hostPort))

	if err := m.waitForContainerReady(hostPort, 30, 1000); err != nil {
		return 0, false, err
	}

	return hostPort, true, nil
}

// ForwardToAgent forwards a request to an agent container using JSON-in-JSON-out protocol.
func (m *Manager) ForwardToAgent(agentURL string, body []byte, headers map[string]string) (*AgentResponse, error) {
	port, _, err := m.EnsureAgentRunning(agentURL)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("http://localhost:%d/", port)

	requestHex := "0x" + hex.EncodeToString(body)
	requestID := headers["X-Request-Id"]

	jsonRequest := map[string]string{
		"requestId": requestID,
		"request":   requestHex,
	}

	jsonBody, err := json.Marshal(jsonRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to forward request: %w", err)
	}
	defer resp.Body.Close()

	responseText, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var responseBody []byte
	var receipt map[string]interface{}

	var jsonResponse map[string]interface{}
	if err := json.Unmarshal(responseText, &jsonResponse); err == nil {
		if result, ok := jsonResponse["result"].(string); ok {
			resultHex := strings.TrimPrefix(result, "0x")
			responseBody, _ = hex.DecodeString(resultHex)
		} else {
			responseBody = responseText
		}

		if _, hasSteps := jsonResponse["steps"]; hasSteps {
			receipt = jsonResponse
		}
	} else {
		responseBody = responseText
	}

	return &AgentResponse{
		Status:  resp.StatusCode,
		Body:    responseBody,
		Receipt: receipt,
	}, nil
}

// Cleanup removes all running containers.
func (m *Manager) Cleanup() {
	slog.Info("Cleaning up containers")

	m.containersMutex.Lock()
	defer m.containersMutex.Unlock()

	ctx := context.Background()
	for versionHash, info := range m.runningContainers {
		timeout := 10
		if err := m.client.ContainerStop(ctx, info.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
			slog.Warn("Failed to stop container", "version", versionHash, "error", err)
		}
		if err := m.client.ContainerRemove(ctx, info.ContainerID, container.RemoveOptions{Force: true}); err != nil {
			slog.Error("Failed to remove container", "version", versionHash, "error", err)
		} else {
			slog.Info("Removed container", "version", versionHash)
		}
	}

	m.runningContainers = make(map[string]*ContainerInfo)
}
