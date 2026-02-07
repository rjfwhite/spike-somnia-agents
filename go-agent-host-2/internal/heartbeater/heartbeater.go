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
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/somnia-chain/agent-runner/internal/committee"
	"github.com/somnia-chain/agent-runner/internal/sessionrpc"
)

// Config holds the configuration for the heartbeater.
type Config struct {
	ContractAddress string
	RPCURL          string
	Interval        time.Duration
}

// Heartbeater maintains active committee membership by sending periodic heartbeat transactions.
type Heartbeater struct {
	client       *ethclient.Client
	contract     *committee.Committee
	session      *sessionrpc.Client
	address      common.Address
	contractAddr string // hex address for session RPC Send calls
	interval     time.Duration

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// New creates a new Heartbeater instance.
func New(cfg Config, session *sessionrpc.Client) (*Heartbeater, error) {
	address := session.Address()

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

	// Create committee contract instance (for read calls like IsActive)
	committeeContract, err := committee.NewCommittee(contractAddr, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create committee contract instance: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Heartbeater{
		client:       client,
		contract:     committeeContract,
		session:      session,
		address:      address,
		contractAddr: contractAddr.Hex(),
		interval:     cfg.Interval,
		ctx:          ctx,
		cancel:       cancel,
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

	// ABI-encode heartbeatMembership calldata
	calldata, err := sessionrpc.EncodeHeartbeatMembership()
	if err != nil {
		slog.Error("Failed to encode heartbeatMembership calldata", "error", err)
		return
	}

	receipt, err := h.session.Send(ctx, h.contractAddr, calldata, "0x0", sessionrpc.DefaultGas)
	if err != nil {
		slog.Error("Heartbeat failed", "error", err)
		return
	}

	if receipt.Success() {
		slog.Info("Heartbeat confirmed",
			"txHash", receipt.TransactionHash,
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)
	} else {
		slog.Error("Heartbeat transaction reverted",
			"txHash", receipt.TransactionHash,
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

	// ABI-encode leaveMembership calldata
	calldata, err := sessionrpc.EncodeLeaveMembership()
	if err != nil {
		slog.Error("Failed to encode leaveMembership calldata", "error", err)
		return
	}

	receipt, err := h.session.Send(ctx, h.contractAddr, calldata, "0x0", sessionrpc.DefaultGas)
	if err != nil {
		slog.Error("Heartbeater failed to leave committee", "error", err)
		return
	}

	if receipt.Success() {
		slog.Info("Left committee successfully",
			"txHash", receipt.TransactionHash,
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)
	} else {
		slog.Error("Leave transaction reverted",
			"txHash", receipt.TransactionHash,
			"status", receipt.Status,
		)
	}
}
