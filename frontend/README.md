# Somnia Agents Frontend

A Next.js application for interacting with the SomniaAgents smart contract on the Somnia blockchain.

## Features

- **View Contract Information**: See contract details like name, symbol, and total agents
- **View Agents**: Look up any agent by ID and see its owner, price, and metadata URI
- **Mint New Agents**: Create new agent NFTs with custom metadata
- **Create Requests**: Submit requests to agents (with payment if required)
- **Wallet Integration**: Connect with MetaMask or other Web3 wallets

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Viem** - Ethereum library for smart contract interaction
- **Wagmi** - React hooks for Ethereum
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MetaMask or another Web3 wallet
- Somnia network configured in your wallet

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configure Somnia Network in MetaMask

Add the Somnia network to your wallet with these details:

- **Network Name**: Somnia
- **RPC URL**: https://somnia-rpc.publicnode.com
- **Chain ID**: 5031
- **Currency Symbol**: STT

## Contract Information

- **Contract Address**: `0x1B8c77a1DD1656902d657dB1452145626cc6593f`
- **Network**: Somnia (Chain ID: 5031)
- **Contract Type**: ERC721 NFT (Agent Marketplace)

## How It Works

### Agents

Agents are NFTs that represent AI services. Each agent has:
- A unique token ID
- An owner (who receives payments)
- A price (in STT) to invoke the agent
- Metadata URI (describing the agent's capabilities)

### Workflow

1. **Mint an Agent**: Create a new agent NFT with metadata describing its capabilities
2. **Set Price** (agent owner only): Define how much it costs to use your agent
3. **Create Request**: Users can submit requests to agents, paying the required fee
4. **Response Handling**: Agents process requests off-chain and responses are recorded on-chain

## Project Structure

```
frontend/
├── app/              # Next.js app directory
│   ├── layout.tsx    # Root layout with providers
│   └── page.tsx      # Home page
├── components/       # React components
│   ├── AgentViewer.tsx
│   ├── ContractReader.tsx
│   ├── CreateRequest.tsx
│   ├── MintAgent.tsx
│   ├── Providers.tsx
│   └── WalletConnect.tsx
└── lib/              # Configuration and utilities
    ├── contract.ts   # Contract ABI and constants
    └── wagmi.ts      # Wagmi configuration
```

## Development Notes

- All contract interactions are type-safe with TypeScript
- The app uses the Wagmi React hooks for blockchain state management
- TanStack Query handles caching and refetching of contract data
- Viem is used for low-level Ethereum operations

## Build for Production

```bash
npm run build
npm start
```

## License

UNLICENSED
