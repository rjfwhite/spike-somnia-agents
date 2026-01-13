# Implementation Examples

Complete examples of Somnia Agent implementations using the function selector routing pattern.

## Example 1: Greeting Agent

A simple agent demonstrating basic string handling with function selector routing.

### Metadata

```json
{
  "name": "Greeting Agent",
  "description": "Returns personalized greetings",
  "container_image": "ipfs://QmGreetingAgentCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "greet",
      "inputs": [{ "name": "name", "type": "string" }],
      "outputs": [{ "name": "greeting", "type": "string" }]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { decodeFunctionData, encodeFunctionResult, keccak256, toBytes, slice } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const abi = [
  {
    type: 'function',
    name: 'greet',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: 'greeting', type: 'string' }]
  }
];

// Single endpoint handles all requests via function selector
app.post('/', (req, res) => {
  try {
    const data = '0x' + req.body.toString('hex');
    const { functionName, args } = decodeFunctionData({ abi, data });

    let result;
    switch (functionName) {
      case 'greet':
        result = `Hello, ${args[0]}! Welcome to Somnia Agents.`;
        break;
      default:
        return res.status(400).send('Unknown function');
    }

    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: [result]
    });

    res.send(Buffer.from(encoded.slice(2), 'hex'));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

### Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
EXPOSE 80
CMD ["node", "server.js"]
```

---

## Example 2: JSON Selector Agent

Fetches JSON from a URL and extracts values using dot notation selectors. This is the pattern used by the core JSON API Selector agent.

### Metadata

```json
{
  "name": "JSON Selector",
  "description": "Fetches JSON and extracts values using selectors",
  "container_image": "ipfs://QmJsonSelectorCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "fetch",
      "inputs": [
        { "name": "url", "type": "string" },
        { "name": "selector", "type": "string" }
      ],
      "outputs": [{ "name": "result", "type": "string" }]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { decodeFunctionData, encodeFunctionResult } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const abi = [
  {
    type: 'function',
    name: 'fetch',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'selector', type: 'string' }
    ],
    outputs: [{ name: 'result', type: 'string' }]
  }
];

// Helper to extract nested value using dot notation
function extractValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    // Handle array notation like items[0]
    const match = key.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      return current[match[1]]?.[parseInt(match[2])];
    }
    return current[key];
  }, obj);
}

app.post('/', async (req, res) => {
  try {
    const data = '0x' + req.body.toString('hex');
    const { functionName, args } = decodeFunctionData({ abi, data });

    let result;
    switch (functionName) {
      case 'fetch': {
        const [url, selector] = args;

        // Validate URL
        if (!url.startsWith('https://')) {
          return res.status(400).send('Only HTTPS URLs allowed');
        }

        // Fetch JSON
        const response = await fetch(url);
        if (!response.ok) {
          return res.status(400).send('Failed to fetch URL');
        }

        const json = await response.json();
        const value = extractValue(json, selector);
        result = value !== undefined ? String(value) : '';
        break;
      }
      default:
        return res.status(400).send('Unknown function');
    }

    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: [result]
    });

    res.send(Buffer.from(encoded.slice(2), 'hex'));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

---

## Example 3: Multi-Method Calculator

Demonstrates an agent with multiple methods, all routed through the same endpoint.

### Metadata

```json
{
  "name": "Calculator",
  "description": "Performs mathematical calculations",
  "container_image": "ipfs://QmCalculatorCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "add",
      "inputs": [
        { "name": "a", "type": "uint256" },
        { "name": "b", "type": "uint256" }
      ],
      "outputs": [{ "name": "result", "type": "uint256" }]
    },
    {
      "type": "function",
      "name": "multiply",
      "inputs": [
        { "name": "a", "type": "uint256" },
        { "name": "b", "type": "uint256" }
      ],
      "outputs": [{ "name": "result", "type": "uint256" }]
    },
    {
      "type": "function",
      "name": "sumArray",
      "inputs": [{ "name": "numbers", "type": "uint256[]" }],
      "outputs": [{ "name": "total", "type": "uint256" }]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { decodeFunctionData, encodeFunctionResult } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const abi = [
  {
    type: 'function',
    name: 'add',
    inputs: [
      { name: 'a', type: 'uint256' },
      { name: 'b', type: 'uint256' }
    ],
    outputs: [{ name: 'result', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'multiply',
    inputs: [
      { name: 'a', type: 'uint256' },
      { name: 'b', type: 'uint256' }
    ],
    outputs: [{ name: 'result', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'sumArray',
    inputs: [{ name: 'numbers', type: 'uint256[]' }],
    outputs: [{ name: 'total', type: 'uint256' }]
  }
];

app.post('/', (req, res) => {
  try {
    const data = '0x' + req.body.toString('hex');
    const { functionName, args } = decodeFunctionData({ abi, data });

    let result;
    switch (functionName) {
      case 'add':
        result = args[0] + args[1];
        break;
      case 'multiply':
        result = args[0] * args[1];
        break;
      case 'sumArray':
        result = args[0].reduce((acc, num) => acc + num, 0n);
        break;
      default:
        return res.status(400).send('Unknown function');
    }

    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: [result]
    });

    res.send(Buffer.from(encoded.slice(2), 'hex'));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

---

## Example 4: Tuple Handler

Processing complex structured data using tuple types.

### Metadata

```json
{
  "name": "User Processor",
  "description": "Processes user information",
  "container_image": "ipfs://QmUserProcessorCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "processUser",
      "inputs": [
        {
          "name": "user",
          "type": "tuple",
          "components": [
            { "name": "name", "type": "string" },
            { "name": "age", "type": "uint256" },
            { "name": "wallet", "type": "address" }
          ]
        }
      ],
      "outputs": [
        { "name": "summary", "type": "string" },
        { "name": "isAdult", "type": "bool" }
      ]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { decodeFunctionData, encodeFunctionResult } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const abi = [
  {
    type: 'function',
    name: 'processUser',
    inputs: [
      {
        name: 'user',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'age', type: 'uint256' },
          { name: 'wallet', type: 'address' }
        ]
      }
    ],
    outputs: [
      { name: 'summary', type: 'string' },
      { name: 'isAdult', type: 'bool' }
    ]
  }
];

app.post('/', (req, res) => {
  try {
    const data = '0x' + req.body.toString('hex');
    const { functionName, args } = decodeFunctionData({ abi, data });

    switch (functionName) {
      case 'processUser': {
        const user = args[0];
        const summary = `User: ${user.name}, Age: ${user.age}, Wallet: ${user.wallet}`;
        const isAdult = user.age >= 18n;

        const encoded = encodeFunctionResult({
          abi,
          functionName,
          result: [summary, isAdult]
        });

        return res.send(Buffer.from(encoded.slice(2), 'hex'));
      }
      default:
        return res.status(400).send('Unknown function');
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

---

## Example 5: AI Parse Website Agent

A comprehensive agent with multiple related functions for AI-powered web parsing. This demonstrates how to implement an agent with several method variants.

### Metadata

```json
{
  "name": "AI Parse Website",
  "description": "AI-powered web content parsing with multiple output types",
  "container_image": "ipfs://QmAiParseWebsiteCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "aiParseWebsiteString",
      "inputs": [
        { "name": "url", "type": "string" },
        { "name": "query", "type": "string" }
      ],
      "outputs": [{ "name": "result", "type": "string" }]
    },
    {
      "type": "function",
      "name": "aiParseWebsiteInteger",
      "inputs": [
        { "name": "url", "type": "string" },
        { "name": "query", "type": "string" },
        { "name": "min", "type": "int256" },
        { "name": "max", "type": "int256" }
      ],
      "outputs": [{ "name": "result", "type": "int256" }]
    },
    {
      "type": "function",
      "name": "aiParseWebsiteBool",
      "inputs": [
        { "name": "url", "type": "string" },
        { "name": "query", "type": "string" }
      ],
      "outputs": [{ "name": "result", "type": "bool" }]
    },
    {
      "type": "function",
      "name": "aiParseWebsiteEnum",
      "inputs": [
        { "name": "url", "type": "string" },
        { "name": "query", "type": "string" },
        { "name": "options", "type": "string[]" }
      ],
      "outputs": [{ "name": "result", "type": "string" }]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { decodeFunctionData, encodeFunctionResult } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const abi = [
  {
    type: 'function',
    name: 'aiParseWebsiteString',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'query', type: 'string' }
    ],
    outputs: [{ name: 'result', type: 'string' }]
  },
  {
    type: 'function',
    name: 'aiParseWebsiteInteger',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'query', type: 'string' },
      { name: 'min', type: 'int256' },
      { name: 'max', type: 'int256' }
    ],
    outputs: [{ name: 'result', type: 'int256' }]
  },
  {
    type: 'function',
    name: 'aiParseWebsiteBool',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'query', type: 'string' }
    ],
    outputs: [{ name: 'result', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'aiParseWebsiteEnum',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'query', type: 'string' },
      { name: 'options', type: 'string[]' }
    ],
    outputs: [{ name: 'result', type: 'string' }]
  }
];

// Helper: fetch and parse webpage with AI
async function parseWithAI(url, query) {
  const response = await fetch(url);
  const html = await response.text();
  // Call AI model to parse content based on query
  // (Implementation depends on your AI provider)
  return await callAIModel(html, query);
}

app.post('/', async (req, res) => {
  try {
    let data = req.body;
    // Convert Buffer to string if needed
    if (Buffer.isBuffer(data)) {
      data = data.toString('utf8');
    }
    if (typeof data !== 'string' || !data.startsWith('0x')) {
      return res.status(400).send('Invalid request body. Expected ABI encoded hex string starting with 0x.');
    }

    const { functionName, args } = decodeFunctionData({ abi, data });
    console.log(`Received call for: ${functionName}`, args);

    let result;
    switch (functionName) {
      case 'aiParseWebsiteString': {
        const [url, query] = args;
        result = await parseWithAI(url, query);
        break;
      }
      case 'aiParseWebsiteInteger': {
        const [url, query, min, max] = args;
        const parsed = await parseWithAI(url, query);
        const num = BigInt(parseInt(parsed));
        // Clamp to range
        result = num < min ? min : num > max ? max : num;
        break;
      }
      case 'aiParseWebsiteBool': {
        const [url, query] = args;
        const parsed = await parseWithAI(url, query);
        result = parsed.toLowerCase() === 'true' || parsed === '1';
        break;
      }
      case 'aiParseWebsiteEnum': {
        const [url, query, options] = args;
        const parsed = await parseWithAI(url, query);
        // Return matching option or first option as fallback
        result = options.find(opt =>
          opt.toLowerCase() === parsed.toLowerCase()
        ) || options[0];
        break;
      }
      default:
        return res.status(400).send('Unknown function');
    }

    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: [result]
    });

    res.send(Buffer.from(encoded.slice(2), 'hex'));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.listen(80);
```

---

## Example 6: Python Implementation

Example using Python with eth-abi for function selector routing.

### Metadata

```json
{
  "name": "Weather Agent",
  "description": "Fetches weather data",
  "container_image": "ipfs://QmWeatherAgentCID",
  "version": "1.0.0",
  "abi": [
    {
      "type": "function",
      "name": "getWeather",
      "inputs": [{ "name": "city", "type": "string" }],
      "outputs": [
        { "name": "temperature", "type": "int256" },
        { "name": "description", "type": "string" }
      ]
    }
  ]
}
```

### Implementation (Python)

```python
from flask import Flask, request, Response
from eth_abi import decode, encode
from eth_utils import keccak
import requests
import os

app = Flask(__name__)

# Define ABI
ABI = {
    'getWeather': {
        'inputs': ['string'],
        'outputs': ['int256', 'string']
    }
}

# Compute function selectors at startup
SELECTORS = {}
for name, spec in ABI.items():
    sig = f"{name}({','.join(spec['inputs'])})"
    selector = keccak(text=sig)[:4]
    SELECTORS[selector] = (name, spec)

@app.route('/', methods=['POST'])
def handle_request():
    try:
        raw_data = request.get_data()

        # Extract 4-byte function selector
        selector = raw_data[:4]
        params_data = raw_data[4:]

        if selector not in SELECTORS:
            return 'Unknown function selector', 400

        name, spec = SELECTORS[selector]

        # Decode parameters
        args = decode(spec['inputs'], params_data)

        # Route to handler
        if name == 'getWeather':
            city = args[0]
            # Mock weather data (replace with real API)
            temperature = 22
            description = f"Sunny in {city}"
            result = encode(spec['outputs'], [temperature, description])
        else:
            return 'Not implemented', 400

        return Response(result, mimetype='application/octet-stream')

    except Exception as e:
        print(f'Error: {e}')
        return str(e), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
```

### Dockerfile (Python)

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
EXPOSE 80
CMD ["python", "server.py"]
```

### requirements.txt

```
flask==3.0.0
eth-abi==4.2.1
eth-utils==2.3.1
requests==2.31.0
```

---

## Invoking Agents

### From JavaScript/TypeScript

```javascript
import { encodeFunctionData, decodeFunctionResult } from 'viem';

const abi = [{
  type: 'function',
  name: 'greet',
  inputs: [{ name: 'name', type: 'string' }],
  outputs: [{ name: 'greeting', type: 'string' }]
}];

// Encode the request (includes 4-byte selector)
const calldata = encodeFunctionData({
  abi,
  functionName: 'greet',
  args: ['Alice']
});

// Send to agent (all requests go to root path)
const response = await fetch('http://agent-url/', {
  method: 'POST',
  body: Buffer.from(calldata.slice(2), 'hex')
});

// Decode the response
const responseHex = '0x' + Buffer.from(await response.arrayBuffer()).toString('hex');
const result = decodeFunctionResult({
  abi,
  functionName: 'greet',
  data: responseHex
});

console.log(result); // "Hello, Alice! Welcome to Somnia Agents."
```

### From Solidity

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGreetingAgent {
    function greet(string calldata name) external returns (string memory);
}

contract MyContract {
    address public greetingAgent;

    function sayHello(string calldata name) external returns (string memory) {
        // The Somnia runtime handles routing to the agent
        return IGreetingAgent(greetingAgent).greet(name);
    }
}
```

---

## Best Practices

### Error Handling

```javascript
app.post('/', (req, res) => {
  try {
    // Validate minimum request length (4-byte selector)
    if (req.body.length < 4) {
      return res.status(400).send('Invalid request: too short');
    }

    const data = '0x' + req.body.toString('hex');
    const { functionName, args } = decodeFunctionData({ abi, data });

    // Handle request...
  } catch (error) {
    // Log for debugging
    console.error('Error processing request:', error);

    // Return appropriate error
    if (error.message.includes('unknown function')) {
      return res.status(400).send('Unknown function selector');
    }
    return res.status(500).send('Internal error');
  }
});
```

### Input Validation

```javascript
case 'fetch': {
  const [url, selector] = args;

  // Validate URL protocol
  if (!url.startsWith('https://')) {
    return res.status(400).send('Only HTTPS URLs allowed');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).send('Invalid URL format');
  }

  // Validate selector format
  if (!selector || selector.length === 0) {
    return res.status(400).send('Selector required');
  }

  // Process request...
}
```

### Timeouts

```javascript
// Set request timeout
app.use((req, res, next) => {
  req.setTimeout(25000); // 25 seconds
  next();
});

// Use AbortController for external requests
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20000);

try {
  const response = await fetch(url, { signal: controller.signal });
  // Process response...
} finally {
  clearTimeout(timeout);
}
```

---

## Next Steps

- [Understand container requirements](./03-container-requirements.md)
- [Learn about ABI encoding](./04-abi-encoding.md)
- [Explore core agents](./01-core-agents.md)
