import { createServer, IncomingMessage, ServerResponse } from 'http';
import { forwardToAgent, cleanupContainers } from './docker.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const RECEIPTS_SERVICE_URL = process.env.RECEIPTS_SERVICE_URL || 'https://agent-receipts-937722299914.us-central1.run.app';

/**
 * Upload a receipt to the receipts service
 */
async function uploadReceipt(requestId: string, receipt: any): Promise<void> {
  try {
    const response = await fetch(`${RECEIPTS_SERVICE_URL}/agent-receipts?requestId=${encodeURIComponent(requestId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(receipt),
    });

    if (!response.ok) {
      console.error(`Failed to upload receipt for ${requestId}: ${response.status}`);
    } else {
      console.log(`Request ${requestId}: Receipt uploaded to receipts service`);
    }
  } catch (error: any) {
    console.error(`Failed to upload receipt for ${requestId}: ${error.message}`);
  }
}

/**
 * Read the entire request body as a Buffer
 */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Send an error response
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(message);
}

/**
 * Handle POST request - forward to agent container
 */
async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const agentUrl = req.headers['x-agent-url'] as string | undefined;
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (!agentUrl) {
    sendError(res, 400, 'Missing X-Agent-Url header');
    return;
  }

  if (!requestId) {
    sendError(res, 400, 'Missing X-Request-Id header');
    return;
  }

  try {
    // Read the binary ABI-encoded request body
    const body = await readBody(req);

    console.log(`Request ${requestId}: Forwarding to agent at ${agentUrl}`);
    console.log(`  Body size: ${body.length} bytes`);

    // Forward to agent container, passing through headers
    const agentResponse = await forwardToAgent(agentUrl, body, {
      'X-Request-Id': requestId,
    });

    console.log(`Request ${requestId}: Agent responded with status ${agentResponse.status}`);

    // Upload receipt if agent provided one
    if (agentResponse.receipt) {
      uploadReceipt(requestId, agentResponse.receipt);
    }

    // Send the binary response back to requester
    res.writeHead(agentResponse.status, {
      'Content-Type': 'application/octet-stream',
    });
    res.end(agentResponse.body);
  } catch (error: any) {
    console.error(`Request ${requestId}: Error - ${error.message}`);
    sendError(res, 500, `Agent execution failed: ${error.message}`);
  }
}

/**
 * Main request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  console.log(`${req.method} ${req.url}`);

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  // Root endpoint handles agent requests
  if (req.url === '/' || req.url === '') {
    if (req.method === 'POST') {
      await handlePost(req, res);
    } else {
      sendError(res, 405, 'Method not allowed. Use POST.');
    }
    return;
  }

  sendError(res, 404, 'Not found');
}

// Create and start server
const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) {
      sendError(res, 500, 'Internal server error');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Agent Host HTTP server listening on port ${PORT}`);
  console.log('');
  console.log('Usage:');
  console.log('  POST / with headers:');
  console.log('    X-Agent-Url: URL of the tarred container image');
  console.log('    X-Request-Id: Request ID for receipts');
  console.log('  Body: Binary ABI-encoded function call');
  console.log('');
  console.log('Response:');
  console.log('  Body: Binary ABI-encoded result');
  console.log('  X-Receipt-Url: URL of execution receipt (if provided by agent)');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await cleanupContainers();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await cleanupContainers();
  server.close();
  process.exit(0);
});
