import { createPublicClient, createWalletClient, http, parseAbiItem, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import 'dotenv/config';
import { callAgentContainer, cleanupContainers } from './docker.js';
import { fetchJson } from './uri.js'; // Changed from ipfs.js and fetchJsonFromIPFS

interface AgentMetadata {
  name: string;
  version?: string;
  description?: string;
  // Flat structure
  container_image?: string;
  // Nested structure
  agent_spec?: {
    name: string;
    version: string;
    image: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Cache for agent metadata (agentId -> { containerImage, name, version })
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

// Contract configuration
const CONTRACT_ADDRESS = '0x9De7D7a7e0864be11F338b3D1bBfF3e982207160' as const;

// Contract ABI - only the parts we need
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

// Base58 alphabet for CIDv0 encoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Convert a bigint to base58 string (for CIDv0)
 */
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

/**
 * Convert agentId (bigint) to IPFS CID string
 * The agentId is the CID encoded as a number
 */
function agentIdToCID(agentId: bigint): string {
  // Convert bigint to base58 (CIDv0 format)
  const cid = bigintToBase58(agentId);
  console.log(`   Converted agentId ${agentId} to CID: ${cid}`);
  return cid;
}

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error('Error: PRIVATE_KEY environment variable is required');
  console.error('Please set it in .env file or as an environment variable');
  process.exit(1);
}

// Create account from private key
const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`);

// Create clients
const publicClient = createPublicClient({
  chain: somnia,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: somnia,
  transport: http(),
});

console.log('🚀 Agent Host started');
console.log(`📋 Contract: ${CONTRACT_ADDRESS}`);
console.log(`🔑 Responder address: ${account.address}`);
console.log('👀 Listening for RequestCreated events...\n');

// Listen for RequestCreated events
const unwatch = publicClient.watchEvent({
  address: CONTRACT_ADDRESS,
  event: parseAbiItem('event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, string method, bytes callData)'),
  onLogs: async (logs) => {
    for (const log of logs) {
      const eventReceivedAt = performance.now();
      const { requestId, agentId, method, callData } = log.args;

      // Convert agentId to CID (this is now the metadata CID)
      const metadataCid = agentIdToCID(agentId!);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 New Request Received!');
      console.log(`   Request ID: ${requestId}`);
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Metadata CID: ${metadataCid}`);
      console.log(`   Method: ${method}`);
      console.log(`   Call Data: ${callData}`);
      console.log(`   Block: ${log.blockNumber}`);
      console.log(`   Tx Hash: ${log.transactionHash}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Process the request and respond
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
            console.log(`🔍 Querying contract for agent URI...`);
            const uri = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: SOMNIA_AGENTS_ABI,
              functionName: 'tokenURI',
              args: [agentId!],
            });
            console.log(`   Contract returned URI: ${uri}`);
            metadataUrl = uri;

            // Handle {id} replacement for ERC1155 if present
            if (metadataUrl.includes('{id}')) {
              metadataUrl = metadataUrl.replace('{id}', agentId!.toString(16).padStart(64, '0'));
            }
          } catch (err: any) {
            console.log(`   ⚠️ Failed to read uri from contract: ${err.message}`);
            console.log(`   Using agentId as CID fallback...`);
            // Fallback: Convert agentId to CID 
            metadataUrl = agentIdToCID(agentId!);
          }
          const uriEndAt = performance.now();
          uriFetchMs = uriEndAt - uriStartAt;
          console.log(`   ⏱️  URI fetch: ${uriFetchMs.toFixed(0)}ms`);

          console.log(`   Metadata URL: ${metadataUrl}`);

          // Fetch metadata to get the actual image location
          const metadataStartAt = performance.now();
          console.log(`🔍 Fetching metadata...`);
          const metadata = await fetchJson(metadataUrl) as AgentMetadata;
          const metadataEndAt = performance.now();
          metadataFetchMs = metadataEndAt - metadataStartAt;
          console.log(`   ⏱️  Metadata fetch: ${metadataFetchMs.toFixed(0)}ms`);

          // Get container image from either flat or nested structure
          containerImage = metadata.container_image || metadata.agent_spec?.image || '';

          if (!containerImage) {
            throw new Error(`Agent metadata does not contain container_image or agent_spec.image field`);
          }

          agentVersion = metadata.version || metadata.agent_spec?.version || 'unknown';
          agentName = metadata.name;

          // Cache the result
          agentCache.set(agentIdStr, {
            containerImage,
            name: agentName,
            version: agentVersion,
          });
          console.log(`   💾 Cached metadata for agent ${agentIdStr}`);
        }

        console.log(`   Container Image: ${containerImage}`);
        console.log(`   Agent Name: ${agentName} v${agentVersion}`);

        const timings = {
          eventReceivedAt,
          uriFetchMs,
          metadataFetchMs,
        };
        await handleAgentRequest(requestId!, agentId!, containerImage, method!, callData!, timings);
      } catch (error) {
        console.error('❌ Error handling request:', error);
      }
    }
  },
  onError: (error) => {
    console.error('❌ Event watcher error:', error);
  },
});

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
  timings: Timings
) {
  console.log(`\n🔄 Processing request ${requestId}...`);

  try {
    // Call the agent's container with hex callData
    const containerStartAt = performance.now();
    const response = await callAgentContainer(agentId.toString(), containerImage, method, callData);
    const containerEndAt = performance.now();
    const containerCallMs = containerEndAt - containerStartAt;
    console.log(`   ⏱️  Container call: ${containerCallMs.toFixed(0)}ms`);

    // Response is already hex-encoded from the container
    const responseData = response as `0x${string}`;
    const receipts: bigint[] = []; // Empty receipts for now

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
    console.log(`   ⏱️  Tx submit: ${txSubmitMs.toFixed(0)}ms`);

    console.log(`✅ Response sent! Tx hash: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const txConfirmedAt = performance.now();
    const txConfirmMs = txConfirmedAt - txSentAt;
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`   Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
    console.log(`   ⏱️  Tx confirmation: ${txConfirmMs.toFixed(0)}ms`);
    
    // Detailed timing breakdown
    const totalTime = txConfirmedAt - timings.eventReceivedAt;
    const timeToSent = txSentAt - timings.eventReceivedAt;
    
    console.log('');
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│              📊 TIMING BREAKDOWN                │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│  1. URI fetch (tokenURI)      ${timings.uriFetchMs.toFixed(0).padStart(8)}ms      │`);
    console.log(`│  2. Metadata fetch (JSON)     ${timings.metadataFetchMs.toFixed(0).padStart(8)}ms      │`);
    console.log(`│  3. Container call            ${containerCallMs.toFixed(0).padStart(8)}ms      │`);
    console.log(`│  4. Tx submit                 ${txSubmitMs.toFixed(0).padStart(8)}ms      │`);
    console.log(`│  5. Tx confirmation           ${txConfirmMs.toFixed(0).padStart(8)}ms      │`);
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│  Time to tx sent (1-4)        ${timeToSent.toFixed(0).padStart(8)}ms      │`);
    console.log(`│  TOTAL (1-5)                  ${totalTime.toFixed(0).padStart(8)}ms      │`);
    console.log('└─────────────────────────────────────────────────┘');
    console.log('');
  } catch (error: any) {
    console.error(`❌ Failed to handle request: ${error.message}`);

    // Still try to send an error response
    try {
      const errorResponse = toHex(`Error: ${error.message}`);
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: 'handleResponse',
        args: [requestId, errorResponse, [], false], // success = false
      });
      console.log(`📤 Error response sent! Tx hash: ${hash}`);
    } catch (responseError: any) {
      console.error(`❌ Failed to send error response: ${responseError.message}`);
    }
  }
}

// Handle graceful shutdown
async function shutdown() {
  console.log('\n\n👋 Shutting down agent host...');
  unwatch();
  await cleanupContainers();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
