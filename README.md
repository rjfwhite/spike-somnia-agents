# Somnia Agents

A decentralized platform for AI agents as NFTs on the Somnia blockchain. This project consists of:

1. **Smart Contracts** (Foundry/Solidity) - ERC721 NFT contract for AI agents
2. **Frontend** (Next.js/TypeScript/Viem) - Web interface to interact with the contract

## 🌐 Deployed Contract

- **Contract Address**: `0x1B8c77a1DD1656902d657dB1452145626cc6593f`
- **Network**: Somnia
- **RPC URL**: https://somnia-rpc.publicnode.com
- **Chain ID**: 5031

## 📁 Project Structure

```
spike-somnia-agents/
├── contracts/          # Foundry smart contracts
│   ├── src/
│   │   └── SomniaAgents.sol
│   ├── script/
│   │   └── DeploySomniaAgents.s.sol
│   └── test/
└── frontend/           # Next.js web application
    ├── app/
    ├── components/
    └── lib/
```

## 🚀 Quick Start

### Smart Contracts

The smart contracts are built with [Foundry](https://book.getfoundry.sh/).

#### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

#### Build Contracts

```bash
cd contracts
forge build
```

#### Test Contracts

```bash
forge test
```

#### Deploy Contracts

```bash
forge script script/DeploySomniaAgents.s.sol:DeploySomniaAgents \
  --rpc-url https://somnia-rpc.publicnode.com \
  --private-key <your_private_key> \
  --broadcast
```

### Frontend

The frontend is a Next.js 14 application using Viem and Wagmi for blockchain interaction.

#### Install Dependencies

```bash
cd frontend
npm install
```

#### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

#### Build for Production

```bash
npm run build
npm start
```

## 🎯 Features

### Smart Contract Features

- **ERC721 NFT Standard**: Each agent is a unique NFT
- **Agent Minting**: Create new agents with metadata URIs
- **Price Setting**: Agent owners can set invocation prices
- **Request Creation**: Users can create requests to agents (with payment)
- **Response Handling**: Record agent responses on-chain

### Frontend Features

- **Wallet Connection**: Connect with MetaMask or other Web3 wallets
- **Contract Reader**: View contract information and stats
- **Agent Viewer**: Look up agents by ID and see details
- **Mint Agent**: Create new agent NFTs
- **Create Request**: Submit requests to agents with payment

## 🏗️ Contract Architecture

### SomniaAgents.sol

Main contract implementing ERC721 with additional agent marketplace functionality:

```solidity
// Key functions:
- mintAgent(address to, string memory uri) → uint256
- setAgentPrice(uint256 agentId, uint256 price)
- createRequest(uint256 requestId, uint256 agentId, string calldata method, bytes calldata callData) payable
- handleResponse(uint256 requestId, bytes calldata responseData, uint256[] calldata receipts)
- getMaxAgentId() → uint256
- agentPrice(uint256 agentId) → uint256
```

### Events

```solidity
event AgentCreated(uint256 indexed agentId, address indexed owner)
event AgentPriceUpdated(uint256 indexed agentId, uint256 price)
event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, string method, bytes callData)
event RequestResolved(uint256 indexed requestId, bytes responseData, uint256[] receipts)
```

## 🛠️ Tech Stack

### Contracts
- Solidity 0.8.13
- Foundry
- OpenZeppelin Contracts

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Viem (Ethereum library)
- Wagmi (React hooks)
- TanStack Query
- Tailwind CSS

## 📖 Usage Examples

### Mint an Agent (via Frontend)

1. Connect your wallet
2. Navigate to "Mint New Agent" section
3. Enter recipient address (or leave empty to mint to yourself)
4. Enter metadata URI (e.g., `ipfs://...` or `https://...`)
5. Click "Mint Agent"

### Create a Request (via Frontend)

1. Connect your wallet with sufficient STT balance
2. Navigate to "Create Agent Request" section
3. Enter the Agent ID you want to invoke
4. Enter the method name (e.g., "generateImage")
5. Enter call data (request parameters)
6. Click "Create Request" (payment will be sent automatically)

### Interact via Cast (CLI)

```bash
# Get max agent ID
cast call 0x1B8c77a1DD1656902d657dB1452145626cc6593f \
  "getMaxAgentId()(uint256)" \
  --rpc-url https://somnia-rpc.publicnode.com

# Get agent price
cast call 0x1B8c77a1DD1656902d657dB1452145626cc6593f \
  "agentPrice(uint256)(uint256)" 1 \
  --rpc-url https://somnia-rpc.publicnode.com

# Mint an agent
cast send 0x1B8c77a1DD1656902d657dB1452145626cc6593f \
  "mintAgent(address,string)(uint256)" \
  <recipient_address> \
  "ipfs://metadata-uri" \
  --rpc-url https://somnia-rpc.publicnode.com \
  --private-key <your_private_key>
```

## 🔐 Network Configuration for MetaMask

Add the Somnia network to your wallet:

- **Network Name**: Somnia
- **RPC URL**: https://somnia-rpc.publicnode.com
- **Chain ID**: 5031
- **Currency Symbol**: STT
- **Block Explorer**: https://explorer.somnia.network (if available)

## 📝 License

UNLICENSED

## 🤝 Contributing

This is a spike/prototype project. Feel free to fork and experiment!

## 📚 Additional Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Viem Documentation](https://viem.sh/)
- [Wagmi Documentation](https://wagmi.sh/)
- [Next.js Documentation](https://nextjs.org/docs)
