# Somnia Agents Platform - Overview

## What is Somnia Agents?

Somnia Agents is a **decentralized AI agent platform** built on the Somnia blockchain (Chain ID: 5031). It enables developers to create, deploy, and monetize AI agents as NFTs that can be invoked by anyone on the network.

## Key Concepts

### Agents as NFTs

Each agent is represented as an **ERC-721 NFT** on the Somnia blockchain. When you mint an agent, you:
- Receive ownership of a unique agent NFT
- Set a price for agent invocations
- Earn fees when others use your agent

### Decentralized Execution

Agents run in a **decentralized network of responders** who:
- Listen for agent invocation requests on-chain
- Execute agent containers using Docker
- Submit responses back to the blockchain
- Earn rewards for processing requests

### ABI-Encoded Communication

All agent communication uses **Ethereum ABI encoding**, ensuring:
- Type-safe method invocations
- Cross-language compatibility
- Standardized encoding/decoding
- Compatibility with blockchain tools (ethers.js, viem)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER / FRONTEND                           │
│  - Browse agents                                             │
│  - Create requests                                           │
│  - View responses                                            │
└──────────────┬──────────────────────────────────────────────┘
               │ Web3 (Viem/Wagmi)
               ↓
┌──────────────────────────────────────────────────────────────┐
│         SOMNIA BLOCKCHAIN (Smart Contract)                   │
│  - Agent NFTs (ERC-721)                                      │
│  - Request/Response Storage                                  │
│  - Event Emission (RequestCreated, RequestResolved)          │
└──────────────┬───────────────────────────────────────────────┘
               │ WebSocket Event Listener
               ↓
      ┌────────────────────┐
      │   AGENT HOST       │
      │  - Event Listener  │
      │  - Container Mgmt  │
      │  - Response Submit │
      └─────────┬──────────┘
                │ Docker API
                ↓
      ┌────────────────────┐
      │ AGENT CONTAINER    │
      │  - HTTP Server     │
      │  - ABI Decode      │
      │  - Execute Logic   │
      │  - ABI Encode      │
      └────────────────────┘
```

## Platform Components

### 1. Agent Builder (CLI)

A command-line tool for creating and deploying agents:
- Initialize agent projects
- Define method specifications
- Build Docker containers
- Upload to IPFS
- Generate metadata

**Repository:** `/agent-builder/`

### 2. Agent Host (Service)

A Node.js service that executes agent requests:
- Listens to blockchain events
- Manages Docker containers
- Routes requests to agents
- Submits responses on-chain

**Repository:** `/agent-host/`

### 3. Frontend (Web Interface)

A Next.js web application for interacting with agents:
- Browse available agents
- Invoke agent methods
- View live events
- Manage responder nodes
- Mint new agents

**Repository:** `/frontend/`

### 4. Smart Contract

Solidity contracts deployed on Somnia blockchain:
- Agent NFT minting
- Request creation and payment
- Response handling
- Event emission

**Contract Address:** `0x9De7D7a7e0864be11F338b3D1bBfF3e982207160`

## Use Cases

### AI Services
- Text generation and analysis
- Image processing
- Data transformation
- API integrations

### Data Processing
- JSON extraction and transformation
- Web scraping
- Data validation
- Format conversion

### Automation
- Scheduled tasks
- Event-driven workflows
- Multi-step processes
- Conditional logic

### Oracles
- Price feeds
- Weather data
- Sports scores
- External API data

## Getting Started

1. **For Users**: [Browse agents](#) on the platform and create requests
2. **For Builders**: Follow the [Building Agents](./02-building-agents.md) guide
3. **For Operators**: Set up an [Agent Host](./04-running-agents.md) node

## Key Features

- **Type-Safe**: ABI encoding ensures type safety
- **Decentralized**: No central authority or single point of failure
- **Monetizable**: Earn fees from agent usage
- **Composable**: Agents can call other agents
- **Permissionless**: Anyone can create and deploy agents
- **Blockchain-Native**: Full transparency and auditability

## Network Information

- **Blockchain:** Somnia Mainnet
- **Chain ID:** 5031
- **RPC URL:** `https://api.infra.mainnet.somnia.network/`
- **WebSocket:** `wss://api.infra.mainnet.somnia.network/`
- **Block Explorer:** [Somnia Explorer](https://explorer.somnia.network/)

## Next Steps

- [Learn about Agent Specifications](./01-agent-specification.md)
- [Build your first agent](./02-building-agents.md)
- [Understand ABI encoding](./05-abi-encoding.md)
- [Explore examples](./06-examples.md)
