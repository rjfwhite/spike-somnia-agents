async function fetchReceiptsOnce(receiptsUrl: string, requestId: string): Promise<any[]> {
    try {
        const response = await fetch(
            `${receiptsUrl}/agent-receipts?requestId=${encodeURIComponent(requestId)}`
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchReceipts(
    receiptsUrl: string,
    requestId: string,
    maxRetries: number = 5,
    retryDelayMs: number = 500
): Promise<any[]> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const receipts = await fetchReceiptsOnce(receiptsUrl, requestId);
        if (receipts.length > 0) {
            return receipts;
        }
        if (attempt < maxRetries - 1) {
            await sleep(retryDelayMs);
        }
    }
    return [];
}
