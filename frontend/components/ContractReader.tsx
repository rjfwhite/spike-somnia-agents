"use client";

import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";

export function ContractReader() {
  // Read contract name
  const { data: name } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "name",
  });

  // Read contract symbol
  const { data: symbol } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "symbol",
  });

  // Read max agent ID
  const { data: maxAgentId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "getMaxAgentId",
  });

  return (
    <div className="glass-panel rounded-xl shadow-xl p-6 space-y-4">
      <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Contract Information</h2>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Contract Name</span>
          <span className="font-bold text-white text-base">{name?.toString() || "Loading..."}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Symbol</span>
          <span className="font-bold text-secondary text-base">{symbol?.toString() || "Loading..."}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
          <span className="text-gray-400 font-medium text-sm uppercase tracking-wider">Total Agents</span>
          <span className="font-bold text-primary text-base">{maxAgentId?.toString() || "0"}</span>
        </div>

        <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
          <span className="text-gray-500 font-medium text-xs uppercase tracking-wider">Contract Address</span>
          <span className="font-mono text-xs text-gray-400 break-all bg-black/30 p-2 rounded border border-white/5">{CONTRACT_ADDRESS}</span>
        </div>
      </div>
    </div>
  );
}

