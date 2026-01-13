import { NextRequest, NextResponse } from 'next/server';

const AGENT_HOST_URL = process.env.AGENT_HOST_URL || 'http://35.226.219.86';

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

        const headers = new Headers();
        headers.set('Content-Type', 'application/octet-stream');

        const receiptUrl = response.headers.get('x-receipt-url');
        if (receiptUrl) {
            headers.set('X-Receipt-Url', receiptUrl);
        }

        return new NextResponse(responseBody, {
            status: response.status,
            headers,
        });
    } catch (error: any) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: error.message || 'Proxy request failed' },
            { status: 500 }
        );
    }
}
