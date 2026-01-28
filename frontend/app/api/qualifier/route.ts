import { NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
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
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';
const EXPLORER_BASE_URL = 'https://shannon-explorer.somnia.network/tx';

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

export async function GET() {
  const startTime = Date.now();

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

    // Send request to platform
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

    console.log('[Qualifier] Transaction submitted:', hash);

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('[Qualifier] Transaction confirmed in block:', receipt.blockNumber);

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

    // Poll for AgentResponded event (with timeout)
    const pollTimeout = 30000; // 30 seconds
    const pollInterval = 2000; // 2 seconds
    const pollStart = Date.now();
    let responseData: { success: boolean; result?: bigint; error?: string } | undefined;

    if (requestId) {
      while (Date.now() - pollStart < pollTimeout) {
        // Get recent logs for AgentResponded
        const logs = await publicClient.getLogs({
          address: PLATFORM_ADDRESS,
          event: {
            type: 'event',
            name: 'AgentResponded',
            inputs: [
              { type: 'uint256', name: 'requestId', indexed: true },
              { type: 'uint256', name: 'agentId', indexed: true },
              { type: 'bytes', name: 'response', indexed: false },
              { type: 'bool', name: 'success', indexed: false }
            ]
          },
          fromBlock: receipt.blockNumber,
          toBlock: 'latest'
        });

        for (const log of logs) {
          if (log.args.requestId === requestId) {
            if (log.args.success && log.args.response) {
              const decoded = decodeAbiParameters(
                [{ type: 'uint256', name: 'sum' }],
                log.args.response
              );
              responseData = {
                success: true,
                result: decoded[0] as bigint
              };
              console.log(`[Qualifier] Result: ${a} + ${b} = ${responseData.result}`);
            } else {
              responseData = {
                success: false,
                error: 'Agent execution failed'
              };
            }
            break;
          }
        }

        if (responseData) break;

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    const duration = Date.now() - startTime;

    // Post success to Slack
    const txLink = explorerLink(hash);
    if (responseData?.success) {
      await postToSlack(
        `Qualifier SUCCESS: add(${a}, ${b}) = ${responseData.result}\n` +
        `Transaction: ${txLink}\n` +
        `Duration: ${duration}ms`
      );
    } else if (responseData && !responseData.success) {
      await postToSlack(
        `Qualifier FAILED: Agent execution failed\n` +
        `Transaction: ${txLink}\n` +
        `Duration: ${duration}ms`
      );
    } else {
      await postToSlack(
        `Qualifier PENDING: add(${a}, ${b}) - waiting for response\n` +
        `Transaction: ${txLink}\n` +
        `Duration: ${duration}ms`
      );
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
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Qualifier] Error:', errorMessage);

    // Post failure to Slack
    await postToSlack(
      `Qualifier ERROR: ${errorMessage}\n` +
      `Duration: ${duration}ms`
    );

    return NextResponse.json({
      success: false,
      error: errorMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
