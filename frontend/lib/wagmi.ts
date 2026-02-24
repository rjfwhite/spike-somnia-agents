"use client";

import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { NETWORKS } from "./networks";

const testnetConfig = NETWORKS.testnet;
const devnetConfig = NETWORKS.devnet;
const mainnetConfig = NETWORKS.mainnet;

export const somnia = defineChain({
  id: testnetConfig.chainId,
  name: "Somnia Testnet",
  nativeCurrency: {
    name: "STT",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [testnetConfig.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: testnetConfig.explorerUrl,
    },
  },
});

export const somniaDevnet = defineChain({
  id: devnetConfig.chainId,
  name: "Somnia Devnet",
  nativeCurrency: {
    name: "STT",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [devnetConfig.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: devnetConfig.explorerUrl,
    },
  },
});

export const somniaMainnet = defineChain({
  id: mainnetConfig.chainId,
  name: "Somnia Mainnet",
  nativeCurrency: {
    name: "STT",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [mainnetConfig.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: mainnetConfig.explorerUrl,
    },
  },
});

export const config = createConfig({
  chains: [somnia, somniaDevnet, somniaMainnet],
  transports: {
    [somnia.id]: http(),
    [somniaDevnet.id]: http(),
    [somniaMainnet.id]: http(),
  },
});
