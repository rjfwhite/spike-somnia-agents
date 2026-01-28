import { NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  encodeFunctionData,
  decodeAbiParameters,
  decodeEventLog,
  parseEther,
  defineChain,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PLATFORM_ADDRESS = '0x58ade7Fe7633b54B0052F9006863c175b8a231bE';
const RPC_URL = 'https://dream-rpc.somnia.network/';
const WS_URL = 'wss://dream-rpc.somnia.network/ws';
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';
const EXPLORER_BASE_URL = 'https://shannon-explorer.somnia.network/tx';

const NUM_PARALLEL_REQUESTS = 20;

interface SlackPayload {
  message: string;
  request_txn?: string;
  response_txn?: string;
}

async function postToSlack(payload: SlackPayload): Promise<void> {
  try {
    console.log('[Qualifier] Posting to Slack:', JSON.stringify(payload));
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    console.log('[Qualifier] Slack response:', response.status, responseText);
  } catch (error) {
    console.error('[Qualifier] Failed to post to Slack:', error);
  }
}

function explorerLink(txHash: string): string {
  return `${EXPLORER_BASE_URL}/${txHash}`;
}

// Define Somnia testnet chain
const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'STT',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
});

// Platform ABI
const platformAbi = [
  {
    type: 'function',
    name: 'requestAgent',
    inputs: [{
      type: 'tuple',
      name: 'requestData',
      components: [
        { type: 'uint256', name: 'agentId' },
        { type: 'bytes', name: 'request' },
        { type: 'address', name: 'callbackAddress' },
        { type: 'bytes4', name: 'callbackSelector' }
      ]
    }],
    outputs: [{ type: 'uint256', name: 'requestId' }]
  },
  {
    type: 'event',
    name: 'AgentRequested',
    inputs: [
      { type: 'uint256', name: 'requestId', indexed: true },
      { type: 'uint256', name: 'agentId', indexed: true },
      { type: 'bytes', name: 'request', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'AgentResponded',
    inputs: [
      { type: 'uint256', name: 'requestId', indexed: true },
      { type: 'uint256', name: 'agentId', indexed: true },
      { type: 'bytes', name: 'response', indexed: false },
      { type: 'bool', name: 'success', indexed: false }
    ]
  }
] as const;

// Agent method ABI
const agentMethodAbi = [{
  type: 'function',
  name: 'add',
  inputs: [
    { type: 'uint256', name: 'a' },
    { type: 'uint256', name: 'b' }
  ],
  outputs: [
    { type: 'uint256', name: 'sum' }
  ]
}] as const;

export const maxDuration = 60;

interface RequestResult {
  index: number;
  a: bigint;
  b: bigint;
  hash?: string;
  requestId?: bigint;
  result?: bigint;
  success?: boolean;
  error?: string;
  timings: {
    sendTxn?: number;
    waitReceipt?: number;
    waitResponse?: number;
    total?: number;
  };
}

export async function GET() {
  const startTime = Date.now();

  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: 'PRIVATE_KEY environment variable is required' },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(privateKey as Hex);
    console.log(`[Qualifier] Using account: ${account.address}`);
    console.log(`[Qualifier] Sending ${NUM_PARALLEL_REQUESTS} parallel requests...`);

    const walletClient = createWalletClient({
      account,
      chain: somniaTestnet,
      transport: http(RPC_URL)
    });

    const publicClient = createPublicClient({
      chain: somniaTestnet,
      transport: http(RPC_URL)
    });

    // Get current nonce
    const startNonce = await publicClient.getTransactionCount({
      address: account.address
    });
    console.log(`[Qualifier] Starting nonce: ${startNonce}`);

    // Prepare all requests
    const results: RequestResult[] = [];
    for (let i = 0; i < NUM_PARALLEL_REQUESTS; i++) {
      const a = BigInt(Math.floor(Math.random() * 100));
      const b = BigInt(Math.floor(Math.random() * 100));
      results.push({
        index: i,
        a,
        b,
        timings: {}
      });
    }

    // Step 1: Send all transactions in parallel with explicit nonces
    const sendStart = Date.now();
    const sendPromises = results.map(async (r, i) => {
      const requestData = encodeFunctionData({
        abi: agentMethodAbi,
        functionName: 'add',
        args: [r.a, r.b]
      });

      try {
        const txStart = Date.now();
        const hash = await walletClient.writeContract({
          address: PLATFORM_ADDRESS,
          abi: platformAbi,
          functionName: 'requestAgent',
          args: [{
            agentId: BigInt('4124847165696832417'),
            request: requestData,
            callbackAddress: '0x0000000000000000000000000000000000000000',
            callbackSelector: '0x00000000'
          }],
          value: parseEther('0.1'),
          nonce: startNonce + i
        });
        r.hash = hash;
        r.timings.sendTxn = Date.now() - txStart;
        console.log(`[Qualifier] [${i}] Tx sent: ${hash} (${r.timings.sendTxn}ms)`);
      } catch (error) {
        r.error = error instanceof Error ? error.message : 'Send failed';
        console.error(`[Qualifier] [${i}] Send error:`, r.error);
      }
    });

    await Promise.all(sendPromises);
    const sendDuration = Date.now() - sendStart;
    console.log(`[Qualifier] All transactions sent in ${sendDuration}ms`);

    // Step 2: Wait for all receipts in parallel
    const receiptStart = Date.now();
    const receiptPromises = results.map(async (r) => {
      if (!r.hash) return;

      try {
        const waitStart = Date.now();
        const receipt = await publicClient.waitForTransactionReceipt({ hash: r.hash as Hex });
        r.timings.waitReceipt = Date.now() - waitStart;

        // Extract requestId
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: platformAbi,
              data: log.data,
              topics: log.topics
            });
            if (decoded.eventName === 'AgentRequested') {
              const args = decoded.args as unknown as { requestId: bigint };
              r.requestId = args.requestId;
              break;
            }
          } catch {
            // Not matching event
          }
        }
        console.log(`[Qualifier] [${r.index}] Receipt: requestId=${r.requestId} (${r.timings.waitReceipt}ms)`);
      } catch (error) {
        r.error = error instanceof Error ? error.message : 'Receipt failed';
        console.error(`[Qualifier] [${r.index}] Receipt error:`, r.error);
      }
    });

    await Promise.all(receiptPromises);
    const receiptDuration = Date.now() - receiptStart;
    console.log(`[Qualifier] All receipts received in ${receiptDuration}ms`);

    // Step 3: Watch for all responses via WebSocket
    const responseStart = Date.now();
    const pendingRequestIds = new Map<string, RequestResult>();
    for (const r of results) {
      if (r.requestId) {
        pendingRequestIds.set(r.requestId.toString(), r);
      }
    }

    if (pendingRequestIds.size > 0) {
      const wsClient = createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(WS_URL)
      });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          unwatch();
          console.log(`[Qualifier] WebSocket timeout - ${pendingRequestIds.size} still pending`);
          resolve();
        }, 45000); // 45 second timeout

        const unwatch = wsClient.watchContractEvent({
          address: PLATFORM_ADDRESS,
          abi: platformAbi,
          eventName: 'AgentResponded',
          onLogs: (logs) => {
            for (const log of logs) {
              const logWithArgs = log as typeof log & { args: { requestId?: bigint; success?: boolean; response?: Hex } };
              const logArgs = logWithArgs.args;
              const reqIdStr = logArgs.requestId?.toString();

              if (reqIdStr && pendingRequestIds.has(reqIdStr)) {
                const r = pendingRequestIds.get(reqIdStr)!;
                r.timings.waitResponse = Date.now() - responseStart;

                if (logArgs.success && logArgs.response) {
                  const decoded = decodeAbiParameters(
                    [{ type: 'uint256', name: 'sum' }],
                    logArgs.response
                  );
                  r.success = true;
                  r.result = decoded[0] as bigint;
                  console.log(`[Qualifier] [${r.index}] Response: ${r.a} + ${r.b} = ${r.result} (${r.timings.waitResponse}ms)`);
                } else {
                  r.success = false;
                  r.error = 'Agent execution failed';
                  console.log(`[Qualifier] [${r.index}] Failed (${r.timings.waitResponse}ms)`);
                }

                pendingRequestIds.delete(reqIdStr);

                if (pendingRequestIds.size === 0) {
                  clearTimeout(timeout);
                  unwatch();
                  resolve();
                }
              }
            }
          }
        });
      });
    }
    const responseDuration = Date.now() - responseStart;

    // Calculate statistics
    const totalDuration = Date.now() - startTime;
    const successful = results.filter(r => r.success === true);
    const failed = results.filter(r => r.success === false);
    const timedOut = results.filter(r => r.requestId && r.success === undefined);
    const sendErrors = results.filter(r => !r.hash);

    const responseTimes = successful.map(r => r.timings.waitResponse!).sort((a, b) => a - b);
    const stats = {
      total: NUM_PARALLEL_REQUESTS,
      successful: successful.length,
      failed: failed.length,
      timedOut: timedOut.length,
      sendErrors: sendErrors.length,
      responseTimeMs: responseTimes.length > 0 ? {
        min: responseTimes[0],
        max: responseTimes[responseTimes.length - 1],
        median: responseTimes[Math.floor(responseTimes.length / 2)],
        avg: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      } : null
    };

    // Build Slack message
    const message = [
      `🚀 Qualifier Batch Complete (${NUM_PARALLEL_REQUESTS} requests)`,
      ``,
      `✅ Successful: ${stats.successful}`,
      `❌ Failed: ${stats.failed}`,
      `⏳ Timed out: ${stats.timedOut}`,
      `🚫 Send errors: ${stats.sendErrors}`,
      ``,
      `⏱️ Timings:`,
      `  📤 Send all: ${sendDuration}ms`,
      `  📝 Receipts: ${receiptDuration}ms`,
      `  🔄 Responses: ${responseDuration}ms`,
      `  ⏱️ Total: ${totalDuration}ms`,
    ];

    if (stats.responseTimeMs) {
      message.push(
        ``,
        `📊 Response time distribution:`,
        `  Min: ${stats.responseTimeMs.min}ms`,
        `  Max: ${stats.responseTimeMs.max}ms`,
        `  Median: ${stats.responseTimeMs.median}ms`,
        `  Avg: ${stats.responseTimeMs.avg}ms`
      );
    }

    await postToSlack({
      message: message.join('\n')
    });

    return NextResponse.json({
      success: true,
      account: account.address,
      stats,
      timings: {
        sendAll: `${sendDuration}ms`,
        receipts: `${receiptDuration}ms`,
        responses: `${responseDuration}ms`,
        total: `${totalDuration}ms`
      },
      results: results.map(r => ({
        index: r.index,
        input: { a: r.a.toString(), b: r.b.toString() },
        hash: r.hash,
        requestId: r.requestId?.toString(),
        success: r.success,
        result: r.result?.toString(),
        error: r.error,
        timings: r.timings
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Qualifier] Error:', errorMessage);

    await postToSlack({
      message: `🚨 Qualifier Batch ERROR\n\n${errorMessage}\n\n⏱️ Failed after ${duration}ms`
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
