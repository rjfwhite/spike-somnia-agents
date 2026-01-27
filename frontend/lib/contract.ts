export const SOMNIA_CHAIN_ID = 50312;
export const SOMNIA_RPC_URL = "https://dream-rpc.somnia.network/";
export const CONTRACT_ADDRESS = "0xCC6B5C0b9327044318cFd38E49a47dc622B898D4" as const;

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
      { "internalType": "string", "name": "containerImageUri", "type": "string" },
      { "internalType": "uint256", "name": "cost", "type": "uint256" }
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
          { "internalType": "string", "name": "containerImageUri", "type": "string" },
          { "internalType": "uint256", "name": "cost", "type": "uint256" }
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
      { "internalType": "bytes4", "name": "callbackSelector", "type": "bytes4" }
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
      { "internalType": "bytes", "name": "response", "type": "bytes" },
      { "internalType": "bool", "name": "success", "type": "bool" }
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
  cost: bigint;
}
