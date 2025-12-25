# Agent Builder

CLI tool to build and upload Somnia agent containers. Part of the Somnia Agents ecosystem.

## Overview

Agent Builder helps you:
- Initialize agent projects with proper structure
- Define method ABIs (request/response types) for your agent
- Build Docker containers for your agents
- Upload containers and metadata to IPFS
- Validate agent specifications

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

# Define your methods
agent-builder spec --add

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

Manage agent methods and their ABIs.

```bash
agent-builder spec --list             # List all methods
agent-builder spec --add              # Add a new method interactively
agent-builder spec --show ping        # Show method details
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

Validate agent configuration and ABIs.

```bash
agent-builder validate
```

### `info [directory]`

Display agent information.

```bash
agent-builder info
agent-builder info --json
```

## Agent Specification

The agent specification (`agent.spec.json`) defines your agent's metadata and methods:

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
      "requestAbi": [
        { "name": "input", "type": "string" },
        { "name": "options", "type": "uint256" }
      ],
      "responseAbi": [
        { "name": "result", "type": "bytes" },
        { "name": "success", "type": "bool" }
      ]
    }
  ],
  "tags": ["data", "processing"],
  "homepage": "https://example.com"
}
```

## Method ABIs

Each method defines request and response ABIs using Ethereum ABI parameter format:

### Supported Types

| Type | Description |
|------|-------------|
| `uint256`, `uint128`, etc. | Unsigned integers |
| `int256`, `int128`, etc. | Signed integers |
| `address` | Ethereum address |
| `bool` | Boolean |
| `string` | UTF-8 string |
| `bytes` | Dynamic byte array |
| `bytes32`, `bytes4`, etc. | Fixed-size byte arrays |
| `uint256[]`, `address[]` | Arrays |
| `tuple` | Struct (requires `components`) |

### Tuple Example

```json
{
  "name": "user",
  "type": "tuple",
  "components": [
    { "name": "id", "type": "uint256" },
    { "name": "name", "type": "string" },
    { "name": "active", "type": "bool" }
  ]
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
  "agent_spec": { ... }
}
```

The `agent_spec` field contains the full specification including all method ABIs.

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
2. **Accept POST requests** - Method name is the URL path
3. **Accept binary data** - Request body is ABI-encoded callData
4. **Return binary data** - Response body is ABI-encoded response

### Example Server (Node.js)

```javascript
import http from 'http';
import { decodeAbiParameters, encodeAbiParameters } from 'viem';

const server = http.createServer((req, res) => {
  const method = req.url.slice(1);
  
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    const callData = Buffer.concat(body);
    
    // Decode request based on method's requestAbi
    // Process the request
    // Encode response based on method's responseAbi
    
    res.writeHead(200);
    res.end(encodedResponse);
  });
});

server.listen(80);
```

## Workflow

1. **Initialize** - `agent-builder init`
2. **Define Methods** - Edit `agent.spec.json` or use `agent-builder spec --add`
3. **Implement** - Write your agent logic
4. **Validate** - `agent-builder validate`
5. **Build** - `agent-builder build`
6. **Upload** - `agent-builder upload`
7. **Mint** - Use the returned Token URI to mint your agent NFT

## Integration with Somnia Agents

After uploading:

1. Get the **Metadata CID** from the upload output
2. Use `ipfs://[CID]` as the token URI when minting
3. The agent's container image CID is stored in the metadata
4. When requests are made, the agent-host fetches and runs your container

## License

MIT
