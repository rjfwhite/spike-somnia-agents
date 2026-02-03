// Committee member periodically sends heartbeat transactions to maintain
// active membership in a committee contract.
package main

import (
	"context"
	"crypto/ecdsa"
	"flag"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/somnia-chain/agent-runner/internal/committee"
)

// Build-time variables (set via -ldflags)
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
)

type Config struct {
	ContractAddress string
	RPCURL          string
	Interval        time.Duration
}

func main() {
	cfg := parseFlags()

	fmt.Println("")
	slog.Info("committee-member starting",
		"version", Version,
		"commit", GitCommit,
		"built", BuildTime,
	)

	// Get private key from environment
	privateKeyHex := os.Getenv("PRIVATE_KEY")
	if privateKeyHex == "" {
		slog.Error("PRIVATE_KEY environment variable is required")
		os.Exit(1)
	}

	// Remove 0x prefix if present
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		slog.Error("Invalid private key", "error", err)
		os.Exit(1)
	}

	// Get address from private key
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		slog.Error("Failed to cast public key to ECDSA")
		os.Exit(1)
	}
	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	slog.Info("Loaded wallet", "address", address.Hex())

	// Connect to Ethereum client
	client, err := ethclient.Dial(cfg.RPCURL)
	if err != nil {
		slog.Error("Failed to connect to RPC", "url", cfg.RPCURL, "error", err)
		os.Exit(1)
	}
	defer client.Close()

	// Get chain ID
	chainID, err := client.ChainID(context.Background())
	if err != nil {
		slog.Error("Failed to get chain ID", "error", err)
		os.Exit(1)
	}
	slog.Info("Connected to chain", "chainID", chainID, "rpc", cfg.RPCURL)

	// Parse contract address
	if !common.IsHexAddress(cfg.ContractAddress) {
		slog.Error("Invalid contract address", "address", cfg.ContractAddress)
		os.Exit(1)
	}
	contractAddr := common.HexToAddress(cfg.ContractAddress)

	// Create committee contract instance
	committeeContract, err := committee.NewCommittee(contractAddr, client)
	if err != nil {
		slog.Error("Failed to create committee contract instance", "error", err)
		os.Exit(1)
	}

	// Create transactor
	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		slog.Error("Failed to create transactor", "error", err)
		os.Exit(1)
	}

	slog.Info("Configuration",
		"contract", contractAddr.Hex(),
		"interval", cfg.Interval,
		"wallet", address.Hex(),
	)

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("")
		slog.Info("Shutting down - leaving committee...")

		// Try to leave the committee gracefully
		sendLeaveMembership(context.Background(), client, committeeContract, auth, address)

		cancel()
	}()

	// Start heartbeat loop
	fmt.Println("")
	slog.Info("Starting heartbeat loop", "interval", cfg.Interval)

	// Send initial heartbeat
	sendHeartbeat(ctx, client, committeeContract, auth, address)

	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("Heartbeat loop stopped")
			return
		case <-ticker.C:
			sendHeartbeat(ctx, client, committeeContract, auth, address)
		}
	}
}

func parseFlags() *Config {
	cfg := &Config{}

	flag.StringVar(&cfg.ContractAddress, "contract", "", "Committee contract address (required)")
	flag.StringVar(&cfg.RPCURL, "rpc-url", "https://dream-rpc.somnia.network/", "Ethereum RPC URL")
	flag.DurationVar(&cfg.Interval, "interval", 30*time.Second, "Heartbeat interval")

	flag.Parse()

	if cfg.ContractAddress == "" {
		fmt.Fprintln(os.Stderr, "Error: --contract flag is required")
		flag.Usage()
		os.Exit(1)
	}

	return cfg
}

func sendHeartbeat(ctx context.Context, client *ethclient.Client, contract *committee.Committee, auth *bind.TransactOpts, address common.Address) {
	// Check if we're already active
	isActive, err := contract.IsActive(&bind.CallOpts{Context: ctx}, address)
	if err != nil {
		slog.Warn("Failed to check active status", "error", err)
	} else {
		slog.Debug("Current active status", "active", isActive)
	}

	// Get current nonce
	nonce, err := client.PendingNonceAt(ctx, address)
	if err != nil {
		slog.Error("Failed to get nonce", "error", err)
		return
	}
	auth.Nonce = big.NewInt(int64(nonce))

	// Get suggested gas price
	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		slog.Error("Failed to get gas price", "error", err)
		return
	}
	auth.GasPrice = gasPrice

	// Send heartbeat transaction
	slog.Info("Sending heartbeat transaction", "nonce", nonce, "gasPrice", gasPrice)

	tx, err := contract.HeartbeatMembership(auth)
	if err != nil {
		slog.Error("Failed to send heartbeat", "error", err)
		return
	}

	slog.Info("Heartbeat transaction sent", "txHash", tx.Hash().Hex())

	// Wait for transaction receipt
	receipt, err := bind.WaitMined(ctx, client, tx)
	if err != nil {
		slog.Error("Failed to wait for transaction", "error", err)
		return
	}

	if receipt.Status == 1 {
		slog.Info("Heartbeat confirmed",
			"txHash", tx.Hash().Hex(),
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)
	} else {
		slog.Error("Heartbeat transaction failed",
			"txHash", tx.Hash().Hex(),
			"status", receipt.Status,
		)
	}
}

func sendLeaveMembership(ctx context.Context, client *ethclient.Client, contract *committee.Committee, auth *bind.TransactOpts, address common.Address) {
	// Check if we're active before trying to leave
	isActive, err := contract.IsActive(&bind.CallOpts{Context: ctx}, address)
	if err != nil {
		slog.Warn("Failed to check active status", "error", err)
		return
	}

	if !isActive {
		slog.Info("Not active in committee, skipping leave")
		return
	}

	// Get current nonce
	nonce, err := client.PendingNonceAt(ctx, address)
	if err != nil {
		slog.Error("Failed to get nonce", "error", err)
		return
	}
	auth.Nonce = big.NewInt(int64(nonce))

	// Get suggested gas price
	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		slog.Error("Failed to get gas price", "error", err)
		return
	}
	auth.GasPrice = gasPrice

	// Send leave transaction
	slog.Info("Sending leave membership transaction", "nonce", nonce, "gasPrice", gasPrice)

	tx, err := contract.LeaveMembership(auth)
	if err != nil {
		slog.Error("Failed to send leave membership", "error", err)
		return
	}

	slog.Info("Leave membership transaction sent", "txHash", tx.Hash().Hex())

	// Wait for transaction receipt with a timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	receipt, err := bind.WaitMined(timeoutCtx, client, tx)
	if err != nil {
		slog.Warn("Failed to wait for leave transaction (may still succeed)", "error", err)
		return
	}

	if receipt.Status == 1 {
		slog.Info("Left committee successfully",
			"txHash", tx.Hash().Hex(),
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)
	} else {
		slog.Error("Leave transaction failed",
			"txHash", tx.Hash().Hex(),
			"status", receipt.Status,
		)
	}
}
