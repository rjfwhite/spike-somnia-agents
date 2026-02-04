// Package heartbeater provides committee membership maintenance through periodic heartbeat transactions.
package heartbeater

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/somnia-chain/agent-runner/internal/committee"
)

// Config holds the configuration for the heartbeater.
type Config struct {
	ContractAddress string
	RPCURL          string
	Interval        time.Duration
}

// Heartbeater maintains active committee membership by sending periodic heartbeat transactions.
type Heartbeater struct {
	client   *ethclient.Client
	contract *committee.Committee
	auth     *bind.TransactOpts
	address  common.Address
	interval time.Duration

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New creates a new Heartbeater instance.
// The private key is loaded from the PRIVATE_KEY environment variable.
func New(cfg Config) (*Heartbeater, error) {
	// Get private key from environment
	privateKeyHex := os.Getenv("PRIVATE_KEY")
	if privateKeyHex == "" {
		return nil, fmt.Errorf("PRIVATE_KEY environment variable is required")
	}

	// Remove 0x prefix if present
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	// Get address from private key
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("failed to cast public key to ECDSA")
	}
	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	slog.Info("Heartbeater loaded wallet", "address", address.Hex())

	// Connect to Ethereum client
	client, err := ethclient.Dial(cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC %s: %w", cfg.RPCURL, err)
	}

	// Get chain ID
	chainID, err := client.ChainID(context.Background())
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}
	slog.Info("Heartbeater connected to chain", "chainID", chainID, "rpc", cfg.RPCURL)

	// Parse contract address
	if !common.IsHexAddress(cfg.ContractAddress) {
		client.Close()
		return nil, fmt.Errorf("invalid contract address: %s", cfg.ContractAddress)
	}
	contractAddr := common.HexToAddress(cfg.ContractAddress)

	// Create committee contract instance
	committeeContract, err := committee.NewCommittee(contractAddr, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create committee contract instance: %w", err)
	}

	// Create transactor
	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create transactor: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Heartbeater{
		client:   client,
		contract: committeeContract,
		auth:     auth,
		address:  address,
		interval: cfg.Interval,
		ctx:      ctx,
		cancel:   cancel,
	}, nil
}

// Start begins the heartbeat loop in a background goroutine.
func (h *Heartbeater) Start() {
	slog.Info("Starting heartbeat loop", "interval", h.interval, "contract", h.contract.Address().Hex())

	h.wg.Add(1)
	go func() {
		defer h.wg.Done()

		// Send initial heartbeat
		h.sendHeartbeat()

		ticker := time.NewTicker(h.interval)
		defer ticker.Stop()

		for {
			select {
			case <-h.ctx.Done():
				slog.Info("Heartbeat loop stopped")
				return
			case <-ticker.C:
				h.sendHeartbeat()
			}
		}
	}()
}

// Stop gracefully shuts down the heartbeater, sending a leave transaction.
func (h *Heartbeater) Stop() {
	slog.Info("Stopping heartbeater - leaving committee...")

	// Cancel the heartbeat loop
	h.cancel()

	// Wait for the loop to finish
	h.wg.Wait()

	// Try to leave the committee gracefully
	h.sendLeaveMembership()

	// Close the client
	h.client.Close()
}

func (h *Heartbeater) sendHeartbeat() {
	ctx := h.ctx

	// Check if we're already active
	isActive, err := h.contract.IsActive(&bind.CallOpts{Context: ctx}, h.address)
	if err != nil {
		slog.Warn("Heartbeater failed to check active status", "error", err)
	} else {
		slog.Debug("Heartbeater current active status", "active", isActive)
	}

	// Get current nonce
	nonce, err := h.client.PendingNonceAt(ctx, h.address)
	if err != nil {
		slog.Error("Heartbeater failed to get nonce", "error", err)
		return
	}
	h.auth.Nonce = big.NewInt(int64(nonce))

	// Get suggested gas price
	gasPrice, err := h.client.SuggestGasPrice(ctx)
	if err != nil {
		slog.Error("Heartbeater failed to get gas price", "error", err)
		return
	}
	h.auth.GasPrice = gasPrice

	// Send heartbeat transaction
	slog.Info("Sending heartbeat transaction", "nonce", nonce, "gasPrice", gasPrice)

	tx, err := h.contract.HeartbeatMembership(h.auth)
	if err != nil {
		slog.Error("Heartbeater failed to send heartbeat", "error", err)
		return
	}

	slog.Info("Heartbeat transaction sent", "txHash", tx.Hash().Hex())

	// Wait for transaction receipt
	receipt, err := bind.WaitMined(ctx, h.client, tx)
	if err != nil {
		slog.Error("Heartbeater failed to wait for transaction", "error", err)
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

func (h *Heartbeater) sendLeaveMembership() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Check if we're active before trying to leave
	isActive, err := h.contract.IsActive(&bind.CallOpts{Context: ctx}, h.address)
	if err != nil {
		slog.Warn("Heartbeater failed to check active status", "error", err)
		return
	}

	if !isActive {
		slog.Info("Heartbeater not active in committee, skipping leave")
		return
	}

	// Get current nonce
	nonce, err := h.client.PendingNonceAt(ctx, h.address)
	if err != nil {
		slog.Error("Heartbeater failed to get nonce", "error", err)
		return
	}
	h.auth.Nonce = big.NewInt(int64(nonce))

	// Get suggested gas price
	gasPrice, err := h.client.SuggestGasPrice(ctx)
	if err != nil {
		slog.Error("Heartbeater failed to get gas price", "error", err)
		return
	}
	h.auth.GasPrice = gasPrice

	// Send leave transaction
	slog.Info("Sending leave membership transaction", "nonce", nonce, "gasPrice", gasPrice)

	tx, err := h.contract.LeaveMembership(h.auth)
	if err != nil {
		slog.Error("Heartbeater failed to send leave membership", "error", err)
		return
	}

	slog.Info("Leave membership transaction sent", "txHash", tx.Hash().Hex())

	// Wait for transaction receipt
	receipt, err := bind.WaitMined(ctx, h.client, tx)
	if err != nil {
		slog.Warn("Heartbeater failed to wait for leave transaction (may still succeed)", "error", err)
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
