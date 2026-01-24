import { NextRequest, NextResponse } from 'next/server';
import { AGENT_HOST_URL } from '@/lib/config';

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(`${AGENT_HOST_URL}/metrics`);

        if (!response.ok) {
            return new NextResponse(
                `Failed to fetch metrics: ${response.status}`,
                { status: response.status }
            );
        }

        const metricsText = await response.text();

        return new NextResponse(metricsText, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    } catch (error: any) {
        console.error('Metrics proxy error:', error);
        return new NextResponse(
            error.message || 'Failed to fetch metrics',
            { status: 500 }
        );
    }
}
