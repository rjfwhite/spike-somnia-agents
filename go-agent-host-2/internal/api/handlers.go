// Package api provides HTTP handlers for the agent runner.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/somnia-chain/agent-runner/internal/config"
	"github.com/somnia-chain/agent-runner/internal/metrics"
)

// Server handles HTTP requests for the agent runner.
type Server struct {
	apiKey string
}

// NewServer creates a new API Server.
func NewServer(apiKey string) *Server {
	return &Server{
		apiKey: apiKey,
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

	sendError(w, http.StatusNotFound, "Not found")
}
