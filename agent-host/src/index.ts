import { createPublicClient, createWalletClient, http, parseAbiItem, toHex } from 'viem';
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
      const { requestId, agentId, method, callData } = log.args;
      
      // Convert agentId to CID
      const cid = agentIdToCID(agentId!);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 New Request Received!');
      console.log(`   Request ID: ${requestId}`);
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Agent CID: ${cid}`);
      console.log(`   Method: ${method}`);
      console.log(`   Call Data: ${callData}`);
      console.log(`   Block: ${log.blockNumber}`);
      console.log(`   Tx Hash: ${log.transactionHash}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Process the request and respond
      try {
        await handleAgentRequest(requestId!, cid, method!, callData!);
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
  cid: string,
  method: string,
  callData: `0x${string}`
) {
  console.log(`\n🔄 Processing request ${requestId}...`);

  try {
    // Call the agent's container with hex callData
    const response = await callAgentContainer(cid, method, callData);

    // Encode response as hex for the contract
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
