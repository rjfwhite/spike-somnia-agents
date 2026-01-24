// Agent runner starts and manages Docker containers for running agents.
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/somnia-chain/agent-runner/internal/api"
	"github.com/somnia-chain/agent-runner/internal/config"
	"github.com/somnia-chain/agent-runner/internal/docker"
	"github.com/somnia-chain/agent-runner/internal/logging"
)

func main() {
	cfg := config.Parse()

	// Initialize logging
	cleanupLog := logging.Setup(logging.Config{
		LogFile:        cfg.LogFile,
		MaxLogFileSize: cfg.MaxLogFileSize,
	})
	defer cleanupLog()

	dockerManager, err := docker.NewManager(cfg.CacheDir, cfg.StartPort, cfg.Runtime)
	if err != nil {
		slog.Error("Failed to initialize Docker", "error", err)
		os.Exit(1)
	}

	server := api.NewServer(dockerManager, cfg.ReceiptsServiceURL, cfg.APIKey)
	http.HandleFunc("/", server.HandleRequest)

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		slog.Info("Shutting down...")
		dockerManager.Cleanup()
		os.Exit(0)
	}()

	// Print startup message
	apiKeyStatus := "<not set, authentication disabled>"
	if cfg.APIKey != "" {
		apiKeyStatus = "<configured>"
	}

	slog.Info("agent-runner starting",
		"version", config.Version,
		"commit", config.GitCommit,
		"built", config.BuildTime,
		"port", cfg.Port,
		"cache_dir", cfg.CacheDir,
		"start_port", cfg.StartPort,
		"runtime", cfg.Runtime,
		"receipts_url", cfg.ReceiptsServiceURL,
		"api_key", apiKeyStatus,
		"log_file", cfg.LogFile,
	)

	// Print usage to stdout (not to log file)
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

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := http.ListenAndServe(addr, nil); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
