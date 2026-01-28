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

// Agent method ABI (for encoding request & decoding response)
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

export const maxDuration = 60; // Allow up to 60 seconds for Vercel Pro

interface Timings {
  sendTxn?: number;
  waitReceipt?: number;
  waitResponse?: number;
  total: number;
}

export async function GET() {
  const startTime = Date.now();
  const timings: Timings = { total: 0 };

  try {
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: 'PRIVATE_KEY environment variable is required' },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(privateKey as Hex);
    console.log('[Qualifier] Using account:', account.address);

    const walletClient = createWalletClient({
      account,
      chain: somniaTestnet,
      transport: http(RPC_URL)
    });

    const publicClient = createPublicClient({
      chain: somniaTestnet,
      transport: http(RPC_URL)
    });

    // Generate random numbers for the add call
    const a = BigInt(Math.floor(Math.random() * 100));
    const b = BigInt(Math.floor(Math.random() * 100));
    console.log(`[Qualifier] Calling add(${a}, ${b})...`);

    const request = encodeFunctionData({
      abi: agentMethodAbi,
      functionName: 'add',
      args: [a, b]
    });

    // Step 1: Send request to platform
    const sendTxnStart = Date.now();
    const hash = await walletClient.writeContract({
      address: PLATFORM_ADDRESS,
      abi: platformAbi,
      functionName: 'requestAgent',
      args: [{
        agentId: BigInt('4124847165696832417'),
        request,
        callbackAddress: '0x0000000000000000000000000000000000000000',
        callbackSelector: '0x00000000'
      }],
      value: parseEther('0.1')
    });
    timings.sendTxn = Date.now() - sendTxnStart;
    console.log(`[Qualifier] Transaction submitted: ${hash} (${timings.sendTxn}ms)`);

    // Step 2: Wait for transaction receipt
    const waitReceiptStart = Date.now();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    timings.waitReceipt = Date.now() - waitReceiptStart;
    console.log(`[Qualifier] Transaction confirmed in block: ${receipt.blockNumber} (${timings.waitReceipt}ms)`);

    // Extract requestId from AgentRequested event
    let requestId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: platformAbi,
          data: log.data,
          topics: log.topics
        });
        if (decoded.eventName === 'AgentRequested') {
          const args = decoded.args as unknown as { requestId: bigint };
          requestId = args.requestId;
          break;
        }
      } catch {
        // Not a matching event, continue
      }
    }

    console.log('[Qualifier] Request ID:', requestId?.toString());

    // Step 3: Watch for AgentResponded event via WebSocket
    const waitResponseStart = Date.now();
    const wsTimeout = 30000; // 30 seconds
    let responseData: { success: boolean; result?: bigint; error?: string; txHash?: string } | undefined;

    if (requestId) {
      const wsClient = createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(WS_URL)
      });

      responseData = await new Promise<typeof responseData>((resolve) => {
        const timeout = setTimeout(() => {
          unwatch();
          console.log('[Qualifier] WebSocket timeout waiting for response');
          resolve(undefined);
        }, wsTimeout);

        const unwatch = wsClient.watchContractEvent({
          address: PLATFORM_ADDRESS,
          abi: platformAbi,
          eventName: 'AgentResponded',
          onLogs: (logs) => {
            for (const log of logs) {
              const logWithArgs = log as typeof log & { args: { requestId?: bigint; success?: boolean; response?: Hex } };
              const logArgs = logWithArgs.args;
              if (logArgs.requestId === requestId) {
                clearTimeout(timeout);
                unwatch();

                if (logArgs.success && logArgs.response) {
                  const decoded = decodeAbiParameters(
                    [{ type: 'uint256', name: 'sum' }],
                    logArgs.response
                  );
                  console.log(`[Qualifier] Result: ${a} + ${b} = ${decoded[0]}`);
                  resolve({
                    success: true,
                    result: decoded[0] as bigint,
                    txHash: log.transactionHash ?? undefined
                  });
                } else {
                  resolve({
                    success: false,
                    error: 'Agent execution failed',
                    txHash: log.transactionHash ?? undefined
                  });
                }
                return;
              }
            }
          }
        });
      });
    }
    timings.waitResponse = Date.now() - waitResponseStart;
    console.log(`[Qualifier] Response wait completed (${timings.waitResponse}ms)`);

    timings.total = Date.now() - startTime;

    // Post to Slack
    const requestTxnUrl = explorerLink(hash);
    const responseTxnUrl = responseData?.txHash ? explorerLink(responseData.txHash) : undefined;

    const timingBreakdown = [
      `📤 Send txn: ${timings.sendTxn}ms`,
      `⏳ Wait receipt: ${timings.waitReceipt}ms`,
      `🔄 Wait response: ${timings.waitResponse}ms`,
      `⏱️ Total: ${timings.total}ms`
    ].join('\n');

    if (responseData?.success) {
      await postToSlack({
        message: `✅ *Qualifier SUCCESS*\n\n🧮 \`add(${a}, ${b}) = ${responseData.result}\`\n\n${timingBreakdown}`,
        request_txn: requestTxnUrl,
        response_txn: responseTxnUrl
      });
    } else if (responseData && !responseData.success) {
      await postToSlack({
        message: `❌ *Qualifier FAILED*\n\nAgent execution failed\n\n${timingBreakdown}`,
        request_txn: requestTxnUrl,
        response_txn: responseTxnUrl
      });
    } else {
      await postToSlack({
        message: `⏳ *Qualifier PENDING*\n\n🧮 \`add(${a}, ${b})\` - waiting for response\n\n${timingBreakdown}`,
        request_txn: requestTxnUrl
      });
    }

    return NextResponse.json({
      success: true,
      account: account.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      requestId: requestId?.toString(),
      input: { a: a.toString(), b: b.toString() },
      response: responseData ? {
        success: responseData.success,
        result: responseData.result?.toString(),
        error: responseData.error
      } : { pending: true },
      timings: {
        sendTxn: `${timings.sendTxn}ms`,
        waitReceipt: `${timings.waitReceipt}ms`,
        waitResponse: `${timings.waitResponse}ms`,
        total: `${timings.total}ms`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    timings.total = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Qualifier] Error:', errorMessage);

    // Post failure to Slack
    await postToSlack({
      message: `🚨 *Qualifier ERROR*\n\n\`${errorMessage}\`\n\n⏱️ Failed after ${timings.total}ms`
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timings: { total: `${timings.total}ms` },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
