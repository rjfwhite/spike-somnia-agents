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
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900">Contract Information</h2>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Contract Name:</span>
          <span className="font-semibold text-gray-900">{name?.toString() || "Loading..."}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Symbol:</span>
          <span className="font-semibold text-gray-900">{symbol?.toString() || "Loading..."}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Total Agents:</span>
          <span className="font-semibold text-gray-900">{maxAgentId?.toString() || "0"}</span>
        </div>

        <div className="flex flex-col gap-1 pt-2 border-t border-gray-200">
          <span className="text-gray-700 font-medium text-sm">Contract Address:</span>
          <span className="font-mono text-xs text-gray-900 break-all">{CONTRACT_ADDRESS}</span>
        </div>
      </div>
    </div>
  );
}

