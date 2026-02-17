"use client";

import { useReadContract } from "wagmi";
import { SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { useNetwork } from "@/lib/network-context";

export function ContractReader() {
  const { currentNetwork } = useNetwork();
  const CONTRACT_ADDRESS = currentNetwork.contracts.legacyContract;
  const SOMNIA_CHAIN_ID = currentNetwork.chainId;
  const SOMNIA_RPC_URL = currentNetwork.rpcUrl;

  // Read contract owner
  const { data: owner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "owner",
  });

  // Read oracle hub address
  const { data: oracleHub } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "oracleHub",
  });

  return (
    <div className="glass-panel rounded-xl shadow-xl p-6 space-y-4">
      <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Contract Information</h2>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Contract Type</span>
          <span className="font-bold text-white text-base">HttpSingletonSomniaAgents</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Chain ID</span>
          <span className="font-bold text-secondary text-base">{SOMNIA_CHAIN_ID}</span>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Owner</span>
          <span className="font-mono text-xs text-primary break-all">{owner?.toString() || "Loading..."}</span>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Oracle Hub</span>
          <span className="font-mono text-xs text-green-400 break-all">{oracleHub?.toString() || "Loading..."}</span>
        </div>

        <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
          <span className="text-gray-500 font-medium text-xs uppercase tracking-wider">Contract Address</span>
          <span className="font-mono text-xs text-gray-400 break-all bg-black/30 p-2 rounded border border-white/5">{CONTRACT_ADDRESS}</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-gray-500 font-medium text-xs uppercase tracking-wider">RPC URL</span>
          <span className="font-mono text-xs text-gray-400 break-all bg-black/30 p-2 rounded border border-white/5">{SOMNIA_RPC_URL}</span>
        </div>
      </div>
    </div>
  );
}

