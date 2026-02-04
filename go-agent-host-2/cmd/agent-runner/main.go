// Agent runner starts and manages Docker containers for running agents.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/somnia-chain/agent-runner/internal/agents"
	"github.com/somnia-chain/agent-runner/internal/api"
	"github.com/somnia-chain/agent-runner/internal/config"
	"github.com/somnia-chain/agent-runner/internal/heartbeater"
	"github.com/somnia-chain/agent-runner/internal/listener"
	"github.com/somnia-chain/agent-runner/internal/logging"
	"github.com/somnia-chain/agent-runner/internal/sandbox"
	"github.com/somnia-chain/agent-runner/internal/startup"
)

func main() {
	cfg := config.Parse()

	// Initialize logging
	cleanupLog := logging.Setup(logging.Config{
		LogFile:        cfg.LogFile,
		MaxLogFileSize: cfg.MaxLogFileSize,
	})
	defer cleanupLog()

	fmt.Println("")
	slog.Info("agent-runner starting",
		"version", config.Version,
		"commit", config.GitCommit,
		"built", config.BuildTime,
	)
	fmt.Println("")

	// =========================================================================
	// Startup Checks
	// =========================================================================

	ctx := context.Background()
	checker := startup.NewChecker()

	// Check 1: Docker daemon
	if err := checker.CheckDocker(ctx); err != nil {
		os.Exit(1)
	}

	// Check 2: Sandbox network
	sandboxNet, err := checker.CheckSandboxNetwork(
		ctx,
		cfg.SandboxNetworkName,
		cfg.SandboxNetworkSubnet,
		cfg.SandboxNetworkGateway,
	)
	if err != nil {
		os.Exit(1)
	}

	// Check 3: Stale containers cleanup
	if _, err := checker.CheckStaleContainers(ctx); err != nil {
		// Log but don't fail - partial cleanup is okay
		slog.Warn("Some stale containers could not be removed", "error", err)
	}

	// Check 4: Firewall rules (created but not applied unless --enable-firewall)
	allowedPorts := []int{cfg.SandboxProxyPort}
	if cfg.LLMProxyEnabled {
		allowedPorts = append(allowedPorts, cfg.LLMProxyPort)
	}
	firewallRules, err := checker.CheckFirewall(
		sandboxNet,
		allowedPorts,
		cfg.EnableFirewall,
	)
	if err != nil {
		os.Exit(1)
	}

	// Print startup check summary
	checker.PrintSummary()
	fmt.Println("")

	// =========================================================================
	// Initialize Services
	// =========================================================================

	// Create agents manager with the client from startup checks
	agentManager := agents.NewManager(
		checker.DockerClient(),
		cfg.CacheDir,
		cfg.StartPort,
		cfg.Runtime,
	)

	// Configure agents manager to use the sandbox network
	llmProxyPort := 0
	if cfg.LLMProxyEnabled {
		llmProxyPort = cfg.LLMProxyPort
	}
	agentManager.SetSandboxNetwork(sandboxNet.Name, sandboxNet.Gateway, cfg.SandboxProxyPort, llmProxyPort)

	// Start the sandbox HTTP/HTTPS proxy
	proxyAddr := fmt.Sprintf("%s:%d", sandboxNet.Gateway, cfg.SandboxProxyPort)
	sandboxProxy := sandbox.NewProxy(proxyAddr)

	// Add request logging
	sandboxProxy.OnComplete = func(r *http.Request, statusCode int, bytesIn, bytesOut int64, duration time.Duration, err error) {
		if err != nil {
			slog.Warn("Proxy request failed",
				"method", r.Method,
				"host", r.Host,
				"error", err,
			)
		} else {
			slog.Debug("Proxy request completed",
				"method", r.Method,
				"host", r.Host,
				"status", statusCode,
				"bytes_in", bytesIn,
				"bytes_out", bytesOut,
				"duration_ms", duration.Milliseconds(),
			)
		}
	}

	if err := sandboxProxy.Start(); err != nil {
		slog.Error("Failed to start sandbox proxy", "error", err)
		os.Exit(1)
	}
	slog.Info("Sandbox proxy started", "addr", proxyAddr)

	// Start the LLM proxy if enabled
	var llmProxy *sandbox.LLMProxy
	if cfg.LLMProxyEnabled {
		llmProxyAddr := fmt.Sprintf("%s:%d", sandboxNet.Gateway, cfg.LLMProxyPort)
		llmProxyCfg := sandbox.LLMProxyConfig{
			ListenAddr:  llmProxyAddr,
			UpstreamURL: cfg.LLMUpstreamURL,
			APIKey:      cfg.LLMAPIKey,
		}

		var err error
		llmProxy, err = sandbox.NewLLMProxy(llmProxyCfg)
		if err != nil {
			slog.Error("Failed to create LLM proxy", "error", err)
			os.Exit(1)
		}

		// Add request logging
		llmProxy.OnComplete = func(r *http.Request, statusCode int, duration time.Duration, streaming bool, err error) {
			if err != nil {
				slog.Warn("LLM proxy request failed",
					"path", r.URL.Path,
					"error", err,
				)
			} else {
				slog.Debug("LLM proxy request completed",
					"path", r.URL.Path,
					"status", statusCode,
					"duration_ms", duration.Milliseconds(),
					"streaming", streaming,
				)
			}
		}

		if err := llmProxy.Start(); err != nil {
			slog.Error("Failed to start LLM proxy", "error", err)
			os.Exit(1)
		}
		slog.Info("LLM proxy started", "addr", llmProxyAddr, "upstream", cfg.LLMUpstreamURL)
	}

	// Initialize blockchain components if needed (committee or listener)
	var eventListener *listener.Listener
	var hb *heartbeater.Heartbeater

	if cfg.CommitteeEnabled || cfg.ListenerEnabled {
		if cfg.SomniaAgentsContract == "" {
			slog.Error("--somnia-agents-contract is required when committee or listener is enabled")
			os.Exit(1)
		}

		// Create listener to resolve contract addresses from SomniaAgents
		listenerCfg := listener.Config{
			SomniaAgentsContract: cfg.SomniaAgentsContract,
			RPCURL:               cfg.RPCURL,
		}

		var err error
		eventListener, err = listener.New(listenerCfg, agentManager)
		if err != nil {
			slog.Error("Failed to create event listener", "error", err)
			os.Exit(1)
		}

		// Configure AgentRegistry address for containers
		agentManager.SetAgentRegistryAddress(eventListener.AgentRegistryAddress())

		// Start heartbeater if enabled (uses resolved committee address)
		if cfg.CommitteeEnabled {
			hbCfg := heartbeater.Config{
				ContractAddress: eventListener.CommitteeAddress(),
				RPCURL:          cfg.RPCURL,
				Interval:        cfg.CommitteeInterval,
			}

			hb, err = heartbeater.New(hbCfg)
			if err != nil {
				slog.Error("Failed to create heartbeater", "error", err)
				os.Exit(1)
			}

			hb.Start()
		}

		// Start event listener if enabled
		if cfg.ListenerEnabled {
			eventListener.Start()
		}
	}

	// Create API server
	server := api.NewServer(agentManager, cfg.ReceiptsServiceURL, cfg.APIKey)
	http.HandleFunc("/", server.HandleRequest)

	// =========================================================================
	// Graceful Shutdown
	// =========================================================================

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("")
		slog.Info("Shutting down...")

		// Stop the event listener
		if eventListener != nil {
			eventListener.Stop()
		}

		// Stop the heartbeater (sends leave transaction)
		if hb != nil {
			hb.Stop()
		}

		// Stop the sandbox proxy
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := sandboxProxy.Stop(shutdownCtx); err != nil {
			slog.Warn("Failed to stop sandbox proxy", "error", err)
		}

		// Stop the LLM proxy if running
		if llmProxy != nil {
			if err := llmProxy.Stop(shutdownCtx); err != nil {
				slog.Warn("Failed to stop LLM proxy", "error", err)
			}
		}

		agentManager.Cleanup()
		os.Exit(0)
	}()

	// =========================================================================
	// Print Configuration & Start Server
	// =========================================================================

	apiKeyStatus := "disabled"
	if cfg.APIKey != "" {
		apiKeyStatus = "enabled"
	}

	firewallStatus := "disabled"
	if cfg.EnableFirewall && firewallRules != nil {
		firewallStatus = "enabled"
	}

	llmProxyStatus := "disabled"
	if cfg.LLMProxyEnabled {
		llmProxyStatus = fmt.Sprintf("enabled (%s:%d -> %s)", sandboxNet.Gateway, cfg.LLMProxyPort, cfg.LLMUpstreamURL)
	}

	committeeStatus := "disabled"
	if cfg.CommitteeEnabled && eventListener != nil {
		committeeStatus = fmt.Sprintf("enabled (%s, interval=%s)", eventListener.CommitteeAddress(), cfg.CommitteeInterval)
	}

	listenerStatus := "disabled"
	if cfg.ListenerEnabled {
		listenerStatus = fmt.Sprintf("enabled (%s)", cfg.SomniaAgentsContract)
	}

	slog.Info("Configuration",
		"port", cfg.Port,
		"cache_dir", cfg.CacheDir,
		"start_port", cfg.StartPort,
		"runtime", cfg.Runtime,
		"receipts_url", cfg.ReceiptsServiceURL,
		"api_key", apiKeyStatus,
		"sandbox_network", sandboxNet.Name,
		"sandbox_gateway", sandboxNet.Gateway,
		"sandbox_proxy", proxyAddr,
		"firewall", firewallStatus,
		"llm_proxy", llmProxyStatus,
		"committee", committeeStatus,
		"listener", listenerStatus,
	)

	// Print usage to stdout
	fmt.Println("")
	fmt.Println("Usage:")
	fmt.Println("  GET or POST / with headers or query params:")
	fmt.Println("    X-Agent-Url header or agentUrl query param: URL of the tarred container image")
	fmt.Println("    X-Request-Id header or requestId query param: Request ID for receipts")
	fmt.Println("  Body: Binary ABI-encoded function call (or base64-encoded in \"data\" query param)")
	fmt.Println("")
	fmt.Println("  Example GET with query params:")
	fmt.Println("    GET /?agentUrl=<url>&requestId=<id>&data=<base64-encoded-body>")
	fmt.Println("")
	fmt.Println("Response:")
	fmt.Println("  Body: Binary ABI-encoded result")
	fmt.Println("")

	addr := fmt.Sprintf(":%d", cfg.Port)
	slog.Info("HTTP server listening", "addr", addr)

	if err := http.ListenAndServe(addr, nil); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
