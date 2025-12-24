"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";

export function AgentViewer() {
  const [agentId, setAgentId] = useState<string>("1");

  // Read agent metadata URI
  const { data: tokenURI, error, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "tokenURI",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900">View Agent</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="agentId" className="block text-sm font-semibold text-gray-900 mb-2">
            Agent ID
          </label>
          <input
            id="agentId"
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter agent ID"
            min="1"
          />
        </div>

        {agentId && (
          <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
            {error ? (
              <p className="text-red-600 font-semibold">Agent not found</p>
            ) : isLoading ? (
              <p className="text-gray-700 font-medium">Loading...</p>
            ) : (
              <div className="flex flex-col">
                <span className="text-gray-700 font-medium mb-2">Token URI:</span>
                <span className="font-mono text-sm break-all text-gray-900">
                  {tokenURI?.toString() || "No URI set"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

