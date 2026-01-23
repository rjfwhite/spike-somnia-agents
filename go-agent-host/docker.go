package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
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

type ContainerInfo struct {
	ContainerID string
	Port        int
	URL         string
}

var (
	runningContainers = make(map[string]*ContainerInfo)
	containersMutex   sync.RWMutex
	nextPort          int
	portMutex         sync.Mutex
	dockerClient      *client.Client
	imageCacheDir     string
	containerRuntime  string
)

func initDockerConfig(cacheDir string, startPort int, runtime string) {
	imageCacheDir = cacheDir
	nextPort = startPort
	containerRuntime = runtime
}

func initDocker() error {
	var err error
	dockerClient, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create Docker client: %w", err)
	}

	// Verify Docker daemon is running
	ctx := context.Background()
	_, err = dockerClient.Ping(ctx)
	if err != nil {
		return fmt.Errorf(`Docker daemon is not running.

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

	return nil
}

// getVersionHash fetches HEAD from URL and creates a version hash from the response headers.
// Uses ETag if available, otherwise Last-Modified, otherwise Content-Length.
func getVersionHash(url string) (string, error) {
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
		// Fallback to URL hash if no version headers available
		versionString = "url:" + url
	}

	log.Printf("Version identifier for %s: %s", url, versionString)

	hash := sha256.Sum256([]byte(versionString))
	return hex.EncodeToString(hash[:8]), nil // Return first 16 hex chars (8 bytes)
}

// downloadImage downloads a container image from a URL
func downloadImage(url, versionHash string) (string, error) {
	if err := os.MkdirAll(imageCacheDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create cache directory: %w", err)
	}

	filePath := filepath.Join(imageCacheDir, versionHash+".tar")

	log.Printf("Downloading image from: %s", url)

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

	log.Printf("Downloaded to %s", filePath)
	return filePath, nil
}

// loadImage loads a Docker image from a tar file
func loadImage(tarPath string) (string, error) {
	log.Printf("Loading Docker image from %s...", tarPath)

	file, err := os.Open(tarPath)
	if err != nil {
		return "", fmt.Errorf("failed to open tar file: %w", err)
	}
	defer file.Close()

	ctx := context.Background()
	resp, err := dockerClient.ImageLoad(ctx, file, true)
	if err != nil {
		return "", fmt.Errorf("failed to load image: %w", err)
	}
	defer resp.Body.Close()

	// Read and parse the output to get the image name
	var output bytes.Buffer
	io.Copy(&output, resp.Body)
	outputStr := output.String()

	// Try to match "Loaded image: <name>" pattern
	re := regexp.MustCompile(`Loaded image[: ]+([^\s"\\]+)`)
	if match := re.FindStringSubmatch(outputStr); match != nil {
		return match[1], nil
	}

	// Try to parse as JSON stream
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

// waitForContainerReady waits for a container to be ready to accept requests
func waitForContainerReady(port int, maxAttempts int, delayMs int) error {
	log.Printf("Waiting for container to be ready on port %d...", port)

	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		url := fmt.Sprintf("http://localhost:%d/", port)
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			log.Printf("Container ready after %d attempt(s)", attempt)
			return nil
		}

		if attempt == maxAttempts {
			return fmt.Errorf("container did not become ready after %d attempts", maxAttempts)
		}

		time.Sleep(time.Duration(delayMs) * time.Millisecond)
	}

	return nil
}

// stopContainer stops and removes a container by version hash
func stopContainer(versionHash string) error {
	containersMutex.Lock()
	info, exists := runningContainers[versionHash]
	if !exists {
		containersMutex.Unlock()
		return nil
	}
	delete(runningContainers, versionHash)
	containersMutex.Unlock()

	ctx := context.Background()
	log.Printf("Stopping container for version %s...", versionHash)

	timeout := 10
	if err := dockerClient.ContainerStop(ctx, info.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		log.Printf("Failed to stop container %s: %v", versionHash, err)
	}

	if err := dockerClient.ContainerRemove(ctx, info.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		log.Printf("Failed to remove container %s: %v", versionHash, err)
		return err
	}

	log.Printf("Removed container %s", versionHash)
	return nil
}

// ensureAgentRunning ensures a container is running for the given agent URL and version.
// Downloads and starts if not already running the correct version.
func ensureAgentRunning(agentURL string) (int, bool, error) {
	versionHash, err := getVersionHash(agentURL)
	if err != nil {
		return 0, false, err
	}

	// Check if already running this exact version
	containersMutex.RLock()
	info, exists := runningContainers[versionHash]
	containersMutex.RUnlock()

	if exists {
		ctx := context.Background()
		containerJSON, err := dockerClient.ContainerInspect(ctx, info.ContainerID)
		if err == nil && containerJSON.State.Running {
			log.Printf("Container for version %s already running on port %d", versionHash, info.Port)
			return info.Port, false, nil
		}
		// Container gone, cleanup
		containersMutex.Lock()
		delete(runningContainers, versionHash)
		containersMutex.Unlock()
	}

	// Check if there's an old version running for this URL and stop it
	containersMutex.RLock()
	var hashesToStop []string
	for hash, info := range runningContainers {
		if info.URL == agentURL && hash != versionHash {
			hashesToStop = append(hashesToStop, hash)
		}
	}
	containersMutex.RUnlock()

	for _, hash := range hashesToStop {
		log.Printf("Found outdated container for %s, stopping...", agentURL)
		stopContainer(hash)
	}

	// Download and load the image
	tarPath, err := downloadImage(agentURL, versionHash)
	if err != nil {
		return 0, false, err
	}

	imageName, err := loadImage(tarPath)
	if err != nil {
		return 0, false, err
	}
	log.Printf("Loaded image: %s", imageName)

	// Allocate port
	portMutex.Lock()
	hostPort := nextPort
	nextPort++
	portMutex.Unlock()

	containerName := fmt.Sprintf("agent-%s", versionHash)
	ctx := context.Background()

	// Cleanup orphaned container if exists
	if existingContainer, err := dockerClient.ContainerInspect(ctx, containerName); err == nil {
		log.Printf("Found orphaned container %s, removing...", containerName)
		dockerClient.ContainerRemove(ctx, existingContainer.ID, container.RemoveOptions{Force: true})
	}

	// Create and start container
	log.Printf("Starting container for %s (version %s) on port %d...", agentURL, versionHash, hostPort)

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
		Runtime: containerRuntime,
	}

	resp, err := dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, containerName)
	if err != nil {
		return 0, false, fmt.Errorf("failed to create container: %w", err)
	}

	if err := dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return 0, false, fmt.Errorf("failed to start container: %w", err)
	}

	containersMutex.Lock()
	runningContainers[versionHash] = &ContainerInfo{
		ContainerID: resp.ID,
		Port:        hostPort,
		URL:         agentURL,
	}
	containersMutex.Unlock()

	log.Printf("Container started at http://localhost:%d", hostPort)

	// Wait for ready
	if err := waitForContainerReady(hostPort, 30, 1000); err != nil {
		return 0, false, err
	}

	return hostPort, true, nil
}

// AgentResponse represents the response from forwarding to an agent
type AgentResponse struct {
	Status  int
	Body    []byte
	Receipt map[string]interface{}
}

// forwardToAgent forwards a request to an agent container using JSON-in-JSON-out protocol.
// Request: { requestId: string, request: hex-encoded string }
// Response: { steps?: array, result: hex-encoded string }
func forwardToAgent(agentURL string, body []byte, headers map[string]string) (*AgentResponse, error) {
	port, _, err := ensureAgentRunning(agentURL)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("http://localhost:%d/", port)

	// Convert binary body to hex-encoded string and build JSON request
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

	// Try to parse as JSON
	var jsonResponse map[string]interface{}
	if err := json.Unmarshal(responseText, &jsonResponse); err == nil {
		// Extract result and convert from hex to binary
		if result, ok := jsonResponse["result"].(string); ok {
			resultHex := strings.TrimPrefix(result, "0x")
			responseBody, _ = hex.DecodeString(resultHex)
		} else {
			responseBody = responseText
		}

		// The full JSON response IS the receipt if it has steps
		if _, hasSteps := jsonResponse["steps"]; hasSteps {
			receipt = jsonResponse
		}
	} else {
		// If response is not JSON, treat as raw text/error
		responseBody = responseText
	}

	return &AgentResponse{
		Status:  resp.StatusCode,
		Body:    responseBody,
		Receipt: receipt,
	}, nil
}

// cleanupContainers removes all running containers
func cleanupContainers() {
	log.Println("Cleaning up containers...")

	containersMutex.Lock()
	defer containersMutex.Unlock()

	ctx := context.Background()
	for versionHash, info := range runningContainers {
		timeout := 10
		if err := dockerClient.ContainerStop(ctx, info.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
			log.Printf("Failed to stop container %s: %v", versionHash, err)
		}
		if err := dockerClient.ContainerRemove(ctx, info.ContainerID, container.RemoveOptions{Force: true}); err != nil {
			log.Printf("Failed to remove container %s: %v", versionHash, err)
		} else {
			log.Printf("Removed container %s", versionHash)
		}
	}

	runningContainers = make(map[string]*ContainerInfo)
}
