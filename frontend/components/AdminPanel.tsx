"use client";

import { useState } from "react";
import { createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, SOMNIA_RPC_URL, SOMNIA_CHAIN_ID } from "@/lib/contract";

// WARNING: This is extremely insecure - private key exposed in frontend
// Only use for testnet/development purposes
const OWNER_PRIVATE_KEY = "0x93816d6fbb0ae93839d852aae7d822dd0989d2526b5feb53d59b48669201f30a" as const;

// Define Somnia testnet chain
const somniaTestnet = {
    id: SOMNIA_CHAIN_ID,
    name: "Somnia Testnet",
    nativeCurrency: {
        name: "STT",
        symbol: "STT",
        decimals: 18,
    },
    rpcUrls: {
        default: { http: [SOMNIA_RPC_URL] },
    },
} as const;

export function AdminPanel() {
    const [agentId, setAgentId] = useState("");
    const [metadataUri, setMetadataUri] = useState("");
    const [containerImageUri, setContainerImageUri] = useState("");
    const [cost, setCost] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; hash?: string } | null>(null);

    const account = privateKeyToAccount(OWNER_PRIVATE_KEY);

    const walletClient = createWalletClient({
        account,
        chain: somniaTestnet,
        transport: http(SOMNIA_RPC_URL),
    });

    const handleSetAgentDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResult(null);

        try {
            const costInWei = cost ? parseEther(cost) : BigInt(0);

            const hash = await walletClient.writeContract({
                address: CONTRACT_ADDRESS,
                abi: SOMNIA_AGENTS_ABI,
                functionName: "setAgentDetails",
                args: [BigInt(agentId), metadataUri, containerImageUri, costInWei],
            });

            setResult({
                success: true,
                message: `Agent details updated successfully!`,
                hash,
            });
        } catch (error: unknown) {
            console.error("Failed to set agent details:", error);
            setResult({
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Security Warning */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl">!</span>
                    <div>
                        <h3 className="text-red-400 font-bold text-sm">Security Warning</h3>
                        <p className="text-red-300/80 text-xs mt-1">
                            This admin panel uses an embedded private key. Only use on testnet for development purposes.
                            Never use this pattern in production.
                        </p>
                    </div>
                </div>
            </div>

            {/* Owner Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Owner Account</h3>
                <p className="font-mono text-sm text-blue-400 break-all">{account.address}</p>
            </div>

            {/* Set Agent Details Form */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                <h2 className="text-lg font-bold text-white mb-4">Set Agent Details</h2>
                <p className="text-gray-400 text-sm mb-6">
                    Configure an agent with metadata URI, container image URI, and invocation cost.
                </p>

                <form onSubmit={handleSetAgentDetails} className="space-y-4">
                    <div>
                        <label htmlFor="agentId" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Agent ID
                        </label>
                        <input
                            id="agentId"
                            type="text"
                            value={agentId}
                            onChange={(e) => setAgentId(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                            placeholder="1"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="metadataUri" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Metadata URI
                        </label>
                        <input
                            id="metadataUri"
                            type="text"
                            value={metadataUri}
                            onChange={(e) => setMetadataUri(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            placeholder="https://example.com/agent-metadata.json"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">URL to the agent metadata JSON</p>
                    </div>

                    <div>
                        <label htmlFor="containerImageUri" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Container Image URI
                        </label>
                        <input
                            id="containerImageUri"
                            type="text"
                            value={containerImageUri}
                            onChange={(e) => setContainerImageUri(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            placeholder="https://agent-host.example.com"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">URL to the agent container/service endpoint</p>
                    </div>

                    <div>
                        <label htmlFor="cost" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Cost (STT)
                        </label>
                        <input
                            id="cost"
                            type="text"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                            placeholder="0.001"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Cost in STT tokens to invoke this agent</p>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg"
                    >
                        {isLoading ? "Updating..." : "Set Agent Details"}
                    </button>
                </form>

                {result && (
                    <div className={`mt-4 p-4 rounded-lg border ${result.success
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                        }`}>
                        <p className={`text-sm font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                            {result.success ? 'Success!' : 'Error'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{result.message}</p>
                        {result.hash && (
                            <p className="text-xs text-gray-500 mt-2 font-mono break-all">
                                Tx: {result.hash}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contract Address</h3>
                <p className="font-mono text-sm text-green-400 break-all">{CONTRACT_ADDRESS}</p>
                <p className="text-xs text-gray-500 mt-2">Chain ID: {SOMNIA_CHAIN_ID}</p>
            </div>
        </div>
    );
}
