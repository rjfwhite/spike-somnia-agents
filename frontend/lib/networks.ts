export type NetworkKey = "devnet" | "testnet" | "mainnet";

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  explorerUrl: string;
  receiptsUrl: string;
  contracts: {
    somniaAgents: `0x${string}`;
    committee: `0x${string}`;
    agentRegistry: `0x${string}`;
    legacyContract: `0x${string}`;
  };
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  devnet: {
    name: "Devnet",
    chainId: 100810,
    rpcUrl: "https://api.infra.devnet.somnia.network",
    wsUrl: "wss://api.infra.devnet.somnia.network/ws",
    explorerUrl: "https://shannon-explorer.somnia.network",
    receiptsUrl: "https://devnet-agent-receipts-t7egsqstqa-ew.a.run.app",
    contracts: {
      somniaAgents: "0x8d0048a4B30753f076057E477D3817f557009668",
      committee: "0xc67C853b00319a63E9037F6c63ebf998B2903694",
      agentRegistry: "0x748Df19Aab2b147026471eEd8068F3D90DeAeFD3",
      legacyContract: "0x0000000000000000000000000000000000000000",
    },
  },
  testnet: {
    name: "Testnet",
    chainId: 50312,
    rpcUrl: "https://api.infra.testnet.somnia.network",
    wsUrl: "wss://api.infra.testnet.somnia.network/ws",
    explorerUrl: "https://shannon-explorer.somnia.network",
    receiptsUrl: "https://testnet-agent-receipts-ldxj422yua-ew.a.run.app",
    contracts: {
      somniaAgents: "0x155A171B3CCfBDe910078b0A6Bf8386cb506B365",
      committee: "0x3533eFd0f7E6668BB97859c05fcAD584691ed594",
      agentRegistry: "0x8fb55E1dDFba1ae01914c5e881699335eDee2905",
      legacyContract: "0x58ade7Fe7633b54B0052F9006863c175b8a231bE",
    },
  },
  mainnet: {
    name: "Mainnet",
    chainId: 5031,
    rpcUrl: "https://api.infra.mainnet.somnia.network",
    wsUrl: "wss://api.infra.mainnet.somnia.network/ws",
    explorerUrl: "https://somnia.blockscout.com",
    receiptsUrl: "",
    contracts: {
      somniaAgents: "0x92A2f65cD78116a16EFCb37f83810864070D01cb",
      committee: "0x8e612853073982F25EFF97699847b4dC2Ef6A4Ba",
      agentRegistry: "0xa7C8078609372c3Ad55514f79C8CB96eee4A4eBC",
      legacyContract: "0x0000000000000000000000000000000000000000",
    },
  },
};
