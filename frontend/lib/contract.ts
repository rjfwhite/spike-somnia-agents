export const SOMNIA_CHAIN_ID = 50312;
export const SOMNIA_RPC_URL = "https://dream-rpc.somnia.network/";
export const CONTRACT_ADDRESS = "0x58ade7Fe7633b54B0052F9006863c175b8a231bE" as const;
export const COMMITTEE_CONTRACT_ADDRESS = "0xA4D2E22EFA337423147C993E2F348Da68F921119" as const;
export const AGENT_REGISTRY_V2_ADDRESS = "0x81A80E8A7923566F4c0120fE7e93aF12A0e180C3" as const;
export const SOMNIA_AGENTS_V2_ADDRESS = "0xfc96D1a8d2C5f44CC51e924a1a79f9AFE9A6bbeF" as const;

// Contract ABI for SomniaAgents (ERC721 Enumerable)
export const SOMNIA_AGENTS_ABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "initialOwner", "type": "address" },
      { "internalType": "address", "name": "_oracleHub", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Errors
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "AgentNotFound",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "required", "type": "uint256" },
      { "internalType": "uint256", "name": "provided", "type": "uint256" }
    ],
    "name": "InsufficientPayment",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "caller", "type": "address" }
    ],
    "name": "NotAgentOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  // ERC721 Errors
  {
    "inputs": [
      { "internalType": "address", "name": "sender", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "ERC721IncorrectOwner",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "ERC721InsufficientApproval",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "approver", "type": "address" }],
    "name": "ERC721InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "operator", "type": "address" }],
    "name": "ERC721InvalidOperator",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "ERC721InvalidOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "receiver", "type": "address" }],
    "name": "ERC721InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }],
    "name": "ERC721InvalidSender",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ERC721NonexistentToken",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "index", "type": "uint256" }
    ],
    "name": "ERC721OutOfBoundsIndex",
    "type": "error"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "metadataUri", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "containerImageUri", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "cost", "type": "uint256" }
    ],
    "name": "AgentSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "AgentDeleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "approved", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
      { "indexed": false, "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "ApprovalForAll",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  // Agent request/response events (emitted by oracle system or future contract versions)
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": false, "internalType": "bytes", "name": "request", "type": "bytes" }
    ],
    "name": "AgentRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": false, "internalType": "bytes", "name": "response", "type": "bytes" },
      { "indexed": false, "internalType": "bool", "name": "success", "type": "bool" }
    ],
    "name": "AgentResponded",
    "type": "event"
  },
  // Agent Functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "string", "name": "metadataUri", "type": "string" },
      { "internalType": "string", "name": "containerImageUri", "type": "string" }
    ],
    "name": "setAgent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "deleteAgent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "getAgent",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "agentId", "type": "uint256" },
          { "internalType": "address", "name": "owner", "type": "address" },
          { "internalType": "string", "name": "metadataUri", "type": "string" },
          { "internalType": "string", "name": "containerImageUri", "type": "string" }
        ],
        "internalType": "struct Agent",
        "name": "agent",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "getAgentsByOwner",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllAgents",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getAgentsPaginated",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Agents mapping (for direct access)
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "agents",
    "outputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "string", "name": "metadataUri", "type": "string" },
      { "internalType": "string", "name": "containerImageUri", "type": "string" },
      { "internalType": "uint256", "name": "cost", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Callback details mapping
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "callbackDetails",
    "outputs": [
      { "internalType": "address", "name": "callbackAddress", "type": "address" },
      { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" },
      { "internalType": "uint256", "name": "agentId", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Request agent
  {
    "inputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "agentId", "type": "uint256" },
          { "internalType": "bytes", "name": "request", "type": "bytes" },
          { "internalType": "address", "name": "callbackAddress", "type": "address" },
          { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" }
        ],
        "internalType": "struct AgentRequestData",
        "name": "requestData",
        "type": "tuple"
      }
    ],
    "name": "requestAgent",
    "outputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  // Oracle response callback
  {
    "inputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "requestId", "type": "uint256" },
          { "internalType": "uint256", "name": "status", "type": "uint256" },
          {
            "components": [
              { "internalType": "string", "name": "name", "type": "string" },
              { "internalType": "string", "name": "value", "type": "string" }
            ],
            "internalType": "struct IOracleHub.Header[]",
            "name": "headers",
            "type": "tuple[]"
          },
          { "internalType": "bytes", "name": "body", "type": "bytes" }
        ],
        "internalType": "struct IOracleHub.HttpResponse",
        "name": "response",
        "type": "tuple"
      }
    ],
    "name": "onOracleResponse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Oracle hub
  {
    "inputs": [],
    "name": "oracleHub",
    "outputs": [{ "internalType": "contract IOracleHub", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_oracleHub", "type": "address" }],
    "name": "setOracleHub",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ERC721 Functions
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getApproved",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "operator", "type": "address" }
    ],
    "name": "isApprovedForAll",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "bytes", "name": "data", "type": "bytes" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }],
    "name": "supportsInterface",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "tokenURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ERC721 Enumerable
  {
    "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }],
    "name": "tokenByIndex",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "index", "type": "uint256" }
    ],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Handler interface ABI for contracts that want to receive agent responses
export const SOMNIA_AGENTS_HANDLER_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "internalType": "bytes[]", "name": "results", "type": "bytes[]" },
      { "internalType": "enum ResponseStatus", "name": "status", "type": "uint8" },
      { "internalType": "uint256", "name": "cost", "type": "uint256" }
    ],
    "name": "handleResponse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Agent struct type for TypeScript
export interface Agent {
  agentId: bigint;
  owner: string;
  metadataUri: string;
  containerImageUri: string;
}

// AgentRegistry v2 ABI (standalone registry contract)
export const AGENT_REGISTRY_V2_ABI = [
  // Errors
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "AgentNotFound",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "caller", "type": "address" }
    ],
    "name": "NotAgentOwner",
    "type": "error"
  },
  // ERC721 Errors
  {
    "inputs": [
      { "internalType": "address", "name": "sender", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "ERC721IncorrectOwner",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "ERC721InsufficientApproval",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "approver", "type": "address" }],
    "name": "ERC721InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "operator", "type": "address" }],
    "name": "ERC721InvalidOperator",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "ERC721InvalidOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "receiver", "type": "address" }],
    "name": "ERC721InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }],
    "name": "ERC721InvalidSender",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ERC721NonexistentToken",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "index", "type": "uint256" }
    ],
    "name": "ERC721OutOfBoundsIndex",
    "type": "error"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "metadataUri", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "containerImageUri", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "cost", "type": "uint256" }
    ],
    "name": "AgentSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "AgentDeleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "approved", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
      { "indexed": false, "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "ApprovalForAll",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  // Agent Functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "string", "name": "metadataUri", "type": "string" },
      { "internalType": "string", "name": "containerImageUri", "type": "string" }
    ],
    "name": "setAgent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "deleteAgent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "getAgent",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "agentId", "type": "uint256" },
          { "internalType": "address", "name": "owner", "type": "address" },
          { "internalType": "string", "name": "metadataUri", "type": "string" },
          { "internalType": "string", "name": "containerImageUri", "type": "string" }
        ],
        "internalType": "struct Agent",
        "name": "agent",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "getAgentsByOwner",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllAgents",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "offset", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getAgentsPaginated",
    "outputs": [{ "internalType": "uint256[]", "name": "agentIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "agentExists",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // ERC721 Functions
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getApproved",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "operator", "type": "address" }
    ],
    "name": "isApprovedForAll",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "bytes", "name": "data", "type": "bytes" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }],
    "name": "supportsInterface",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "tokenURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ERC721 Enumerable
  {
    "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }],
    "name": "tokenByIndex",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "index", "type": "uint256" }
    ],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// SomniaAgents v2 ABI (request/response consensus contract)
export const SOMNIA_AGENTS_V2_ABI = [
  // Errors (from AgentRegistry that SomniaAgents calls)
  {
    "inputs": [{ "internalType": "uint256", "name": "agentId", "type": "uint256" }],
    "name": "AgentNotFound",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "caller", "type": "address" }
    ],
    "name": "NotAgentOwner",
    "type": "error"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "maxCostPerAgent", "type": "uint256" },
      { "indexed": false, "internalType": "bytes", "name": "payload", "type": "bytes" },
      { "indexed": false, "internalType": "address[]", "name": "subcommittee", "type": "address[]" }
    ],
    "name": "RequestCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "indexed": false, "internalType": "enum ResponseStatus", "name": "status", "type": "uint8" }
    ],
    "name": "RequestFinalized",
    "type": "event"
  },
  // Request Functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "callbackAddress", "type": "address" },
      { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" },
      { "internalType": "bytes", "name": "payload", "type": "bytes" }
    ],
    "name": "createRequest",
    "outputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "agentId", "type": "uint256" },
      { "internalType": "address", "name": "callbackAddress", "type": "address" },
      { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" },
      { "internalType": "bytes", "name": "payload", "type": "bytes" },
      { "internalType": "uint256", "name": "subcommitteeSize", "type": "uint256" },
      { "internalType": "uint256", "name": "threshold", "type": "uint256" },
      { "internalType": "enum ConsensusType", "name": "consensusType", "type": "uint8" }
    ],
    "name": "createAdvancedRequest",
    "outputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  // Response Functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "internalType": "bytes", "name": "result", "type": "bytes" },
      { "internalType": "uint256", "name": "receipt", "type": "uint256" },
      { "internalType": "uint256", "name": "cost", "type": "uint256" },
      { "internalType": "bool", "name": "success", "type": "bool" }
    ],
    "name": "submitResponse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Timeout/Upkeep Functions
  {
    "inputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "name": "timeoutRequest",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "name": "getRequest",
    "outputs": [
      { "internalType": "address", "name": "requester", "type": "address" },
      { "internalType": "address", "name": "callbackAddress", "type": "address" },
      { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" },
      { "internalType": "address[]", "name": "subcommittee", "type": "address[]" },
      { "internalType": "uint256", "name": "threshold", "type": "uint256" },
      { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
      { "internalType": "enum ResponseStatus", "name": "status", "type": "uint8" },
      { "internalType": "uint256", "name": "responseCount", "type": "uint256" },
      { "internalType": "enum ConsensusType", "name": "consensusType", "type": "uint8" },
      { "internalType": "uint256", "name": "maxCost", "type": "uint256" },
      { "internalType": "uint256", "name": "finalCost", "type": "uint256" },
      { "internalType": "address", "name": "agentCreator", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "name": "getResponses",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "validator", "type": "address" },
          { "internalType": "bytes", "name": "result", "type": "bytes" },
          { "internalType": "enum ResponseStatus", "name": "status", "type": "uint8" },
          { "internalType": "uint256", "name": "receipt", "type": "uint256" },
          { "internalType": "uint256", "name": "cost", "type": "uint256" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "internalType": "struct Response[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "requestId", "type": "uint256" }],
    "name": "hasRequest",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "nextRequestId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oldestPendingId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "defaultSubcommitteeSize",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "defaultThreshold",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "requestTimeout",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "callbackGasLimit",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxPerAgentFee",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRequestDeposit",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "subcommitteeSize", "type": "uint256" }],
    "name": "getAdvancedRequestDeposit",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "agentRegistry",
    "outputs": [{ "internalType": "contract IAgentRegistry", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "committee",
    "outputs": [{ "internalType": "contract ICommittee", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Owner Functions
  {
    "inputs": [{ "internalType": "address", "name": "_agentRegistry", "type": "address" }],
    "name": "setAgentRegistry",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_committee", "type": "address" }],
    "name": "setCommittee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "size", "type": "uint256" }],
    "name": "setDefaultSubcommitteeSize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "threshold", "type": "uint256" }],
    "name": "setDefaultThreshold",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "timeout", "type": "uint256" }],
    "name": "setRequestTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "gasLimit", "type": "uint256" }],
    "name": "setCallbackGasLimit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "fee", "type": "uint256" }],
    "name": "setMaxPerAgentFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Revenue Share
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "runnerBps",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creatorBps",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "protocolBps",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_treasury", "type": "address" }],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint16", "name": "_runnerBps", "type": "uint16" },
      { "internalType": "uint16", "name": "_creatorBps", "type": "uint16" },
      { "internalType": "uint16", "name": "_protocolBps", "type": "uint16" }
    ],
    "name": "setFeeShares",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Committee Contract ABI
export const COMMITTEE_ABI = [
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "member", "type": "address" }
    ],
    "name": "MemberJoined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "member", "type": "address" }
    ],
    "name": "MemberLeft",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "member", "type": "address" }
    ],
    "name": "MemberTimedOut",
    "type": "event"
  },
  // Read Functions
  {
    "inputs": [],
    "name": "getActiveMembers",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }],
    "name": "isActive",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "n", "type": "uint256" },
      { "internalType": "bytes32", "name": "seed", "type": "bytes32" }
    ],
    "name": "electSubcommittee",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "lastHeartbeat",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastUpkeep",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "HEARTBEAT_INTERVAL",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "members",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Write Functions
  {
    "inputs": [],
    "name": "heartbeatMembership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "leaveMembership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Payment Distribution
  {
    "inputs": [
      { "internalType": "address[]", "name": "recipients", "type": "address[]" },
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "pendingBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
