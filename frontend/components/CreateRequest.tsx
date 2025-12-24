"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { formatEther } from "viem";

export function CreateRequest() {
  const [agentId, setAgentId] = useState<string>("1");
  const [method, setMethod] = useState<string>("");
  const [callData, setCallData] = useState<string>("");
  
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Read agent price
  const { data: price } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "agentPrice",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a random request ID
    const requestId = BigInt(Math.floor(Math.random() * 1000000000));
    
    // Encode the call data as bytes (you can modify this based on your needs)
    const encodedCallData = callData.startsWith("0x") 
      ? callData as `0x${string}`
      : `0x${Buffer.from(callData).toString("hex")}` as `0x${string}`;

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: "createRequest",
      args: [requestId, BigInt(agentId), method, encodedCallData],
      value: price || BigInt(0),
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4 border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900">Create Agent Request</h2>
      
      <form onSubmit={handleCreateRequest} className="space-y-4">
        <div>
          <label htmlFor="requestAgentId" className="block text-sm font-semibold text-gray-900 mb-2">
            Agent ID
          </label>
          <input
            id="requestAgentId"
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="1"
            min="1"
            required
          />
          {price !== undefined && (
            <p className="text-sm text-gray-700 font-medium mt-2">
              Agent Price: <span className="text-gray-900 font-semibold">{formatEther(price)} STT</span>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="method" className="block text-sm font-semibold text-gray-900 mb-2">
            Method
          </label>
          <input
            id="method"
            type="text"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="e.g., generateImage, analyzeText"
            required
          />
        </div>

        <div>
          <label htmlFor="callData" className="block text-sm font-semibold text-gray-900 mb-2">
            Call Data (plain text or hex)
          </label>
          <textarea
            id="callData"
            value={callData}
            onChange={(e) => setCallData(e.target.value)}
            className="w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Enter request parameters"
            rows={3}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isPending || isConfirming || !agentId || !method || !callData}
          className="w-full bg-purple-600 text-white py-2.5 px-4 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {isPending ? "Confirming..." : isConfirming ? "Creating..." : "Create Request"}
        </button>

        {hash && (
          <div className="text-sm bg-purple-50 p-3 rounded-md border border-purple-200">
            <p className="text-gray-900 font-semibold mb-1">Transaction Hash:</p>
            <p className="font-mono text-xs break-all text-gray-900">{hash}</p>
          </div>
        )}

        {isSuccess && (
          <div className="bg-green-100 border border-green-400 text-green-800 px-4 py-3 rounded font-semibold">
            Request created successfully!
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-3 rounded font-semibold">
            Error: {error.message}
          </div>
        )}
      </form>
    </div>
  );
}

