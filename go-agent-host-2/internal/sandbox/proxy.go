// Package sandbox provides network isolation for sandboxed containers.
package sandbox

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/elazarl/goproxy"
)

// ProxyMetrics holds metrics for proxy usage.
type ProxyMetrics struct {
	RequestCount atomic.Int64
	ConnectCount atomic.Int64
	ErrorCount   atomic.Int64
}

// Proxy is an HTTP/HTTPS forward proxy for sandbox containers.
// It uses goproxy for HTTP proxying and CONNECT tunneling.
type Proxy struct {
	listenAddr string
	server     *http.Server
	proxy      *goproxy.ProxyHttpServer
	metrics    *ProxyMetrics

	// Optional hooks for authorization and metering
	AuthFunc   func(r *http.Request) error
	OnRequest  func(r *http.Request)
	OnComplete func(r *http.Request, statusCode int, bytesIn, bytesOut int64, duration time.Duration, err error)
}

// NewProxy creates a new HTTP/HTTPS proxy.
// listenAddr should be the sandbox network gateway IP and port, e.g., "172.30.0.1:3128"
func NewProxy(listenAddr string) *Proxy {
	proxy := goproxy.NewProxyHttpServer()
	proxy.Verbose = false

	return &Proxy{
		listenAddr: listenAddr,
		proxy:      proxy,
		metrics:    &ProxyMetrics{},
	}
}

// Metrics returns the current proxy metrics.
func (p *Proxy) Metrics() *ProxyMetrics {
	return p.metrics
}

// Start starts the proxy server.
func (p *Proxy) Start() error {
	slog.Info("Starting HTTP/HTTPS proxy", "addr", p.listenAddr)

	// Set up request handler for auth and metering
	p.proxy.OnRequest().DoFunc(func(r *http.Request, ctx *goproxy.ProxyCtx) (*http.Request, *http.Response) {
		p.metrics.RequestCount.Add(1)

		// Auth check
		if p.AuthFunc != nil {
			if err := p.AuthFunc(r); err != nil {
				p.metrics.ErrorCount.Add(1)
				return r, goproxy.NewResponse(r, goproxy.ContentTypeText, http.StatusProxyAuthRequired, "proxy auth required\n")
			}
		}

		// Request hook
		if p.OnRequest != nil {
			p.OnRequest(r)
		}

		// Store start time in context for metering
		ctx.UserData = time.Now()
		return r, nil
	})

	// Set up response handler for metering
	p.proxy.OnResponse().DoFunc(func(resp *http.Response, ctx *goproxy.ProxyCtx) *http.Response {
		if p.OnComplete != nil && ctx.Req != nil {
			start, ok := ctx.UserData.(time.Time)
			if !ok {
				start = time.Now()
			}
			duration := time.Since(start)

			statusCode := 0
			if resp != nil {
				statusCode = resp.StatusCode
			}

			// Note: accurate byte counting for response bodies requires wrapping resp.Body
			// For now we report 0 for bytes - can be enhanced if needed
			p.OnComplete(ctx.Req, statusCode, ctx.Req.ContentLength, 0, duration, ctx.Error)
		}
		return resp
	})

	// Handle CONNECT (HTTPS tunneling)
	p.proxy.OnRequest().HandleConnectFunc(func(host string, ctx *goproxy.ProxyCtx) (*goproxy.ConnectAction, string) {
		p.metrics.ConnectCount.Add(1)

		// Auth check for CONNECT
		if p.AuthFunc != nil && ctx.Req != nil {
			if err := p.AuthFunc(ctx.Req); err != nil {
				p.metrics.ErrorCount.Add(1)
				return goproxy.RejectConnect, host
			}
		}

		slog.Debug("CONNECT tunnel", "host", host)
		return goproxy.OkConnect, host
	})

	p.server = &http.Server{
		Addr:         p.listenAddr,
		Handler:      p.proxy,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	listener, err := net.Listen("tcp", p.listenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", p.listenAddr, err)
	}

	go func() {
		if err := p.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			slog.Error("Proxy server error", "error", err)
		}
	}()

	return nil
}

// Stop gracefully stops the proxy server.
func (p *Proxy) Stop(ctx context.Context) error {
	if p.server == nil {
		return nil
	}
	slog.Info("Stopping HTTP/HTTPS proxy")
	return p.server.Shutdown(ctx)
}
