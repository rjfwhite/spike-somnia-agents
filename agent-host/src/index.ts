import { createPublicClient, createWalletClient, http, webSocket, parseAbiItem, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import 'dotenv/config';
import { callAgentContainer, cleanupContainers } from './docker.js';
import { fetchJson } from './uri.js';

interface AgentMetadata {
  name: string;
  version?: string;
  description?: string;
  container_image?: string;
  agent_spec?: {
    name: string;
    version: string;
    image: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface CachedAgentInfo {
  containerImage: string;
  name: string;
  version: string;
}
const agentCache = new Map<string, CachedAgentInfo>();

// Somnia chain configuration
const somnia = defineChain({
  id: 5031,
  name: 'Somnia',
  nativeCurrency: {
    decimals: 18,
    name: 'STT',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: ['https://api.infra.mainnet.somnia.network/'],
    },
  },
});

const CONTRACT_ADDRESS = '0x9De7D7a7e0864be11F338b3D1bBfF3e982207160' as const;

const SOMNIA_AGENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'requestId', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'method', type: 'string' },
      { indexed: false, internalType: 'bytes', name: 'callData', type: 'bytes' },
    ],
    name: 'RequestCreated',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'requestId', type: 'uint256' },
      { internalType: 'bytes', name: 'responseData', type: 'bytes' },
      { internalType: 'uint256[]', name: 'receipts', type: 'uint256[]' },
      { internalType: 'bool', name: 'success', type: 'bool' },
    ],
    name: 'handleResponse',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bigintToBase58(num: bigint): string {
  if (num === 0n) return BASE58_ALPHABET[0];
  let result = '';
  while (num > 0n) {
    const remainder = num % 58n;
    result = BASE58_ALPHABET[Number(remainder)] + result;
    num = num / 58n;
  }
  return result;
}

function agentIdToCID(agentId: bigint): string {
  const cid = bigintToBase58(agentId);
  console.log(`   Converted agentId ${agentId} to CID: ${cid}`);
  return cid;
}

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error('Error: PRIVATE_KEY environment variable is required');
  process.exit(1);
}

// Hardcoded RPC URLs
const HTTP_RPC_URL = 'https://api.infra.mainnet.somnia.network/';
const WSS_RPC_URL = 'wss://api.infra.mainnet.somnia.network/ws';

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`);

// Wallet client for sending transactions (uses HTTP always)
const walletClient = createWalletClient({
  account,
  chain: somnia,
  transport: http(HTTP_RPC_URL),
});

console.log('🚀 Agent Host started (Auto-Reconnect WebSocket Mode)');
console.log(`📋 Contract: ${CONTRACT_ADDRESS}`);
console.log(`🔑 Responder address: ${account.address}`);

// Global unwatch function reference
let paramsUnwatch: (() => void) | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;

// Function to start/restart the event watcher
async function startEventWatcher() {
  if (paramsUnwatch) {
    console.log('🔄 Cleaning up previous listener...');
    paramsUnwatch();
    paramsUnwatch = undefined;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  console.log(`🔌 Connecting to WebSocket: ${WSS_RPC_URL}`);

  try {
    const publicClient = createPublicClient({
      chain: somnia,
      transport: webSocket(WSS_RPC_URL),
    });

    console.log('👀 Listening for RequestCreated events...');

    paramsUnwatch = publicClient.watchEvent({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem('event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, string method, bytes callData)'),
      onLogs: async (logs) => {
        for (const log of logs) {
          await processLog(log, publicClient);
        }
      },
      onError: (error) => {
        console.error('❌ WebSocket error:', error);
        // Reconnect immediately on error? Or let the timer handle it?
        // Let's force a restart in 5 seconds to avoid spam loops
        setTimeout(() => startEventWatcher(), 5000);
      }
    });

    // Heartbeat: Fetch block number every 10 seconds to keep connection alive and check liveness
    heartbeatTimer = setInterval(async () => {
      try {
        const blockNumber = await publicClient.getBlockNumber();
        process.stdout.write(`💓 Block: ${blockNumber} `);
      } catch (error: any) {
        console.error(`\n❌ Heartbeat failed: ${error.message}`);
        console.log('🔄 Reconnecting due to heartbeat failure...');
        startEventWatcher();
      }
    }, 10000);

    // Schedule reconnection in 2 minutes
    reconnectTimer = setTimeout(() => {
      console.log('\n⏰ Scheduled reconnection (2 minutes passed)...');
      startEventWatcher();
    }, 2 * 60 * 1000); // 2 minutes

  } catch (error) {
    console.error('❌ Failed to setup WebSocket client:', error);
    setTimeout(() => startEventWatcher(), 5000);
  }
}

// Start the initial watcher
startEventWatcher();

async function processLog(log: any, client: any) {
  const eventReceivedAt = performance.now();
  const { requestId, agentId, method, callData } = log.args;

  process.stdout.write(`\n🔔 Event received! ReqID: ${requestId}\n`);

  try {
    const agentIdStr = agentId!.toString();
    let containerImage: string;
    let agentName: string;
    let agentVersion: string;
    let uriFetchMs = 0;
    let metadataFetchMs = 0;

    // Check cache first
    const cached = agentCache.get(agentIdStr);
    if (cached) {
      console.log(`📦 Using cached metadata for agent ${agentIdStr}`);
      containerImage = cached.containerImage;
      agentName = cached.name;
      agentVersion = cached.version;
    } else {
      // Not cached - fetch URI and metadata
      let metadataUrl: string;

      // Try to fetch URI from contract
      const uriStartAt = performance.now();
      try {
        // console.log(`🔍 Querying contract for agent URI...`);
        // Use the client passed in (ws) or a separate http client? 
        // Ideally use the WS client for reads too
        const uri = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: SOMNIA_AGENTS_ABI,
          functionName: 'tokenURI',
          args: [agentId!],
        });
        metadataUrl = uri;

        if (metadataUrl.includes('{id}')) {
          metadataUrl = metadataUrl.replace('{id}', agentId!.toString(16).padStart(64, '0'));
        }
      } catch (err: any) {
        console.log(`   ⚠️ Failed to read uri: ${err.message}`);
        metadataUrl = agentIdToCID(agentId!);
      }
      const uriEndAt = performance.now();
      uriFetchMs = uriEndAt - uriStartAt;

      console.log(`   Metadata URL: ${metadataUrl}`);

      // Fetch metadata
      const metadataStartAt = performance.now();
      console.log(`🔍 Fetching metadata...`);
      const metadata = await fetchJson(metadataUrl) as AgentMetadata;
      const metadataEndAt = performance.now();
      metadataFetchMs = metadataEndAt - metadataStartAt;

      containerImage = metadata.container_image || metadata.agent_spec?.image || '';
      if (!containerImage) throw new Error(`No container image found`);

      agentVersion = metadata.version || metadata.agent_spec?.version || 'unknown';
      agentName = metadata.name;

      agentCache.set(agentIdStr, {
        containerImage,
        name: agentName,
        version: agentVersion,
      });
    }

    console.log(`   Container Image: ${containerImage}`);

    await handleAgentRequest(requestId!, agentId!, containerImage, method!, callData!, {
      eventReceivedAt, uriFetchMs, metadataFetchMs
    }, client, log); // Pass log object

  } catch (error) {
    console.error('❌ Error processing request:', error);
  }
}

interface Timings {
  eventReceivedAt: number;
  uriFetchMs: number;
  metadataFetchMs: number;
}

async function handleAgentRequest(
  requestId: bigint,
  agentId: bigint,
  containerImage: string,
  method: string,
  callData: `0x${string}`,
  timings: Timings,
  publicClient: any,
  log: any
) {
  console.log(`\n🔄 Processing request ${requestId}...`);

  try {
    const containerStartAt = performance.now();

    // Construct Headers (Per-Request Context)
    const headers: Record<string, string> = {
      'X-Somnia-Agent-ID': agentId.toString(),
      'X-Somnia-Request-ID': requestId.toString(),
      'X-Somnia-Block-Number': log.blockNumber ? log.blockNumber.toString() : '0',
      'X-Somnia-Tx-Hash': log.transactionHash || '',
      'X-Somnia-Timestamp': Date.now().toString(),
    };

    // Construct Environment Variables (Lifecycle Context)
    const env = [
      `SOMNIA_AGENT_ID=${agentId.toString()}`,
      `SOMNIA_RPC_URL=${HTTP_RPC_URL}`,
      `SOMNIA_CONTRACT_ADDRESS=${CONTRACT_ADDRESS}`,
      `SOMNIA_HOST_VERSION=1.0.0`
    ];

    const response = await callAgentContainer(
      agentId.toString(),
      containerImage,
      method,
      callData,
      headers,
      env
    );
    const containerEndAt = performance.now();
    const containerCallMs = containerEndAt - containerStartAt;
    console.log(`   ⏱️  Container call: ${containerCallMs.toFixed(0)}ms`);

    const responseData = response as `0x${string}`;
    const receipts: bigint[] = [];

    console.log(`📤 Sending response for request ${requestId}...`);

    const txStartAt = performance.now();
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: 'handleResponse',
      args: [requestId, responseData, receipts, true], // success = true
    });
    const txSentAt = performance.now();
    const txSubmitMs = txSentAt - txStartAt;

    console.log(`✅ Response sent! Tx hash: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const txConfirmedAt = performance.now();
    const txConfirmMs = txConfirmedAt - txSentAt;

    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    const totalTime = txConfirmedAt - timings.eventReceivedAt;

    console.log(`   ⏱️  TOTAL TIME: ${totalTime.toFixed(0)}ms`);

  } catch (error: any) {
    console.error(`❌ Failed to handle request: ${error.message}`);
    // Attempt error response
    try {
      const errorResponse = toHex(`Error: ${error.message}`);
      await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: 'handleResponse',
        args: [requestId, errorResponse, [], false],
      });
    } catch (e) { console.error("Double fault sending error response", e); }
  }
}

async function shutdown() {
  console.log('\n\n👋 Shutting down agent host...');
  if (paramsUnwatch) paramsUnwatch();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await cleanupContainers();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import { createServer } from 'http';

const healthPort = parseInt(process.env.PORT || '8080');
const healthServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'agent-host',
      uptime: process.uptime(),
      cachedAgents: agentCache.size,
      transport: 'websocket-reconnect'
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

healthServer.listen(healthPort, () => {
  console.log(`🏥 Health server listening on port ${healthPort}`);
});
