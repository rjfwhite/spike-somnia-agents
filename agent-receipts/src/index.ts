import express, { Request, Response } from 'express';
import cors from 'cors';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'agent-receipts';

// Initialize GCS client (uses ADC in Cloud Run)
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

// Enable CORS for all origins
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Get the folder path for a requestId
 */
function getFolderPath(requestId: string): string {
    return `receipts/${requestId}/`;
}

/**
 * Generate a unique receipt filename
 */
function generateReceiptFilename(): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${randomSuffix}.json`;
}

/**
 * Read all receipts from GCS for a given requestId
 */
async function readReceipts(requestId: string): Promise<any[]> {
    const folderPath = getFolderPath(requestId);

    try {
        const [files] = await bucket.getFiles({ prefix: folderPath });

        if (files.length === 0) {
            return [];
        }

        const receipts = await Promise.all(
            files.map(async (file) => {
                const [content] = await file.download();
                return JSON.parse(content.toString());
            })
        );

        // Sort by _storedAt timestamp
        return receipts.sort((a, b) =>
            new Date(a._storedAt).getTime() - new Date(b._storedAt).getTime()
        );
    } catch (error: any) {
        console.error(`Error reading receipts for ${requestId}:`, error.message);
        return [];
    }
}

/**
 * Write a single receipt to GCS for a given requestId
 */
async function writeReceipt(requestId: string, receipt: any): Promise<void> {
    const filePath = getFolderPath(requestId) + generateReceiptFilename();
    const file = bucket.file(filePath);
    await file.save(JSON.stringify(receipt, null, 2), {
        contentType: 'application/json',
    });
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', bucket: BUCKET_NAME });
});

// POST /agent-receipts?requestId=<id> - Store a receipt for a request
app.post('/agent-receipts', async (req: Request, res: Response) => {
    const requestId = req.query.requestId as string;

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
        // Write receipt as a separate file (no read-modify-write, no race conditions)
        await writeReceipt(requestId, receipt);

        console.log(`Stored receipt for requestId: ${requestId}`);

        res.status(201).json({
            success: true,
            requestId,
        });
    } catch (error: any) {
        console.error(`Error storing receipt for ${requestId}:`, error.message);
        res.status(500).json({ error: 'Failed to store receipt' });
    }
});

// GET /agent-receipts?requestId=<id> - Get all receipts for a request
app.get('/agent-receipts', async (req: Request, res: Response) => {
    const requestId = req.query.requestId as string;

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
    } catch (error: any) {
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
