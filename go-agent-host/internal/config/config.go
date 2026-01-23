// Package config provides configuration management for the agent runner.
package config

import (
	"flag"
)

// Build-time variables (set via -ldflags)
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
)

// Config holds the application configuration.
type Config struct {
	Port               int
	ReceiptsServiceURL string
	CacheDir           string
	StartPort          int
	Runtime            string
	APIKey             string
}

// Parse parses command-line flags and returns a Config.
func Parse() *Config {
	cfg := &Config{}

	flag.IntVar(&cfg.Port, "port", 8080, "HTTP server port")
	flag.StringVar(&cfg.ReceiptsServiceURL, "receipts-url", "https://agent-receipts-937722299914.us-central1.run.app", "URL for receipt uploads (empty to disable)")
	flag.StringVar(&cfg.CacheDir, "cache-dir", "./image-cache", "Directory to cache downloaded container images")
	flag.IntVar(&cfg.StartPort, "start-port", 10000, "Starting port for container allocation")
	flag.StringVar(&cfg.Runtime, "runtime", "", "Container runtime (e.g., runsc for gVisor)")
	flag.StringVar(&cfg.APIKey, "api-key", "", "API key for request authentication (optional, no auth if empty)")
	flag.Parse()

	return cfg
}
