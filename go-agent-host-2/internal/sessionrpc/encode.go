package sessionrpc

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
)

// DefaultGas is the default gas limit for session transactions (5M gas, hex-encoded).
const DefaultGas = "0x4C4B40"

// Minimal ABI fragments — only the write functions called via session RPC.

const somniaAgentsWriteABI = `[{
	"inputs": [
		{"type": "uint256", "name": "requestId"},
		{"type": "bytes", "name": "result"},
		{"type": "uint256", "name": "receipt"},
		{"type": "uint256", "name": "price"}
	],
	"name": "submitResponse",
	"outputs": [],
	"stateMutability": "nonpayable",
	"type": "function"
}]`

const committeeWriteABIJSON = `[
	{
		"inputs": [],
		"name": "heartbeatMembership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "leaveMembership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

var (
	agentsWriteABI       abi.ABI
	committeeParsedABI   abi.ABI
)

func init() {
	var err error
	agentsWriteABI, err = abi.JSON(strings.NewReader(somniaAgentsWriteABI))
	if err != nil {
		panic("sessionrpc: parse submitResponse ABI: " + err.Error())
	}
	committeeParsedABI, err = abi.JSON(strings.NewReader(committeeWriteABIJSON))
	if err != nil {
		panic("sessionrpc: parse committee ABI: " + err.Error())
	}
}

// EncodeSubmitResponse returns 0x-prefixed calldata for
// submitResponse(requestId, result, receipt, price).
func EncodeSubmitResponse(requestId *big.Int, result []byte, receipt *big.Int, price *big.Int) (string, error) {
	data, err := agentsWriteABI.Pack("submitResponse", requestId, result, receipt, price)
	if err != nil {
		return "", fmt.Errorf("encode submitResponse: %w", err)
	}
	return "0x" + hex.EncodeToString(data), nil
}

// EncodeHeartbeatMembership returns 0x-prefixed calldata for heartbeatMembership().
func EncodeHeartbeatMembership() (string, error) {
	data, err := committeeParsedABI.Pack("heartbeatMembership")
	if err != nil {
		return "", fmt.Errorf("encode heartbeatMembership: %w", err)
	}
	return "0x" + hex.EncodeToString(data), nil
}

// EncodeLeaveMembership returns 0x-prefixed calldata for leaveMembership().
func EncodeLeaveMembership() (string, error) {
	data, err := committeeParsedABI.Pack("leaveMembership")
	if err != nil {
		return "", fmt.Errorf("encode leaveMembership: %w", err)
	}
	return "0x" + hex.EncodeToString(data), nil
}
