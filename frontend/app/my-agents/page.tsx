"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { SOMNIA_AGENTS_ABI, Agent } from "@/lib/contract";
import { useNetwork } from "@/lib/network-context";
import { TokenMetadata } from "@/lib/types";
import Link from "next/link";
import { Plus, Loader2, Wallet } from "lucide-react";
import { AgentCard } from "@/components/AgentCard";

interface MyAgentData {
    id: string;
    metadataUri: string;
    containerImageUri: string;
    metadata: TokenMetadata | null;
}

export default function MyAgentsPage() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const { currentNetwork } = useNetwork();
    const CONTRACT_ADDRESS = currentNetwork.contracts.legacyContract;
    const [agents, setAgents] = useState<MyAgentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Get agent IDs owned by connected address
    const { data: agentIds, isLoading: isLoadingIds, error: idsError } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: "getAgentsByOwner",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    // Fetch agent details and metadata
    useEffect(() => {
        if (!publicClient || !agentIds || (agentIds as bigint[]).length === 0) {
            setAgents([]);
            setLoading(false);
            return;
        }

        const fetchAgentDetails = async () => {
            setLoading(true);
            setError(null);

            try {
                const agentPromises = (agentIds as bigint[]).map(async (agentId) => {
                    const agent = await publicClient.readContract({
                        address: CONTRACT_ADDRESS,
                        abi: SOMNIA_AGENTS_ABI,
                        functionName: "getAgent",
                        args: [agentId],
                    }) as Agent;

                    // Fetch metadata
                    let metadata = null;
                    if (agent.metadataUri && (agent.metadataUri.startsWith('http://') || agent.metadataUri.startsWith('https://'))) {
                        try {
                            const res = await fetch(agent.metadataUri);
                            if (res.ok) {
                                metadata = await res.json();
                            }
                        } catch (e) {
                            console.error(`Failed to fetch metadata for agent ${agentId}`, e);
                        }
                    }

                    return {
                        id: agentId.toString(),
                        metadataUri: agent.metadataUri,
                        containerImageUri: agent.containerImageUri,
                        metadata,
                    };
                });

                const agentsData = await Promise.all(agentPromises);
                setAgents(agentsData);
            } catch (err) {
                console.error("Failed to fetch agent details:", err);
                setError(err instanceof Error ? err.message : "Failed to load agents");
            } finally {
                setLoading(false);
            }
        };

        fetchAgentDetails();
    }, [publicClient, agentIds]);

    if (!isConnected) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">My Agents</h1>
                    <p className="text-gray-400 mt-2">Manage your registered agents</p>
                </div>

                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center">
                            <Wallet className="w-8 h-8 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Connect Your Wallet</h3>
                        <p className="text-gray-400 text-sm max-w-md mx-auto">
                            Connect your wallet to view and manage agents you own. Any agents registered to your address will appear here.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">My Agents</h1>
                    <p className="text-gray-400 mt-2">Manage your registered agents</p>
                </div>
                <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Create Agent
                </Link>
            </div>

            {/* Connected Address */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Connected Address</h3>
                <p className="font-mono text-sm text-blue-400 break-all">{address}</p>
            </div>

            {/* Loading State */}
            {(isLoadingIds || loading) && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="flex items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-gray-400">Loading your agents...</span>
                    </div>
                </div>
            )}

            {/* Error State */}
            {(idsError || error) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <p className="text-red-400 text-sm">{idsError?.message || error}</p>
                </div>
            )}

            {/* No Agents */}
            {!isLoadingIds && !loading && agents.length === 0 && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-gray-500/10 rounded-full flex items-center justify-center">
                            <Plus className="w-8 h-8 text-gray-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">No Agents Yet</h3>
                        <p className="text-gray-400 text-sm max-w-md mx-auto">
                            You haven&apos;t created any agents yet. Create your first agent to get started.
                        </p>
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create Your First Agent
                        </Link>
                    </div>
                </div>
            )}

            {/* Agent List */}
            {!isLoadingIds && !loading && agents.length > 0 && (
                <div className="flex flex-col gap-4">
                    {agents.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            id={agent.id}
                            metadata={agent.metadata}
                            cost={undefined}
                            showActions
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
