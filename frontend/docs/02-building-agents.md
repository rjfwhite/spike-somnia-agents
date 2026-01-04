# Building Agents

This guide walks you through creating, building, and deploying your first Somnia agent.

## Prerequisites

- **Docker**: Installed and running ([Get Docker](https://docs.docker.com/get-docker/))
- **Node.js**: Version 18 or higher ([Get Node.js](https://nodejs.org/))
- **Agent Builder CLI**: Install globally with `npm install -g @somnia/agent-builder`

## Installation

```bash
npm install -g @somnia/agent-builder
```

Verify installation:

```bash
agent-builder --version
```

## Quick Start

### 1. Initialize Agent Project

Create a new agent project:

```bash
agent-builder init my-first-agent
cd my-first-agent
```

This creates:
```
my-first-agent/
├── agent.config.json   # Build configuration
├── agent.spec.json     # Agent specification
├── Dockerfile          # Container definition
├── server.js           # Agent server implementation
└── package.json        # Node.js dependencies
```

### 2. Define Agent Specification

Edit `agent.spec.json` or use the interactive CLI:

```bash
agent-builder spec --add
```

**Example specification:**

```json
{
  "name": "greeting-agent",
  "version": "1.0.0",
  "description": "A simple greeting agent",
  "methods": [
    {
      "name": "greet",
      "description": "Returns a personalized greeting",
      "inputs": [
        {
          "name": "name",
          "type": "string",
          "description": "Name to greet"
        }
      ],
      "outputs": [
        {
          "name": "greeting",
          "type": "string",
          "description": "The greeting message"
        }
      ]
    }
  ]
}
```

### 3. Implement Agent Logic

Edit `server.js` to implement your agent:

```javascript
const express = require('express');
const { decodeAbiParameters, encodeAbiParameters } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Helper to decode inputs
function decodeInput(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

// Helper to encode outputs
function encodeOutput(values, types) {
  return Buffer.from(
    encodeAbiParameters(types, values).slice(2),
    'hex'
  );
}

// Implement the 'greet' method
app.post('/greet', (req, res) => {
  try {
    // Decode input (expects a string parameter)
    const [name] = decodeInput(req.body, [
      { type: 'string', name: 'name' }
    ]);

    // Execute logic
    const greeting = `Hello, ${name}! Welcome to Somnia Agents.`;

    // Encode and return output
    const encoded = encodeOutput([greeting], [
      { type: 'string', name: 'greeting' }
    ]);

    res.send(encoded);
  } catch (error) {
    console.error('Error in greet method:', error);
    res.status(500).send('Internal server error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = 80;
app.listen(PORT, () => {
  console.log(`Agent server listening on port ${PORT}`);
});
```

### 4. Define Dockerfile

The generated `Dockerfile` should look like:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port 80 (required)
EXPOSE 80

# Start server
CMD ["node", "server.js"]
```

### 5. Test Locally

Build and run locally:

```bash
# Build Docker image
docker build -t my-first-agent .

# Run container
docker run -p 8080:80 my-first-agent
```

Test the endpoint:

```bash
# Encode test data (using agent-builder)
agent-builder test --method greet --input '{"name": "Alice"}'
```

### 6. Build for Production

Build the agent container:

```bash
agent-builder build
```

This:
- Validates the specification
- Builds the Docker image
- Exports as `.tar` file
- Displays the build output path

Output: `./dist/my-first-agent.tar`

### 7. Upload to IPFS

Upload the container and metadata to IPFS:

```bash
agent-builder upload --pinata-jwt YOUR_PINATA_JWT
```

Or use local IPFS:

```bash
agent-builder upload --ipfs-url http://localhost:5001
```

This returns:
- **Container CID**: IPFS hash of the Docker image
- **Metadata CID**: IPFS hash of the agent metadata

**Example output:**
```
✓ Container uploaded to IPFS
  CID: Qm...abc123

✓ Metadata uploaded to IPFS
  CID: Qm...def456

Use this metadata CID when minting your agent NFT!
```

### 8. Mint Agent NFT

Use the frontend or contract directly:

**Via Frontend:**
1. Go to "Mint Agent" page
2. Paste the metadata CID
3. Set your agent price
4. Confirm transaction

**Via Contract:**
```javascript
// Using viem/ethers
await contract.mintAgent(
  yourAddress,
  "ipfs://Qm...def456" // metadata CID
);

await contract.setAgentPrice(
  agentId,
  parseEther("0.01") // 0.01 ETH per invocation
);
```

## Agent Builder CLI Reference

### Commands

#### `init [directory]`
Initialize a new agent project.

```bash
agent-builder init my-agent
```

Options:
- `--template <name>`: Use a template (default, minimal, advanced)

#### `spec --add`
Interactively add a method to the specification.

```bash
agent-builder spec --add
```

#### `spec --view`
Display the current specification.

```bash
agent-builder spec --view
```

#### `validate`
Validate the agent specification.

```bash
agent-builder validate
```

#### `build`
Build the agent Docker container.

```bash
agent-builder build
```

Options:
- `--output <path>`: Output directory (default: `./dist`)
- `--tag <name>`: Docker image tag

#### `upload`
Upload container and metadata to IPFS.

```bash
agent-builder upload --pinata-jwt YOUR_JWT
```

Options:
- `--pinata-jwt <token>`: Pinata JWT for authentication
- `--ipfs-url <url>`: Local IPFS API URL (alternative to Pinata)
- `--container-path <path>`: Path to container .tar file

#### `test`
Test agent methods locally.

```bash
agent-builder test --method greet --input '{"name": "Alice"}'
```

Options:
- `--method <name>`: Method to test
- `--input <json>`: JSON input data
- `--port <number>`: Container port (default: 8080)

## Configuration

### agent.config.json

```json
{
  "dockerRegistry": "docker.io",
  "imageName": "my-agent",
  "tag": "latest",
  "platform": "linux/amd64"
}
```

### Environment Variables

Create `.env` file:

```bash
PINATA_JWT=your_pinata_jwt_here
IPFS_URL=http://localhost:5001
```

## Best Practices

### Performance
- Keep container images small (use Alpine Linux)
- Install only production dependencies
- Use `.dockerignore` to exclude unnecessary files
- Implement caching where appropriate

### Security
- Validate all inputs
- Handle errors gracefully
- Don't expose sensitive data in responses
- Use environment variables for secrets
- Implement rate limiting if needed

### Development
- Test locally before building
- Use semantic versioning
- Document your methods thoroughly
- Include usage examples
- Add comprehensive error handling

### Docker Optimization

**Use multi-stage builds:**

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 80
CMD ["node", "dist/server.js"]
```

**.dockerignore file:**

```
node_modules
npm-debug.log
.git
.env
dist/*.tar
README.md
```

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker logs <container-id>
```

Common issues:
- Port 80 not exposed
- Missing dependencies
- Server not listening on correct port

### Build Failures

Ensure Docker is running:
```bash
docker info
```

Clear Docker cache:
```bash
docker system prune
```

### IPFS Upload Issues

Test IPFS connection:
```bash
curl http://localhost:5001/api/v0/version
```

Or verify Pinata credentials:
```bash
curl -X GET https://api.pinata.cloud/data/testAuthentication \
  -H "Authorization: Bearer YOUR_JWT"
```

## Next Steps

- [Understand container requirements](./03-container-requirements.md)
- [Learn about ABI encoding](./05-abi-encoding.md)
- [Explore example agents](./06-examples.md)
- [Set up an agent host](./04-running-agents.md)
