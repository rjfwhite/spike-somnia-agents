const express = require('express');
const { decodeAbiParameters, encodeAbiParameters } = require('viem');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 80;

// Middleware to parse raw body as hex
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Helper to decode ABI-encoded input
function decodeInput(data, types) {
    const hex = data.toString('hex');
    const hexWithPrefix = hex.startsWith('0x') ? hex : `0x${hex}`;
    return decodeAbiParameters(types, hexWithPrefix);
}

// Helper to encode ABI output
function encodeOutput(values, types) {
    return encodeAbiParameters(types, values);
}

// Method: request(string url, string[] keys, string[] values) returns (string response)
app.post('/request', async (req, res) => {
    try {
        console.log(`\n📨 Received request`);

        // 1. Get Request ID from header
        const requestId = req.headers['x-somnia-request-id'];
        if (!requestId) {
            console.warn('⚠️ Warning: X-Somnia-Request-ID header missing');
        }

        // 2. Decode input: string url, string[] keys, string[] values
        const [url, keys, values] = decodeInput(req.body, [
            { type: 'string', name: 'url' },
            { type: 'string[]', name: 'keys' },
            { type: 'string[]', name: 'values' }
        ]);

        console.log(`   URL: ${url}`);
        console.log(`   Request ID: ${requestId}`);

        // 3. Construct JSON Payload
        const payload = {
            requestId: requestId || 'unknown',
            timestamp: Date.now()
        };

        // Add key/value pairs to payload
        if (keys.length !== values.length) {
            throw new Error(`Keys and values length mismatch: ${keys.length} vs ${values.length}`);
        }

        for (let i = 0; i < keys.length; i++) {
            payload[keys[i]] = values[i];
        }

        console.log(`   Payload:`, JSON.stringify(payload));

        // 4. Execute HTTP POST
        console.log(`   🚀 Sending POST to ${url}...`);
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10s timeout
        });

        console.log(`   ✅ Response status: ${response.status}`);

        // 5. Prepare Response
        // We return the response body as a string. If object, stringify it.
        let responseBody = response.data;
        if (typeof responseBody === 'object') {
            responseBody = JSON.stringify(responseBody);
        } else {
            responseBody = String(responseBody);
        }

        // Encode output: string response
        const encoded = encodeOutput([responseBody], [{ type: 'string', name: 'response' }]);

        res.send(Buffer.from(encoded.slice(2), 'hex'));

    } catch (error) {
        console.error('❌ Error in /request:', error.message);
        // Clean error message for response
        const errorMessage = error.response
            ? `HTTP Error: ${error.response.status} ${error.response.statusText}`
            : error.message;

        // Optionally perform ABI error encoding here if the contract expects it, 
        // but for now 500 with text is standard for the host to catch.
        res.status(500).send(Buffer.from(errorMessage));
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', methods: ['request'] });
});

app.listen(PORT, () => {
    console.log(`Idempotent Request Agent listening on port ${PORT}`);
    console.log('Available methods:');
    console.log('  POST /request - request(string url, string[] keys, string[] values) returns (string response)');
});
