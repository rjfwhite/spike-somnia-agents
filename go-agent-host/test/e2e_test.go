//go:build e2e

package test

import (
	"bytes"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/somnia-chain/agent-runner/internal/api"
	"github.com/somnia-chain/agent-runner/internal/docker"
)

// Test configuration
const (
	testAgentURL      = "https://storage.googleapis.com/my-public-stuff/my-container-9000.tar"
	testRequestHex    = "771602f7000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000d6"
	expectedResultHex = "00000000000000000000000000000000000000000000000000000000000000e2"
	testAPIKey        = "test-secret-key-12345"
)

func TestAPIKeyAuthentication(t *testing.T) {
	// Create a mock docker manager - we don't need real Docker for auth tests
	// Instead, we'll test against a server that requires auth but won't actually run containers

	// For auth tests, we can test without Docker since auth happens before container operations
	// We'll create a server with API key and test the auth layer

	t.Run("health endpoint accessible without auth", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		resp, err := http.Get(server.URL + "/health")
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected health endpoint to return 200 without auth, got %d", resp.StatusCode)
		}
	})

	t.Run("version endpoint accessible without auth", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		resp, err := http.Get(server.URL + "/version")
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected version endpoint to return 200 without auth, got %d", resp.StatusCode)
		}
	})

	t.Run("root endpoint rejected without auth", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		req, _ := http.NewRequest("POST", server.URL+"/", bytes.NewReader([]byte("test")))
		req.Header.Set("X-Agent-Url", "http://example.com/agent.tar")
		req.Header.Set("X-Request-Id", "test-1")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized without API key, got %d", resp.StatusCode)
		}
	})

	t.Run("root endpoint rejected with wrong API key", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		req, _ := http.NewRequest("POST", server.URL+"/", bytes.NewReader([]byte("test")))
		req.Header.Set("X-Agent-Url", "http://example.com/agent.tar")
		req.Header.Set("X-Request-Id", "test-1")
		req.Header.Set("X-API-Key", "wrong-key")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized with wrong API key, got %d", resp.StatusCode)
		}
	})

	t.Run("auth works with X-API-Key header", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		req, _ := http.NewRequest("POST", server.URL+"/", bytes.NewReader([]byte("test")))
		req.Header.Set("X-Agent-Url", "http://example.com/agent.tar")
		req.Header.Set("X-Request-Id", "test-1")
		req.Header.Set("X-API-Key", testAPIKey)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		// Should not be 401 - auth passed (may fail later due to invalid agent URL, but auth worked)
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass with X-API-Key header, got 401")
		}
	})

	t.Run("auth works with Bearer token", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		req, _ := http.NewRequest("POST", server.URL+"/", bytes.NewReader([]byte("test")))
		req.Header.Set("X-Agent-Url", "http://example.com/agent.tar")
		req.Header.Set("X-Request-Id", "test-1")
		req.Header.Set("Authorization", "Bearer "+testAPIKey)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass with Bearer token, got 401")
		}
	})

	t.Run("auth works with query parameter", func(t *testing.T) {
		dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
		if err != nil {
			t.Skip("Docker not available, skipping test")
		}
		defer dockerManager.Cleanup()

		apiServer := api.NewServer(dockerManager, "", testAPIKey)
		server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
		defer server.Close()

		req, _ := http.NewRequest("POST", server.URL+"/?apiKey="+testAPIKey, bytes.NewReader([]byte("test")))
		req.Header.Set("X-Agent-Url", "http://example.com/agent.tar")
		req.Header.Set("X-Request-Id", "test-1")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("Expected auth to pass with apiKey query param, got 401")
		}
	})
}

func TestE2EWithAPIKey(t *testing.T) {
	if testAgentURL == "" {
		t.Skip("testAgentURL not configured")
	}

	dockerManager, err := docker.NewManager("./test-image-cache", 11000, "")
	if err != nil {
		t.Fatalf("Failed to initialize Docker: %v", err)
	}
	defer dockerManager.Cleanup()

	// Create test server with API key
	apiServer := api.NewServer(dockerManager, "", testAPIKey)
	server := httptest.NewServer(http.HandlerFunc(apiServer.HandleRequest))
	defer server.Close()

	requestBytes, err := hex.DecodeString(testRequestHex)
	if err != nil {
		t.Fatalf("Failed to decode request hex: %v", err)
	}

	// Create request with API key
	req, err := http.NewRequest("POST", server.URL+"/", bytes.NewReader(requestBytes))
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("X-Agent-Url", testAgentURL)
	req.Header.Set("X-Request-Id", "test-request-with-auth")
	req.Header.Set("X-API-Key", testAPIKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	t.Logf("Response status: %d", resp.StatusCode)
	t.Logf("Response body (hex): %s", hex.EncodeToString(body))

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	if expectedResultHex != "" {
		expectedBytes, err := hex.DecodeString(expectedResultHex)
		if err != nil {
			t.Fatalf("Failed to decode expected result hex: %v", err)
		}
		if !bytes.Equal(body, expectedBytes) {
			t.Errorf("Response mismatch\nExpected: %s\nGot:      %s", expectedResultHex, hex.EncodeToString(body))
		}
	}
}
