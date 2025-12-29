const express = require('express');
const { decodeAbiParameters, encodeAbiParameters } = require('viem');

const app = express();
const PORT = 80;

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

// Method: greet(string name) returns (string greeting)
app.post('/greet', (req, res) => {
    try {
        // Decode input: string name
        const [name] = decodeInput(req.body, [{ type: 'string', name: 'name' }]);

        // Generate greeting
        const greeting = `Hello, ${name}! Welcome to the Somnia Agents platform.`;

        // Encode output: string greeting
        const encoded = encodeOutput([greeting], [{ type: 'string', name: 'greeting' }]);

        res.send(Buffer.from(encoded.slice(2), 'hex'));
    } catch (error) {
        console.error('Error in /greet:', error);
        res.status(500).send(Buffer.from(error.message));
    }
});

// Method: add(uint256 a, uint256 b) returns (uint256 sum)
app.post('/add', (req, res) => {
    try {
        // Decode input: uint256 a, uint256 b
        const [a, b] = decodeInput(req.body, [
            { type: 'uint256', name: 'a' },
            { type: 'uint256', name: 'b' }
        ]);

        // Calculate sum
        const sum = a + b;

        // Encode output: uint256 sum
        const encoded = encodeOutput([sum], [{ type: 'uint256', name: 'sum' }]);

        res.send(Buffer.from(encoded.slice(2), 'hex'));
    } catch (error) {
        console.error('Error in /add:', error);
        res.status(500).send(Buffer.from(error.message));
    }
});

// Method: processData(bytes data) returns (bytes result, bool success)
app.post('/processData', (req, res) => {
    try {
        // Decode input: bytes data
        const [data] = decodeInput(req.body, [{ type: 'bytes', name: 'data' }]);

        // Process the data (example: reverse it and convert to uppercase if it's text)
        let result;
        let success = true;

        try {
            // Try to interpret as UTF-8 text
            const text = Buffer.from(data.slice(2), 'hex').toString('utf8');
            const processed = text.split('').reverse().join('').toUpperCase();
            result = `0x${Buffer.from(processed).toString('hex')}`;
        } catch (e) {
            // If not text, just return the data as-is
            result = data;
            success = false;
        }

        // Encode output: bytes result, bool success
        const encoded = encodeOutput([result, success], [
            { type: 'bytes', name: 'result' },
            { type: 'bool', name: 'success' }
        ]);

        res.send(Buffer.from(encoded.slice(2), 'hex'));
    } catch (error) {
        console.error('Error in /processData:', error);
        res.status(500).send(Buffer.from(error.message));
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', methods: ['greet', 'add', 'processData'] });
});

app.listen(PORT, () => {
    console.log(`Example agent listening on port ${PORT}`);
    console.log('Available methods:');
    console.log('  POST /greet - greet(string name) returns (string greeting)');
    console.log('  POST /add - add(uint256 a, uint256 b) returns (uint256 sum)');
    console.log('  POST /processData - processData(bytes data) returns (bytes result, bool success)');
});
