# Agent Host

A TypeScript Node.js application that listens for agent requests on the Somnia blockchain, runs agent containers via Docker, and responds to them.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your private key:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and add your responder wallet's private key:
   ```
   PRIVATE_KEY=your_private_key_here
   ```

   > **Note:** The wallet must be registered as a responder on the contract.

4. Ensure Docker is running on your system.

## Running

### Development mode (with hot reload):
```bash
npm run dev
```

### Production mode:
```bash
npm run build
npm start
```

## How it works

1. The application connects to the Somnia blockchain (chain ID 5031)
2. Listens for `RequestCreated` events on the SomniaAgents contract
3. When a request is received:
   - The `agentId` is converted to an IPFS CID (it's stored as a base58-encoded bigint)
   - The container image tarball is fetched from IPFS
   - The image is loaded into Docker and a container is started (port 80 mapped to a host port)
   - The request is forwarded to the container via HTTP POST
   - The response is sent back to the contract via `handleResponse`

## Configuration

- **Contract Address:** `0x8E660a4618E117b7442A96fA2BEe3d7aE5E6Ed7f`
- **RPC URL:** `https://api.infra.mainnet.somnia.network/`
- **Chain ID:** `5031`

## Agent Container Requirements

Agent containers must:
- Run a web server on port 80
- Accept POST requests at `/{method}` endpoints
- Return responses as text/bytes
