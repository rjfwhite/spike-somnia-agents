// Package listener provides blockchain event listening for agent request execution.
package listener

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"

	"github.com/somnia-chain/agent-runner/internal/agentregistry"
	"github.com/somnia-chain/agent-runner/internal/agents"
	"github.com/somnia-chain/agent-runner/internal/somniaagents"
)

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
			if hexStr, ok := data.(string); ok {
				return decodeRevertData(hexStr)
			}
		}
	}

	return err.Error()
}

// decodeRevertData decodes ABI-encoded revert data (Error(string) format).
func decodeRevertData(hexData string) string {
	// Remove 0x prefix if present
	hexData = strings.TrimPrefix(hexData, "0x")

	data, err := hex.DecodeString(hexData)
	if err != nil || len(data) < 4 {
		return "failed to decode: " + hexData
	}

	// Check for Error(string) selector: 0x08c379a0
	errorSelector := []byte{0x08, 0xc3, 0x79, 0xa0}
	if !bytes.Equal(data[:4], errorSelector) {
		return "unknown error format: 0x" + hexData
	}

	// Need at least selector (4) + offset (32) + length (32) = 68 bytes
	if len(data) < 68 {
		return "revert data too short: 0x" + hexData
	}

	// Get string length from bytes 36-68 (after selector and offset)
	length := new(big.Int).SetBytes(data[36:68]).Uint64()

	// Check we have enough data for the string
	if uint64(len(data)) < 68+length {
		return "revert data truncated: 0x" + hexData
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
	SomniaAgentsContract string
	RPCURL               string
	ReceiptsServiceURL   string
}

// Listener listens for RequestCreated events and executes agents.
type Listener struct {
	client         *ethclient.Client
	somniaAgents   *somniaagents.SomniaAgents
	agentRegistry  *agentregistry.AgentRegistry
	agentManager   *agents.Manager
	auth           *bind.TransactOpts
	address        common.Address
	privateKey     *ecdsa.PrivateKey
	chainID        *big.Int
	rpcURL         string
	wsURL          string

	// Resolved contract addresses
	somniaAgentsAddr  common.Address
	agentRegistryAddr common.Address
	committeeAddr     common.Address

	// Receipts service configuration
	receiptsServiceURL string

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Track processed requests to avoid duplicates
	processed     map[string]bool
	processedLock sync.Mutex
}

// New creates a new Listener instance.
// The private key is loaded from the PRIVATE_KEY environment variable.
func New(cfg Config, agentManager *agents.Manager) (*Listener, error) {
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

	slog.Info("Listener loaded wallet", "address", address.Hex())

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
	slog.Info("Listener connected to chain", "chainID", chainID, "rpc", cfg.RPCURL)

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

	// Create transactor
	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create transactor: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Listener{
		client:             client,
		somniaAgents:       somniaAgentsContract,
		agentRegistry:      agentRegistryContract,
		agentManager:       agentManager,
		auth:               auth,
		address:            address,
		privateKey:         privateKey,
		chainID:            chainID,
		rpcURL:             cfg.RPCURL,
		wsURL:              httpToWsURL(cfg.RPCURL),
		somniaAgentsAddr:   somniaAgentsAddr,
		agentRegistryAddr:  agentRegistryAddr,
		committeeAddr:      committeeAddr,
		receiptsServiceURL: cfg.ReceiptsServiceURL,
		ctx:                ctx,
		cancel:             cancel,
		processed:          make(map[string]bool),
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

// Start begins listening for RequestCreated events.
func (l *Listener) Start() {
	slog.Info("Starting event listener",
		"somnia_agents", l.somniaAgents.Address().Hex(),
		"agent_registry", l.agentRegistry.Address().Hex(),
		"validator", l.address.Hex(),
	)

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
		"requester", event.Requester.Hex(),
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

	// Handle the request in a goroutine
	go l.handleRequest(event)
}

func (l *Listener) handleRequest(event *somniaagents.RequestCreatedEvent) {
	ctx := l.ctx
	requestId := event.RequestId
	agentId := event.AgentId

	// Check if request is still pending
	isPending, err := l.somniaAgents.IsRequestPending(&bind.CallOpts{Context: ctx}, requestId)
	if err != nil {
		slog.Error("Failed to check if request is pending", "requestId", requestId, "error", err)
		return
	}
	if !isPending {
		slog.Info("Request is no longer pending", "requestId", requestId)
		return
	}

	// Get agent info from registry
	agent, err := l.agentRegistry.GetAgent(&bind.CallOpts{Context: ctx}, agentId)
	if err != nil {
		slog.Error("Failed to get agent from registry", "agentId", agentId, "error", err)
		return
	}

	slog.Info("Retrieved agent info",
		"agentId", agentId,
		"containerImageUri", agent.ContainerImageUri,
		"cost", agent.Cost,
	)

	if agent.ContainerImageUri == "" {
		slog.Error("Agent has no container image URI", "agentId", agentId)
		return
	}

	// Generate a request ID string for the agent
	requestIdStr := fmt.Sprintf("blockchain-%d", requestId.Uint64())

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

	// Upload receipt asynchronously (don't block blockchain submission)
	if response.Receipt != nil {
		go l.uploadReceipt(requestIdStr, response.Receipt)
	}

	// Submit the response to the blockchain
	l.submitResponse(requestId, response.Body, agent.Cost)
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

func (l *Listener) submitResponse(requestId *big.Int, result []byte, agentCost *big.Int) {
	ctx := l.ctx

	// Check if request is still pending before submitting
	isPending, err := l.somniaAgents.IsRequestPending(&bind.CallOpts{Context: ctx}, requestId)
	if err != nil {
		slog.Error("Failed to check if request is pending before submit", "requestId", requestId, "error", err)
		return
	}
	if !isPending {
		slog.Info("Request is no longer pending, skipping response submission", "requestId", requestId)
		return
	}

	// Get current nonce
	nonce, err := l.client.PendingNonceAt(ctx, l.address)
	if err != nil {
		slog.Error("Failed to get nonce", "requestId", requestId, "error", err)
		return
	}
	l.auth.Nonce = big.NewInt(int64(nonce))

	// Get suggested gas price
	gasPrice, err := l.client.SuggestGasPrice(ctx)
	if err != nil {
		slog.Error("Failed to get gas price", "requestId", requestId, "error", err)
		return
	}
	l.auth.GasPrice = gasPrice

	// For now, use 0 as receipt (CID) and agent cost as price
	receipt := big.NewInt(0)
	price := agentCost
	if price == nil {
		price = big.NewInt(0)
	}

	slog.Info("Submitting response to blockchain",
		"requestId", requestId,
		"resultSize", len(result),
		"price", price,
		"nonce", nonce,
	)

	tx, err := l.somniaAgents.SubmitResponse(l.auth, requestId, result, receipt, price)
	if err != nil {
		slog.Error("Failed to submit response",
			"requestId", requestId,
			"error", err,
			"revertReason", decodeRevertReason(err),
		)
		return
	}

	slog.Info("Response transaction sent", "requestId", requestId, "txHash", tx.Hash().Hex())

	// Wait for transaction receipt
	txReceipt, err := bind.WaitMined(ctx, l.client, tx)
	if err != nil {
		slog.Error("Failed to wait for response transaction", "requestId", requestId, "error", err)
		return
	}

	if txReceipt.Status == 1 {
		slog.Info("Response submitted successfully",
			"requestId", requestId,
			"txHash", tx.Hash().Hex(),
			"block", txReceipt.BlockNumber,
			"gasUsed", txReceipt.GasUsed,
		)
	} else {
		// Try to get the revert reason by calling the same method
		revertReason := "unknown"
		callMsg := ethereum.CallMsg{
			From:     l.address,
			To:       tx.To(),
			Gas:      tx.Gas(),
			GasPrice: tx.GasPrice(),
			Value:    tx.Value(),
			Data:     tx.Data(),
		}
		// Replay the call at the block where it failed to get revert data
		_, callErr := l.client.CallContract(ctx, callMsg, txReceipt.BlockNumber)
		if callErr != nil {
			revertReason = decodeRevertReason(callErr)
		}
		slog.Error("Response transaction failed",
			"requestId", requestId,
			"txHash", tx.Hash().Hex(),
			"status", txReceipt.Status,
			"gasUsed", txReceipt.GasUsed,
			"revertReason", revertReason,
		)
	}
}
