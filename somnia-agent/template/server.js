import { createServer } from 'http';
import { readFileSync } from 'fs';
import { decodeFunctionData, encodeFunctionResult } from 'viem';

const PORT = 80;

// Helper to track execution steps
function createResponse() {
  return {
    steps: [],
    result: null,
  };
}

function addStep(response, name, data = {}) {
  response.steps.push({
    name,
    ...data,
  });
}

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

// Handler functions - add your implementations here
const handlers = {
  greet(name) {
    return `Hello, ${name}!`;
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

  const response = createResponse();

  try {
    const body = await readBody(req);

    // Parse JSON request: { requestId: string, request: hex-encoded string }
    const jsonRequest = JSON.parse(body.toString());
    const { requestId = 'unknown', request: requestHex } = jsonRequest;

    addStep(response, 'request_received', { requestId });

    // Convert hex request to data format for viem
    const data = requestHex.startsWith('0x') ? requestHex : '0x' + requestHex;

    if (data.length < 10) { // 0x + 4 bytes minimum
      addStep(response, 'error', { error: 'Invalid request: too short' });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    // Decode calldata - viem returns functionName and args
    const { functionName, args } = decodeFunctionData({ abi, data });
    addStep(response, 'request_decoded', { functionName, argsCount: args.length });

    console.log(`[${requestId}] Handling ${functionName}`);

    // Get handler for this function
    const handler = handlers[functionName];
    if (!handler) {
      addStep(response, 'error', { error: `No handler for function: ${functionName}` });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    // Call handler with args
    addStep(response, 'handler_started', { functionName });
    const result = handler(...args);
    addStep(response, 'handler_completed', { functionName, resultType: typeof result });

    // Encode the response
    const encoded = encodeFunctionResult({
      abi,
      functionName,
      result: Array.isArray(result) ? result : [result]
    });
    addStep(response, 'response_encoded', { responseLength: encoded.length });

    console.log(`[${requestId}] Response: ${encoded}`);

    // Set result and return
    response.result = encoded;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

  } catch (error) {
    console.error('Error processing request:', error);
    addStep(response, 'error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
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
