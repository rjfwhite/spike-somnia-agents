import { NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  webSocket,
  encodeFunctionData,
  parseEther,
  defineChain,
  numberToHex,
} from 'viem';
import {
  SOMNIA_AGENTS_V2_ADDRESS,
  SOMNIA_AGENTS_V2_ABI,
  SOMNIA_RPC_URL,
} from '@/lib/contract';

const WS_URL = 'wss://dream-rpc.somnia.network/ws';
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';

const DEFAULT_NUM_REQUESTS = 20;

async function postToSlack(message: string): Promise<void> {
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
  } catch (error) {
    console.error('[Qualifier] Failed to post to Slack:', error);
  }
}

let rpcId = 1;
async function jsonRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(SOMNIA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  return data.result;
}

const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { decimals: 18, name: 'STT', symbol: 'STT' },
  rpcUrls: { default: { http: [SOMNIA_RPC_URL] } },
});

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

export const maxDuration = 120;

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const numRequests = Math.max(1, parseInt(searchParams.get('n') || String(DEFAULT_NUM_REQUESTS), 10) || DEFAULT_NUM_REQUESTS);
    const sessionSeed = process.env.SESSION_SEED || '0x84d9bfc4bb7d2a83a068e41f063dc7afcb182f439ac320840940ceb01475072f';

    const sessionAddress = await jsonRpc('somnia_getSessionAddress', [sessionSeed]) as string;
    console.log(`[Qualifier] Session: ${sessionAddress}, sending ${numRequests} requests`);

    // Step 1: Subscribe to RequestFinalized events BEFORE submitting
    const wsClient = createPublicClient({
      chain: somniaTestnet,
      transport: webSocket(WS_URL)
    });

    let completed = 0;

    const eventsDone = new Promise<void>((resolve) => {
      const wsTimeout = setTimeout(() => {
        unwatchFinalized();
        console.log(`[Qualifier] Timeout - completed: ${completed}`);
        resolve();
      }, 55000);

      const checkDone = () => {
        if (completed >= numRequests) {
          clearTimeout(wsTimeout);
          unwatchFinalized();
          resolve();
        }
      };

      const unwatchFinalized = wsClient.watchContractEvent({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        eventName: 'RequestFinalized',
        onLogs: (logs) => {
          completed += logs.length;
          if (completed % 50 === 0 || completed >= numRequests) {
            console.log(`[Qualifier] completed: ${completed}/${numRequests} (${Date.now() - startTime}ms)`);
          }
          checkDone();
        }
      });
    });

    // Step 2: Submit all transactions in parallel
    const sendStart = Date.now();
    let submitted = 0;
    let sendErrors = 0;

    const sendPromises = Array.from({ length: numRequests }, async (_, i) => {
      const a = BigInt(Math.floor(Math.random() * 100));
      const b = BigInt(Math.floor(Math.random() * 100));

      const agentPayload = encodeFunctionData({
        abi: agentMethodAbi,
        functionName: 'add',
        args: [a, b]
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
        const txResult = await jsonRpc('somnia_sendSessionTransaction', [{
          seed: sessionSeed,
          gas: '0x989680',
          to: SOMNIA_AGENTS_V2_ADDRESS,
          value: numberToHex(parseEther('1')),
          data: calldata,
        }]) as Record<string, unknown>;

        if (txResult.status === '0x0') {
          sendErrors++;
          return;
        }

        submitted++;
        if (submitted % 50 === 0 || submitted === numRequests) {
          console.log(`[Qualifier] submitted: ${submitted}/${numRequests} (${Date.now() - sendStart}ms)`);
        }
      } catch (error) {
        sendErrors++;
        console.error(`[Qualifier] [${i}] Send error:`, error instanceof Error ? error.message : error);
      }
    });

    await Promise.all(sendPromises);
    const submitDuration = Date.now() - sendStart;
    console.log(`[Qualifier] All submitted in ${submitDuration}ms (errors: ${sendErrors})`);

    // Wait for events
    await eventsDone;

    const totalDuration = Date.now() - startTime;
    const effectiveTPS = totalDuration > 0 ? (completed / (totalDuration / 1000)) : 0;
    const submitTPS = submitDuration > 0 ? (submitted / (submitDuration / 1000)) : 0;
    const missing = numRequests - completed - sendErrors;

    const stats = {
      total: numRequests,
      submitted,
      sendErrors,
      completed,
      missing,
      effectiveTPS: Math.round(effectiveTPS * 100) / 100,
      submitTPS: Math.round(submitTPS * 100) / 100,
    };

    const message = [
      `Qualifier Batch Complete (${numRequests} requests)`,
      ``,
      `Submitted:  ${submitted}`,
      `Send errors: ${sendErrors}`,
      `Completed:  ${completed}`,
      `Missing:    ${missing}`,
      ``,
      `Submit time: ${submitDuration}ms`,
      `Total time:  ${totalDuration}ms`,
      ``,
      `Effective TPS: ${stats.effectiveTPS} (completed/total_time)`,
      `Submit TPS:    ${stats.submitTPS} (submitted/submit_time)`,
    ].join('\n');

    await postToSlack(message);

    return NextResponse.json({
      success: true,
      sessionAddress,
      stats,
      timings: {
        submitAll: `${submitDuration}ms`,
        total: `${totalDuration}ms`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Qualifier] Error:', errorMessage);

    await postToSlack(`Qualifier ERROR\n\n${errorMessage}\n\nFailed after ${duration}ms`);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
