// Package config provides configuration management for the agent runner.
package config

import (
	"flag"
	"time"
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
	LogFile            string
	MaxLogFileSize     int

	// Sandbox network configuration
	SandboxNetworkName    string
	SandboxNetworkSubnet  string
	SandboxNetworkGateway string
	SandboxProxyPort      int
	EnableFirewall        bool

	// LLM Proxy configuration
	LLMProxyEnabled bool
	LLMProxyPort    int
	LLMUpstreamURL  string
	LLMAPIKey              string
	DisableLLMValidation   bool

	// Blockchain configuration
	RPCURL               string
	SomniaAgentsContract string

	// Committee heartbeater configuration
	CommitteeInterval time.Duration
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
	flag.StringVar(&cfg.LogFile, "log-file", "", "Path to log file (default: stdout)")
	flag.IntVar(&cfg.MaxLogFileSize, "max-log-file-size", 10*1024*1024, "Max log file size in bytes before rotation (default: 10MB)")

	// Sandbox network configuration
	flag.StringVar(&cfg.SandboxNetworkName, "sandbox-network", "agent-sandbox", "Docker network name for sandbox containers")
	flag.StringVar(&cfg.SandboxNetworkSubnet, "sandbox-subnet", "172.30.0.0/16", "Subnet for sandbox network")
	flag.StringVar(&cfg.SandboxNetworkGateway, "sandbox-gateway", "172.30.0.1", "Gateway IP for sandbox network (host-side)")
	flag.IntVar(&cfg.SandboxProxyPort, "sandbox-proxy-port", 3128, "Port for sandbox HTTP/HTTPS proxy")
	flag.BoolVar(&cfg.EnableFirewall, "enable-firewall", false, "Enable iptables firewall rules for sandbox isolation")

	// LLM Proxy configuration
	flag.BoolVar(&cfg.LLMProxyEnabled, "llm-proxy-enabled", false, "Enable OpenAI-compatible LLM proxy")
	flag.IntVar(&cfg.LLMProxyPort, "llm-proxy-port", 11434, "Port for LLM proxy")
	flag.StringVar(&cfg.LLMUpstreamURL, "llm-upstream-url", "https://api.openai.com", "Upstream LLM service URL")
	flag.StringVar(&cfg.LLMAPIKey, "llm-api-key", "", "API key for upstream LLM service")
	flag.BoolVar(&cfg.DisableLLMValidation, "disable-llm-validation", false, "Disable LLM determinism validation on startup")

	// Blockchain configuration
	flag.StringVar(&cfg.RPCURL, "rpc-url", "https://dream-rpc.somnia.network/", "Blockchain RPC URL")
	flag.StringVar(&cfg.SomniaAgentsContract, "somnia-agents-contract", "", "SomniaAgents contract address (required)")

	// Committee heartbeater configuration
	flag.DurationVar(&cfg.CommitteeInterval, "committee-interval", 30*time.Second, "Heartbeat interval")

	flag.Parse()

	return cfg
}
