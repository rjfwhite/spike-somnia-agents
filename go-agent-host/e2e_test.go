package main

import (
	"bytes"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Test configuration - fill these in
const (
	testAgentURL      = "https://storage.googleapis.com/my-public-stuff/my-container-9000.tar"
	testRequestHex    = "771602f7000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000d6"
	expectedResultHex = "00000000000000000000000000000000000000000000000000000000000000e2"
)

func TestE2E(t *testing.T) {
	if testAgentURL == "" {
		t.Skip("testAgentURL not configured")
	}

	// Initialize docker config
	initDockerConfig("./test-image-cache", 11000, "")
	if err := initDocker(); err != nil {
		t.Fatalf("Failed to initialize Docker: %v", err)
	}
	defer cleanupContainers()

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handleRequest))
	defer server.Close()

	// Decode request bytes
	requestBytes, err := hex.DecodeString(testRequestHex)
	if err != nil {
		t.Fatalf("Failed to decode request hex: %v", err)
	}

	// Create request
	req, err := http.NewRequest("POST", server.URL+"/", bytes.NewReader(requestBytes))
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("X-Agent-Url", testAgentURL)
	req.Header.Set("X-Request-Id", "test-request-1")

	// Send request with timeout
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	t.Logf("Response status: %d", resp.StatusCode)
	t.Logf("Response body (hex): %s", hex.EncodeToString(body))

	// Assert status
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	// Assert response if expected result is configured
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
