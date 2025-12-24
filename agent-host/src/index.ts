import { createPublicClient, createWalletClient, http, parseAbiItem, toHex, fromHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import 'dotenv/config';
import { callAgentContainer, cleanupContainers } from './docker.js';

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
const CONTRACT_ADDRESS = '0x8E660a4618E117b7442A96fA2BEe3d7aE5E6Ed7f' as const;

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

// Cache for agent CIDs (agentId -> IPFS CID)
const agentCIDCache = new Map<string, string>();

/**
 * Get the IPFS CID for an agent from the tokenURI
 */
async function getAgentCID(agentId: bigint): Promise<string> {
  const cacheKey = agentId.toString();
  
  if (agentCIDCache.has(cacheKey)) {
    return agentCIDCache.get(cacheKey)!;
  }

  console.log(`🔍 Fetching tokenURI for agent ${agentId}...`);
  
  const tokenURI = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: 'tokenURI',
    args: [agentId],
  });

  console.log(`   Token URI: ${tokenURI}`);

  // The tokenURI might be:
  // 1. An IPFS CID directly (e.g., "QmXxx..." or "bafyxxx...")
  // 2. An IPFS URL (e.g., "ipfs://QmXxx...")
  // 3. An HTTP URL to metadata JSON
  
  let cid: string;

  if (tokenURI.startsWith('ipfs://')) {
    // Extract CID from ipfs:// URL
    cid = tokenURI.replace('ipfs://', '').split('/')[0];
  } else if (tokenURI.startsWith('Qm') || tokenURI.startsWith('bafy')) {
    // Direct CID
    cid = tokenURI;
  } else if (tokenURI.startsWith('http')) {
    // Fetch metadata JSON and extract image CID
    const response = await fetch(tokenURI);
    const metadata = await response.json();
    
    // Look for image field in metadata
    const imageUri = metadata.image || metadata.image_url || metadata.animation_url;
    if (!imageUri) {
      throw new Error(`No image field found in metadata: ${JSON.stringify(metadata)}`);
    }
    
    if (imageUri.startsWith('ipfs://')) {
      cid = imageUri.replace('ipfs://', '').split('/')[0];
    } else {
      cid = imageUri;
    }
  } else {
    // Assume it's a CID
    cid = tokenURI;
  }

  console.log(`   Resolved CID: ${cid}`);
  agentCIDCache.set(cacheKey, cid);
  return cid;
}

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
      const { requestId, agentId, method, callData } = log.args;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 New Request Received!');
      console.log(`   Request ID: ${requestId}`);
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Method: ${method}`);
      console.log(`   Call Data: ${callData}`);
      console.log(`   Block: ${log.blockNumber}`);
      console.log(`   Tx Hash: ${log.transactionHash}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Process the request and respond
      try {
        await handleAgentRequest(requestId!, agentId!, method!, callData!);
      } catch (error) {
        console.error('❌ Error handling request:', error);
      }
    }
  },
  onError: (error) => {
    console.error('❌ Event watcher error:', error);
  },
});

async function handleAgentRequest(
  requestId: bigint,
  agentId: bigint,
  method: string,
  callData: `0x${string}`
) {
  console.log(`\n🔄 Processing request ${requestId}...`);

  try {
    // Get the IPFS CID for this agent's container image
    const cid = await getAgentCID(agentId);

    // Decode callData from hex to string for the HTTP request
    let callDataStr: string;
    try {
      callDataStr = fromHex(callData, 'string');
    } catch {
      // If it's not valid UTF-8, use the raw hex
      callDataStr = callData;
    }

    // Call the agent's container
    const response = await callAgentContainer(cid, method, callDataStr);

    // Encode response as bytes
    const responseData = toHex(response);
    const receipts: bigint[] = []; // Empty receipts for now

    console.log(`📤 Sending response for request ${requestId}...`);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: 'handleResponse',
      args: [requestId, responseData, receipts],
    });

    console.log(`✅ Response sent! Tx hash: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`   Status: ${receipt.status === 'success' ? 'Success' : 'Failed'}`);
    console.log(`   Gas used: ${receipt.gasUsed}\n`);
  } catch (error: any) {
    console.error(`❌ Failed to handle request: ${error.message}`);
    
    // Still try to send an error response
    try {
      const errorResponse = toHex(`Error: ${error.message}`);
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: 'handleResponse',
        args: [requestId, errorResponse, []],
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
