// Package listener provides blockchain event listening for agent request execution.
package listener

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"

	"github.com/somnia-chain/agent-runner/internal/agentregistry"
	"github.com/somnia-chain/agent-runner/internal/agents"
	"github.com/somnia-chain/agent-runner/internal/sessionrpc"
	"github.com/somnia-chain/agent-runner/internal/somniaagents"
)

// agentCacheEntry holds cached agent info with a TTL.
type agentCacheEntry struct {
	agent     *agentregistry.Agent
	fetchedAt time.Time
}

const agentCacheTTL = 60 * time.Second

// decodeRevertReason extracts a human-readable revert reason from an error.
// It handles both rpc.DataError (which contains revert data) and standard errors.
func decodeRevertReason(err error) string {
	if err == nil {
		return ""
	}

	// Try to extract data from rpc.DataError
	var dataErr rpc.DataError
	if errors.As(err, &dataErr) {
		if data := dataErr.ErrorData(); data != nil {
			if hexStr, ok := data.(string); ok && len(hexStr) > 0 {
				decoded := decodeRevertData(hexStr)
				if decoded != "" {
					return decoded
				}
			}
		}
	}

	// Fall back to error message
	return err.Error()
}

// decodeRevertData decodes ABI-encoded revert data (Error(string) format).
// Returns empty string if decoding fails, so caller can fall back to raw error.
func decodeRevertData(hexData string) string {
	// Remove 0x prefix if present
	hexData = strings.TrimPrefix(hexData, "0x")

	if len(hexData) == 0 {
		return ""
	}

	data, err := hex.DecodeString(hexData)
	if err != nil || len(data) < 4 {
		return ""
	}

	// Check for Error(string) selector: 0x08c379a0
	errorSelector := []byte{0x08, 0xc3, 0x79, 0xa0}
	if !bytes.Equal(data[:4], errorSelector) {
		// Return the raw hex for non-standard errors
		return "0x" + hexData
	}

	// Need at least selector (4) + offset (32) + length (32) = 68 bytes
	if len(data) < 68 {
		return "0x" + hexData
	}

	// Get string length from bytes 36-68 (after selector and offset)
	length := new(big.Int).SetBytes(data[36:68]).Uint64()

	// Check we have enough data for the string
	if uint64(len(data)) < 68+length {
		return "0x" + hexData
	}

	// Extract the string
	return string(data[68 : 68+length])
}

// httpToWsURL converts an HTTP RPC URL to a WebSocket URL by adding /ws path.
func httpToWsURL(httpURL string) string {
	wsURL := httpURL
	// Convert scheme
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	// Add /ws path
	wsURL = strings.TrimSuffix(wsURL, "/")
	wsURL += "/ws"
	return wsURL
}

// Config holds the configuration for the event listener.
type Config struct {
	SomniaAgentsContract  string
	RPCURL                string
	ReceiptsServiceURL    string
	MaxConcurrentRequests int
}

// Listener listens for RequestCreated events and executes agents.
type Listener struct {
	client        *ethclient.Client
	somniaAgents  *somniaagents.SomniaAgents
	agentRegistry *agentregistry.AgentRegistry
	agentManager  *agents.Manager
	session       *sessionrpc.Client
	address       common.Address
	rpcURL        string
	wsURL         string

	// Resolved contract addresses
	somniaAgentsAddr  common.Address
	agentRegistryAddr common.Address
	committeeAddr     common.Address

	// Receipts service configuration
	receiptsServiceURL string

	// Worker pool
	requestCh  chan *somniaagents.RequestCreatedEvent
	maxWorkers int

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Track processed requests to avoid duplicates
	processed     map[string]bool
	processedLock sync.Mutex

	// Agent info cache
	agentCache     map[string]*agentCacheEntry
	agentCacheLock sync.RWMutex
}

// New creates a new Listener instance.
func New(cfg Config, agentManager *agents.Manager, session *sessionrpc.Client) (*Listener, error) {
	address := session.Address()

	slog.Info("Listener using wallet", "address", address.Hex())

	// Connect to Ethereum client (for contract reads and revert reason extraction)
	client, err := ethclient.Dial(cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC %s: %w", cfg.RPCURL, err)
	}

	slog.Info("Listener connected to RPC", "rpc", cfg.RPCURL)

	// Parse SomniaAgents contract address
	if !common.IsHexAddress(cfg.SomniaAgentsContract) {
		client.Close()
		return nil, fmt.Errorf("invalid SomniaAgents contract address: %s", cfg.SomniaAgentsContract)
	}
	somniaAgentsAddr := common.HexToAddress(cfg.SomniaAgentsContract)

	// Create SomniaAgents contract instance
	somniaAgentsContract, err := somniaagents.NewSomniaAgents(somniaAgentsAddr, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create SomniaAgents contract instance: %w", err)
	}

	// Resolve AgentRegistry address from SomniaAgents contract
	agentRegistryAddr, err := somniaAgentsContract.AgentRegistry(&bind.CallOpts{Context: context.Background()})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get AgentRegistry address from SomniaAgents: %w", err)
	}
	slog.Info("Resolved AgentRegistry address from SomniaAgents", "address", agentRegistryAddr.Hex())

	// Resolve Committee address from SomniaAgents contract
	committeeAddr, err := somniaAgentsContract.Committee(&bind.CallOpts{Context: context.Background()})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get Committee address from SomniaAgents: %w", err)
	}
	slog.Info("Resolved Committee address from SomniaAgents", "address", committeeAddr.Hex())

	// Create AgentRegistry contract instance
	agentRegistryContract, err := agentregistry.NewAgentRegistry(agentRegistryAddr, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create AgentRegistry contract instance: %w", err)
	}

	maxWorkers := cfg.MaxConcurrentRequests
	if maxWorkers <= 0 {
		maxWorkers = 20
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Listener{
		client:             client,
		somniaAgents:       somniaAgentsContract,
		agentRegistry:      agentRegistryContract,
		agentManager:       agentManager,
		session:            session,
		address:            address,
		rpcURL:             cfg.RPCURL,
		wsURL:              httpToWsURL(cfg.RPCURL),
		somniaAgentsAddr:   somniaAgentsAddr,
		agentRegistryAddr:  agentRegistryAddr,
		committeeAddr:      committeeAddr,
		receiptsServiceURL: cfg.ReceiptsServiceURL,
		requestCh:          make(chan *somniaagents.RequestCreatedEvent, 10000),
		maxWorkers:         maxWorkers,
		ctx:                ctx,
		cancel:             cancel,
		processed:          make(map[string]bool),
		agentCache:         make(map[string]*agentCacheEntry),
	}, nil
}

// AgentRegistryAddress returns the resolved AgentRegistry contract address.
func (l *Listener) AgentRegistryAddress() string {
	return l.agentRegistryAddr.Hex()
}

// CommitteeAddress returns the resolved Committee contract address.
func (l *Listener) CommitteeAddress() string {
	return l.committeeAddr.Hex()
}

// Start begins listening for RequestCreated events with a bounded worker pool.
func (l *Listener) Start() {
	slog.Info("Starting event listener",
		"somnia_agents", l.somniaAgents.Address().Hex(),
		"agent_registry", l.agentRegistry.Address().Hex(),
		"validator", l.address.Hex(),
		"workers", l.maxWorkers,
	)

	// Start worker pool
	for i := 0; i < l.maxWorkers; i++ {
		l.wg.Add(1)
		go l.worker()
	}

	// Start event subscription loop
	l.wg.Add(1)
	go l.listenLoop()
}

// Stop gracefully shuts down the listener.
func (l *Listener) Stop() {
	slog.Info("Stopping event listener...")
	l.cancel()
	l.wg.Wait()
	l.client.Close()
	slog.Info("Event listener stopped")
}

func (l *Listener) worker() {
	defer l.wg.Done()
	for {
		select {
		case event := <-l.requestCh:
			l.handleRequest(event)
		case <-l.ctx.Done():
			return
		}
	}
}

func (l *Listener) listenLoop() {
	defer l.wg.Done()

	for {
		select {
		case <-l.ctx.Done():
			return
		default:
			l.subscribeAndListen()
		}

		// If we get here, the subscription ended - wait before reconnecting
		select {
		case <-l.ctx.Done():
			return
		case <-time.After(5 * time.Second):
			slog.Info("Reconnecting WebSocket subscription...")
		}
	}
}

func (l *Listener) subscribeAndListen() {
	// Connect to WebSocket endpoint for subscriptions
	wsClient, err := ethclient.Dial(l.wsURL)
	if err != nil {
		slog.Error("Failed to connect to WebSocket RPC", "url", l.wsURL, "error", err)
		return
	}
	defer wsClient.Close()

	slog.Info("Connected to WebSocket RPC", "url", l.wsURL)

	// Get the RequestCreated event signature
	eventSignature := l.somniaAgents.ABI().Events["RequestCreated"].ID

	// Create filter query
	query := ethereum.FilterQuery{
		Addresses: []common.Address{l.somniaAgents.Address()},
		Topics:    [][]common.Hash{{eventSignature}},
	}

	// Create a channel to receive logs
	logs := make(chan types.Log)

	// Subscribe to logs
	sub, err := wsClient.SubscribeFilterLogs(l.ctx, query, logs)
	if err != nil {
		slog.Error("Failed to subscribe to logs", "error", err)
		return
	}
	defer sub.Unsubscribe()

	slog.Info("Subscribed to RequestCreated events via WebSocket",
		"contract", l.somniaAgents.Address().Hex(),
	)

	for {
		select {
		case <-l.ctx.Done():
			return
		case err := <-sub.Err():
			slog.Error("Subscription error", "error", err)
			return
		case vLog := <-logs:
			l.handleLog(vLog)
		}
	}
}

func (l *Listener) handleLog(vLog types.Log) {
	// Parse the RequestCreated event
	event, err := l.somniaAgents.ParseRequestCreated(vLog)
	if err != nil {
		slog.Warn("Failed to parse RequestCreated event", "error", err, "txHash", vLog.TxHash.Hex())
		return
	}

	if event == nil {
		return
	}

	// Create unique key for this request
	requestKey := fmt.Sprintf("%s-%d", vLog.TxHash.Hex(), event.RequestId.Uint64())

	// Check if already processed
	l.processedLock.Lock()
	if l.processed[requestKey] {
		l.processedLock.Unlock()
		return
	}
	l.processed[requestKey] = true
	l.processedLock.Unlock()

	slog.Info("Received RequestCreated event",
		"requestId", event.RequestId,
		"agentId", event.AgentId,
		"subcommitteeSize", len(event.Subcommittee),
		"txHash", vLog.TxHash.Hex(),
	)

	// Check if we're in the subcommittee
	inSubcommittee := false
	for _, member := range event.Subcommittee {
		if member == l.address {
			inSubcommittee = true
			break
		}
	}

	if !inSubcommittee {
		slog.Debug("Not in subcommittee for request", "requestId", event.RequestId)
		return
	}

	slog.Info("We are in the subcommittee for request", "requestId", event.RequestId)

	// Send to worker pool (drop if full to avoid blocking the event loop)
	select {
	case l.requestCh <- event:
	default:
		slog.Warn("Worker pool full, dropping request", "requestId", event.RequestId)
	}
}

// getCachedAgent returns agent info from cache or fetches from chain.
func (l *Listener) getCachedAgent(agentId *big.Int) (*agentregistry.Agent, error) {
	key := agentId.String()

	// Fast path: read lock
	l.agentCacheLock.RLock()
	if entry, ok := l.agentCache[key]; ok && time.Since(entry.fetchedAt) < agentCacheTTL {
		l.agentCacheLock.RUnlock()
		return entry.agent, nil
	}
	l.agentCacheLock.RUnlock()

	// Slow path: fetch from chain
	agent, err := l.agentRegistry.GetAgent(&bind.CallOpts{Context: l.ctx}, agentId)
	if err != nil {
		return nil, err
	}

	l.agentCacheLock.Lock()
	l.agentCache[key] = &agentCacheEntry{agent: agent, fetchedAt: time.Now()}
	l.agentCacheLock.Unlock()

	return agent, nil
}

func (l *Listener) handleRequest(event *somniaagents.RequestCreatedEvent) {
	requestId := event.RequestId
	agentId := event.AgentId

	// Get agent info from cache (or fetch once)
	agent, err := l.getCachedAgent(agentId)
	if err != nil {
		slog.Error("Failed to get agent from registry", "agentId", agentId, "error", err)
		return
	}

	if agent.ContainerImageUri == "" {
		slog.Error("Agent has no container image URI", "agentId", agentId)
		return
	}

	// Generate a request ID string for the agent
	requestIdStr := fmt.Sprintf("%d", requestId.Uint64())

	// Forward the request to the agent
	slog.Info("Forwarding request to agent",
		"requestId", requestId,
		"agentUrl", agent.ContainerImageUri,
		"payloadSize", len(event.Payload),
	)

	response, err := l.agentManager.Forward(agent.ContainerImageUri, event.Payload, map[string]string{
		"X-Request-Id": requestIdStr,
	})
	if err != nil {
		slog.Error("Failed to forward request to agent", "requestId", requestId, "error", err)
		return
	}

	slog.Info("Agent responded",
		"requestId", requestId,
		"status", response.Status,
		"responseSize", len(response.Body),
	)

	// Upload receipt asynchronously
	if response.Receipt != nil {
		response.Receipt["agentId"] = agentId.String()
		response.Receipt["request"] = "0x" + hex.EncodeToString(event.Payload)
		go l.uploadReceipt(requestIdStr, response.Receipt)
	}

	// Submit the response to the blockchain (fire and forget)
	success := response.Status >= 200 && response.Status < 300
	go l.submitResponse(requestId, response.Body, event.MaxCostPerAgent, success)
}

// uploadReceipt uploads a receipt to the receipts service asynchronously.
func (l *Listener) uploadReceipt(requestID string, receipt map[string]interface{}) {
	if l.receiptsServiceURL == "" {
		return
	}

	receiptJSON, err := json.Marshal(receipt)
	if err != nil {
		slog.Error("Failed to marshal receipt", "request_id", requestID, "error", err)
		return
	}

	receiptURL := fmt.Sprintf("%s/agent-receipts?requestId=%s", l.receiptsServiceURL, url.QueryEscape(requestID))
	resp, err := http.Post(receiptURL, "application/json", bytes.NewReader(receiptJSON))
	if err != nil {
		slog.Error("Failed to upload receipt", "request_id", requestID, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		slog.Error("Failed to upload receipt", "request_id", requestID, "status", resp.StatusCode)
	} else {
		slog.Info("Receipt uploaded", "request_id", requestID)
	}
}

func (l *Listener) submitResponse(requestId *big.Int, result []byte, cost *big.Int, success bool) {
	ctx := l.ctx

	// For now, use 0 as receipt (CID)
	txReceipt := big.NewInt(0)
	if cost == nil {
		cost = big.NewInt(0)
	}

	// ABI-encode the submitResponse calldata
	calldata, err := sessionrpc.EncodeSubmitResponse(requestId, result, txReceipt, cost, success)
	if err != nil {
		slog.Error("Failed to encode submitResponse calldata", "requestId", requestId, "error", err)
		return
	}

	slog.Info("Submitting response via session RPC",
		"requestId", requestId,
		"validator", l.address.Hex(),
		"contract", l.somniaAgentsAddr.Hex(),
		"resultSize", len(result),
		"cost", cost,
	)

	receipt, err := l.session.Send(ctx, l.somniaAgentsAddr.Hex(), calldata, "0x0", sessionrpc.SubmitResponseGas)
	if err != nil {
		slog.Error("Failed to submit response",
			"requestId", requestId,
			"validator", l.address.Hex(),
			"contract", l.somniaAgentsAddr.Hex(),
			"error", err,
		)
		return
	}

	if receipt.Success() {
		slog.Info("Response submitted successfully",
			"requestId", requestId,
			"validator", l.address.Hex(),
			"txHash", receipt.TransactionHash,
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)
	} else {
		// Try to get the revert reason by replaying the call at the failed block
		revertReason := "unknown (replay succeeded - state may have changed)"
		var rawError string

		calldataBytes, _ := hex.DecodeString(strings.TrimPrefix(calldata, "0x"))
		to := l.somniaAgentsAddr
		callMsg := ethereum.CallMsg{
			From: l.address,
			To:   &to,
			Gas:  2_000_000,
			Data: calldataBytes,
		}

		// Parse block number from receipt for accurate replay
		blockNum := new(big.Int)
		blockHex := strings.TrimPrefix(receipt.BlockNumber, "0x")
		blockNum.SetString(blockHex, 16)

		_, callErr := l.client.CallContract(ctx, callMsg, blockNum)
		if callErr != nil {
			rawError = callErr.Error()
			revertReason = decodeRevertReason(callErr)
		}

		slog.Error("Response transaction reverted",
			"requestId", requestId,
			"validator", l.address.Hex(),
			"contract", l.somniaAgentsAddr.Hex(),
			"txHash", receipt.TransactionHash,
			"block", receipt.BlockNumber,
			"status", receipt.Status,
			"gasUsed", receipt.GasUsed,
			"revertReason", revertReason,
			"rawError", rawError,
		)
	}
}
