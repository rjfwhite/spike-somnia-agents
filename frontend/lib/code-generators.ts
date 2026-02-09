import { AbiFunction } from "./types";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_V2_ADDRESS } from "./contract";
import { formatEther } from "viem";

// Helper to add memory qualifier for string and bytes types in function signatures
function withMemory(type: string): string {
  if (type === 'string' || type === 'bytes' || type.endsWith('[]')) {
    return `${type} memory`;
  }
  return type;
}

export function generateSolidityExample(method: AbiFunction, agentId?: string, price?: bigint): string {
  const inputs = method.inputs.map(p => `${withMemory(p.type)} ${p.name}`).join(", ");
  const argNames = method.inputs.map(p => p.name).join(", ");
  const outputTypes = method.outputs.map(p => withMemory(p.type)).join(", ");
  const outputNames = method.outputs.map((p, i) => p.name || `result${i}`).join(", ");

  // Encoding uses the interface selector
  const encodingLogic = method.inputs.length > 0
    ? `bytes memory request = abi.encodeWithSelector(IAgent.${method.name}.selector, ${argNames});`
    : `bytes memory request = abi.encodeWithSelector(IAgent.${method.name}.selector);`;

  const priceValue = price ? `${formatEther(price)} ether` : "0.01 ether";
  const agentIdValue = agentId || "AGENT_ID";

  // Generate decode logic for outputs
  const decodeLogic = method.outputs.length > 0
    ? `(${outputTypes}) = abi.decode(results[0], (${method.outputs.map(p => p.type).join(", ")}));`
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

    // Response status codes
    uint8 constant STATUS_PENDING = 0;
    uint8 constant STATUS_SUCCESS = 1;
    uint8 constant STATUS_FAILED = 2;
    uint8 constant STATUS_TIMED_OUT = 3;

    // Store pending requests
    mapping(uint256 => address) public requestSenders;

    event AgentResponseReceived(uint256 indexed requestId, uint8 status${method.outputs.length > 0 ? `, ${method.outputs.map(p => `${p.type} ${p.name || 'result'}`).join(', ')}` : ''});

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
    // status: 0 = Pending, 1 = Success, 2 = Failed, 3 = TimedOut
    function handleResponse(uint256 requestId, bytes[] calldata results, uint8 status, uint256 cost) external {
        require(msg.sender == address(platform), "Only platform can call");

        if (status == STATUS_SUCCESS && results.length > 0) {
            // Decode the first result (consensus result)
            ${decodeLogic}
            emit AgentResponseReceived(requestId, status${method.outputs.length > 0 ? `, ${outputNames}` : ''});
        } else {
            // Failed or timed out
            emit AgentResponseReceived(requestId, status${method.outputs.length > 0 ? method.outputs.map(() => ', 0').join('') : ''});
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

  return `import { createPublicClient, createWalletClient, http, webSocket, encodeFunctionData, parseEther, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PLATFORM_ADDRESS = '${CONTRACT_ADDRESS}';
const RPC_URL = 'https://dream-rpc.somnia.network/';
const WS_URL = 'wss://dream-rpc.somnia.network/ws';

// Response status codes
const STATUS_PENDING = 0;
const STATUS_SUCCESS = 1;
const STATUS_FAILED = 2;
const STATUS_TIMED_OUT = 3;

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
    name: 'RequestCreated',
    inputs: [
      { type: 'uint256', name: 'requestId', indexed: true },
      { type: 'uint256', name: 'agentId', indexed: true },
      { type: 'uint256', name: 'maxCost', indexed: false },
      { type: 'bytes', name: 'payload', indexed: false },
      { type: 'address[]', name: 'subcommittee', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'RequestFinalized',
    inputs: [
      { type: 'uint256', name: 'requestId', indexed: true },
      { type: 'uint8', name: 'status', indexed: false }
    ]
  },
  {
    type: 'function',
    name: 'getResponses',
    inputs: [{ type: 'uint256', name: 'requestId' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { type: 'address', name: 'validator' },
        { type: 'bytes', name: 'result' },
        { type: 'uint8', name: 'status' },
        { type: 'uint256', name: 'receipt' },
        { type: 'uint256', name: 'cost' },
        { type: 'uint256', name: 'timestamp' }
      ]
    }]
  }
] as const;

// Agent method ABI (for encoding request)
const agentMethodAbi = [${JSON.stringify(methodAbi, null, 2)}] as const;

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
  //    For on-chain callbacks, use the Solidity example instead
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

  // 3. Wait for transaction and extract requestId from RequestCreated event
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const createdLog = receipt.logs.find(log => {
    try {
      const decoded = decodeEventLog({ abi: platformAbi, data: log.data, topics: log.topics });
      return decoded.eventName === 'RequestCreated';
    } catch { return false; }
  });

  const requestId = createdLog?.args?.requestId;
  console.log('Request ID:', requestId);

  // 4. Watch for RequestFinalized event (covers Success, Failed, and TimedOut)
  return new Promise((resolve, reject) => {
    const unwatch = publicClient.watchContractEvent({
      address: PLATFORM_ADDRESS,
      abi: platformAbi,
      eventName: 'RequestFinalized',
      onLogs: (logs) => {
        for (const log of logs) {
          if (log.args.requestId === requestId) {
            unwatch();
            const status = Number(log.args.status);

            // 5. Read responses from the contract
            publicClient.readContract({
              address: PLATFORM_ADDRESS,
              abi: platformAbi,
              functionName: 'getResponses',
              args: [requestId]
            }).then(responses => {
              console.log('Finalized! Status:', status === STATUS_SUCCESS ? 'Success' : status === STATUS_FAILED ? 'Failed' : 'TimedOut');
              console.log('Responses:', responses);

              if (status === STATUS_SUCCESS) {
                resolve({ status: 'success', responses });
              } else {
                reject(new Error(status === STATUS_FAILED ? 'Agent execution failed' : 'Request timed out'));
              }
            });
          }
        }
      }
    });
  });
}`;
}

