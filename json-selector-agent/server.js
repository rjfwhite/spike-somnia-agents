const express = require('express');
const { decodeAbiParameters, encodeAbiParameters } = require('viem');
const axios = require('axios');
const _ = require('lodash');

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

// Method: fetch(string url, string selector) returns (string result)
app.post('/fetch', async (req, res) => {
    try {
        // Decode input: string url, string selector
        const [url, selector] = decodeInput(req.body, [
            { type: 'string', name: 'url' },
            { type: 'string', name: 'selector' }
        ]);

        console.log(`Fetching URL: ${url} with selector: ${selector}`);

        // Fetch JSON from URL
        const response = await axios.get(url);
        const data = response.data;

        // Extract value using selector (lodash.get supports dot notation like 'a.b[0].c')
        let resultValue = _.get(data, selector);

        // Handle cases where result is not a string
        if (resultValue === undefined) {
            throw new Error(`Selector "${selector}" not found in response`);
        }

        let resultString;
        if (typeof resultValue === 'string') {
            resultString = resultValue;
        } else if (typeof resultValue === 'object') {
            resultString = JSON.stringify(resultValue);
        } else {
            resultString = String(resultValue);
        }

        // Encode output: string result
        const encoded = encodeOutput([resultString], [{ type: 'string', name: 'result' }]);

        res.send(Buffer.from(encoded.slice(2), 'hex'));
    } catch (error) {
        console.error('Error in /fetch:', error.message);
        // Clean error message for response
        const errorMessage = error.response
            ? `HTTP Error: ${error.response.status} ${error.response.statusText}`
            : error.message;

        res.status(500).send(Buffer.from(errorMessage));
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', methods: ['fetch'] });
});

app.listen(PORT, () => {
    console.log(`JSON Selector Agent listening on port ${PORT}`);
    console.log('Available methods:');
    console.log('  POST /fetch - fetch(string url, string selector) returns (string result)');
});
