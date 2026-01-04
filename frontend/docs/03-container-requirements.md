# Agent Container Requirements

This document specifies the requirements for agent Docker containers to work with the Somnia Agent platform.

## Core Requirements

### 1. HTTP Server on Port 80

Your container **must** run an HTTP server listening on **port 80**.

```javascript
// Example with Express.js
const app = express();
app.listen(80, () => {
  console.log('Agent listening on port 80');
});
```

```python
# Example with Flask
from flask import Flask
app = Flask(__name__)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
```

### 2. Method Endpoints

Each method in your agent specification must have a corresponding HTTP POST endpoint at `/{methodName}`.

**Example:**
- Method `greet` → Endpoint `POST /greet`
- Method `calculate` → Endpoint `POST /calculate`
- Method `fetchData` → Endpoint `POST /fetchData`

### 3. ABI-Encoded Requests

All requests use **Ethereum ABI encoding**:
- Request body contains **raw binary data** (ABI-encoded)
- Content-Type: `application/octet-stream` (or similar)
- Data encoded according to method's `inputs` specification

### 4. ABI-Encoded Responses

All responses must use **Ethereum ABI encoding**:
- Response body contains **raw binary data** (ABI-encoded)
- Data encoded according to method's `outputs` specification
- HTTP status 200 for successful responses

### 5. Error Handling

Return appropriate HTTP status codes:
- **200**: Success
- **400**: Invalid input (bad ABI encoding, validation failed)
- **500**: Internal server error
- **503**: Service unavailable (temporary)

## Implementation Guide

### Node.js Implementation

Using **viem** (recommended):

```javascript
const express = require('express');
const { decodeAbiParameters, encodeAbiParameters } = require('viem');

const app = express();

// Important: Use raw body parser
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Decode helper
function decodeInput(buffer, types) {
  const hex = `0x${buffer.toString('hex')}`;
  return decodeAbiParameters(types, hex);
}

// Encode helper
function encodeOutput(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

// Method endpoint
app.post('/greet', (req, res) => {
  try {
    // Decode input
    const [name] = decodeInput(req.body, [
      { type: 'string', name: 'name' }
    ]);

    // Execute logic
    const greeting = `Hello, ${name}!`;

    // Encode output
    const encoded = encodeOutput([greeting], [
      { type: 'string', name: 'greeting' }
    ]);

    res.send(encoded);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

### Python Implementation

Using **eth-abi**:

```python
from flask import Flask, request, Response
from eth_abi import decode, encode

app = Flask(__name__)

@app.route('/greet', methods=['POST'])
def greet():
    try:
        # Decode input
        raw_data = request.get_data()
        decoded = decode(['string'], raw_data)
        name = decoded[0]

        # Execute logic
        greeting = f"Hello, {name}!"

        # Encode output
        encoded = encode(['string'], [greeting])

        return Response(encoded, mimetype='application/octet-stream')
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
```

### Go Implementation

Using **go-ethereum**:

```go
package main

import (
    "io"
    "net/http"
    "github.com/ethereum/go-ethereum/accounts/abi"
    "github.com/ethereum/go-ethereum/common"
)

func greetHandler(w http.ResponseWriter, r *http.Request) {
    // Read raw body
    body, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }

    // Define ABI types
    stringType, _ := abi.NewType("string", "", nil)
    args := abi.Arguments{{Type: stringType}}

    // Decode input
    decoded, err := args.Unpack(body)
    if err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    name := decoded[0].(string)

    // Execute logic
    greeting := "Hello, " + name + "!"

    // Encode output
    encoded, _ := args.Pack(greeting)

    w.Header().Set("Content-Type", "application/octet-stream")
    w.Write(encoded)
}

func main() {
    http.HandleFunc("/greet", greetHandler)
    http.ListenAndServe(":80", nil)
}
```

## Complex Type Examples

### Arrays

**Specification:**
```json
{
  "inputs": [
    { "name": "numbers", "type": "uint256[]" }
  ],
  "outputs": [
    { "name": "sum", "type": "uint256" }
  ]
}
```

**Implementation (Node.js):**
```javascript
app.post('/sum', (req, res) => {
  const [numbers] = decodeInput(req.body, [
    { type: 'uint256[]', name: 'numbers' }
  ]);

  const sum = numbers.reduce((a, b) => a + b, 0n);

  const encoded = encodeOutput([sum], [
    { type: 'uint256', name: 'sum' }
  ]);

  res.send(encoded);
});
```

### Tuples (Structs)

**Specification:**
```json
{
  "inputs": [
    {
      "name": "user",
      "type": "tuple",
      "components": [
        { "name": "name", "type": "string" },
        { "name": "age", "type": "uint256" }
      ]
    }
  ],
  "outputs": [
    { "name": "greeting", "type": "string" }
  ]
}
```

**Implementation (Node.js):**
```javascript
app.post('/greetUser', (req, res) => {
  const [user] = decodeInput(req.body, [
    {
      type: 'tuple',
      name: 'user',
      components: [
        { type: 'string', name: 'name' },
        { type: 'uint256', name: 'age' }
      ]
    }
  ]);

  const greeting = `Hello ${user.name}, age ${user.age}!`;

  const encoded = encodeOutput([greeting], [
    { type: 'string', name: 'greeting' }
  ]);

  res.send(encoded);
});
```

### Multiple Inputs/Outputs

**Specification:**
```json
{
  "inputs": [
    { "name": "a", "type": "uint256" },
    { "name": "b", "type": "uint256" }
  ],
  "outputs": [
    { "name": "sum", "type": "uint256" },
    { "name": "product", "type": "uint256" }
  ]
}
```

**Implementation (Node.js):**
```javascript
app.post('/calculate', (req, res) => {
  const [a, b] = decodeInput(req.body, [
    { type: 'uint256', name: 'a' },
    { type: 'uint256', name: 'b' }
  ]);

  const sum = a + b;
  const product = a * b;

  const encoded = encodeOutput([sum, product], [
    { type: 'uint256', name: 'sum' },
    { type: 'uint256', name: 'product' }
  ]);

  res.send(encoded);
});
```

## Dockerfile Best Practices

### Minimal Example

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app code
COPY . .

# Expose required port
EXPOSE 80

# Start server
CMD ["node", "server.js"]
```

### Multi-Stage Build (Production)

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Production stage
FROM node:18-alpine
WORKDIR /app

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package.json ./

EXPOSE 80
CMD ["node", "server.js"]
```

### Python Example

```dockerfile
FROM python:3.11-alpine

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

EXPOSE 80

CMD ["python", "server.py"]
```

## Testing Your Container

### Local Testing

```bash
# Build image
docker build -t my-agent .

# Run container
docker run -p 8080:80 my-agent

# Test with curl (requires ABI encoding)
# Use agent-builder test command instead:
agent-builder test --method greet --input '{"name": "Alice"}'
```

### Health Check Endpoint

Add a health check endpoint:

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    methods: ['greet', 'calculate']
  });
});
```

Then in Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/health || exit 1
```

## Performance Considerations

### Response Time

- Agent host has a **timeout** (default: 30 seconds)
- Keep processing under 25 seconds for safety
- Use streaming for long-running tasks

### Memory Usage

- Container memory is limited by host configuration
- Typical limit: 512MB - 2GB
- Implement memory-efficient algorithms
- Clean up resources after each request

### Concurrency

- Agent host may send multiple requests simultaneously
- Ensure thread/request safety
- Use connection pooling for databases
- Implement request queuing if needed

## Security Best Practices

### Input Validation

```javascript
app.post('/divide', (req, res) => {
  const [a, b] = decodeInput(req.body, [
    { type: 'uint256', name: 'a' },
    { type: 'uint256', name: 'b' }
  ]);

  // Validate inputs
  if (b === 0n) {
    return res.status(400).send('Division by zero');
  }

  const result = a / b;
  const encoded = encodeOutput([result], [
    { type: 'uint256', name: 'result' }
  ]);

  res.send(encoded);
});
```

### Error Handling

```javascript
app.post('/fetchUrl', async (req, res) => {
  try {
    const [url] = decodeInput(req.body, [
      { type: 'string', name: 'url' }
    ]);

    // Validate URL
    if (!url.startsWith('https://')) {
      return res.status(400).send('Only HTTPS URLs allowed');
    }

    const response = await fetch(url);
    const data = await response.text();

    const encoded = encodeOutput([data], [
      { type: 'string', name: 'data' }
    ]);

    res.send(encoded);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).send('Failed to fetch URL');
  }
});
```

### Resource Limits

```javascript
app.use(express.raw({
  type: '*/*',
  limit: '10mb' // Limit request size
}));

// Timeout middleware
app.use((req, res, next) => {
  req.setTimeout(25000); // 25 second timeout
  next();
});
```

## Debugging

### Logging

```javascript
// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Log errors
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal server error');
});
```

### Testing Locally

```bash
# Run with logs
docker run -p 8080:80 my-agent

# Exec into container
docker exec -it <container-id> sh

# View logs
docker logs <container-id> -f
```

## Common Issues

### Port Not Accessible

Ensure Docker exposes port 80:

```dockerfile
EXPOSE 80
```

And server listens on `0.0.0.0`:

```javascript
app.listen(80, '0.0.0.0');
```

### ABI Decoding Errors

- Verify types match specification exactly
- Check for byte order issues
- Ensure `0x` prefix handling is correct
- Use `toString('hex')` for buffers

### Container Crashes

- Check memory usage
- Implement graceful error handling
- Add health checks
- Monitor resource consumption

## Next Steps

- [Learn about ABI encoding in detail](./05-abi-encoding.md)
- [Explore example implementations](./06-examples.md)
- [Set up an agent host to run agents](./04-running-agents.md)
