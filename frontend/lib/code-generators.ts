import { MethodDefinition, AbiParameter } from "./types";
import { CONTRACT_ADDRESS } from "./contract";
import { formatEther } from "viem";

export function generateSolidityExample(method: MethodDefinition, agentId?: string, price?: bigint): string {
  const inputs = method.inputs.map(p => `${p.type} ${p.name}`).join(", ");
  const inputTypes = method.inputs.map(p => p.type).join(",");
  const argNames = method.inputs.map(p => p.name).join(", ");

  // We only encode parameters, not the function selector
  const encodingLogic = inputTypes
    ? `bytes memory callData = abi.encode(${argNames});`
    : `bytes memory callData = ""; // No parameters`;

  const priceValue = price ? `${formatEther(price)} ether` : "agentPrice";
  const agentIdValue = agentId || "agentId";

  return `// 1. Prepare param data (ABI encoded parameters only)
${encodingLogic}

// 2. Call Platform Contract
ISomniaAgents platform = ISomniaAgents(${CONTRACT_ADDRESS});
// request ID (random/nonce), agent ID, method name, call data
platform.createRequest{value: ${priceValue}}(${Math.floor(Math.random() * 100000)}, ${agentIdValue}, "${method.name}", callData);`;
}

export function generateViemExample(method: MethodDefinition, agentId?: string, price?: bigint): string {
  // We need the ABI for parameters only to encode them
  const paramsAbi = method.inputs.map(p => ({ type: p.type, name: p.name }));
  const agentIdValue = agentId ? `${agentId}n` : "1n";
  const priceValue = price ? `'${formatEther(price)}'` : "'0.01'";

  return `import { createPublicClient, http, encodeAbiParameters, parseEther } from 'viem';
import { mainnet } from 'viem/chains';
import { somniaAgentsAbi } from './abi'; // Your ABI file

const client = createPublicClient({
  chain: mainnet, // Replace with Somnia chain
  transport: http()
});

// 1. Encode Parameters (NOT function data)
const callData = encodeAbiParameters(
  ${JSON.stringify(paramsAbi, null, 2)},
  [${method.inputs.map(p => p.name).join(", ")}] // Replace with actual values
);

// 2. Send 'createRequest' Transaction to Platform
const { request } = await client.simulateContract({
  address: '${CONTRACT_ADDRESS}',
  abi: somniaAgentsAbi,
  functionName: 'createRequest',
  args: [
    ${Math.floor(Math.random() * 100000)}n, // requestId (random)
    ${agentIdValue}, // agentId
    '${method.name}', // method name string
    callData // encoded params
  ],
  value: parseEther(${priceValue}), // Agent price
  account: '0x...'
});

const hash = await client.writeContract(request);
console.log("Tx Hash:", hash);`;
}

export function generateExpressExample(method: MethodDefinition, agentId?: string, price?: bigint): string {
  const paramsAbi = method.inputs.map(p => ({ type: p.type, name: p.name }));
  const agentIdValue = agentId ? `BigInt(${agentId})` : "BigInt(req.params.id)";

  return `import express from 'express';
import { createWalletClient, http, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaAgentsAbi } from './abi';

const app = express();
app.use(express.json());

app.post('/agent/:id/${method.name}', async (req, res) => {
  try {
    const { ${method.inputs.map(p => p.name).join(", ")} } = req.body;
    const agentId = ${agentIdValue};

    // 1. Encode Parameters
    const callData = encodeAbiParameters(
      ${JSON.stringify(paramsAbi, null, 2)},
      [${method.inputs.map(p => p.name).join(", ")}]
    );

    // 2. Interact with Platform Contract
    const hash = await walletClient.writeContract({
      address: '${CONTRACT_ADDRESS}',
      abi: somniaAgentsAbi,
      functionName: 'createRequest',
      args: [
        BigInt(Math.floor(Math.random() * 1e9)), // random requestId
        agentId,
        '${method.name}',
        callData
      ],
      // value: ... (if needed)
    });

    res.json({ txHash: hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`;
}
