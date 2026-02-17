export type NetworkKey = "testnet" | "devnet";

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  explorerUrl: string;
  contracts: {
    somniaAgents: `0x${string}`;
    committee: `0x${string}`;
    agentRegistry: `0x${string}`;
    legacyContract: `0x${string}`;
  };
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  testnet: {
    name: "Testnet",
    chainId: 50312,
    rpcUrl: "https://dream-rpc.somnia.network/",
    wsUrl: "wss://dream-rpc.somnia.network/ws",
    explorerUrl: "https://shannon-explorer.somnia.network",
    contracts: {
      somniaAgents: "0xE7f05032Dcf41dd49721D2C1bf6DCEF4BB4be600",
      committee: "0xA4D2E22EFA337423147C993E2F348Da68F921119",
      agentRegistry: "0x81A80E8A7923566F4c0120fE7e93aF12A0e180C3",
      legacyContract: "0x58ade7Fe7633b54B0052F9006863c175b8a231bE",
    },
  },
  devnet: {
    name: "Devnet",
    chainId: 100810,
    rpcUrl: "https://api.infra.devnet.somnia.network",
    wsUrl: "wss://api.infra.devnet.somnia.network/ws",
    explorerUrl: "https://shannon-explorer.somnia.network", // TODO: update when devnet explorer is available
    contracts: {
      somniaAgents: "0x6FB8cC9621137920867418456e7E3D9732197888",
      committee: "0xC3760dBC467FA7B1B3e9f2540CA289F22641d2C0",
      agentRegistry: "0x9f00f0b42df3BB78524AAc644FD53c44e3a36f62",
      legacyContract: "0x0000000000000000000000000000000000000000",
    },
  },
};
