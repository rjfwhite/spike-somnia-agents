# API Reference

Complete API reference for interacting with Somnia Agents smart contract and platform.

## Smart Contract

**Contract Address:** `0x9De7D7a7e0864be11F338b3D1bBfF3e982207160`
**Network:** Somnia Mainnet (Chain ID: 5031)
**RPC URL:** `https://api.infra.mainnet.somnia.network/`

## Contract Methods

### Read Methods

#### `getMaxAgentId()`

Get the total number of agents minted.

```solidity
function getMaxAgentId() external view returns (uint256)
```

**Returns:**
- `uint256`: The highest agent ID (total number of agents)

**Example (viem):**
```javascript
const maxAgentId = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'getMaxAgentId'
});
```

---

#### `tokenURI(uint256 agentId)`

Get the metadata URI for an agent.

```solidity
function tokenURI(uint256 agentId) external view returns (string memory)
```

**Parameters:**
- `agentId` (uint256): The agent NFT ID

**Returns:**
- `string`: URI pointing to agent metadata (IPFS or HTTP)

**Example:**
```javascript
const uri = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'tokenURI',
  args: [1n]
});
// Returns: "ipfs://Qm..."
```

---

#### `ownerOf(uint256 agentId)`

Get the owner of an agent NFT.

```solidity
function ownerOf(uint256 agentId) external view returns (address)
```

**Parameters:**
- `agentId` (uint256): The agent NFT ID

**Returns:**
- `address`: Owner's wallet address

**Example:**
```javascript
const owner = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'ownerOf',
  args: [1n]
});
```

---

#### `agentPrice(uint256 agentId)`

Get the price to invoke an agent.

```solidity
function agentPrice(uint256 agentId) external view returns (uint256)
```

**Parameters:**
- `agentId` (uint256): The agent NFT ID

**Returns:**
- `uint256`: Price in wei (1 ETH = 10^18 wei)

**Example:**
```javascript
const price = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'agentPrice',
  args: [1n]
});

console.log('Price:', formatEther(price), 'ETH');
```

---

#### `getRequest(uint256 requestId)`

Get details of a request.

```solidity
function getRequest(uint256 requestId) external view returns (
  uint256 agentId,
  string memory method,
  bytes memory callData,
  bytes memory responseData,
  bool resolved
)
```

**Parameters:**
- `requestId` (uint256): The request ID

**Returns:**
- `agentId` (uint256): Agent that was called
- `method` (string): Method name invoked
- `callData` (bytes): ABI-encoded input data
- `responseData` (bytes): ABI-encoded output data (empty if not resolved)
- `resolved` (bool): Whether request has been processed

**Example:**
```javascript
const request = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'getRequest',
  args: [1n]
});
```

---

### Write Methods

#### `mintAgent(address to, string memory uri)`

Mint a new agent NFT.

```solidity
function mintAgent(address to, string memory uri) external returns (uint256)
```

**Parameters:**
- `to` (address): Address to mint the NFT to
- `uri` (string): Metadata URI (IPFS CID with `ipfs://` prefix)

**Returns:**
- `uint256`: The newly minted agent ID

**Events Emitted:**
- `AgentCreated(uint256 indexed agentId, address indexed owner)`

**Example:**
```javascript
const { request } = await publicClient.simulateContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'mintAgent',
  args: [userAddress, 'ipfs://Qm...'],
  account: userAddress
});

const hash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// Extract agent ID from logs
const agentId = receipt.logs[0].topics[1];
```

---

#### `setAgentPrice(uint256 agentId, uint256 price)`

Set the price for invoking an agent (owner only).

```solidity
function setAgentPrice(uint256 agentId, uint256 price) external
```

**Parameters:**
- `agentId` (uint256): The agent NFT ID
- `price` (uint256): Price in wei

**Requirements:**
- Caller must be the agent owner

**Events Emitted:**
- `AgentPriceUpdated(uint256 indexed agentId, uint256 price)`

**Example:**
```javascript
import { parseEther } from 'viem';

const hash = await walletClient.writeContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'setAgentPrice',
  args: [agentId, parseEther('0.01')], // 0.01 ETH
  account: userAddress
});
```

---

#### `createRequest(uint256 requestId, uint256 agentId, string memory method, bytes memory callData)`

Create a request to invoke an agent method.

```solidity
function createRequest(
  uint256 requestId,
  uint256 agentId,
  string memory method,
  bytes memory callData
) external payable
```

**Parameters:**
- `requestId` (uint256): Unique request ID (generate client-side)
- `agentId` (uint256): Agent to invoke
- `method` (string): Method name to call
- `callData` (bytes): ABI-encoded input parameters

**Payable:**
- Must send exact amount matching `agentPrice(agentId)`

**Events Emitted:**
- `RequestCreated(uint256 indexed requestId, uint256 indexed agentId, string method, bytes callData)`

**Example:**
```javascript
import { encodeAbiParameters, parseEther } from 'viem';

// Generate unique request ID
const requestId = BigInt(Date.now());

// Encode input data
const callData = encodeAbiParameters(
  [{ type: 'string', name: 'name' }],
  ['Alice']
);

// Get agent price
const price = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'agentPrice',
  args: [agentId]
});

// Create request
const hash = await walletClient.writeContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'createRequest',
  args: [requestId, agentId, 'greet', callData],
  value: price,
  account: userAddress
});
```

---

#### `handleResponse(uint256 requestId, bytes memory responseData, uint256[] memory receipts, bool success)`

Submit a response for a request (responders only).

```solidity
function handleResponse(
  uint256 requestId,
  bytes memory responseData,
  uint256[] memory receipts,
  bool success
) external
```

**Parameters:**
- `requestId` (uint256): Request ID being responded to
- `responseData` (bytes): ABI-encoded output data
- `receipts` (uint256[]): Array of receipt IDs (tracking)
- `success` (bool): Whether execution succeeded

**Requirements:**
- Caller must be a registered responder
- Request must not already be resolved

**Events Emitted:**
- `RequestResolved(uint256 indexed requestId, bytes responseData, uint256[] receipts, bool success)`

**Example:**
```javascript
const hash = await walletClient.writeContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'handleResponse',
  args: [
    requestId,
    encodedResponse,
    [BigInt(1)], // receipt IDs
    true // success
  ],
  account: responderAddress
});
```

---

## Contract Events

### `AgentCreated`

Emitted when a new agent is minted.

```solidity
event AgentCreated(uint256 indexed agentId, address indexed owner);
```

**Parameters:**
- `agentId` (uint256, indexed): The new agent ID
- `owner` (address, indexed): Agent owner address

**Listening (viem):**
```javascript
const unwatch = publicClient.watchContractEvent({
  address: contractAddress,
  abi: contractAbi,
  eventName: 'AgentCreated',
  onLogs: (logs) => {
    logs.forEach(log => {
      console.log('New agent:', log.args.agentId);
      console.log('Owner:', log.args.owner);
    });
  }
});
```

---

### `RequestCreated`

Emitted when a new request is created.

```solidity
event RequestCreated(
  uint256 indexed requestId,
  uint256 indexed agentId,
  string method,
  bytes callData
);
```

**Parameters:**
- `requestId` (uint256, indexed): Unique request ID
- `agentId` (uint256, indexed): Agent being invoked
- `method` (string): Method name
- `callData` (bytes): ABI-encoded input

**Listening:**
```javascript
publicClient.watchContractEvent({
  address: contractAddress,
  abi: contractAbi,
  eventName: 'RequestCreated',
  onLogs: (logs) => {
    logs.forEach(log => {
      const { requestId, agentId, method, callData } = log.args;
      console.log(`Request ${requestId}: calling agent ${agentId}.${method}()`);
    });
  }
});
```

---

### `RequestResolved`

Emitted when a request is resolved with a response.

```solidity
event RequestResolved(
  uint256 indexed requestId,
  bytes responseData,
  uint256[] receipts,
  bool success
);
```

**Parameters:**
- `requestId` (uint256, indexed): Request ID
- `responseData` (bytes): ABI-encoded output
- `receipts` (uint256[]): Receipt tracking IDs
- `success` (bool): Execution status

**Listening:**
```javascript
publicClient.watchContractEvent({
  address: contractAddress,
  abi: contractAbi,
  eventName: 'RequestResolved',
  onLogs: (logs) => {
    logs.forEach(log => {
      const { requestId, responseData, success } = log.args;
      console.log(`Request ${requestId} resolved:`, success);
    });
  }
});
```

---

### `AgentPriceUpdated`

Emitted when an agent's price is updated.

```solidity
event AgentPriceUpdated(uint256 indexed agentId, uint256 price);
```

**Parameters:**
- `agentId` (uint256, indexed): Agent ID
- `price` (uint256): New price in wei

---

## Agent Metadata Format

Agent metadata is stored as JSON at the `tokenURI`:

```json
{
  "name": "Agent Name",
  "description": "Agent description",
  "image": "ipfs://Qm...image",
  "agent_spec": {
    "name": "agent-name",
    "version": "1.0.0",
    "description": "Agent description",
    "author": "Creator Name",
    "image": "Qm...containerCID",
    "methods": [
      {
        "name": "methodName",
        "description": "Method description",
        "inputs": [
          {
            "name": "paramName",
            "type": "string",
            "description": "Parameter description"
          }
        ],
        "outputs": [
          {
            "name": "resultName",
            "type": "string",
            "description": "Result description"
          }
        ]
      }
    ],
    "tags": ["tag1", "tag2"],
    "homepage": "https://example.com",
    "repository": "https://github.com/..."
  }
}
```

## Code Examples

### Complete Agent Invocation Flow

```javascript
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, decodeAbiParameters, parseEther } from 'viem';

// Setup clients
const account = privateKeyToAccount('0x...');

const publicClient = createPublicClient({
  chain: somniaChain,
  transport: http('https://api.infra.mainnet.somnia.network/')
});

const walletClient = createWalletClient({
  account,
  chain: somniaChain,
  transport: http('https://api.infra.mainnet.somnia.network/')
});

// 1. Get agent price
const agentId = 1n;
const price = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'agentPrice',
  args: [agentId]
});

// 2. Encode input data
const callData = encodeAbiParameters(
  [{ type: 'string', name: 'name' }],
  ['Alice']
);

// 3. Create request
const requestId = BigInt(Date.now());

const hash = await walletClient.writeContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'createRequest',
  args: [requestId, agentId, 'greet', callData],
  value: price
});

console.log('Transaction hash:', hash);

// 4. Wait for response
const unwatch = publicClient.watchContractEvent({
  address: contractAddress,
  abi: contractAbi,
  eventName: 'RequestResolved',
  args: { requestId },
  onLogs: (logs) => {
    const { responseData, success } = logs[0].args;

    if (success) {
      // Decode response
      const [greeting] = decodeAbiParameters(
        [{ type: 'string', name: 'greeting' }],
        responseData
      );

      console.log('Response:', greeting);
    } else {
      console.log('Request failed');
    }

    unwatch();
  }
});
```

### Minting an Agent

```javascript
// 1. Upload container to IPFS (using agent-builder)
// 2. Create metadata
const metadata = {
  name: "My Agent",
  description: "My first agent",
  agent_spec: {
    name: "my-agent",
    version: "1.0.0",
    image: "Qm...containerCID",
    methods: [/* ... */]
  }
};

// 3. Upload metadata to IPFS
const metadataCid = await uploadToIpfs(JSON.stringify(metadata));

// 4. Mint agent NFT
const { request } = await publicClient.simulateContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'mintAgent',
  args: [account.address, `ipfs://${metadataCid}`]
});

const hash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// 5. Get agent ID from logs
const agentId = receipt.logs[0].topics[1];

// 6. Set price
await walletClient.writeContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'setAgentPrice',
  args: [agentId, parseEther('0.01')]
});

console.log('Agent minted:', agentId);
```

## Error Handling

### Common Errors

**"Insufficient payment"**
- Sent value doesn't match agent price
- Solution: Check `agentPrice()` before calling

**"Request already resolved"**
- Trying to respond to already-resolved request
- Solution: Check request status first

**"Not agent owner"**
- Trying to call owner-only method
- Solution: Verify ownership with `ownerOf()`

**"Invalid request ID"**
- Request doesn't exist
- Solution: Ensure request was created successfully

### Example Error Handling

```javascript
try {
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'createRequest',
    args: [requestId, agentId, method, callData],
    value: price
  });
} catch (error) {
  if (error.message.includes('insufficient')) {
    console.error('Insufficient ETH sent');
  } else if (error.message.includes('price')) {
    console.error('Incorrect agent price');
  } else {
    console.error('Transaction failed:', error);
  }
}
```

## Rate Limits and Best Practices

### Request IDs

- Generate unique IDs (use timestamp + random)
- Check if ID already exists before creating
- Store mapping of your requests for tracking

### Gas Optimization

- Batch multiple operations when possible
- Use appropriate gas limits
- Monitor gas prices

### Event Listening

- Use WebSocket for real-time updates
- Implement reconnection logic
- Filter events by indexed parameters

## Next Steps

- [Build your first agent](./02-building-agents.md)
- [Learn about ABI encoding](./05-abi-encoding.md)
- [Explore examples](./06-examples.md)
