// Simple agent HTTP server
import http from 'http';

const PORT = 80;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const method = url.pathname.slice(1); // Remove leading slash

  let body = [];
  req.on('data', chunk => body.push(chunk));

  req.on('end', () => {
    const callData = Buffer.concat(body);
    console.log(`Received request: ${method}`);
    console.log(`Call data (hex): ${callData.toString('hex')}`);

    // Handle the request based on method
    // The callData contains ABI-encoded input parameters
    // Return ABI-encoded output parameters
    
    try {
      const response = handleMethod(method, callData);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(response);
    } catch (error) {
      console.error(`Error handling ${method}:`, error);
      res.writeHead(500);
      res.end(`Error: ${error.message}`);
    }
  });
});

function handleMethod(method, callData) {
  switch (method) {
    case 'ping':
      // No inputs expected
      // Output: string message
      // For simplicity, return raw text (in production, use ABI encoding)
      return Buffer.from('pong');
      
    case 'echo':
      // Input: string message
      // Output: string message
      // Echo back the input (callData is ABI-encoded string)
      return callData;
      
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

server.listen(PORT, () => {
  console.log(`Agent server listening on port ${PORT}`);
});
