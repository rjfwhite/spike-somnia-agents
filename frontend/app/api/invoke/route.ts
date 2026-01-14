import { NextRequest, NextResponse } from 'next/server';

const AGENT_HOST_URL = process.env.AGENT_HOST_URL || 'http://136.119.40.64';
const RECEIPTS_SERVICE_URL = process.env.RECEIPTS_SERVICE_URL || 'https://agent-receipts-937722299914.us-central1.run.app';

function toHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchReceipts(requestId: string): Promise<any[]> {
    try {
        const response = await fetch(
            `${RECEIPTS_SERVICE_URL}/agent-receipts?requestId=${encodeURIComponent(requestId)}`
        );
        if (!response.ok) {
            console.error(`Failed to fetch receipts: ${response.status}`);
            return [];
        }
        const data = await response.json();
        return data.receipts || [];
    } catch (error: any) {
        console.error(`Failed to fetch receipts: ${error.message}`);
        return [];
    }
}

export async function POST(request: NextRequest) {
    try {
        const agentUrl = request.headers.get('x-agent-url');
        const requestId = request.headers.get('x-request-id');

        if (!agentUrl) {
            return NextResponse.json(
                { error: 'Missing X-Agent-Url header' },
                { status: 400 }
            );
        }

        if (!requestId) {
            return NextResponse.json(
                { error: 'Missing X-Request-Id header' },
                { status: 400 }
            );
        }

        const body = await request.arrayBuffer();

        const response = await fetch(AGENT_HOST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Agent-Url': agentUrl,
                'X-Request-Id': requestId,
            },
            body: body,
        });

        const responseBody = await response.arrayBuffer();
        const responseHex = toHex(new Uint8Array(responseBody));

        // Fetch receipts from the receipts service
        const receipts = await fetchReceipts(requestId);

        return NextResponse.json({
            response: responseHex,
            receipts,
            agentStatus: response.status,
        }, {
            status: response.ok ? 200 : response.status,
        });
    } catch (error: any) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: error.message || 'Proxy request failed' },
            { status: 500 }
        );
    }
}
