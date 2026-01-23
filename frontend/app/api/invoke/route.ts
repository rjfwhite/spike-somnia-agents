import { NextRequest, NextResponse } from 'next/server';

const AGENT_HOST_URL = process.env.AGENT_HOST_URL || 'http://34.170.54.156';

function toHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

        return NextResponse.json({
            response: responseHex,
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
