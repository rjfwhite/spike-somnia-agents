// Package sessionrpc provides a client for Somnia's high-performance session
// transaction RPCs. The node manages nonces internally and returns full
// receipts synchronously, eliminating the need for local nonce tracking or
// receipt polling. Safe to call concurrently from multiple goroutines.
package sessionrpc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync/atomic"

	"github.com/ethereum/go-ethereum/common"
)

// Receipt mirrors the eth_getTransactionReceipt response returned by
// somnia_sendSessionTransaction.
type Receipt struct {
	TransactionHash   string `json:"transactionHash"`
	TransactionIndex  string `json:"transactionIndex"`
	BlockHash         string `json:"blockHash"`
	BlockNumber       string `json:"blockNumber"`
	From              string `json:"from"`
	To                string `json:"to"`
	CumulativeGasUsed string `json:"cumulativeGasUsed"`
	GasUsed           string `json:"gasUsed"`
	ContractAddress   string `json:"contractAddress"`
	Status            string `json:"status"`
	LogsBloom         string `json:"logsBloom"`
	Logs              []Log  `json:"logs"`
	EffectiveGasPrice string `json:"effectiveGasPrice"`
	Type              string `json:"type"`
}

// Log is a single event log entry from a transaction receipt.
type Log struct {
	Address          string   `json:"address"`
	Topics           []string `json:"topics"`
	Data             string   `json:"data"`
	BlockNumber      string   `json:"blockNumber"`
	TransactionHash  string   `json:"transactionHash"`
	TransactionIndex string   `json:"transactionIndex"`
	BlockHash        string   `json:"blockHash"`
	LogIndex         string   `json:"logIndex"`
	Removed          bool     `json:"removed"`
}

// Success returns true if the transaction was not reverted.
func (r *Receipt) Success() bool {
	return r.Status == "0x1"
}

type sendParams struct {
	Seed  string `json:"seed"`
	Gas   string `json:"gas"`
	To    string `json:"to"`
	Value string `json:"value"`
	Data  string `json:"data"`
}

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	ID      int64       `json:"id"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
	ID      int64           `json:"id"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    string `json:"data,omitempty"`
}

// Client sends transactions via Somnia's session RPCs.
type Client struct {
	rpcURL  string
	seed    string
	address common.Address
	httpC   *http.Client
	nextID  atomic.Int64
}

// New creates a Client. It calls somnia_getSessionAddress to resolve and
// validate the wallet address derived from the seed. The seed should be
// the same hex-encoded secret key used for committee membership.
func New(rpcURL, seed string) (*Client, error) {
	if seed == "" {
		return nil, fmt.Errorf("session seed is required")
	}

	c := &Client{
		rpcURL: rpcURL,
		seed:   seed,
		httpC:  &http.Client{},
	}

	// Resolve address from seed
	var addrHex string
	if err := c.call(context.Background(), "somnia_getSessionAddress", []string{seed}, &addrHex); err != nil {
		return nil, fmt.Errorf("somnia_getSessionAddress: %w", err)
	}

	if !common.IsHexAddress(addrHex) {
		return nil, fmt.Errorf("somnia_getSessionAddress returned invalid address: %s", addrHex)
	}

	c.address = common.HexToAddress(addrHex)
	slog.Info("Session RPC client initialized",
		"address", c.address.Hex(),
		"rpc", rpcURL,
	)

	return c, nil
}

// Address returns the wallet address derived from the session seed.
func (c *Client) Address() common.Address {
	return c.address
}

// Send submits a transaction via somnia_sendSessionTransaction and blocks
// until the receipt is returned. The node manages nonces internally.
// Safe to call concurrently from multiple goroutines.
func (c *Client) Send(ctx context.Context, to string, data string, value string, gas string) (*Receipt, error) {
	params := []sendParams{{
		Seed:  c.seed,
		Gas:   gas,
		To:    to,
		Value: value,
		Data:  data,
	}}

	var receipt Receipt
	if err := c.call(ctx, "somnia_sendSessionTransaction", params, &receipt); err != nil {
		return nil, err
	}

	return &receipt, nil
}

func (c *Client) call(ctx context.Context, method string, params interface{}, result interface{}) error {
	id := c.nextID.Add(1)

	reqBody := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      id,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpC.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	var rpcResp jsonRPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return fmt.Errorf("unmarshal response: %w", err)
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("RPC %s (code %d): %s (data: %s)",
			method, rpcResp.Error.Code, rpcResp.Error.Message, rpcResp.Error.Data)
	}

	if result != nil {
		if err := json.Unmarshal(rpcResp.Result, result); err != nil {
			return fmt.Errorf("unmarshal result: %w", err)
		}
	}

	return nil
}
