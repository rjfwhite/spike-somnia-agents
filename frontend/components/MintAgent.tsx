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
    <div className="glass-panel rounded-xl shadow-xl p-8 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Mint New Agent</h2>

      <form onSubmit={handleMint} className="space-y-6">
        <div>
          <label htmlFor="recipient" className="block text-sm font-semibold text-gray-300 mb-2">
            Recipient Address <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-transparent transition-all"
            placeholder="0x... (defaults to your address)"
          />
        </div>

        <div>
          <label htmlFor="uri" className="block text-sm font-semibold text-gray-300 mb-2">
            Metadata URI
          </label>
          <div className="relative">
            <input
              id="uri"
              type="text"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-transparent transition-all pl-10"
              placeholder="ipfs://... or https://..."
              required
            />
            <div className="absolute left-3 top-3.5 text-gray-500">
              🔗
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || isConfirming || !metadataUri}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 px-6 rounded-xl hover:from-blue-500 hover:to-cyan-500 active:from-blue-700 active:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5"
        >
          {isPending ? "Confirming..." : isConfirming ? "Minting..." : "Mint Agent"}
        </button>

        {hash && (
          <div className="text-sm bg-black/30 p-4 rounded-xl border border-white/10 mt-4">
            <p className="text-gray-400 font-semibold mb-1 uppercase tracking-wider text-xs">Transaction Hash</p>
            <p className="font-mono text-xs break-all text-secondary">{hash}</p>
          </div>
        )}

        {isSuccess && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
            <span>✅</span> Agent minted successfully!
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold text-sm break-words flex items-center gap-2">
            <span>⚠️</span> Error: {error.message}
          </div>
        )}
      </form>
    </div>
  );
}

