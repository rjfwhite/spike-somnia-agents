// Package submitter provides serialized blockchain transaction submission.
// A single goroutine processes all transactions sequentially via a channel,
// ensuring correct nonce management and automatic recovery on failure.
package submitter

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"sync"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// TxResult holds the outcome of a submitted transaction.
type TxResult struct {
	Tx      *types.Transaction
	Receipt *types.Receipt
	Err     error
}

type txJob struct {
	name    string
	ctx     context.Context
	execute func(auth *bind.TransactOpts) (*types.Transaction, error)
	result  chan TxResult
}

// Submitter serializes all transaction submissions through a single goroutine.
type Submitter struct {
	client  *ethclient.Client
	auth    *bind.TransactOpts
	address common.Address
	nonce   uint64
	rpcURL  string
	jobs    chan txJob
	wg      sync.WaitGroup
}

// New creates a Submitter. It loads SECRET_KEY from the environment,
// connects to the RPC, fetches the initial nonce, and starts the
// processing goroutine.
func New(rpcURL string) (*Submitter, error) {
	privateKeyHex := os.Getenv("SECRET_KEY")
	if privateKeyHex == "" {
		return nil, fmt.Errorf("SECRET_KEY environment variable is required")
	}
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid secret key: %w", err)
	}

	publicKeyECDSA, ok := privateKey.Public().(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("failed to cast public key to ECDSA")
	}
	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC %s: %w", rpcURL, err)
	}

	chainID, err := client.ChainID(context.Background())
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create transactor: %w", err)
	}
	auth.GasLimit = 10000000
	auth.GasPrice = big.NewInt(10_000_000_000)

	nonce, err := client.PendingNonceAt(context.Background(), address)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get initial nonce: %w", err)
	}

	slog.Info("Submitter initialized",
		"address", address.Hex(),
		"chainID", chainID,
		"nonce", nonce,
		"rpc", rpcURL,
	)

	s := &Submitter{
		client:  client,
		auth:    auth,
		address: address,
		nonce:   nonce,
		rpcURL:  rpcURL,
		jobs:    make(chan txJob, 64),
	}

	s.wg.Add(1)
	go s.run()

	return s, nil
}

// Address returns the wallet address derived from the secret key.
func (s *Submitter) Address() common.Address {
	return s.address
}

// Submit sends a transaction job to the processing goroutine and blocks
// until the transaction is mined or fails. The caller's context controls
// cancellation and timeout.
func (s *Submitter) Submit(ctx context.Context, name string, fn func(auth *bind.TransactOpts) (*types.Transaction, error)) TxResult {
	result := make(chan TxResult, 1)
	job := txJob{
		name:    name,
		ctx:     ctx,
		execute: fn,
		result:  result,
	}

	select {
	case s.jobs <- job:
	case <-ctx.Done():
		return TxResult{Err: ctx.Err()}
	}

	select {
	case r := <-result:
		return r
	case <-ctx.Done():
		return TxResult{Err: ctx.Err()}
	}
}

// Stop closes the job channel and waits for the processing goroutine to
// drain any remaining jobs before returning.
func (s *Submitter) Stop() {
	close(s.jobs)
	s.wg.Wait()
	s.client.Close()
}

func (s *Submitter) run() {
	defer s.wg.Done()

	for job := range s.jobs {
		s.auth.Nonce = new(big.Int).SetUint64(s.nonce)

		slog.Info("Submitter sending transaction",
			"name", job.name,
			"nonce", s.nonce,
		)

		tx, err := job.execute(s.auth)
		if err != nil {
			slog.Error("Submitter transaction send failed",
				"name", job.name,
				"nonce", s.nonce,
				"error", err,
			)
			s.resyncNonce()
			job.result <- TxResult{Err: fmt.Errorf("send failed: %w", err)}
			continue
		}

		slog.Info("Submitter transaction sent, waiting for receipt",
			"name", job.name,
			"txHash", tx.Hash().Hex(),
			"nonce", s.nonce,
		)

		receipt, err := bind.WaitMined(job.ctx, s.client, tx)
		if err != nil {
			slog.Error("Submitter failed waiting for receipt",
				"name", job.name,
				"txHash", tx.Hash().Hex(),
				"nonce", s.nonce,
				"error", err,
			)
			s.resyncNonce()
			job.result <- TxResult{Tx: tx, Err: fmt.Errorf("wait mined failed: %w", err)}
			continue
		}

		// Nonce was consumed regardless of receipt status (success or revert).
		s.nonce++

		slog.Info("Submitter transaction mined",
			"name", job.name,
			"txHash", tx.Hash().Hex(),
			"status", receipt.Status,
			"block", receipt.BlockNumber,
			"gasUsed", receipt.GasUsed,
		)

		job.result <- TxResult{Tx: tx, Receipt: receipt}
	}
}

func (s *Submitter) resyncNonce() {
	nonce, err := s.client.PendingNonceAt(context.Background(), s.address)
	if err != nil {
		slog.Error("Submitter failed to resync nonce", "error", err)
		return
	}
	slog.Info("Submitter resynced nonce", "old", s.nonce, "new", nonce)
	s.nonce = nonce
}
