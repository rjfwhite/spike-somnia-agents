import { AbiFunction } from "./types";
import { CONTRACT_ADDRESS } from "./contract";
import { formatEther } from "viem";

export function generateSolidityExample(method: AbiFunction, agentId?: string, price?: bigint): string {
  const inputs = method.inputs.map(p => `${p.type} ${p.name}`).join(", ");
  const argNames = method.inputs.map(p => p.name).join(", ");
  const outputTypes = method.outputs.map(p => p.type).join(", ");
  const outputNames = method.outputs.map((p, i) => p.name || `result${i}`).join(", ");

  // Encoding uses the interface selector
  const encodingLogic = method.inputs.length > 0
    ? `bytes memory request = abi.encodeWithSelector(IAgent.${method.name}.selector, ${argNames});`
    : `bytes memory request = abi.encodeWithSelector(IAgent.${method.name}.selector);`;

  const priceValue = price ? `${formatEther(price)} ether` : "agentCost";
  const agentIdValue = agentId || "AGENT_ID";

  // Generate decode logic for outputs
  const decodeLogic = method.outputs.length > 0
    ? `(${outputTypes}) = abi.decode(response, (${method.outputs.map(p => p.type).join(", ")}));`
    : `// No return value`;

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Platform interface
interface IHttpSingletonSomniaAgents {
    struct AgentRequestData {
        uint256 agentId;
        bytes request;          // ABI-encoded function call (selector + params)
        address callbackAddress; // Contract to receive response
        bytes4 callbackSelector; // Function selector for callback
    }

    function requestAgent(AgentRequestData calldata data) external payable returns (uint256 requestId);
}

// Agent interface (for .selector and type safety)
interface IAgent {
    function ${method.name}(${inputs}) external${method.outputs.length > 0 ? ` returns (${outputTypes})` : ''};
}

contract MyContract {
    IHttpSingletonSomniaAgents public platform = IHttpSingletonSomniaAgents(${CONTRACT_ADDRESS});
    uint256 constant AGENT_ID = ${agentIdValue};

    // Store pending requests
    mapping(uint256 => address) public requestSenders;

    event AgentResponseReceived(uint256 indexed requestId, bool success${method.outputs.length > 0 ? `, ${method.outputs.map(p => `${p.type} ${p.name || 'result'}`).join(', ')}` : ''});

    function invoke${method.name.charAt(0).toUpperCase() + method.name.slice(1)}(${inputs ? inputs : ""}) external payable returns (uint256 requestId) {
        // 1. Encode the FULL function call using interface selector
        ${encodingLogic}

        // 2. Build request - callback to THIS contract's handleResponse function
        IHttpSingletonSomniaAgents.AgentRequestData memory requestData = IHttpSingletonSomniaAgents.AgentRequestData({
            agentId: AGENT_ID,
            request: request,
            callbackAddress: address(this),
            callbackSelector: this.handleResponse.selector
        });

        // 3. Send request and get requestId
        requestId = platform.requestAgent{value: ${priceValue}}(requestData);
        requestSenders[requestId] = msg.sender;
    }

    // Called by the platform when the agent responds
    function handleResponse(uint256 requestId, bytes calldata response, bool success) external {
        require(msg.sender == address(platform), "Only platform can call");

        if (success && response.length > 0) {
            // Decode the response
            ${decodeLogic}
            emit AgentResponseReceived(requestId, success${method.outputs.length > 0 ? `, ${outputNames}` : ''});
        } else {
            emit AgentResponseReceived(requestId, false${method.outputs.length > 0 ? method.outputs.map(() => ', 0').join('') : ''});
        }
    }
}`;
}

export function generateViemExample(method: AbiFunction, agentId?: string, price?: bigint): string {
  const agentIdValue = agentId ? `${agentId}n` : "1n";
  const priceValue = price ? `'${formatEther(price)}'` : "'0'";

  // Build the agent's method ABI for encoding
  const methodAbi = {
    type: 'function',
    name: method.name,
    inputs: method.inputs.map(p => ({ type: p.type, name: p.name })),
    outputs: method.outputs.map(p => ({ type: p.type, name: p.name })),
  };

  const outputsAbi = method.outputs.map(p => ({ type: p.type, name: p.name }));

  return `import { createPublicClient, createWalletClient, http, webSocket, encodeFunctionData, decodeAbiParameters, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PLATFORM_ADDRESS = '${CONTRACT_ADDRESS}';
const RPC_URL = 'https://dream-rpc.somnia.network/';
const WS_URL = 'wss://dream-rpc.somnia.network/ws';

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
];

// Agent method ABI (for encoding request & decoding response)
const agentMethodAbi = [${JSON.stringify(methodAbi, null, 2)}];

async function invokeAgentAndWaitForResponse() {
  const account = privateKeyToAccount('0x...'); // Your private key

  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL)
  });

  const publicClient = createPublicClient({
    transport: webSocket(WS_URL)
  });

  // 1. Encode the FULL function call (selector + parameters)
  const request = encodeFunctionData({
    abi: agentMethodAbi,
    functionName: '${method.name}',
    args: [${method.inputs.map(p => `/* ${p.name}: ${p.type} */`).join(', ')}]
  });

  // 2. Send request (no callback - we'll watch for events)
  const hash = await walletClient.writeContract({
    address: PLATFORM_ADDRESS,
    abi: platformAbi,
    functionName: 'requestAgent',
    args: [{
      agentId: ${agentIdValue},
      request,
      callbackAddress: '0x0000000000000000000000000000000000000000',
      callbackSelector: '0x00000000'
    }],
    value: parseEther(${priceValue})
  });

  console.log('Transaction submitted:', hash);

  // 3. Wait for transaction and extract requestId from AgentRequested event
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const requestedLog = receipt.logs.find(log => {
    try {
      const decoded = decodeEventLog({ abi: platformAbi, data: log.data, topics: log.topics });
      return decoded.eventName === 'AgentRequested';
    } catch { return false; }
  });

  const requestId = requestedLog?.args?.requestId;
  console.log('Request ID:', requestId);

  // 4. Watch for AgentResponded event
  return new Promise((resolve, reject) => {
    const unwatch = publicClient.watchContractEvent({
      address: PLATFORM_ADDRESS,
      abi: platformAbi,
      eventName: 'AgentResponded',
      onLogs: (logs) => {
        for (const log of logs) {
          if (log.args.requestId === requestId) {
            unwatch();

            if (log.args.success && log.args.response) {
              // 5. Decode the response using agent's output ABI
              const decoded = decodeAbiParameters(
                ${JSON.stringify(outputsAbi)},
                log.args.response
              );
              console.log('Response:', decoded);
              resolve({ success: true, data: decoded });
            } else {
              reject(new Error('Agent execution failed'));
            }
          }
        }
      }
    });
  });
}`;
}

