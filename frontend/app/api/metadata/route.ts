import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const url = request.nextUrl.searchParams.get('url');

        if (!url) {
            return NextResponse.json(
                { error: 'Missing url parameter' },
                { status: 400 }
            );
        }

        // Validate URL
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return NextResponse.json(
                { error: 'Invalid URL' },
                { status: 400 }
            );
        }

        const response = await fetch(parsedUrl.toString(), {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch metadata: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Metadata proxy error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch metadata' },
            { status: 500 }
        );
    }
}
