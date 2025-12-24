import { createPublicClient, createWalletClient, http, parseAbiItem, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import 'dotenv/config';

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

  // For now, create a simple response
  // In a real implementation, this would process the request and generate an appropriate response
  const responseData = toHex(`Response for request ${requestId}`);
  const receipts: bigint[] = []; // Empty receipts for now

  console.log(`📤 Sending response for request ${requestId}...`);

  try {
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
    console.error(`❌ Failed to send response: ${error.message}`);
    throw error;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down agent host...');
  unwatch();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down agent host...');
  unwatch();
  process.exit(0);
});
