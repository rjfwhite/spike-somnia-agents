// Package agents provides agent container lifecycle management.
package agents

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
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	"github.com/somnia-chain/agent-runner/internal/metrics"
)

// ContainerInfo holds information about a running container.
type ContainerInfo struct {
	ContainerID string
	Port        int
	URL         string
}

// Response represents the response from forwarding to an agent.
type Response struct {
	Status  int
	Body    []byte
	Receipt map[string]interface{}
}

// versionCacheEntry holds a cached version hash with expiry time.
type versionCacheEntry struct {
	hash      string
	expiresAt time.Time
}

// SandboxNetworkConfig holds the sandbox network configuration.
type SandboxNetworkConfig struct {
	Name         string // Network name (e.g., "agent-sandbox")
	Gateway      string // Gateway IP on host (e.g., "172.30.0.1")
	ProxyPort    int    // Proxy port (e.g., 3128)
	LLMProxyPort int    // LLM proxy port (e.g., 11434), 0 = disabled
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
	startingMutex     sync.Map // Prevents concurrent starts of same container
	httpClient        *http.Client
	versionCache      map[string]*versionCacheEntry
	versionCacheMutex sync.RWMutex
	versionCacheTTL   time.Duration
	versionFetchMutex sync.Map              // Prevents concurrent HEAD requests for same URL
	sandboxNetwork    *SandboxNetworkConfig // Sandbox network configuration (nil = no sandbox network)
	agentRegistryAddr string                // AgentRegistry contract address for containers
}

// NewManager creates a new Manager with a pre-existing Docker client.
// Use this when the Docker client has already been created (e.g., by startup checks).
func NewManager(dockerClient *client.Client, cacheDir string, startPort int, runtime string) *Manager {
	return &Manager{
		client:            dockerClient,
		runningContainers: make(map[string]*ContainerInfo),
		nextPort:          startPort,
		imageCacheDir:     cacheDir,
		containerRuntime:  runtime,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		versionCache:    make(map[string]*versionCacheEntry),
		versionCacheTTL: 30 * time.Second,
	}
}

// Client returns the underlying Docker client.
func (m *Manager) Client() *client.Client {
	return m.client
}

// SetSandboxNetwork configures the sandbox network for container isolation.
// When set, containers will be attached to this network and have HTTP_PROXY
// environment variables injected to route traffic through the sandbox proxy.
// If llmProxyPort > 0, OpenAI-compatible environment variables will also be injected.
func (m *Manager) SetSandboxNetwork(networkName, gatewayIP string, proxyPort, llmProxyPort int) {
	m.sandboxNetwork = &SandboxNetworkConfig{
		Name:         networkName,
		Gateway:      gatewayIP,
		ProxyPort:    proxyPort,
		LLMProxyPort: llmProxyPort,
	}
	slog.Info("Sandbox network configured",
		"network", networkName,
		"gateway", gatewayIP,
		"proxy_port", proxyPort,
		"llm_proxy_port", llmProxyPort,
	)
}

// SetAgentRegistryAddress configures the AgentRegistry contract address for containers.
func (m *Manager) SetAgentRegistryAddress(addr string) {
	m.agentRegistryAddr = addr
	slog.Info("AgentRegistry address configured for containers", "address", addr)
}

// getVersionHash fetches HEAD from URL and creates a version hash from the response headers.
// Results are cached for versionCacheTTL to avoid redundant HEAD requests.
func (m *Manager) getVersionHash(agentURL string) (string, error) {
	// Check cache first
	m.versionCacheMutex.RLock()
	if entry, exists := m.versionCache[agentURL]; exists && time.Now().Before(entry.expiresAt) {
		m.versionCacheMutex.RUnlock()
		slog.Debug("Version hash cache hit", "url", agentURL, "hash", entry.hash)
		return entry.hash, nil
	}
	m.versionCacheMutex.RUnlock()

	// Prevent concurrent HEAD requests for the same URL
	fetchChan := make(chan struct{})
	actual, loaded := m.versionFetchMutex.LoadOrStore(agentURL, fetchChan)
	if loaded {
		// Another goroutine is fetching, wait for it
		<-actual.(chan struct{})
		// Check cache again - should be populated now
		m.versionCacheMutex.RLock()
		if entry, exists := m.versionCache[agentURL]; exists {
			m.versionCacheMutex.RUnlock()
			return entry.hash, nil
		}
		m.versionCacheMutex.RUnlock()
		return "", fmt.Errorf("concurrent version fetch failed for %s", agentURL)
	}
	defer func() {
		close(fetchChan)
		m.versionFetchMutex.Delete(agentURL)
	}()

	// Double-check cache after acquiring lock
	m.versionCacheMutex.RLock()
	if entry, exists := m.versionCache[agentURL]; exists && time.Now().Before(entry.expiresAt) {
		m.versionCacheMutex.RUnlock()
		return entry.hash, nil
	}
	m.versionCacheMutex.RUnlock()

	req, err := http.NewRequest("HEAD", agentURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create HEAD request: %w", err)
	}

	resp, err := m.httpClient.Do(req)
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
		versionString = "url:" + agentURL
	}

	slog.Debug("Version identifier resolved", "url", agentURL, "version", versionString)

	hash := sha256.Sum256([]byte(versionString))
	hashStr := hex.EncodeToString(hash[:8])

	// Update cache
	m.versionCacheMutex.Lock()
	m.versionCache[agentURL] = &versionCacheEntry{
		hash:      hashStr,
		expiresAt: time.Now().Add(m.versionCacheTTL),
	}
	m.versionCacheMutex.Unlock()

	return hashStr, nil
}

// downloadImage downloads a container image from a URL.
func (m *Manager) downloadImage(agentURL, versionHash string) (string, error) {
	start := time.Now()

	if err := os.MkdirAll(m.imageCacheDir, 0755); err != nil {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to create cache directory: %w", err)
	}

	filePath := filepath.Join(m.imageCacheDir, versionHash+".tar")

	slog.Info("Downloading image", "url", agentURL)

	req, err := http.NewRequest("GET", agentURL, nil)
	if err != nil {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to create GET request: %w", err)
	}
	req.Header.Set("Accept", "application/x-tar, application/octet-stream, */*")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to download image: %d %s", resp.StatusCode, resp.Status)
	}

	file, err := os.Create(filePath)
	if err != nil {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to create cache file: %w", err)
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "error").Inc()
		return "", fmt.Errorf("failed to write cache file: %w", err)
	}

	metrics.ImageDownloadsTotal.WithLabelValues(agentURL, "success").Inc()
	metrics.ImageDownloadDuration.WithLabelValues(agentURL).Observe(time.Since(start).Seconds())

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

// streamContainerLogs starts a goroutine that streams container logs to slog.
func (m *Manager) streamContainerLogs(containerID, versionHash, agentURL string) {
	go func() {
		ctx := context.Background()
		options := container.LogsOptions{
			ShowStdout: true,
			ShowStderr: true,
			Follow:     true,
			Timestamps: true,
		}

		logs, err := m.client.ContainerLogs(ctx, containerID, options)
		if err != nil {
			slog.Error("Failed to attach to container logs", "version", versionHash, "error", err)
			return
		}
		defer logs.Close()

		reader := bufio.NewReader(logs)
		for {
			// Docker multiplexes stdout/stderr with an 8-byte header
			header := make([]byte, 8)
			_, err := io.ReadFull(reader, header)
			if err != nil {
				if err != io.EOF {
					slog.Debug("Container log stream ended", "version", versionHash, "error", err)
				}
				return
			}

			// Header format: [stream_type, 0, 0, 0, size1, size2, size3, size4]
			streamType := header[0]
			size := int(header[4])<<24 | int(header[5])<<16 | int(header[6])<<8 | int(header[7])

			if size > 0 {
				payload := make([]byte, size)
				_, err := io.ReadFull(reader, payload)
				if err != nil {
					return
				}

				line := strings.TrimSpace(string(payload))
				if line != "" {
					if streamType == 2 {
						slog.Error("Container stderr", "version", versionHash, "agent_url", agentURL, "message", line)
					} else {
						slog.Info("Container stdout", "version", versionHash, "agent_url", agentURL, "message", line)
					}
				}
			}
		}
	}()
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
	agentURL := info.URL
	delete(m.runningContainers, versionHash)
	metrics.ContainersActive.WithLabelValues(agentURL).Dec()
	m.containersMutex.Unlock()

	ctx := context.Background()
	slog.Info("Stopping container", "version", versionHash)

	timeout := 10
	if err := m.client.ContainerStop(ctx, info.ContainerID, container.StopOptions{Timeout: &timeout}); err != nil {
		slog.Warn("Failed to stop container", "version", versionHash, "error", err)
	}

	if err := m.client.ContainerRemove(ctx, info.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		slog.Error("Failed to remove container", "version", versionHash, "error", err)
		metrics.ContainerOperationsTotal.WithLabelValues(agentURL, "stop", "error").Inc()
		return err
	}

	metrics.ContainerOperationsTotal.WithLabelValues(agentURL, "stop", "success").Inc()
	slog.Info("Removed container", "version", versionHash)
	return nil
}

// EnsureRunning ensures a container is running for the given agent URL and version.
func (m *Manager) EnsureRunning(agentURL string) (int, bool, error) {
	start := time.Now()

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
		metrics.ContainersActive.WithLabelValues(agentURL).Dec()
		m.containersMutex.Unlock()
	}

	// Prevent concurrent container starts for the same version
	// Use a channel as a mutex per versionHash
	startChan := make(chan struct{})
	actual, loaded := m.startingMutex.LoadOrStore(versionHash, startChan)
	if loaded {
		// Another goroutine is already starting this container, wait for it
		<-actual.(chan struct{})
		// Now check if the container is running
		m.containersMutex.RLock()
		info, exists := m.runningContainers[versionHash]
		m.containersMutex.RUnlock()
		if exists {
			return info.Port, false, nil
		}
		return 0, false, fmt.Errorf("concurrent container start failed for %s", versionHash)
	}
	// We're the one starting this container, clean up when done
	defer func() {
		close(startChan)
		m.startingMutex.Delete(versionHash)
	}()

	// Double-check after acquiring start lock
	m.containersMutex.RLock()
	info, exists = m.runningContainers[versionHash]
	m.containersMutex.RUnlock()
	if exists {
		ctx := context.Background()
		containerJSON, err := m.client.ContainerInspect(ctx, info.ContainerID)
		if err == nil && containerJSON.State.Running {
			slog.Debug("Container already running (after lock)", "version", versionHash, "port", info.Port)
			return info.Port, false, nil
		}
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

	// Build environment variables
	var envVars []string
	if m.sandboxNetwork != nil {
		// Inject LLM proxy configuration if enabled
		if m.sandboxNetwork.LLMProxyPort > 0 {
			llmBaseURL := fmt.Sprintf("http://%s:%d/v1", m.sandboxNetwork.Gateway, m.sandboxNetwork.LLMProxyPort)
			envVars = append(envVars,
				// OpenAI SDK compatible (older versions)
				"OPENAI_API_BASE="+llmBaseURL,
				// OpenAI SDK compatible (newer versions)
				"OPENAI_BASE_URL="+llmBaseURL,
				// Generic
				"LLM_API_BASE="+llmBaseURL,
				// API key placeholder - the proxy injects the real key
				"OPENAI_API_KEY=sk-proxy-injected",
			)
			slog.Debug("Injecting LLM proxy environment variables",
				"llm_base_url", llmBaseURL,
				"container", containerName,
			)
		}
	}

	// Inject AgentRegistry address if set
	if m.agentRegistryAddr != "" {
		envVars = append(envVars, "AGENT_REGISTRY_CONTRACT="+m.agentRegistryAddr)
		slog.Debug("Injecting AgentRegistry address", "address", m.agentRegistryAddr, "container", containerName)
	}

	containerConfig := &container.Config{
		Image: imageName,
		Env:   envVars,
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

	// Configure network - use sandbox network if configured
	var networkConfig *network.NetworkingConfig
	if m.sandboxNetwork != nil {
		networkConfig = &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				m.sandboxNetwork.Name: {},
			},
		}
		slog.Debug("Attaching container to sandbox network",
			"network", m.sandboxNetwork.Name,
			"container", containerName,
		)
	}

	resp, err := m.client.ContainerCreate(ctx, containerConfig, hostConfig, networkConfig, nil, containerName)
	if err != nil {
		return 0, false, fmt.Errorf("failed to create container: %w", err)
	}

	if err := m.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return 0, false, fmt.Errorf("failed to start container: %w", err)
	}

	// Start streaming container logs to structured logging
	m.streamContainerLogs(resp.ID, versionHash, agentURL)

	m.containersMutex.Lock()
	m.runningContainers[versionHash] = &ContainerInfo{
		ContainerID: resp.ID,
		Port:        hostPort,
		URL:         agentURL,
	}
	metrics.ContainersActive.WithLabelValues(agentURL).Inc()
	m.containersMutex.Unlock()

	slog.Info("Container started", "url", fmt.Sprintf("http://localhost:%d", hostPort))

	if err := m.waitForContainerReady(hostPort, 30, 1000); err != nil {
		metrics.ContainerOperationsTotal.WithLabelValues(agentURL, "start", "error").Inc()
		return 0, false, err
	}

	metrics.ContainerOperationsTotal.WithLabelValues(agentURL, "start", "success").Inc()
	metrics.ContainerStartDuration.WithLabelValues(agentURL).Observe(time.Since(start).Seconds())

	return hostPort, true, nil
}

// Forward forwards a request to an agent container using JSON-in-JSON-out protocol.
func (m *Manager) Forward(agentURL string, body []byte, headers map[string]string) (*Response, error) {
	port, _, err := m.EnsureRunning(agentURL)
	if err != nil {
		metrics.AgentRequestsTotal.WithLabelValues(agentURL, "error").Inc()
		return nil, err
	}

	start := time.Now()
	url := fmt.Sprintf("http://localhost:%d/", port)

	requestHex := "0x" + hex.EncodeToString(body)
	requestID := headers["X-Request-Id"]

	jsonRequest := map[string]string{
		"requestId": requestID,
		"request":   requestHex,
	}

	jsonBody, err := json.Marshal(jsonRequest)
	if err != nil {
		metrics.AgentRequestsTotal.WithLabelValues(agentURL, "error").Inc()
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		metrics.AgentRequestsTotal.WithLabelValues(agentURL, "error").Inc()
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		metrics.AgentRequestsTotal.WithLabelValues(agentURL, "error").Inc()
		return nil, fmt.Errorf("failed to forward request: %w", err)
	}
	defer resp.Body.Close()

	responseText, err := io.ReadAll(resp.Body)
	if err != nil {
		metrics.AgentRequestsTotal.WithLabelValues(agentURL, "error").Inc()
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
			// Include the request hex in the receipt
			jsonResponse["request"] = requestHex
			receipt = jsonResponse
		}
	} else {
		responseBody = responseText
	}

	statusCode := fmt.Sprintf("%d", resp.StatusCode)
	metrics.AgentRequestsTotal.WithLabelValues(agentURL, statusCode).Inc()
	metrics.AgentRequestDuration.WithLabelValues(agentURL).Observe(time.Since(start).Seconds())

	return &Response{
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
			metrics.ContainerOperationsTotal.WithLabelValues(info.URL, "stop", "error").Inc()
		} else {
			slog.Info("Removed container", "version", versionHash)
			metrics.ContainerOperationsTotal.WithLabelValues(info.URL, "stop", "success").Inc()
		}
		metrics.ContainersActive.WithLabelValues(info.URL).Dec()
	}

	m.runningContainers = make(map[string]*ContainerInfo)
}
