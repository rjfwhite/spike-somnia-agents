// Package metrics provides Prometheus metrics for the agent runner.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// HTTP metrics (aggregate only)
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_runner_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "agent_runner_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// Container metrics (per-agent)
	ContainersActive = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "agent_runner_containers_active",
			Help: "Number of currently active containers",
		},
		[]string{"agent"},
	)

	ContainerOperationsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_runner_container_operations_total",
			Help: "Total number of container operations",
		},
		[]string{"agent", "operation", "status"},
	)

	ContainerStartDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "agent_runner_container_start_duration_seconds",
			Help:    "Time to start a container (download, load, start, ready)",
			Buckets: []float64{1, 2, 5, 10, 20, 30, 60, 120},
		},
		[]string{"agent"},
	)

	// Image metrics (per-agent)
	ImageDownloadsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_runner_image_downloads_total",
			Help: "Total number of image downloads",
		},
		[]string{"agent", "status"},
	)

	ImageDownloadDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "agent_runner_image_download_duration_seconds",
			Help:    "Time to download container images",
			Buckets: []float64{1, 2, 5, 10, 20, 30, 60, 120, 300},
		},
		[]string{"agent"},
	)

	// Agent request metrics (per-agent)
	AgentRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_runner_agent_requests_total",
			Help: "Total number of requests forwarded to agents",
		},
		[]string{"agent", "status_code"},
	)

	AgentRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "agent_runner_agent_request_duration_seconds",
			Help:    "Time for agent to process request",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60},
		},
		[]string{"agent"},
	)
)
