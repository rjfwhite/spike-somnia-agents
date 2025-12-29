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
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-4 sm:space-y-5 border border-gray-200">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Authorized Responders</h2>

      {/* Owner warning */}
      {!isOwner && address && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
          Note: Only the contract owner can manage responders
        </div>
      )}

      {/* Check Responder Status */}
      <div className="space-y-3 sm:space-y-4 border-b border-gray-200 pb-4">
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Check Responder Status</h3>
        <div>
          <label htmlFor="checkAddress" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
            Responder Address
          </label>
          <input
            id="checkAddress"
            type="text"
            value={checkAddress}
            onChange={(e) => setCheckAddress(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="0x..."
          />
        </div>

        {checkAddress && isAddress(checkAddress) && (
          <div className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm ${
            isAuthorized
              ? "bg-green-100 border border-green-400 text-green-800"
              : "bg-gray-100 border border-gray-400 text-gray-800"
          }`}>
            Status: {isAuthorized ? "✓ Authorized Responder" : "✗ Not Authorized"}
          </div>
        )}

        {checkAddress && !isAddress(checkAddress) && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
            Invalid Ethereum address format
          </div>
        )}

        {checkError && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm break-words">
            Error: {checkError.message}
          </div>
        )}
      </div>

      {/* Add Responder */}
      <div className="space-y-3 sm:space-y-4 border-b border-gray-200 pb-4">
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Add Responder</h3>
        <form onSubmit={handleAddResponder} className="space-y-3 sm:space-y-4">
          <div>
            <label htmlFor="addAddress" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
              Responder Address
            </label>
            <input
              id="addAddress"
              type="text"
              value={addAddress}
              onChange={(e) => setAddAddress(e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="0x..."
              required
            />
          </div>

          <button
            type="submit"
            disabled={isAddPending || isAddConfirming || !addAddress || !isAddress(addAddress)}
            className="w-full bg-green-600 text-white py-3 sm:py-2.5 px-4 rounded-md hover:bg-green-700 active:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors text-base sm:text-sm min-h-[48px] sm:min-h-0"
          >
            {isAddPending ? "Confirming..." : isAddConfirming ? "Adding..." : "Add Responder"}
          </button>

          {addHash && (
            <div className="text-sm bg-blue-50 p-3 rounded-md border border-blue-200">
              <p className="text-gray-900 font-semibold mb-1">Transaction Hash:</p>
              <p className="font-mono text-xs break-all text-gray-900">{addHash}</p>
            </div>
          )}

          {isAddSuccess && (
            <div className="bg-green-100 border border-green-400 text-green-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
              Responder added successfully!
            </div>
          )}

          {addError && (
            <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm break-words">
              {addError.message.includes("OwnableUnauthorizedAccount")
                ? "Only the contract owner can add responders"
                : `Error: ${addError.message}`}
            </div>
          )}
        </form>
      </div>

      {/* Remove Responder */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Remove Responder</h3>
        <form onSubmit={handleRemoveResponder} className="space-y-3 sm:space-y-4">
          <div>
            <label htmlFor="removeAddress" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
              Responder Address
            </label>
            <input
              id="removeAddress"
              type="text"
              value={removeAddress}
              onChange={(e) => setRemoveAddress(e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="0x..."
              required
            />
          </div>

          <button
            type="submit"
            disabled={isRemovePending || isRemoveConfirming || !removeAddress || !isAddress(removeAddress)}
            className="w-full bg-red-600 text-white py-3 sm:py-2.5 px-4 rounded-md hover:bg-red-700 active:bg-red-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors text-base sm:text-sm min-h-[48px] sm:min-h-0"
          >
            {isRemovePending ? "Confirming..." : isRemoveConfirming ? "Removing..." : "Remove Responder"}
          </button>

          {removeHash && (
            <div className="text-sm bg-blue-50 p-3 rounded-md border border-blue-200">
              <p className="text-gray-900 font-semibold mb-1">Transaction Hash:</p>
              <p className="font-mono text-xs break-all text-gray-900">{removeHash}</p>
            </div>
          )}

          {isRemoveSuccess && (
            <div className="bg-green-100 border border-green-400 text-green-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm">
              Responder removed successfully!
            </div>
          )}

          {removeError && (
            <div className="bg-red-100 border border-red-400 text-red-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded font-semibold text-sm break-words">
              {removeError.message.includes("OwnableUnauthorizedAccount")
                ? "Only the contract owner can remove responders"
                : `Error: ${removeError.message}`}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
