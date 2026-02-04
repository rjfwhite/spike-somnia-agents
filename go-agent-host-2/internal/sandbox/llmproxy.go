// Package sandbox provides network isolation for sandboxed containers.
package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"sync/atomic"
	"time"
)

// LLMProxyMetrics holds metrics for LLM proxy usage.
type LLMProxyMetrics struct {
	RequestCount   atomic.Int64
	StreamingCount atomic.Int64
	ErrorCount     atomic.Int64
}

// LLMProxyConfig holds configuration for the LLM proxy.
type LLMProxyConfig struct {
	ListenAddr  string // e.g., "172.30.0.1:11434"
	UpstreamURL string // e.g., "https://api.openai.com"
	APIKey      string // API key for upstream authentication
}

// LLMProxy is an OpenAI-compatible reverse proxy for LLM services.
type LLMProxy struct {
	config     LLMProxyConfig
	server     *http.Server
	upstream   *url.URL
	metrics    *LLMProxyMetrics
	httpClient *http.Client

	// Optional hook for request completion logging/metrics
	OnComplete func(r *http.Request, statusCode int, duration time.Duration, streaming bool, err error)
}

// NewLLMProxy creates a new OpenAI-compatible LLM proxy.
func NewLLMProxy(cfg LLMProxyConfig) (*LLMProxy, error) {
	upstream, err := url.Parse(cfg.UpstreamURL)
	if err != nil {
		return nil, fmt.Errorf("invalid upstream URL: %w", err)
	}

	return &LLMProxy{
		config:   cfg,
		upstream: upstream,
		metrics:  &LLMProxyMetrics{},
		httpClient: &http.Client{
			Timeout: 5 * time.Minute, // Long timeout for LLM responses
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}, nil
}

// Metrics returns the current proxy metrics.
func (p *LLMProxy) Metrics() *LLMProxyMetrics {
	return p.metrics
}

// Start starts the LLM proxy server.
func (p *LLMProxy) Start() error {
	slog.Info("Starting LLM proxy", "addr", p.config.ListenAddr, "upstream", p.config.UpstreamURL)

	mux := http.NewServeMux()

	// OpenAI-compatible endpoints
	mux.HandleFunc("/v1/chat/completions", p.handleChatCompletions)
	mux.HandleFunc("/v1/models", p.handleModels)
	mux.HandleFunc("/v1/completions", p.handleCompletions)

	// Health check
	mux.HandleFunc("/health", p.handleHealth)

	p.server = &http.Server{
		Addr:         p.config.ListenAddr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute, // Long timeout for streaming
		IdleTimeout:  120 * time.Second,
	}

	listener, err := net.Listen("tcp", p.config.ListenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", p.config.ListenAddr, err)
	}

	go func() {
		if err := p.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			slog.Error("LLM proxy server error", "error", err)
		}
	}()

	return nil
}

// Stop gracefully stops the LLM proxy server.
func (p *LLMProxy) Stop(ctx context.Context) error {
	if p.server == nil {
		return nil
	}
	slog.Info("Stopping LLM proxy")
	return p.server.Shutdown(ctx)
}

// handleChatCompletions handles /v1/chat/completions requests
func (p *LLMProxy) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	p.metrics.RequestCount.Add(1)
	start := time.Now()

	// Read body to detect streaming
	body, err := io.ReadAll(r.Body)
	if err != nil {
		p.metrics.ErrorCount.Add(1)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	streaming := p.isStreamingRequest(body)
	if streaming {
		p.metrics.StreamingCount.Add(1)
	}

	// Forward to upstream
	statusCode, err := p.forwardRequest(w, r, "/v1/chat/completions", streaming)

	duration := time.Since(start)
	if p.OnComplete != nil {
		if err != nil {
			p.metrics.ErrorCount.Add(1)
		}
		p.OnComplete(r, statusCode, duration, streaming, err)
	}
}

// handleCompletions handles legacy /v1/completions requests
func (p *LLMProxy) handleCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	p.metrics.RequestCount.Add(1)
	start := time.Now()

	// Read body to detect streaming
	body, err := io.ReadAll(r.Body)
	if err != nil {
		p.metrics.ErrorCount.Add(1)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	streaming := p.isStreamingRequest(body)
	if streaming {
		p.metrics.StreamingCount.Add(1)
	}

	statusCode, err := p.forwardRequest(w, r, "/v1/completions", streaming)

	duration := time.Since(start)
	if p.OnComplete != nil {
		if err != nil {
			p.metrics.ErrorCount.Add(1)
		}
		p.OnComplete(r, statusCode, duration, streaming, err)
	}
}

// handleModels handles /v1/models requests
func (p *LLMProxy) handleModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	p.metrics.RequestCount.Add(1)
	start := time.Now()

	statusCode, err := p.forwardRequest(w, r, "/v1/models", false)

	duration := time.Since(start)
	if p.OnComplete != nil {
		if err != nil {
			p.metrics.ErrorCount.Add(1)
		}
		p.OnComplete(r, statusCode, duration, false, err)
	}
}

// handleHealth returns health status
func (p *LLMProxy) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy"}`))
}

// forwardRequest forwards the request to the upstream LLM service
func (p *LLMProxy) forwardRequest(w http.ResponseWriter, r *http.Request, path string, streaming bool) (int, error) {
	// Build upstream URL
	upstreamURL := *p.upstream
	upstreamURL.Path = path
	upstreamURL.RawQuery = r.URL.RawQuery

	// Create forwarded request
	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL.String(), r.Body)
	if err != nil {
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return http.StatusInternalServerError, err
	}

	// Copy headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Inject API key - override any existing Authorization header
	if p.config.APIKey != "" {
		proxyReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	}

	// Remove hop-by-hop headers
	proxyReq.Header.Del("Connection")
	proxyReq.Header.Del("Proxy-Connection")

	// Forward request
	resp, err := p.httpClient.Do(proxyReq)
	if err != nil {
		slog.Error("LLM upstream request failed", "error", err, "upstream", upstreamURL.String())
		http.Error(w, "Upstream request failed", http.StatusBadGateway)
		return http.StatusBadGateway, err
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// For streaming responses, flush as we go
	if streaming {
		w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering
		w.WriteHeader(resp.StatusCode)

		flusher, ok := w.(http.Flusher)
		if !ok {
			_, err = io.Copy(w, resp.Body)
			return resp.StatusCode, err
		}

		// Stream response with flushing
		buf := make([]byte, 4096)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
				flusher.Flush()
			}
			if readErr == io.EOF {
				break
			}
			if readErr != nil {
				return resp.StatusCode, readErr
			}
		}
		return resp.StatusCode, nil
	}

	// Non-streaming response
	w.WriteHeader(resp.StatusCode)
	_, err = io.Copy(w, resp.Body)
	return resp.StatusCode, err
}

// isStreamingRequest checks if the request body has stream: true
func (p *LLMProxy) isStreamingRequest(body []byte) bool {
	var req struct {
		Stream bool `json:"stream"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		return false
	}
	return req.Stream
}
