"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { NETWORKS, NetworkConfig, NetworkKey } from "./networks";

interface NetworkContextType {
  networkKey: NetworkKey;
  currentNetwork: NetworkConfig;
  setNetwork: (key: NetworkKey) => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const STORAGE_KEY = "somnia-network";

function getInitialNetwork(): NetworkKey {
  if (typeof window === "undefined") return "testnet";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "testnet" || stored === "devnet" || stored === "mainnet") return stored;
  return "testnet";
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkKey, setNetworkKey] = useState<NetworkKey>("testnet");

  // Read from localStorage after mount
  useEffect(() => {
    setNetworkKey(getInitialNetwork());
  }, []);

  const setNetwork = useCallback((key: NetworkKey) => {
    setNetworkKey(key);
    localStorage.setItem(STORAGE_KEY, key);
    // Reload page to reinitialize all wagmi connections with new chain
    window.location.reload();
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        networkKey,
        currentNetwork: NETWORKS[networkKey],
        setNetwork,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}
