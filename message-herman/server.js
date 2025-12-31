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

// Method: messageHerman(string message) returns (string response)
app.post('/messageHerman', async (req, res) => {
    try {
        console.log(`\n📨 Received request`);

        // 1. Get Request ID from header
        const requestId = req.headers['x-somnia-request-id'];
        if (!requestId) {
            console.warn('⚠️ Warning: X-Somnia-Request-ID header missing');
        }

        // 2. Decode input: string message
        const [message] = decodeInput(req.body, [
            { type: 'string', name: 'message' }
        ]);

        console.log(`   Message for Herman: ${message}`);
        console.log(`   Request ID: ${requestId}`);

        // 3. Construct JSON Payload
        const payload = {
            requestId: requestId || 'unknown',
            name: "YOO",
            message: message
        };

        console.log(`   Payload:`, JSON.stringify(payload));

        // 4. Execute HTTP POST to SMS Service
        const url = 'https://sms-service-neon.vercel.app/';
        console.log(`   🚀 Sending POST to ${url}...`);
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10s timeout
        });

        console.log(`   ✅ Response status: ${response.status}`);

        // 5. Prepare Response
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
        console.error('❌ Error in /messageHerman:', error.message);
        const errorMessage = error.response
            ? `HTTP Error: ${error.response.status} ${error.response.statusText}`
            : error.message;
        res.status(500).send(Buffer.from(errorMessage));
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', methods: ['messageHerman'] });
});

app.listen(PORT, () => {
    console.log(`Message Herman Agent listening on port ${PORT}`);
    console.log('Available methods:');
    console.log('  POST /messageHerman - messageHerman(string message) returns (string response)');
});
