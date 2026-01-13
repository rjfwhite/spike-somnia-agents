import { createServer } from 'http';
import { readFileSync } from 'fs';
import { decodeFunctionData, encodeFunctionResult } from 'viem';

const PORT = 80;

// Load agent definition from JSON
const agentDef = JSON.parse(readFileSync('./agent.json', 'utf-8'));
const abi = agentDef.abi;

console.log(`Starting ${agentDef.name} v${agentDef.version}`);
console.log(agentDef.description);
console.log('');

// Log available functions
for (const fn of abi.filter(x => x.type === 'function')) {
  const sig = `${fn.name}(${fn.inputs.map(i => i.type).join(',')})`;
  console.log(`Registered: ${sig}`);
}

// Handler functions
const handlers = {
  greet(name) {
    return `Hello!!!!, ${name}!`;
  },

  add(a, b) {
    return a + b;
  },

  echo(message) {
    return message;
  },

  reverse(text) {
    return text.split('').reverse().join('');
  }
};

// Read request body as Buffer
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Main request handler
async function handleRequest(req, res) {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      name: agentDef.name,
      version: agentDef.version,
      methods: abi.filter(f => f.type === 'function').map(f => f.name)
    }));
    return;
  }

  // Root GET for readiness check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready' }));
    return;
  }

  // Only handle POST to /
  if (req.method !== 'POST' || (req.url !== '/' && req.url !== '')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  try {
    const body = await readBody(req);

    if (body.length < 4) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request: too short');
      return;
    }

    const data = '0x' + body.toString('hex');

    // Decode calldata - viem returns functionName and args
    const { functionName, args } = decodeFunctionData({ abi, data });

    console.log(`Handling ${functionName}`);

    // Get handler for this function
    const handler = handlers[functionName];
    if (!handler) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`No handler for function: ${functionName}`);
      return;
    }

    // Call handler with args
    const result = handler(...args);

    // Encode the response
    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: Array.isArray(result) ? result : [result]
    });

    console.log(`Response: ${encoded}`);

    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(Buffer.from(encoded.slice(2), 'hex'));

  } catch (error) {
    console.error('Error processing request:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${error.message}`);
  }
}

// Create and start server
const server = createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  handleRequest(req, res).catch(err => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`${agentDef.name} listening on port ${PORT}`);
});
