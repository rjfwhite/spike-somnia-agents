// Agent runner starts and manages Docker containers for running agents.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/somnia-chain/agent-runner/internal/api"
	"github.com/somnia-chain/agent-runner/internal/config"
	"github.com/somnia-chain/agent-runner/internal/docker"
)

func main() {
	cfg := config.Parse()

	dockerManager, err := docker.NewManager(cfg.CacheDir, cfg.StartPort, cfg.Runtime)
	if err != nil {
		log.Fatalf("Failed to initialize Docker: %v", err)
	}

	server := api.NewServer(dockerManager, cfg.ReceiptsServiceURL, cfg.APIKey)
	http.HandleFunc("/", server.HandleRequest)

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("\nShutting down...")
		dockerManager.Cleanup()
		os.Exit(0)
	}()

	// Print startup message
	log.Printf("agent-runner %s (commit: %s, built: %s)", config.Version, config.GitCommit, config.BuildTime)
	log.Printf("Listening on port %d", cfg.Port)
	log.Println("")
	log.Println("Config:")
	log.Printf("  --port=%d", cfg.Port)
	log.Printf("  --cache-dir=%s", cfg.CacheDir)
	log.Printf("  --start-port=%d", cfg.StartPort)
	log.Printf("  --runtime=%s", cfg.Runtime)
	log.Printf("  --receipts-url=%s", cfg.ReceiptsServiceURL)
	if cfg.APIKey != "" {
		log.Printf("  --api-key=<configured>")
	} else {
		log.Printf("  --api-key=<not set, authentication disabled>")
	}
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

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
