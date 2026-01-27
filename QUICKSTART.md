# Quick Start Guide

This guide will help you get the Somnia Agents platform up and running quickly.

## Prerequisites

- Node.js 18+ and npm
- A Web3 wallet (MetaMask recommended)
- Some STT tokens on the Somnia network (for transactions)

## Step 1: Configure Your Wallet

Add the Somnia network to MetaMask:

1. Open MetaMask
2. Click on the network dropdown (usually shows "Ethereum Mainnet")
3. Click "Add Network" → "Add a network manually"
4. Enter the following details:
   - **Network Name**: Somnia
   - **RPC URL**: `https://somnia-rpc.publicnode.com`
   - **Chain ID**: `5031`
   - **Currency Symbol**: `STT`
5. Click "Save"

## Step 2: Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The application will be available at http://localhost:3000

## Step 3: Connect Your Wallet

1. Open http://localhost:3000 in your browser
2. Click the "Connect Wallet" button
3. Approve the connection in MetaMask
4. Make sure you're on the Somnia network

## Step 4: Explore the Interface

### View Contract Information
The top-left card shows:
- Contract name and symbol
- Total number of agents minted
- Contract address

### View an Agent
The top-right card lets you:
- Enter an agent ID to view
- See the agent's owner, price, and metadata URI

### Mint a New Agent
The bottom-left card lets you:
- Create a new agent NFT
- Specify recipient address (optional)
- Set metadata URI (required)

### Create a Request
The bottom-right card lets you:
- Submit a request to an existing agent
- Automatically pays the required fee
- Provide method name and call data

## Example Workflow

### 1. Mint Your First Agent

1. Navigate to the "Mint New Agent" section
2. Leave the recipient empty (will mint to your address)
3. Enter a metadata URI, for example:
   ```
   https://example.com/agent-metadata.json
   ```
4. Click "Mint Agent"
5. Approve the transaction in MetaMask
6. Wait for confirmation
7. Note the agent ID from the success message

### 2. Set Agent Price (Optional)

To set a price for your agent, you'll need to call `setAgentPrice` directly:

```bash
# Using cast (Foundry)
cast send 0x58ade7Fe7633b54B0052F9006863c175b8a231bE \
  "setAgentPrice(uint256,uint256)" \
  <agent_id> \
  <price_in_wei> \
  --rpc-url https://somnia-rpc.publicnode.com \
  --private-key <your_private_key>
```

Or you could add a "Set Price" component to the frontend (not included in this version).

### 3. Create a Request to Your Agent

1. Switch to a different wallet address (or use the same one for testing)
2. Navigate to the "Create Agent Request" section
3. Enter your agent ID
4. Enter a method name, e.g., `generateImage`
5. Enter call data, e.g., `{"prompt": "a sunset over mountains"}`
6. Click "Create Request"
7. Approve the transaction (including payment if you set a price)
8. Wait for confirmation

### 4. View Agent Details

1. Go to the "View Agent" section
2. Enter your agent ID
3. See the owner, price, and metadata URI

## Common Issues

### Transaction Fails
- Make sure you have enough STT for gas fees
- Make sure you're on the Somnia network (Chain ID 5031)
- Check that the agent ID exists before creating a request

### Contract Not Responding
- Verify the RPC URL is accessible: https://somnia-rpc.publicnode.com
- Check if there are any network issues with Somnia
- Try refreshing the page

### Wallet Not Connecting
- Make sure MetaMask is installed and unlocked
- Ensure you've added the Somnia network to MetaMask
- Try disconnecting and reconnecting

## Next Steps

### For Users
- Explore existing agents
- Create requests to agents
- Monitor request responses via events

### For Developers
- Add more UI components (e.g., Set Agent Price, View Events)
- Implement event listening for real-time updates
- Add agent response handling UI
- Create agent metadata schemas
- Build off-chain agent execution infrastructure

### For Agent Creators
- Mint your agent NFT
- Set an appropriate price
- Host metadata describing your agent's capabilities
- Build off-chain infrastructure to process requests
- Monitor RequestCreated events
- Call handleResponse with results

## Advanced: Monitoring Events

You can listen to contract events using viem:

```typescript
import { watchContractEvent } from 'viem/actions'
import { publicClient } from '@/lib/wagmi'
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from '@/lib/contract'

// Watch for new requests
const unwatch = watchContractEvent(publicClient, {
  address: CONTRACT_ADDRESS,
  abi: SOMNIA_AGENTS_ABI,
  eventName: 'RequestCreated',
  onLogs: (logs) => {
    logs.forEach((log) => {
      console.log('New request:', log.args)
    })
  }
})
```

## Resources

- [Contract on Somnia](https://explorer.somnia.network/address/0x58ade7Fe7633b54B0052F9006863c175b8a231bE) (if explorer is available)
- [Somnia Documentation](https://docs.somnia.network)
- [Viem Documentation](https://viem.sh)
- [Wagmi Documentation](https://wagmi.sh)

## Support

For issues or questions:
1. Check the console for error messages
2. Review the transaction in a block explorer
3. Verify your wallet configuration
4. Check that contract address is correct: `0x58ade7Fe7633b54B0052F9006863c175b8a231bE`

