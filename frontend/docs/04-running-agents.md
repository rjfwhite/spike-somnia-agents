# Running Agents - Agent Host

The **Agent Host** is a Node.js service that listens for agent requests on the Somnia blockchain, executes agent containers, and submits responses back on-chain.

## What is the Agent Host?

The agent host is the **decentralized execution layer** of the Somnia Agents platform. It:

1. **Listens** to RequestCreated events on the blockchain
2. **Fetches** agent metadata and container images from IPFS
3. **Executes** agent containers using Docker
4. **Submits** responses back to the smart contract
5. **Earns** rewards for processing requests

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Somnia Blockchain                                      │
│  - Smart Contract                                       │
│  - Events: RequestCreated, RequestResolved              │
└───────────────────┬─────────────────────────────────────┘
                    │ WebSocket
                    │ Event Listener
                    ↓
      ┌─────────────────────────────┐
      │  Agent Host (Node.js)        │
      │  1. Listen for events        │
      │  2. Fetch metadata/image     │
      │  3. Start container          │
      │  4. Call method              │
      │  5. Submit response          │
      └──────────┬──────────────────┘
                 │ Docker API
                 ↓
      ┌──────────────────────┐
      │  Docker Engine        │
      │  - Load images        │
      │  - Manage containers  │
      │  - Port allocation    │
      └──────────┬───────────┘
                 │ HTTP
                 ↓
      ┌──────────────────────┐
      │  Agent Container      │
      │  - Execute method     │
      │  - Return response    │
      └──────────────────────┘
```

## Prerequisites

- **Docker**: Installed and running
- **Node.js**: Version 18 or higher
- **Somnia Wallet**: With private key for submitting responses
- **ETH**: For gas fees on Somnia network

## Installation

### From Source

```bash
# Clone repository
git clone https://github.com/somnia/agent-host.git
cd agent-host

# Install dependencies
npm install

# Build
npm run build
```

### Using NPM

```bash
npm install -g @somnia/agent-host
```

## Configuration

### Environment Variables

Create a `.env` file:

```bash
# Required
PRIVATE_KEY=your_private_key_here

# Optional
RPC_URL=https://api.infra.mainnet.somnia.network/
WS_URL=wss://api.infra.mainnet.somnia.network/
CONTRACT_ADDRESS=0x9De7D7a7e0864be11F338b3D1bBfF3e982207160
PORT=8080
LOG_LEVEL=info
```

### Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | - | Private key for signing transactions |
| `RPC_URL` | No | Somnia mainnet | HTTP RPC endpoint |
| `WS_URL` | No | Somnia mainnet | WebSocket endpoint |
| `CONTRACT_ADDRESS` | No | Deployed contract | Smart contract address |
| `PORT` | No | 8080 | Health check server port |
| `LOG_LEVEL` | No | info | Logging level (debug, info, warn, error) |
| `IPFS_GATEWAY` | No | ipfs.io | IPFS gateway URL |

## Running the Agent Host

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start npm --name "agent-host" -- start

# View logs
pm2 logs agent-host

# Monitor
pm2 monit

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Using Docker

```bash
# Build image
docker build -t agent-host .

# Run container
docker run -d \
  --name agent-host \
  -e PRIVATE_KEY=$PRIVATE_KEY \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 8080:8080 \
  agent-host
```

**Important:** The agent host needs access to Docker socket to manage containers.

## How It Works

### 1. Event Listening

The agent host connects to Somnia blockchain via WebSocket:

```javascript
const client = createPublicClient({
  chain: somniaChain,
  transport: webSocket(WS_URL)
});

// Listen for RequestCreated events
client.watchContractEvent({
  address: CONTRACT_ADDRESS,
  abi: contractAbi,
  eventName: 'RequestCreated',
  onLogs: (logs) => handleRequest(logs)
});
```

### 2. Request Processing

When a RequestCreated event is detected:

```javascript
async function handleRequest(log) {
  const { requestId, agentId, method, callData } = log.args;

  // 1. Fetch agent metadata
  const metadata = await fetchAgentMetadata(agentId);

  // 2. Load container image
  const containerId = await loadAgentContainer(metadata.image);

  // 3. Start container
  const port = await startContainer(containerId);

  // 4. Call method
  const response = await callAgentMethod(port, method, callData);

  // 5. Submit response
  await submitResponse(requestId, response);
}
```

### 3. Container Management

**Loading images:**
```javascript
// Convert agentId (uint256) to IPFS CID
const cid = bigintToCid(agentId);

// Download from IPFS
const imageTar = await downloadFromIpfs(cid);

// Load into Docker
await docker.loadImage(imageTar);
```

**Starting containers:**
```javascript
const container = await docker.createContainer({
  Image: imageTag,
  ExposedPorts: { '80/tcp': {} },
  HostConfig: {
    PortBindings: {
      '80/tcp': [{ HostPort: `${dynamicPort}` }]
    },
    Memory: 512 * 1024 * 1024, // 512MB limit
  }
});

await container.start();
```

**Port allocation:**
- Base port: 10000
- Increments for each container
- Tracks active containers and ports

### 4. Method Invocation

```javascript
async function callAgentMethod(port, method, callData) {
  const response = await fetch(`http://localhost:${port}/${method}`, {
    method: 'POST',
    body: Buffer.from(callData.slice(2), 'hex'),
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  });

  return await response.arrayBuffer();
}
```

### 5. Response Submission

```javascript
const tx = await contract.handleResponse(
  requestId,
  responseData,
  receipts,
  success
);

await tx.wait();
```

## Monitoring

### Health Check Endpoint

The agent host exposes a health check endpoint:

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "processedRequests": 42,
  "activeContainers": 3,
  "blockchain": {
    "connected": true,
    "blockNumber": 1234567
  }
}
```

### Logging

Logs include:
- Event detection
- Container lifecycle
- Method invocations
- Response submissions
- Errors and warnings

**Example logs:**
```
[2024-01-15 10:30:45] INFO: Agent host started
[2024-01-15 10:30:46] INFO: Connected to blockchain
[2024-01-15 10:30:47] INFO: Listening for RequestCreated events
[2024-01-15 10:31:00] INFO: Request detected: requestId=1, agentId=42
[2024-01-15 10:31:01] INFO: Fetching metadata for agent 42
[2024-01-15 10:31:02] INFO: Loading container image
[2024-01-15 10:31:05] INFO: Container started on port 10001
[2024-01-15 10:31:05] INFO: Calling method: greet
[2024-01-15 10:31:06] INFO: Response received (150 bytes)
[2024-01-15 10:31:07] INFO: Submitting response for request 1
[2024-01-15 10:31:10] INFO: Response confirmed (tx: 0x...)
```

### Metrics

Track performance metrics:
- Request processing time
- Container startup time
- Method execution time
- Transaction confirmation time
- Success/failure rates

## Performance Optimization

### Caching

**Metadata caching:**
```javascript
const metadataCache = new Map();

async function fetchAgentMetadata(agentId) {
  if (metadataCache.has(agentId)) {
    return metadataCache.get(agentId);
  }

  const metadata = await fetchFromIpfs(agentId);
  metadataCache.set(agentId, metadata);
  return metadata;
}
```

**Image caching:**
- Keep frequently used images loaded
- Implement LRU cache for images
- Prune old containers periodically

### Container Reuse

```javascript
// Keep containers running for reuse
const containerPool = new Map();

async function getOrCreateContainer(agentId) {
  if (containerPool.has(agentId)) {
    return containerPool.get(agentId);
  }

  const container = await createContainer(agentId);
  containerPool.set(agentId, container);
  return container;
}
```

### Parallel Processing

```javascript
// Process multiple requests concurrently
const MAX_CONCURRENT = 10;
const queue = new PQueue({ concurrency: MAX_CONCURRENT });

client.watchContractEvent({
  eventName: 'RequestCreated',
  onLogs: (logs) => {
    logs.forEach(log => {
      queue.add(() => handleRequest(log));
    });
  }
});
```

## Security Considerations

### Private Key Management

- **Never commit** private keys to version control
- Use environment variables or secret managers
- Rotate keys periodically
- Use hardware wallets for production

### Container Isolation

- Containers run with limited resources
- No host network access (isolated network)
- Memory and CPU limits enforced
- Filesystem is ephemeral

### Input Validation

- Validate agent metadata before execution
- Check image signatures (future feature)
- Implement request rate limiting
- Monitor for malicious agents

## Troubleshooting

### WebSocket Disconnections

The agent host implements auto-reconnect:

```javascript
client.watchContractEvent({
  onLogs: handleLogs,
  onError: (error) => {
    console.error('WebSocket error:', error);
    // Auto-reconnect logic
    reconnect();
  }
});
```

### Docker Connection Issues

Ensure Docker socket is accessible:

```bash
# Test Docker connection
docker ps

# Check socket permissions
ls -l /var/run/docker.sock
```

### Out of Memory

If containers are consuming too much memory:

```javascript
// Adjust memory limits
HostConfig: {
  Memory: 256 * 1024 * 1024, // 256MB
  MemorySwap: 512 * 1024 * 1024 // 512MB
}
```

### Transaction Failures

Common causes:
- Insufficient gas
- Network congestion
- Invalid response data
- Already resolved request

Check transaction logs and adjust gas settings if needed.

## Advanced Configuration

### Custom IPFS Gateway

```bash
IPFS_GATEWAY=https://your-ipfs-gateway.com
```

### Gas Price Configuration

```javascript
// Custom gas settings
const tx = await contract.handleResponse(
  requestId,
  responseData,
  receipts,
  success,
  {
    gasLimit: 500000n,
    maxFeePerGas: parseGwei('20'),
    maxPriorityFeePerGas: parseGwei('1')
  }
);
```

### Request Filtering

Only process specific agents:

```javascript
// Filter by agent ID
const ALLOWED_AGENTS = [1, 2, 3, 42];

client.watchContractEvent({
  eventName: 'RequestCreated',
  args: {
    agentId: ALLOWED_AGENTS
  },
  onLogs: handleLogs
});
```

## Running Multiple Hosts

For redundancy and load distribution:

1. Run multiple agent host instances
2. Each with different private key
3. All registered as responders
4. First to submit response wins
5. Others ignore already-resolved requests

```bash
# Instance 1
PRIVATE_KEY=key1 npm start

# Instance 2
PRIVATE_KEY=key2 npm start
```

## Next Steps

- [Learn about ABI encoding](./05-abi-encoding.md)
- [Explore example agents](./06-examples.md)
- [Understand container requirements](./03-container-requirements.md)
- [Build your own agent](./02-building-agents.md)
