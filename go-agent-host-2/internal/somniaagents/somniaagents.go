// Package somniaagents provides Go bindings for the SomniaAgents smart contract.
package somniaagents

import (
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// SomniaAgentsABI is the ABI of the SomniaAgents contract.
const SomniaAgentsABI = `[
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256"},
			{"indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256"},
			{"indexed": false, "internalType": "uint256", "name": "maxCostPerAgent", "type": "uint256"},
			{"indexed": false, "internalType": "bytes", "name": "payload", "type": "bytes"},
			{"indexed": false, "internalType": "address[]", "name": "subcommittee", "type": "address[]"}
		],
		"name": "RequestCreated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256"},
			{"indexed": false, "internalType": "uint8", "name": "status", "type": "uint8"}
		],
		"name": "RequestFinalized",
		"type": "event"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "requestId", "type": "uint256"},
			{"internalType": "bytes", "name": "result", "type": "bytes"},
			{"internalType": "uint256", "name": "receipt", "type": "uint256"},
			{"internalType": "uint256", "name": "cost", "type": "uint256"},
			{"internalType": "bool", "name": "success", "type": "bool"}
		],
		"name": "submitResponse",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint256", "name": "requestId", "type": "uint256"}],
		"name": "hasRequest",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "agentRegistry",
		"outputs": [{"internalType": "contract IAgentRegistry", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "committee",
		"outputs": [{"internalType": "contract ICommittee", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

// RequestCreatedEvent represents the RequestCreated event from the contract.
type RequestCreatedEvent struct {
	RequestId    *big.Int
	AgentId      *big.Int
	MaxCostPerAgent *big.Int
	Payload      []byte
	Subcommittee []common.Address
}

// SomniaAgents is a Go binding for the SomniaAgents smart contract.
type SomniaAgents struct {
	SomniaAgentsCaller
	SomniaAgentsTransactor
	SomniaAgentsFilterer
	address common.Address
	abi     abi.ABI
}

// SomniaAgentsCaller provides read-only contract methods.
type SomniaAgentsCaller struct {
	contract *bind.BoundContract
}

// SomniaAgentsTransactor provides write contract methods.
type SomniaAgentsTransactor struct {
	contract *bind.BoundContract
}

// SomniaAgentsFilterer provides event filtering methods.
type SomniaAgentsFilterer struct {
	contract *bind.BoundContract
	abi      abi.ABI
}

// NewSomniaAgents creates a new instance of SomniaAgents bound to a specific address.
func NewSomniaAgents(address common.Address, backend bind.ContractBackend) (*SomniaAgents, error) {
	parsed, err := abi.JSON(strings.NewReader(SomniaAgentsABI))
	if err != nil {
		return nil, err
	}

	contract := bind.NewBoundContract(address, parsed, backend, backend, backend)

	return &SomniaAgents{
		SomniaAgentsCaller:     SomniaAgentsCaller{contract: contract},
		SomniaAgentsTransactor: SomniaAgentsTransactor{contract: contract},
		SomniaAgentsFilterer:   SomniaAgentsFilterer{contract: contract, abi: parsed},
		address:                address,
		abi:                    parsed,
	}, nil
}

// Address returns the contract address.
func (s *SomniaAgents) Address() common.Address {
	return s.address
}

// ABI returns the contract ABI.
func (s *SomniaAgents) ABI() abi.ABI {
	return s.abi
}

// HasRequest checks if a request exists and hasn't been overwritten.
func (c *SomniaAgentsCaller) HasRequest(opts *bind.CallOpts, requestId *big.Int) (bool, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "hasRequest", requestId)
	if err != nil {
		return false, err
	}
	return out[0].(bool), nil
}

// AgentRegistry returns the address of the AgentRegistry contract.
func (c *SomniaAgentsCaller) AgentRegistry(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "agentRegistry")
	if err != nil {
		return common.Address{}, err
	}
	return out[0].(common.Address), nil
}

// Committee returns the address of the Committee contract.
func (c *SomniaAgentsCaller) Committee(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "committee")
	if err != nil {
		return common.Address{}, err
	}
	return out[0].(common.Address), nil
}

// SubmitResponse submits a response for a request.
func (t *SomniaAgentsTransactor) SubmitResponse(opts *bind.TransactOpts, requestId *big.Int, result []byte, receipt *big.Int, cost *big.Int, success bool) (*types.Transaction, error) {
	return t.contract.Transact(opts, "submitResponse", requestId, result, receipt, cost, success)
}

// ParseRequestCreated parses a RequestCreated event from a log.
func (f *SomniaAgentsFilterer) ParseRequestCreated(log types.Log) (*RequestCreatedEvent, error) {
	event := new(RequestCreatedEvent)

	// Indexed fields are in topics
	if len(log.Topics) < 3 {
		return nil, nil
	}

	event.RequestId = new(big.Int).SetBytes(log.Topics[1].Bytes())
	event.AgentId = new(big.Int).SetBytes(log.Topics[2].Bytes())

	// Non-indexed fields are in data
	err := f.abi.UnpackIntoInterface(event, "RequestCreated", log.Data)
	if err != nil {
		return nil, err
	}

	return event, nil
}
