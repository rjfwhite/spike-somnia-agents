import express from 'express';
import { Storage } from '@google-cloud/storage';
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'agent-receipts';
// Initialize GCS client (uses ADC in Cloud Run)
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);
// Middleware to parse JSON bodies
app.use(express.json());
/**
 * Get the GCS file path for a requestId
 */
function getFilePath(requestId) {
    return `receipts/${requestId}.json`;
}
/**
 * Read receipts from GCS for a given requestId
 */
async function readReceipts(requestId) {
    const file = bucket.file(getFilePath(requestId));
    try {
        const [exists] = await file.exists();
        if (!exists) {
            return [];
        }
        const [content] = await file.download();
        return JSON.parse(content.toString());
    }
    catch (error) {
        console.error(`Error reading receipts for ${requestId}:`, error.message);
        return [];
    }
}
/**
 * Write receipts to GCS for a given requestId
 */
async function writeReceipts(requestId, receipts) {
    const file = bucket.file(getFilePath(requestId));
    await file.save(JSON.stringify(receipts, null, 2), {
        contentType: 'application/json',
    });
}
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', bucket: BUCKET_NAME });
});
// POST /agent-receipts?requestId=<id> - Store a receipt for a request
app.post('/agent-receipts', async (req, res) => {
    const requestId = req.query.requestId;
    if (!requestId) {
        res.status(400).json({ error: 'Missing requestId query parameter' });
        return;
    }
    const receipt = req.body;
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
        res.status(400).json({ error: 'Receipt must be a JSON object' });
        return;
    }
    try {
        // Add timestamp metadata
        const receiptWithMetadata = {
            ...receipt,
            _storedAt: new Date().toISOString(),
        };
        // Read existing receipts, append new one, and write back
        const existingReceipts = await readReceipts(requestId);
        existingReceipts.push(receiptWithMetadata);
        await writeReceipts(requestId, existingReceipts);
        console.log(`Stored receipt for requestId: ${requestId} (total: ${existingReceipts.length})`);
        res.status(201).json({
            success: true,
            requestId,
            receiptCount: existingReceipts.length,
        });
    }
    catch (error) {
        console.error(`Error storing receipt for ${requestId}:`, error.message);
        res.status(500).json({ error: 'Failed to store receipt' });
    }
});
// GET /agent-receipts?requestId=<id> - Get all receipts for a request
app.get('/agent-receipts', async (req, res) => {
    const requestId = req.query.requestId;
    if (!requestId) {
        res.status(400).json({ error: 'Missing requestId query parameter' });
        return;
    }
    try {
        const receipts = await readReceipts(requestId);
        res.json({
            requestId,
            receipts,
            count: receipts.length,
        });
    }
    catch (error) {
        console.error(`Error reading receipts for ${requestId}:`, error.message);
        res.status(500).json({ error: 'Failed to retrieve receipts' });
    }
});
// Start server
app.listen(PORT, () => {
    console.log(`Agent Receipts service listening on port ${PORT}`);
    console.log(`Using GCS bucket: ${BUCKET_NAME}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  POST /agent-receipts?requestId=<id>  - Store a receipt');
    console.log('  GET  /agent-receipts?requestId=<id>  - Get all receipts for a request');
    console.log('  GET  /health                         - Health check');
});
