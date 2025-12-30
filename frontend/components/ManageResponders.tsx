"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { isAddress } from "viem";

export function ManageResponders() {
  // State for checking responder status
  const [checkAddress, setCheckAddress] = useState<string>("");

  // State for adding responder
  const [addAddress, setAddAddress] = useState<string>("");

  // State for removing responder
  const [removeAddress, setRemoveAddress] = useState<string>("");

  const { address } = useAccount();

  // Check if an address is an authorized responder
  const { data: isAuthorized, error: checkError } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "isResponder",
    args: checkAddress && isAddress(checkAddress) ? [checkAddress as `0x${string}`] : undefined,
  });

  // Check if connected user is the contract owner
  const { data: contractOwner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "owner",
  });

  const isOwner = address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase();

  // Add responder hooks
  const { data: addHash, writeContract: addResponder, isPending: isAddPending, error: addError } = useWriteContract();
  const { isLoading: isAddConfirming, isSuccess: isAddSuccess } = useWaitForTransactionReceipt({
    hash: addHash,
  });

  // Remove responder hooks
  const { data: removeHash, writeContract: removeResponder, isPending: isRemovePending, error: removeError } = useWriteContract();
  const { isLoading: isRemoveConfirming, isSuccess: isRemoveSuccess } = useWaitForTransactionReceipt({
    hash: removeHash,
  });

  const handleAddResponder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAddress(addAddress)) {
      alert("Invalid Ethereum address");
      return;
    }

    addResponder({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: "addResponder",
      args: [addAddress as `0x${string}`],
    });
  };

  const handleRemoveResponder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAddress(removeAddress)) {
      alert("Invalid Ethereum address");
      return;
    }

    removeResponder({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      functionName: "removeResponder",
      args: [removeAddress as `0x${string}`],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-500">Manage Responders</h2>
        {!isOwner && address && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-3 py-1 rounded-full font-bold text-xs flex items-center gap-2">
            <span>⚠️</span> View Only (Not Owner)
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Check Responder Status */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-6 h-full border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
            Check Status
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="checkAddress" className="block text-sm font-semibold text-gray-300 mb-2">
                Address
              </label>
              <input
                id="checkAddress"
                type="text"
                value={checkAddress}
                onChange={(e) => setCheckAddress(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                placeholder="0x..."
              />
            </div>

            {checkAddress && isAddress(checkAddress) && (
              <div className={`px-4 py-3 rounded-xl font-semibold text-sm border flex items-center gap-2 ${isAuthorized
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-gray-500/10 border-gray-500/30 text-gray-400"
                }`}>
                <span>{isAuthorized ? "✓" : "✗"}</span>
                {isAuthorized ? "Authorized" : "Not Authorized"}
              </div>
            )}

            {checkAddress && !isAddress(checkAddress) && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold text-sm">
                Invalid Address
              </div>
            )}

            {checkError && (
              <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold text-sm break-words">
                Error: {checkError.message}
              </div>
            )}
          </div>
        </div>

        {/* Add Responder */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-6 h-full border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="w-1.5 h-6 bg-green-500 rounded-full"></span>
            Add Responder
          </h3>
          <form onSubmit={handleAddResponder} className="space-y-4">
            <div>
              <label htmlFor="addAddress" className="block text-sm font-semibold text-gray-300 mb-2">
                Responder Address
              </label>
              <input
                id="addAddress"
                type="text"
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent transition-all"
                placeholder="0x..."
                required
              />
            </div>

            <button
              type="submit"
              disabled={isAddPending || isAddConfirming || !addAddress || !isAddress(addAddress)}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-6 rounded-xl hover:from-green-500 hover:to-emerald-500 active:from-green-700 active:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg shadow-green-500/20 transition-all transform hover:-translate-y-0.5"
            >
              {isAddPending ? "Confirming..." : isAddConfirming ? "Adding..." : "Add Access"}
            </button>

            {addHash && (
              <div className="text-xs bg-black/30 p-3 rounded-lg border border-white/10 mt-4">
                <p className="text-gray-500 mb-1 uppercase tracking-wider text-[10px]">Tx Hash</p>
                <p className="font-mono break-all text-secondary">{addHash}</p>
              </div>
            )}

            {isAddSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
                <span>✅</span> Added!
              </div>
            )}

            {addError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold text-sm break-words">
                {addError.message.includes("OwnableUnauthorizedAccount")
                  ? "Only owner can add"
                  : `Error`}
              </div>
            )}
          </form>
        </div>

        {/* Remove Responder */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-6 h-full border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="w-1.5 h-6 bg-red-500 rounded-full"></span>
            Remove Responder
          </h3>
          <form onSubmit={handleRemoveResponder} className="space-y-4">
            <div>
              <label htmlFor="removeAddress" className="block text-sm font-semibold text-gray-300 mb-2">
                Responder Address
              </label>
              <input
                id="removeAddress"
                type="text"
                value={removeAddress}
                onChange={(e) => setRemoveAddress(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent transition-all"
                placeholder="0x..."
                required
              />
            </div>

            <button
              type="submit"
              disabled={isRemovePending || isRemoveConfirming || !removeAddress || !isAddress(removeAddress)}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white py-3 px-6 rounded-xl hover:from-red-500 hover:to-rose-500 active:from-red-700 active:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg shadow-red-500/20 transition-all transform hover:-translate-y-0.5"
            >
              {isRemovePending ? "Confirming..." : isRemoveConfirming ? "Removing..." : "Remove Access"}
            </button>

            {removeHash && (
              <div className="text-xs bg-black/30 p-3 rounded-lg border border-white/10 mt-4">
                <p className="text-gray-500 mb-1 uppercase tracking-wider text-[10px]">Tx Hash</p>
                <p className="font-mono break-all text-secondary">{removeHash}</p>
              </div>
            )}

            {isRemoveSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
                <span>✅</span> Removed!
              </div>
            )}

            {removeError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold text-sm break-words">
                {removeError.message.includes("OwnableUnauthorizedAccount")
                  ? "Only owner can remove"
                  : `Error`}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
