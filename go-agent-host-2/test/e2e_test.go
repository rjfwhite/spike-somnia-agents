//go:build e2e

package test

import (
	"bytes"
	"context"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// Test configuration
const (
	testAgentURL      = "https://storage.googleapis.com/my-public-stuff/my-container-9000.tar"
	testRequestHex    = "771602f7000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000d6"
	expectedResultHex = "00000000000000000000000000000000000000000000000000000000000000e2"
	testAPIKey        = "test-secret-key-12345"
	testPort          = 18080
	testNetworkName   = "test-sandbox-e2e"
)

var (
	binaryPath   string
	sharedRunner *agentRunner
)

func TestMain(m *testing.M) {
	// Find the binary
	candidates := []string{
		"../bin/agent-runner",
		"./bin/agent-runner",
		"agent-runner",
	}

	for _, path := range candidates {
		absPath, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		if _, err := os.Stat(absPath); err == nil {
			binaryPath = absPath
			break
		}
	}

	if binaryPath == "" {
		fmt.Println("agent-runner binary not found. Run 'make build' first.")
		os.Exit(1)
	}

	fmt.Printf("Using binary: %s\n", binaryPath)

	// Start shared runner
	var err error
	sharedRunner, err = startAgentRunner()
	if err != nil {
		fmt.Printf("Failed to start agent-runner: %v\n", err)
		os.Exit(1)
	}

	// Run all tests against the shared runner
	code := m.Run()

	// Cleanup
	sharedRunner.Stop()

	os.Exit(code)
}

// agentRunner manages an agent-runner subprocess for testing.
type agentRunner struct {
	cmd         *exec.Cmd
	port        int
	baseURL     string
	cancelFunc  context.CancelFunc
	networkName string
}

// startAgentRunner starts the agent-runner binary with test configuration.
func startAgentRunner() (*agentRunner, error) {
	ctx, cancel := context.WithCancel(context.Background())

	args := []string{
		"--port", fmt.Sprintf("%d", testPort),
		"--start-port", fmt.Sprintf("%d", testPort+1000),
		"--cache-dir", "./test-cache",
		"--sandbox-network", testNetworkName,
		"--sandbox-subnet", "172.31.0.0/16",
		"--sandbox-gateway", "172.31.0.1",
		"--api-key", testAPIKey,
	}

	cmd := exec.CommandContext(ctx, binaryPath, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to start: %w", err)
	}

	runner := &agentRunner{
		cmd:         cmd,
		port:        testPort,
		baseURL:     fmt.Sprintf("http://localhost:%d", testPort),
		cancelFunc:  cancel,
		networkName: testNetworkName,
	}

	// Wait for the server to be ready
	if err := runner.waitForHealthy(30 * time.Second); err != nil {
		runner.Stop()
		return nil, fmt.Errorf("failed to become healthy: %w", err)
	}

	fmt.Printf("agent-runner started on %s\n", runner.baseURL)
	return runner, nil
}

// waitForHealthy polls the health endpoint until the server is ready.
func (r *agentRunner) waitForHealthy(timeout time.Duration) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		resp, err := client.Get(r.baseURL + "/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("server did not become healthy within %v", timeout)
}

// Stop gracefully stops the agent-runner process.
func (r *agentRunner) Stop() {
	if r.cmd == nil || r.cmd.Process == nil {
		return
	}

	fmt.Println("Stopping agent-runner...")

	// Send SIGTERM for graceful shutdown
	r.cmd.Process.Signal(syscall.SIGTERM)

	// Wait briefly for graceful shutdown
	done := make(chan error, 1)
	go func() {
		done <- r.cmd.Wait()
	}()

	select {
	case <-done:
		fmt.Println("agent-runner stopped gracefully")
	case <-time.After(10 * time.Second):
		fmt.Println("agent-runner did not stop gracefully, killing...")
		r.cmd.Process.Kill()
		<-done
	}

	r.cancelFunc()

	// Clean up test cache directory
	os.RemoveAll("./test-cache")

	// Clean up Docker network
	if r.networkName != "" {
		exec.Command("docker", "network", "rm", r.networkName).Run()
	}
}

// request makes an HTTP request to the agent-runner.
func request(method, path string, body []byte, headers map[string]string) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, sharedRunner.baseURL+path, bodyReader)
	if err != nil {
		return nil, nil, err
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp, nil, err
	}

	return resp, respBody, nil
}

// =============================================================================
// Tests - all run against the shared runner instance
// =============================================================================

func TestHealthEndpoint(t *testing.T) {
	resp, body, err := request("GET", "/health", nil, nil)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200, got %d", resp.StatusCode)
	}

	t.Logf("Health response: %s", string(body))
}

func TestVersionEndpoint(t *testing.T) {
	resp, body, err := request("GET", "/version", nil, nil)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200, got %d", resp.StatusCode)
	}

	t.Logf("Version response: %s", string(body))
}

func TestMetricsEndpoint(t *testing.T) {
	resp, body, err := request("GET", "/metrics", nil, nil)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200, got %d", resp.StatusCode)
	}

	// Just check it returns something that looks like prometheus metrics
	if len(body) < 100 {
		t.Errorf("Expected metrics output, got: %s", string(body))
	}
}

func TestAuthRequired(t *testing.T) {
	t.Run("rejected without auth", func(t *testing.T) {
		resp, _, err := request("POST", "/", []byte("test"), map[string]string{
			"X-Agent-Url":  "http://example.com/agent.tar",
			"X-Request-Id": "test-1",
		})
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("rejected with wrong API key", func(t *testing.T) {
		resp, _, err := request("POST", "/", []byte("test"), map[string]string{
			"X-Agent-Url":  "http://example.com/agent.tar",
			"X-Request-Id": "test-1",
			"X-API-Key":    "wrong-key",
		})
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", resp.StatusCode)
		}
	})
}

func TestAuthMethods(t *testing.T) {
	t.Run("X-API-Key header", func(t *testing.T) {
		resp, _, err := request("POST", "/", []byte("test"), map[string]string{
			"X-Agent-Url":  "http://example.com/agent.tar",
			"X-Request-Id": "test-1",
			"X-API-Key":    testAPIKey,
		})
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		// Should not be 401 - auth passed (may fail later for other reasons)
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass, got 401")
		}
	})

	t.Run("Bearer token", func(t *testing.T) {
		resp, _, err := request("POST", "/", []byte("test"), map[string]string{
			"X-Agent-Url":   "http://example.com/agent.tar",
			"X-Request-Id":  "test-1",
			"Authorization": "Bearer " + testAPIKey,
		})
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass, got 401")
		}
	})

	t.Run("query parameter", func(t *testing.T) {
		resp, _, err := request("POST", "/?apiKey="+testAPIKey, []byte("test"), map[string]string{
			"X-Agent-Url":  "http://example.com/agent.tar",
			"X-Request-Id": "test-1",
		})
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass, got 401")
		}
	})
}

func TestAgentExecution(t *testing.T) {
	if testAgentURL == "" {
		t.Skip("testAgentURL not configured")
	}

	requestBytes, err := hex.DecodeString(testRequestHex)
	if err != nil {
		t.Fatalf("Failed to decode request hex: %v", err)
	}

	resp, body, err := request("POST", "/", requestBytes, map[string]string{
		"X-Agent-Url":  testAgentURL,
		"X-Request-Id": "e2e-test-execution",
		"X-API-Key":    testAPIKey,
	})
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}

	t.Logf("Response status: %d", resp.StatusCode)
	t.Logf("Response body (hex): %s", hex.EncodeToString(body))

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200, got %d", resp.StatusCode)
	}

	if expectedResultHex != "" {
		expectedBytes, err := hex.DecodeString(expectedResultHex)
		if err != nil {
			t.Fatalf("Failed to decode expected result: %v", err)
		}
		if !bytes.Equal(body, expectedBytes) {
			t.Errorf("Response mismatch\nExpected: %s\nGot:      %s", expectedResultHex, hex.EncodeToString(body))
		}
	}
}
