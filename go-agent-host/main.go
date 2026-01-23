package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
)

var (
	port               int
	receiptsServiceURL string
	cacheDir           string
	startPort          int
	runtime            string
)

// uploadReceipt uploads a receipt to the receipts service
func uploadReceipt(requestID string, receipt map[string]interface{}) {
	if receiptsServiceURL == "" {
		return
	}

	receiptJSON, err := json.Marshal(receipt)
	if err != nil {
		log.Printf("Failed to marshal receipt for %s: %v", requestID, err)
		return
	}

	receiptURL := fmt.Sprintf("%s/agent-receipts?requestId=%s", receiptsServiceURL, url.QueryEscape(requestID))
	resp, err := http.Post(receiptURL, "application/json", bytes.NewReader(receiptJSON))
	if err != nil {
		log.Printf("Failed to upload receipt for %s: %v", requestID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		log.Printf("Failed to upload receipt for %s: %d", requestID, resp.StatusCode)
	} else {
		log.Printf("Request %s: Receipt uploaded to receipts service", requestID)
	}
}

// sendError sends an error response
func sendError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(status)
	w.Write([]byte(message))
}

// handleAgentRequest handles requests to the agent endpoint
func handleAgentRequest(w http.ResponseWriter, r *http.Request) {
	// Parse URL and query parameters
	queryParams := r.URL.Query()

	// Headers can override query params
	agentURL := r.Header.Get("X-Agent-Url")
	if agentURL == "" {
		agentURL = queryParams.Get("agentUrl")
	}

	requestID := r.Header.Get("X-Request-Id")
	if requestID == "" {
		requestID = queryParams.Get("requestId")
	}

	dataParam := queryParams.Get("data")

	if agentURL == "" {
		sendError(w, http.StatusBadRequest, "Missing X-Agent-Url header or agentUrl query param")
		return
	}

	if requestID == "" {
		sendError(w, http.StatusBadRequest, "Missing X-Request-Id header or requestId query param")
		return
	}

	// Get body from query param (base64) or request body
	var body []byte
	var err error

	if dataParam != "" {
		body, err = base64.StdEncoding.DecodeString(dataParam)
		if err != nil {
			sendError(w, http.StatusBadRequest, "Invalid base64 data in 'data' query param")
			return
		}
	} else {
		body, err = io.ReadAll(r.Body)
		if err != nil {
			sendError(w, http.StatusBadRequest, "Failed to read request body")
			return
		}
	}

	source := "request body"
	if dataParam != "" {
		source = "query param"
	}
	log.Printf("Request %s: Forwarding to agent at %s", requestID, agentURL)
	log.Printf("  Body size: %d bytes (from %s)", len(body), source)

	// Forward to agent container
	agentResponse, err := forwardToAgent(agentURL, body, map[string]string{
		"X-Request-Id": requestID,
	})
	if err != nil {
		log.Printf("Request %s: Error - %v", requestID, err)
		sendError(w, http.StatusInternalServerError, fmt.Sprintf("Agent execution failed: %v", err))
		return
	}

	log.Printf("Request %s: Agent responded with status %d", requestID, agentResponse.Status)

	// Upload receipt if agent provided one (async)
	if agentResponse.Receipt != nil {
		go uploadReceipt(requestID, agentResponse.Receipt)
	}

	// Send the binary response back to requester
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(agentResponse.Status)
	w.Write(agentResponse.Body)
}

// handleHealth handles the health check endpoint
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy"}`))
}

// handleRequest is the main request handler
func handleRequest(w http.ResponseWriter, r *http.Request) {
	log.Printf("%s %s", r.Method, r.URL.String())

	// Health check endpoint
	if r.URL.Path == "/health" {
		handleHealth(w, r)
		return
	}

	// Root endpoint handles agent requests
	if r.URL.Path == "/" || r.URL.Path == "" {
		if r.Method == "POST" || r.Method == "GET" {
			handleAgentRequest(w, r)
		} else {
			sendError(w, http.StatusMethodNotAllowed, "Method not allowed. Use GET or POST.")
		}
		return
	}

	sendError(w, http.StatusNotFound, "Not found")
}

func main() {
	// Parse CLI flags
	flag.IntVar(&port, "port", 8080, "HTTP server port")
	flag.StringVar(&receiptsServiceURL, "receipts-url", "https://agent-receipts-937722299914.us-central1.run.app", "URL for receipt uploads (empty to disable)")
	flag.StringVar(&cacheDir, "cache-dir", "./image-cache", "Directory to cache downloaded container images")
	flag.IntVar(&startPort, "start-port", 10000, "Starting port for container allocation")
	flag.StringVar(&runtime, "runtime", "", "Container runtime (e.g., runsc for gVisor)")
	flag.Parse()

	// Initialize Docker client and config
	initDockerConfig(cacheDir, startPort, runtime)
	if err := initDocker(); err != nil {
		log.Fatalf("Failed to initialize Docker: %v", err)
	}

	// Setup HTTP server
	http.HandleFunc("/", handleRequest)

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("\nShutting down...")
		cleanupContainers()
		os.Exit(0)
	}()

	// Print startup message
	log.Printf("Agent Host HTTP server listening on port %d", port)
	log.Println("")
	log.Println("Config:")
	log.Printf("  --port=%d", port)
	log.Printf("  --cache-dir=%s", cacheDir)
	log.Printf("  --start-port=%d", startPort)
	log.Printf("  --runtime=%s", runtime)
	log.Printf("  --receipts-url=%s", receiptsServiceURL)
	log.Println("")
	log.Println("Usage:")
	log.Println("  GET or POST / with headers or query params:")
	log.Println("    X-Agent-Url header or agentUrl query param: URL of the tarred container image")
	log.Println("    X-Request-Id header or requestId query param: Request ID for receipts")
	log.Println("  Body: Binary ABI-encoded function call (or base64-encoded in \"data\" query param)")
	log.Println("")
	log.Println("  Example GET with query params:")
	log.Println("    GET /?agentUrl=<url>&requestId=<id>&data=<base64-encoded-body>")
	log.Println("")
	log.Println("Response:")
	log.Println("  Body: Binary ABI-encoded result")

	// Start server
	addr := fmt.Sprintf(":%d", port)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
