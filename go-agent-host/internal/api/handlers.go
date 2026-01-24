// Package api provides HTTP handlers for the agent runner.
package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/somnia-chain/agent-runner/internal/config"
	"github.com/somnia-chain/agent-runner/internal/docker"
	"github.com/somnia-chain/agent-runner/internal/metrics"
)

// Server handles HTTP requests for the agent runner.
type Server struct {
	dockerManager      *docker.Manager
	receiptsServiceURL string
	apiKey             string
}

// NewServer creates a new API Server.
func NewServer(dockerManager *docker.Manager, receiptsServiceURL, apiKey string) *Server {
	return &Server{
		dockerManager:      dockerManager,
		receiptsServiceURL: receiptsServiceURL,
		apiKey:             apiKey,
	}
}

// authenticate checks if the request has a valid API key.
// Returns true if authentication passes (no key configured or valid key provided).
func (s *Server) authenticate(r *http.Request) bool {
	if s.apiKey == "" {
		return true
	}

	// Check Authorization header (Bearer token)
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		const bearerPrefix = "Bearer "
		if len(authHeader) > len(bearerPrefix) && authHeader[:len(bearerPrefix)] == bearerPrefix {
			if authHeader[len(bearerPrefix):] == s.apiKey {
				return true
			}
		}
	}

	// Check X-API-Key header
	if r.Header.Get("X-API-Key") == s.apiKey {
		return true
	}

	// Check apiKey query parameter
	if r.URL.Query().Get("apiKey") == s.apiKey {
		return true
	}

	return false
}

// uploadReceipt uploads a receipt to the receipts service.
func (s *Server) uploadReceipt(requestID string, receipt map[string]interface{}) {
	if s.receiptsServiceURL == "" {
		return
	}

	receiptJSON, err := json.Marshal(receipt)
	if err != nil {
		slog.Error("Failed to marshal receipt", "request_id", requestID, "error", err)
		return
	}

	receiptURL := fmt.Sprintf("%s/agent-receipts?requestId=%s", s.receiptsServiceURL, url.QueryEscape(requestID))
	resp, err := http.Post(receiptURL, "application/json", bytes.NewReader(receiptJSON))
	if err != nil {
		slog.Error("Failed to upload receipt", "request_id", requestID, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		slog.Error("Failed to upload receipt", "request_id", requestID, "status", resp.StatusCode)
	} else {
		slog.Info("Receipt uploaded", "request_id", requestID)
	}
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// sendError sends an error response.
func sendError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(status)
	w.Write([]byte(message))
}

// handleAgentRequest handles requests to the agent endpoint.
func (s *Server) handleAgentRequest(w http.ResponseWriter, r *http.Request) {
	queryParams := r.URL.Query()

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
	slog.Info("Forwarding to agent", "request_id", requestID, "agent_url", agentURL, "body_size", len(body), "body_source", source)

	agentResponse, err := s.dockerManager.ForwardToAgent(agentURL, body, map[string]string{
		"X-Request-Id": requestID,
	})
	if err != nil {
		slog.Error("Agent execution failed", "request_id", requestID, "error", err)
		sendError(w, http.StatusInternalServerError, fmt.Sprintf("Agent execution failed: %v", err))
		return
	}

	slog.Info("Agent responded", "request_id", requestID, "status", agentResponse.Status)

	if agentResponse.Receipt != nil {
		go s.uploadReceipt(requestID, agentResponse.Receipt)
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(agentResponse.Status)
	w.Write(agentResponse.Body)
}

// handleHealth handles the health check endpoint.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "healthy",
		"version": config.Version,
	})
}

// handleVersion handles the version endpoint.
func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"version":   config.Version,
		"gitCommit": config.GitCommit,
		"buildTime": config.BuildTime,
	})
}

// HandleRequest is the main request handler.
func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	path := r.URL.Path
	if path == "" {
		path = "/"
	}

	// Wrap response writer to capture status code
	wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

	// Handle the request
	s.handleRequestInternal(wrapped, r)

	// Record metrics (skip for /metrics endpoint to avoid recursion)
	if path != "/metrics" {
		duration := time.Since(start).Seconds()
		status := strconv.Itoa(wrapped.statusCode)
		metrics.HTTPRequestsTotal.WithLabelValues(r.Method, path, status).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
	}
}

// handleRequestInternal handles the actual request routing.
func (s *Server) handleRequestInternal(w http.ResponseWriter, r *http.Request) {
	slog.Debug("Request received", "method", r.Method, "url", r.URL.String())

	// Metrics endpoint - no authentication required
	if r.URL.Path == "/metrics" {
		promhttp.Handler().ServeHTTP(w, r)
		return
	}

	// Health and version endpoints don't require authentication
	if r.URL.Path == "/health" {
		s.handleHealth(w, r)
		return
	}

	if r.URL.Path == "/version" {
		s.handleVersion(w, r)
		return
	}

	// All other endpoints require authentication
	if !s.authenticate(r) {
		sendError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if r.URL.Path == "/" || r.URL.Path == "" {
		if r.Method == "POST" || r.Method == "GET" {
			s.handleAgentRequest(w, r)
		} else {
			sendError(w, http.StatusMethodNotAllowed, "Method not allowed. Use GET or POST.")
		}
		return
	}

	sendError(w, http.StatusNotFound, "Not found")
}
