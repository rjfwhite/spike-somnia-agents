// Package agentregistry provides Go bindings for the AgentRegistry smart contract.
package agentregistry

import (
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

// AgentRegistryABI is the ABI of the AgentRegistry contract.
const AgentRegistryABI = `[
	{
		"inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
		"name": "getAgent",
		"outputs": [
			{
				"components": [
					{"internalType": "uint256", "name": "agentId", "type": "uint256"},
					{"internalType": "address", "name": "owner", "type": "address"},
					{"internalType": "string", "name": "metadataUri", "type": "string"},
					{"internalType": "string", "name": "containerImageUri", "type": "string"},
					{"internalType": "uint256", "name": "cost", "type": "uint256"}
				],
				"internalType": "struct Agent",
				"name": "agent",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
		"name": "agentExists",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getAllAgents",
		"outputs": [{"internalType": "uint256[]", "name": "agentIds", "type": "uint256[]"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

// Agent represents an agent registered in the AgentRegistry contract.
type Agent struct {
	AgentId           *big.Int
	Owner             common.Address
	MetadataUri       string
	ContainerImageUri string
	Cost              *big.Int
}

// AgentRegistry is a Go binding for the AgentRegistry smart contract.
type AgentRegistry struct {
	AgentRegistryCaller
	address common.Address
}

// AgentRegistryCaller provides read-only contract methods.
type AgentRegistryCaller struct {
	contract *bind.BoundContract
}

// NewAgentRegistry creates a new instance of AgentRegistry bound to a specific address.
func NewAgentRegistry(address common.Address, backend bind.ContractBackend) (*AgentRegistry, error) {
	parsed, err := abi.JSON(strings.NewReader(AgentRegistryABI))
	if err != nil {
		return nil, err
	}

	contract := bind.NewBoundContract(address, parsed, backend, backend, backend)

	return &AgentRegistry{
		AgentRegistryCaller: AgentRegistryCaller{contract: contract},
		address:             address,
	}, nil
}

// Address returns the contract address.
func (a *AgentRegistry) Address() common.Address {
	return a.address
}

// GetAgent returns the agent info for a given agent ID.
func (c *AgentRegistryCaller) GetAgent(opts *bind.CallOpts, agentId *big.Int) (*Agent, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "getAgent", agentId)
	if err != nil {
		return nil, err
	}

	// The result is a struct, we need to unpack it
	result := out[0].(struct {
		AgentId           *big.Int       `json:"agentId"`
		Owner             common.Address `json:"owner"`
		MetadataUri       string         `json:"metadataUri"`
		ContainerImageUri string         `json:"containerImageUri"`
		Cost              *big.Int       `json:"cost"`
	})

	return &Agent{
		AgentId:           result.AgentId,
		Owner:             result.Owner,
		MetadataUri:       result.MetadataUri,
		ContainerImageUri: result.ContainerImageUri,
		Cost:              result.Cost,
	}, nil
}

// AgentExists checks if an agent exists.
func (c *AgentRegistryCaller) AgentExists(opts *bind.CallOpts, agentId *big.Int) (bool, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "agentExists", agentId)
	if err != nil {
		return false, err
	}
	return out[0].(bool), nil
}

// GetAllAgents returns all registered agent IDs.
func (c *AgentRegistryCaller) GetAllAgents(opts *bind.CallOpts) ([]*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "getAllAgents")
	if err != nil {
		return nil, err
	}
	return out[0].([]*big.Int), nil
}
