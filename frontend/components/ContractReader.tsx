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
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4 border border-gray-200">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Contract Information</h2>
      
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
          <span className="text-gray-700 font-medium text-sm">Contract Name:</span>
          <span className="font-semibold text-gray-900 text-sm sm:text-base">{name?.toString() || "Loading..."}</span>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
          <span className="text-gray-700 font-medium text-sm">Symbol:</span>
          <span className="font-semibold text-gray-900 text-sm sm:text-base">{symbol?.toString() || "Loading..."}</span>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
          <span className="text-gray-700 font-medium text-sm">Total Agents:</span>
          <span className="font-semibold text-gray-900 text-sm sm:text-base">{maxAgentId?.toString() || "0"}</span>
        </div>

        <div className="flex flex-col gap-1 pt-2 border-t border-gray-200">
          <span className="text-gray-700 font-medium text-xs sm:text-sm">Contract Address:</span>
          <span className="font-mono text-xs text-gray-900 break-all">{CONTRACT_ADDRESS}</span>
        </div>
      </div>
    </div>
  );
}

