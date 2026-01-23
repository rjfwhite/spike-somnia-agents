export const SOMNIA_CHAIN_ID = 50312;
export const SOMNIA_RPC_URL = "https://dream-rpc.somnia.network/";
export const CONTRACT_ADDRESS = "0xCFfb624d499D9674f4eB1C877DE9bb30172B1d37" as const;

// Contract ABI for HttpSingletonSomniaAgents
export const SOMNIA_AGENTS_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "initialOwner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "AgentNotFound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "required",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "provided",
        "type": "uint256"
      }
    ],
    "name": "InsufficientPayment",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "request",
        "type": "bytes"
      }
    ],
    "name": "AgentRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "response",
        "type": "bytes"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      }
    ],
    "name": "AgentResponded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "agentDetails",
    "outputs": [
      {
        "internalType": "string",
        "name": "metadataUri",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "containerImageUri",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "cost",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "callbackDetails",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "callbackAddress",
        "type": "address"
      },
      {
        "internalType": "bytes4",
        "name": "callbackSelector",
        "type": "bytes4"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentContainerUri",
    "outputs": [
      {
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentCost",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "cost",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentUri",
    "outputs": [
      {
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "requestId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "status",
            "type": "uint256"
          },
          {
            "components": [
              {
                "internalType": "string",
                "name": "name",
                "type": "string"
              },
              {
                "internalType": "string",
                "name": "value",
                "type": "string"
              }
            ],
            "internalType": "struct IOracleHub.Header[]",
            "name": "headers",
            "type": "tuple[]"
          },
          {
            "internalType": "bytes",
            "name": "body",
            "type": "bytes"
          }
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
  {
    "inputs": [],
    "name": "oracleHub",
    "outputs": [
      {
        "internalType": "contract IOracleHub",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
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
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "agentId",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "request",
            "type": "bytes"
          },
          {
            "internalType": "address",
            "name": "callbackAddress",
            "type": "address"
          },
          {
            "internalType": "bytes4",
            "name": "callbackSelector",
            "type": "bytes4"
          }
        ],
        "internalType": "struct AgentRequestData",
        "name": "requestData",
        "type": "tuple"
      }
    ],
    "name": "requestAgent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "metadataUri",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "containerImageUri",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "cost",
        "type": "uint256"
      }
    ],
    "name": "setAgentDetails",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_oracleHub",
        "type": "address"
      }
    ],
    "name": "setOracleHub",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Handler interface ABI for contracts that want to receive agent responses
export const SOMNIA_AGENTS_HANDLER_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "response",
        "type": "bytes"
      },
      {
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      }
    ],
    "name": "handleResponse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;