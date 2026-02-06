// Package heartbeater provides committee membership maintenance through periodic heartbeat transactions.
package heartbeater

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/somnia-chain/agent-runner/internal/committee"
	"github.com/somnia-chain/agent-runner/internal/submitter"
)

// Config holds the configuration for the heartbeater.
type Config struct {
	ContractAddress string
	RPCURL          string
	Interval        time.Duration
}

// Heartbeater maintains active committee membership by sending periodic heartbeat transactions.
type Heartbeater struct {
	client    *ethclient.Client
	contract  *committee.Committee
	submitter *submitter.Submitter
	address   common.Address
	interval  time.Duration

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New creates a new Heartbeater instance.
func New(cfg Config, sub *submitter.Submitter) (*Heartbeater, error) {
	address := sub.Address()

	slog.Info("Heartbeater using wallet", "address", address.Hex())

	// Connect to Ethereum client (for contract read calls)
	client, err := ethclient.Dial(cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC %s: %w", cfg.RPCURL, err)
	}

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

	ctx, cancel := context.WithCancel(context.Background())

	return &Heartbeater{
		client:    client,
		contract:  committeeContract,
		submitter: sub,
		address:   address,
		interval:  cfg.Interval,
		ctx:       ctx,
		cancel:    cancel,
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

	result := h.submitter.Submit(ctx, "heartbeat", func(auth *bind.TransactOpts) (*types.Transaction, error) {
		return h.contract.HeartbeatMembership(auth)
	})
	if result.Err != nil {
		slog.Error("Heartbeat failed", "error", result.Err)
		return
	}

	if result.Receipt.Status == 1 {
		slog.Info("Heartbeat confirmed",
			"txHash", result.Tx.Hash().Hex(),
			"block", result.Receipt.BlockNumber,
			"gasUsed", result.Receipt.GasUsed,
		)
	} else {
		slog.Error("Heartbeat transaction reverted",
			"txHash", result.Tx.Hash().Hex(),
			"status", result.Receipt.Status,
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

	result := h.submitter.Submit(ctx, "leave-membership", func(auth *bind.TransactOpts) (*types.Transaction, error) {
		return h.contract.LeaveMembership(auth)
	})
	if result.Err != nil {
		slog.Error("Heartbeater failed to leave committee", "error", result.Err)
		return
	}

	if result.Receipt.Status == 1 {
		slog.Info("Left committee successfully",
			"txHash", result.Tx.Hash().Hex(),
			"block", result.Receipt.BlockNumber,
			"gasUsed", result.Receipt.GasUsed,
		)
	} else {
		slog.Error("Leave transaction reverted",
			"txHash", result.Tx.Hash().Hex(),
			"status", result.Receipt.Status,
		)
	}
}
