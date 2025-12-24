"use client";

import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { SOMNIA_CHAIN_ID, SOMNIA_RPC_URL } from "./contract";

// Define the Somnia chain
export const somnia = defineChain({
  id: SOMNIA_CHAIN_ID,
  name: "Somnia",
  nativeCurrency: {
    name: "STT",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [SOMNIA_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://explorer.somnia.network",
    },
  },
});

export const config = createConfig({
  chains: [somnia],
  transports: {
    [somnia.id]: http(),
  },
});

