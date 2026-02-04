// Package committee provides Go bindings for the Committee smart contract.
package committee

import (
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// CommitteeABI is the ABI of the Committee contract.
const CommitteeABI = `[
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "address", "name": "member", "type": "address"}
		],
		"name": "MemberJoined",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "address", "name": "member", "type": "address"}
		],
		"name": "MemberLeft",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "address", "name": "member", "type": "address"}
		],
		"name": "MemberTimedOut",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "getActiveMembers",
		"outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "address", "name": "addr", "type": "address"}],
		"name": "isActive",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "n", "type": "uint256"},
			{"internalType": "bytes32", "name": "seed", "type": "bytes32"}
		],
		"name": "electSubcommittee",
		"outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "address", "name": "", "type": "address"}],
		"name": "lastHeartbeat",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "lastUpkeep",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "HEARTBEAT_INTERVAL",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"name": "members",
		"outputs": [{"internalType": "address", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
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
	},
	{
		"inputs": [],
		"name": "upkeep",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

// Committee is a Go binding for the Committee smart contract.
type Committee struct {
	CommitteeCaller
	CommitteeTransactor
	address common.Address
}

// CommitteeCaller provides read-only contract methods.
type CommitteeCaller struct {
	contract *bind.BoundContract
}

// CommitteeTransactor provides write contract methods.
type CommitteeTransactor struct {
	contract *bind.BoundContract
}

// NewCommittee creates a new instance of Committee bound to a specific address.
func NewCommittee(address common.Address, backend bind.ContractBackend) (*Committee, error) {
	parsed, err := abi.JSON(strings.NewReader(CommitteeABI))
	if err != nil {
		return nil, err
	}

	contract := bind.NewBoundContract(address, parsed, backend, backend, backend)

	return &Committee{
		CommitteeCaller:     CommitteeCaller{contract: contract},
		CommitteeTransactor: CommitteeTransactor{contract: contract},
		address:             address,
	}, nil
}

// Address returns the contract address.
func (c *Committee) Address() common.Address {
	return c.address
}

// GetActiveMembers returns the list of currently active committee members.
func (c *CommitteeCaller) GetActiveMembers(opts *bind.CallOpts) ([]common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "getActiveMembers")
	if err != nil {
		return nil, err
	}
	return out[0].([]common.Address), nil
}

// IsActive checks if an address is an active committee member.
func (c *CommitteeCaller) IsActive(opts *bind.CallOpts, addr common.Address) (bool, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "isActive", addr)
	if err != nil {
		return false, err
	}
	return out[0].(bool), nil
}

// ElectSubcommittee returns a deterministically elected subcommittee.
func (c *CommitteeCaller) ElectSubcommittee(opts *bind.CallOpts, n *big.Int, seed [32]byte) ([]common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "electSubcommittee", n, seed)
	if err != nil {
		return nil, err
	}
	return out[0].([]common.Address), nil
}

// LastHeartbeat returns the timestamp of an address's last heartbeat.
func (c *CommitteeCaller) LastHeartbeat(opts *bind.CallOpts, addr common.Address) (*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "lastHeartbeat", addr)
	if err != nil {
		return nil, err
	}
	return out[0].(*big.Int), nil
}

// LastUpkeep returns the timestamp of the last upkeep call.
func (c *CommitteeCaller) LastUpkeep(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "lastUpkeep")
	if err != nil {
		return nil, err
	}
	return out[0].(*big.Int), nil
}

// HeartbeatInterval returns the required heartbeat interval in seconds.
func (c *CommitteeCaller) HeartbeatInterval(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "HEARTBEAT_INTERVAL")
	if err != nil {
		return nil, err
	}
	return out[0].(*big.Int), nil
}

// Members returns the address at a given index in the members list.
func (c *CommitteeCaller) Members(opts *bind.CallOpts, index *big.Int) (common.Address, error) {
	var out []interface{}
	err := c.contract.Call(opts, &out, "members", index)
	if err != nil {
		return common.Address{}, err
	}
	return out[0].(common.Address), nil
}

// HeartbeatMembership sends a heartbeat transaction to join or maintain active membership.
func (c *CommitteeTransactor) HeartbeatMembership(opts *bind.TransactOpts) (*types.Transaction, error) {
	return c.contract.Transact(opts, "heartbeatMembership")
}

// LeaveMembership sends a transaction to explicitly leave the committee.
func (c *CommitteeTransactor) LeaveMembership(opts *bind.TransactOpts) (*types.Transaction, error) {
	return c.contract.Transact(opts, "leaveMembership")
}

// Upkeep triggers member pruning for inactive members.
func (c *CommitteeTransactor) Upkeep(opts *bind.TransactOpts) (*types.Transaction, error) {
	return c.contract.Transact(opts, "upkeep")
}
