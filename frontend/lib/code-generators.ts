import { AbiFunction } from "./types";
import { SOMNIA_AGENTS_V2_ADDRESS } from "./contract";

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

  const encodingLogic = method.inputs.length > 0
    ? `bytes memory payload = abi.encodeWithSelector(IAgent.${method.name}.selector, ${argNames});`
    : `bytes memory payload = abi.encodeWithSelector(IAgent.${method.name}.selector);`;

  const agentIdValue = agentId || "AGENT_ID";

  const decodeLogic = method.outputs.length > 0
    ? `(${outputTypes}) = abi.decode(results[0], (${method.outputs.map(p => p.type).join(", ")}));`
    : `// No return value`;

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

enum ResponseStatus { Pending, Success, Failed, TimedOut }

// Platform interface
interface ISomniaAgents {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

// Agent interface (for .selector and type safety)
interface IAgent {
    function ${method.name}(${inputs}) external${method.outputs.length > 0 ? ` returns (${outputTypes})` : ''};
}

contract MyContract {
    ISomniaAgents public platform = ISomniaAgents(${SOMNIA_AGENTS_V2_ADDRESS});
    uint256 constant AGENT_ID = ${agentIdValue};

    // Store pending requests
    mapping(uint256 => address) public requestSenders;

    event AgentResponseReceived(uint256 indexed requestId, ResponseStatus status${method.outputs.length > 0 ? `, ${method.outputs.map(p => `${p.type} ${p.name || 'result'}`).join(', ')}` : ''});

    function invoke${method.name.charAt(0).toUpperCase() + method.name.slice(1)}(${inputs ? inputs : ""}) external payable returns (uint256 requestId) {
        // 1. Encode the function call using the agent interface selector
        ${encodingLogic}

        // 2. Get the required deposit
        uint256 deposit = platform.getRequestDeposit();

        // 3. Send request with callback to this contract
        requestId = platform.createRequest{value: deposit}(
            AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        requestSenders[requestId] = msg.sender;
    }

    // Called by the platform when consensus is reached
    function handleResponse(
        uint256 requestId,
        bytes[] calldata results,
        ResponseStatus status,
        uint256 cost
    ) external {
        require(msg.sender == address(platform), "Only platform can call");

        if (status == ResponseStatus.Success && results.length > 0) {
            // Decode the first result (consensus result)
            ${decodeLogic}
            emit AgentResponseReceived(requestId, status${method.outputs.length > 0 ? `, ${outputNames}` : ''});
        } else {
            // Failed or timed out
            emit AgentResponseReceived(requestId, status${method.outputs.length > 0 ? method.outputs.map(() => ', 0').join('') : ''});
        }
    }

    // Accept rebates from the platform
    receive() external payable {}
}`;
}

export function generateViemExample(method: AbiFunction, agentId?: string, price?: bigint): string {
  const agentIdValue = agentId ? `${agentId}n` : "1n";

  const methodAbi = {
    type: 'function',
    name: method.name,
    inputs: method.inputs.map(p => ({ type: p.type, name: p.name })),
    outputs: method.outputs.map(p => ({ type: p.type, name: p.name })),
  };

  return `import { createPublicClient, createWalletClient, http, webSocket, encodeFunctionData, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PLATFORM_ADDRESS = '${SOMNIA_AGENTS_V2_ADDRESS}';
const RPC_URL = 'https://dream-rpc.somnia.network/';
const WS_URL = 'wss://dream-rpc.somnia.network/ws';

// Platform ABI (subset)
const platformAbi = [
  {
    type: 'function',
    name: 'createRequest',
    inputs: [
      { type: 'uint256', name: 'agentId' },
      { type: 'address', name: 'callbackAddress' },
      { type: 'bytes4', name: 'callbackSelector' },
      { type: 'bytes', name: 'payload' }
    ],
    outputs: [{ type: 'uint256', name: 'requestId' }],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'getRequestDeposit',
    inputs: [],
    outputs: [{ type: 'uint256', name: '' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'RequestCreated',
    inputs: [
      { type: 'uint256', name: 'requestId', indexed: true },
      { type: 'uint256', name: 'agentId', indexed: true },
      { type: 'uint256', name: 'maxCostPerAgent', indexed: false },
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

// Agent method ABI (for encoding the payload)
const agentMethodAbi = [${JSON.stringify(methodAbi, null, 2)}] as const;

async function invokeAgent() {
  const account = privateKeyToAccount('0x...'); // Your private key

  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL)
  });

  const publicClient = createPublicClient({
    transport: webSocket(WS_URL)
  });

  // 1. Encode the agent function call (selector + parameters)
  const payload = encodeFunctionData({
    abi: agentMethodAbi,
    functionName: '${method.name}',
    args: [${method.inputs.map(p => `/* ${p.name}: ${p.type} */`).join(', ')}]
  });

  // 2. Get the required deposit
  const deposit = await publicClient.readContract({
    address: PLATFORM_ADDRESS,
    abi: platformAbi,
    functionName: 'getRequestDeposit'
  });

  // 3. Send request (no callback - we'll watch for events)
  const hash = await walletClient.writeContract({
    address: PLATFORM_ADDRESS,
    abi: platformAbi,
    functionName: 'createRequest',
    args: [
      ${agentIdValue},                                          // agentId
      '0x0000000000000000000000000000000000000000', // no callback
      '0x00000000',                                 // no callback selector
      payload
    ],
    value: deposit
  });

  console.log('Transaction submitted:', hash);

  // 4. Wait for transaction and extract requestId
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const createdLog = receipt.logs.find(log => {
    try {
      const decoded = decodeEventLog({ abi: platformAbi, data: log.data, topics: log.topics });
      return decoded.eventName === 'RequestCreated';
    } catch { return false; }
  });

  const requestId = createdLog?.args?.requestId;
  console.log('Request ID:', requestId);

  // 5. Watch for RequestFinalized event
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

            // 6. Read responses
            publicClient.readContract({
              address: PLATFORM_ADDRESS,
              abi: platformAbi,
              functionName: 'getResponses',
              args: [requestId]
            }).then(responses => {
              console.log('Status:', status === 1 ? 'Success' : status === 2 ? 'Failed' : 'TimedOut');
              console.log('Responses:', responses);

              if (status === 1) {
                resolve({ status: 'success', responses });
              } else {
                reject(new Error(status === 2 ? 'Agent execution failed' : 'Request timed out'));
              }
            });
          }
        }
      }
    });
  });
}`;
}
