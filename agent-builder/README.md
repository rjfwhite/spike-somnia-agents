# Agent Builder

CLI tool to build and upload Somnia agent containers. Part of the Somnia Agents ecosystem.

## Overview

Agent Builder helps you:
- Initialize agent projects with proper structure
- Define method ABIs using standard Ethereum ABI format (inputs/outputs)
- Build Docker containers for your agents
- Upload containers and metadata to IPFS
- Validate agent specifications against Ethereum ABI spec

## Installation

```bash
cd agent-builder
npm install
npm run build
npm link  # Makes 'agent-builder' available globally
```

## Quick Start

```bash
# Create a new agent project
agent-builder init my-agent
cd my-agent

# Define your methods (interactive)
agent-builder spec --add

# Validate the spec
agent-builder validate

# Build the container
agent-builder build

# Upload to IPFS (requires Pinata credentials)
export PINATA_API_KEY=your_key
export PINATA_SECRET_KEY=your_secret
agent-builder upload
```

## Commands

### `init [directory]`

Initialize a new agent project.

```bash
agent-builder init                    # Initialize in current directory
agent-builder init my-agent           # Create new directory
agent-builder init -n "My Agent"      # With custom name
agent-builder init -f                 # Force overwrite existing
```

Creates:
- `agent.config.json` - Build configuration
- `agent.spec.json` - Agent specification with method ABIs
- `Dockerfile` - Sample Dockerfile
- `server.js` - Sample HTTP server
- `.env.example` - Environment template

### `spec [directory]`

Manage agent methods and their ABIs (standard Ethereum format).

```bash
agent-builder spec --list             # List all methods
agent-builder spec --add              # Add a new method interactively
agent-builder spec --show ping        # Show method details
agent-builder spec --show ping --abi  # Show as Ethereum ABI JSON
agent-builder spec --remove ping      # Remove a method
agent-builder spec --json             # Output full spec as JSON
```

### `build [directory]`

Build the Docker container.

```bash
agent-builder build                   # Build with defaults
agent-builder build -t myagent:v1     # Custom tag
agent-builder build --no-export       # Don't create tar file
agent-builder build -e ./output.tar   # Custom export path
```

### `upload [directory]`

Upload container and metadata to IPFS.

```bash
agent-builder upload                  # Upload to Pinata
agent-builder upload --local          # Use local IPFS node
agent-builder upload --verify         # Verify availability
agent-builder upload --metadata-only  # Re-upload metadata only
```

### `validate [directory]`

Validate agent configuration against Ethereum ABI specification.

```bash
agent-builder validate
```

### `info [directory]`

Display agent information.

```bash
agent-builder info
agent-builder info --json
```

## Agent Specification (Ethereum ABI Format)

The agent specification (`agent.spec.json`) uses **standard Ethereum ABI format** for method inputs/outputs:

```json
{
  "name": "my-agent",
  "version": "1.0.0",
  "description": "Description of what this agent does",
  "author": "Your Name",
  "methods": [
    {
      "name": "processData",
      "description": "Process input data and return result",
      "inputs": [
        { 
          "name": "data", 
          "type": "string",
          "internalType": "string"
        },
        { 
          "name": "amount", 
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        { 
          "name": "result", 
          "type": "bytes",
          "internalType": "bytes"
        },
        { 
          "name": "success", 
          "type": "bool",
          "internalType": "bool"
        }
      ]
    }
  ],
  "tags": ["data", "processing"],
  "homepage": "https://example.com"
}
```

## Method ABI Format

Each method uses the standard Ethereum ABI format:

### ABI Parameter Structure

```typescript
interface AbiParameter {
  name: string;           // Parameter name
  type: string;           // ABI type (uint256, address, bytes, tuple, etc.)
  internalType?: string;  // Solidity internal type (e.g., "struct MyStruct")
  components?: AbiParameter[];  // For tuple types only
  indexed?: boolean;      // For event parameters
}
```

### Supported Types

| Type | Description |
|------|-------------|
| `uint256`, `uint128`, `uint8`, etc. | Unsigned integers (8-256 bits, multiples of 8) |
| `int256`, `int128`, `int8`, etc. | Signed integers (8-256 bits, multiples of 8) |
| `address` | 20-byte Ethereum address |
| `bool` | Boolean (true/false) |
| `string` | Dynamic UTF-8 string |
| `bytes` | Dynamic byte array |
| `bytes32`, `bytes4`, etc. | Fixed-size byte arrays (1-32 bytes) |
| `uint256[]`, `address[]`, etc. | Dynamic arrays |
| `uint256[10]` | Fixed-size arrays |
| `tuple` | Struct (requires `components`) |
| `tuple[]` | Array of structs |

### Tuple (Struct) Example

```json
{
  "name": "user",
  "type": "tuple",
  "internalType": "struct User",
  "components": [
    { "name": "id", "type": "uint256", "internalType": "uint256" },
    { "name": "wallet", "type": "address", "internalType": "address" },
    { "name": "active", "type": "bool", "internalType": "bool" }
  ]
}
```

### Full Ethereum ABI Output

Use `--abi` flag to get standard Ethereum ABI format:

```bash
agent-builder spec --show processData --abi
```

Output:
```json
{
  "type": "function",
  "name": "processData",
  "inputs": [
    { "name": "data", "type": "string", "internalType": "string" },
    { "name": "amount", "type": "uint256", "internalType": "uint256" }
  ],
  "outputs": [
    { "name": "result", "type": "bytes", "internalType": "bytes" },
    { "name": "success", "type": "bool", "internalType": "bool" }
  ],
  "stateMutability": "nonpayable"
}
```

## Token Metadata

When uploading, a token metadata file is generated for the NFT:

```json
{
  "name": "my-agent",
  "description": "Description",
  "attributes": [
    { "trait_type": "version", "value": "1.0.0" },
    { "trait_type": "methods", "value": 3 }
  ],
  "agent_spec": {
    "name": "my-agent",
    "version": "1.0.0",
    "methods": [
      {
        "name": "processData",
        "inputs": [...],
        "outputs": [...]
      }
    ]
  }
}
```

The `agent_spec.methods` array contains the full ABI for each method.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PINATA_API_KEY` | Pinata API key for IPFS uploads |
| `PINATA_SECRET_KEY` | Pinata secret key |

Create a `.env` file:

```bash
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key
```

## Container Requirements

Agent containers must:

1. **Listen on port 80** - The agent-host calls containers on this port
2. **Accept POST requests** - Method name is the URL path (e.g., `/processData`)
3. **Accept ABI-encoded data** - Request body is ABI-encoded based on method `inputs`
4. **Return ABI-encoded data** - Response body is ABI-encoded based on method `outputs`

### Example Server (Node.js with viem)

```javascript
import http from 'http';
import { decodeAbiParameters, encodeAbiParameters } from 'viem';

// Define ABIs for your methods
const methodAbis = {
  processData: {
    inputs: [
      { name: 'data', type: 'string' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [
      { name: 'result', type: 'bytes' },
      { name: 'success', type: 'bool' }
    ]
  }
};

const server = http.createServer((req, res) => {
  const method = req.url.slice(1);
  const abi = methodAbis[method];
  
  if (!abi) {
    res.writeHead(404);
    res.end('Method not found');
    return;
  }

  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    const callData = Buffer.concat(body);
    
    // Decode inputs
    const inputs = decodeAbiParameters(abi.inputs, callData);
    
    // Process request...
    const result = processData(inputs);
    
    // Encode outputs
    const response = encodeAbiParameters(abi.outputs, [result.data, result.success]);
    
    res.writeHead(200);
    res.end(response);
  });
});

server.listen(80);
```

## Workflow

1. **Initialize** - `agent-builder init`
2. **Define Methods** - Edit `agent.spec.json` or use `agent-builder spec --add`
3. **Validate** - `agent-builder validate` (checks ABI conformance)
4. **Implement** - Write your agent logic with proper ABI encoding/decoding
5. **Build** - `agent-builder build`
6. **Upload** - `agent-builder upload`
7. **Mint** - Use the returned Token URI to mint your agent NFT

## Integration with Somnia Agents

After uploading:

1. Get the **Metadata CID** from the upload output
2. Use `ipfs://[CID]` as the token URI when minting
3. The agent's container image CID is stored in the metadata
4. Callers can read the `agent_spec.methods` to see available methods and their ABIs
5. When requests are made, the agent-host fetches and runs your container

## ABI Encoding/Decoding

The request `callData` and response data use standard Ethereum ABI encoding:

- Use libraries like [viem](https://viem.sh/), [ethers.js](https://docs.ethers.org/), or [web3.js](https://web3js.readthedocs.io/)
- The `inputs` array defines how `callData` is encoded
- The `outputs` array defines how response data is encoded

Example with viem:
```typescript
import { encodeAbiParameters, decodeAbiParameters } from 'viem';

// Encoding (client-side)
const callData = encodeAbiParameters(
  [{ name: 'message', type: 'string' }],
  ['Hello, Agent!']
);

// Decoding (server-side)
const [message] = decodeAbiParameters(
  [{ name: 'message', type: 'string' }],
  callData
);
```

## License

MIT
