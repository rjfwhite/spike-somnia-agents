import { NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  webSocket,
  encodeFunctionData,
  decodeAbiParameters,
  decodeEventLog,
  parseEther,
  defineChain,
  hexToBytes,
  numberToHex,
  type Hex,
} from 'viem';
import {
  SOMNIA_AGENTS_V2_ADDRESS,
  SOMNIA_AGENTS_V2_ABI,
  SOMNIA_RPC_URL,
} from '@/lib/contract';

const WS_URL = 'wss://dream-rpc.somnia.network/ws';
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';
const EXPLORER_BASE_URL = 'https://shannon-explorer.somnia.network/tx';

const NUM_PARALLEL_REQUESTS = 1000;

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

// Raw JSON-RPC helper for session RPCs
let rpcId = 1;
async function jsonRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(SOMNIA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: rpcId++,
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC ${method}: ${data.error.message}`);
  }
  return data.result;
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
      http: [SOMNIA_RPC_URL],
    },
  },
});

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

interface ResponseData {
  validator: string;
  result: Hex;
  receipt: bigint;
  price: bigint;
  timestamp: bigint;
}

interface RequestResult {
  index: number;
  a: bigint;
  b: bigint;
  hash?: string;
  requestId?: bigint;
  result?: bigint;
  success?: boolean;
  error?: string;
  responseRaw?: string;
  finalCost?: bigint;
  rebate?: bigint;
  responseCount?: number;
  timings: {
    submitTxn?: number;
    waitResponse?: number;
    total?: number;
  };
}

export async function GET() {
  const startTime = Date.now();

  try {
    const sessionSeed = process.env.SESSION_SEED || '0x84d9bfc4bb7d2a83a068e41f063dc7afcb182f439ac320840940ceb01475072f';
    if (!sessionSeed) {
      return NextResponse.json(
        { error: 'SESSION_SEED environment variable is required' },
        { status: 500 }
      );
    }

    // Get the session wallet address from the seed
    const sessionAddress = await jsonRpc('somnia_getSessionAddress', [sessionSeed]) as string;
    console.log(`[Qualifier] Session address: ${sessionAddress}`);
    console.log(`[Qualifier] Sending ${NUM_PARALLEL_REQUESTS} parallel requests...`);

    const publicClient = createPublicClient({
      chain: somniaTestnet,
      transport: http(SOMNIA_RPC_URL)
    });

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

    // Step 1: Submit all transactions via session RPC (nonce managed by node)
    const sendStart = Date.now();
    const sendPromises = results.map(async (r, i) => {
      const agentPayload = encodeFunctionData({
        abi: agentMethodAbi,
        functionName: 'add',
        args: [r.a, r.b]
      });

      const calldata = encodeFunctionData({
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: 'createRequest',
        args: [
          BigInt('6857928810370910649'),
          '0x0000000000000000000000000000000000000000' as `0x${string}`,
          '0x00000000' as `0x${string}`,
          agentPayload
        ]
      });

      try {
        const txStart = Date.now();
        const txResult = await jsonRpc('somnia_sendSessionTransaction', [{
          seed: sessionSeed,
          gas: '0x1E8480',
          to: SOMNIA_AGENTS_V2_ADDRESS,
          value: numberToHex(parseEther('1')),
          data: calldata,
        }]) as Record<string, unknown>;

        r.timings.submitTxn = Date.now() - txStart;

        r.hash = (txResult.hash ?? txResult.transactionHash) as string;

        // Check for revert
        if (txResult.status === '0x0') {
          r.error = 'Transaction reverted';
          console.error(`[Qualifier] [${i}] Reverted: ${r.hash}`);
          return;
        }

        // Extract requestId from receipt logs returned by session RPC
        const logs = txResult.logs as Array<{ data: Hex; topics: readonly Hex[] }> | undefined;
        if (logs && logs.length > 0) {
          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: SOMNIA_AGENTS_V2_ABI,
                data: log.data,
                topics: log.topics as [Hex, ...Hex[]],
              });
              if (decoded.eventName === 'RequestCreated') {
                r.requestId = (decoded.args as unknown as { requestId: bigint }).requestId;
                break;
              }
            } catch { /* not a matching event */ }
          }
        }

        console.log(`[Qualifier] [${i}] Submitted: ${r.hash}, requestId=${r.requestId} (${r.timings.submitTxn}ms)`);
      } catch (error) {
        r.error = error instanceof Error ? error.message : 'Submit failed';
        console.error(`[Qualifier] [${i}] Submit error:`, r.error);
      }
    });

    await Promise.all(sendPromises);
    const submitDuration = Date.now() - sendStart;
    console.log(`[Qualifier] All transactions submitted in ${submitDuration}ms`);

    // Step 2: Watch for finalized responses via WebSocket
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
          unwatchFinalized();
          unwatchTimeout();
          console.log(`[Qualifier] WebSocket timeout - ${pendingRequestIds.size} still pending`);
          resolve();
        }, 45000); // 45 second timeout

        const checkDone = () => {
          if (pendingRequestIds.size === 0) {
            clearTimeout(timeout);
            unwatchFinalized();
            unwatchTimeout();
            resolve();
          }
        };

        // Watch for RequestFinalized events, then fetch the actual response data
        const unwatchFinalized = wsClient.watchContractEvent({
          address: SOMNIA_AGENTS_V2_ADDRESS,
          abi: SOMNIA_AGENTS_V2_ABI,
          eventName: 'RequestFinalized',
          onLogs: async (logs) => {
            for (const log of logs) {
              const logWithArgs = log as typeof log & { args: { requestId?: bigint; finalCost?: bigint; rebate?: bigint } };
              const logArgs = logWithArgs.args;
              const reqIdStr = logArgs.requestId?.toString();

              if (reqIdStr && pendingRequestIds.has(reqIdStr)) {
                const r = pendingRequestIds.get(reqIdStr)!;
                r.timings.waitResponse = Date.now() - responseStart;
                r.finalCost = logArgs.finalCost;
                r.rebate = logArgs.rebate;

                // Fetch the actual response data via getResponses()
                try {
                  const responses = await publicClient.readContract({
                    address: SOMNIA_AGENTS_V2_ADDRESS,
                    abi: SOMNIA_AGENTS_V2_ABI,
                    functionName: 'getResponses',
                    args: [logArgs.requestId!],
                  }) as ResponseData[];

                  r.responseCount = responses.length;

                  if (responses.length > 0) {
                    const firstResponse = responses[0];
                    try {
                      const decoded = decodeAbiParameters(
                        [{ type: 'uint256', name: 'sum' }],
                        firstResponse.result
                      );
                      r.success = true;
                      r.result = decoded[0] as bigint;
                      console.log(`[Qualifier] [${r.index}] Response: ${r.a} + ${r.b} = ${r.result} (${r.timings.waitResponse}ms, ${responses.length} validators)`);
                    } catch {
                      // Try decoding as UTF-8 error string
                      r.success = false;
                      try {
                        const bytes = hexToBytes(firstResponse.result);
                        const decoder = new TextDecoder('utf-8', { fatal: false });
                        r.responseRaw = decoder.decode(bytes);
                        r.error = `Agent failed: ${r.responseRaw}`;
                      } catch {
                        r.error = `Agent failed (raw hex: ${firstResponse.result})`;
                      }
                      console.log(`[Qualifier] [${r.index}] Failed: ${r.error} (${r.timings.waitResponse}ms)`);
                    }
                  } else {
                    r.success = false;
                    r.error = 'No responses returned after finalization';
                    console.log(`[Qualifier] [${r.index}] No responses (${r.timings.waitResponse}ms)`);
                  }
                } catch (error) {
                  r.success = false;
                  r.error = `Failed to fetch responses: ${error instanceof Error ? error.message : 'unknown'}`;
                  console.error(`[Qualifier] [${r.index}] getResponses error:`, r.error);
                }

                pendingRequestIds.delete(reqIdStr);
                checkDone();
              }
            }
          }
        });

        // Watch for RequestTimedOut events
        const unwatchTimeout = wsClient.watchContractEvent({
          address: SOMNIA_AGENTS_V2_ADDRESS,
          abi: SOMNIA_AGENTS_V2_ABI,
          eventName: 'RequestTimedOut',
          onLogs: (logs) => {
            for (const log of logs) {
              const logWithArgs = log as typeof log & { args: { requestId?: bigint } };
              const reqIdStr = logWithArgs.args.requestId?.toString();

              if (reqIdStr && pendingRequestIds.has(reqIdStr)) {
                const r = pendingRequestIds.get(reqIdStr)!;
                r.timings.waitResponse = Date.now() - responseStart;
                r.success = false;
                r.error = 'Request timed out on-chain';
                console.log(`[Qualifier] [${r.index}] Timed out on-chain (${r.timings.waitResponse}ms)`);

                pendingRequestIds.delete(reqIdStr);
                checkDone();
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
      `🚀 Qualifier Batch Complete (${NUM_PARALLEL_REQUESTS} requests, session RPC)`,
      ``,
      `✅ Successful: ${stats.successful}`,
      `❌ Failed: ${stats.failed}`,
      `⏳ Timed out: ${stats.timedOut}`,
      `🚫 Send errors: ${stats.sendErrors}`,
      ``,
      `⏱️ Timings:`,
      `  📤 Submit all (send+confirm): ${submitDuration}ms`,
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
      sessionAddress,
      stats,
      timings: {
        submitAll: `${submitDuration}ms`,
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
        responseRaw: r.responseRaw,
        finalCost: r.finalCost?.toString(),
        rebate: r.rebate?.toString(),
        responseCount: r.responseCount,
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
