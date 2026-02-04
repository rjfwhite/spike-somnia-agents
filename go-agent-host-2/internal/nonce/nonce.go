// Package nonce provides a local nonce manager for transaction submission.
package nonce

import (
	"context"
	"math/big"
	"sync"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Manager tracks nonces locally to avoid RPC calls on every transaction.
type Manager struct {
	mu    sync.Mutex
	nonce uint64
}

// NewManager creates a nonce manager, fetching the initial nonce from the chain.
func NewManager(ctx context.Context, rpcURL string, address common.Address) (*Manager, error) {
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	nonce, err := client.PendingNonceAt(ctx, address)
	if err != nil {
		return nil, err
	}

	return &Manager{nonce: nonce}, nil
}

// Next returns the next nonce and increments the internal counter.
func (m *Manager) Next() *big.Int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := m.nonce
	m.nonce++
	return big.NewInt(int64(n))
}

// Current returns the current nonce without incrementing.
func (m *Manager) Current() uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.nonce
}
