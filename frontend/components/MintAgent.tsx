"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";

export function MintAgent() {
  const [recipient, setRecipient] = useState<string>("");
  const [metadataUri, setMetadataUri] = useState<string>("");
  const { address } = useAccount();
  
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const targetAddress = recipient || address;
    if (!targetAddress) {
      alert("Please connect wallet or specify recipient address");
      return;
    }

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: "mintAgent",
      args: [targetAddress as `0x${string}`, metadataUri],
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4 border border-gray-200">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Mint New Agent</h2>
      
      <form onSubmit={handleMint} className="space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="recipient" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
            Recipient Address <span className="font-normal text-gray-600">(optional)</span>
          </label>
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0x... (defaults to your address)"
          />
        </div>

        <div>
          <label htmlFor="uri" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
            Metadata URI
          </label>
          <input
            id="uri"
            type="text"
            value={metadataUri}
            onChange={(e) => setMetadataUri(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="ipfs://... or https://..."
            required
          />
        </div>

        <button
          type="submit"
          disabled={isPending || isConfirming || !metadataUri}
          className="w-full bg-blue-600 text-white py-3 sm:py-2.5 px-4 rounded-md hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors text-base sm:text-sm min-h-[48px] sm:min-h-0"
        >
          {isPending ? "Confirming..." : isConfirming ? "Minting..." : "Mint Agent"}
        </button>

        {hash && (
          <div className="text-sm bg-blue-50 p-3 rounded-md border border-blue-200">
            <p className="text-gray-900 font-semibold mb-1">Transaction Hash:</p>
            <p className="font-mono text-xs break-all text-gray-900">{hash}</p>
          </div>
        )}

        {isSuccess && (
          <div className="bg-green-100 border border-green-400 text-green-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
            Agent minted successfully!
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm break-words">
            Error: {error.message}
          </div>
        )}
      </form>
    </div>
  );
}

