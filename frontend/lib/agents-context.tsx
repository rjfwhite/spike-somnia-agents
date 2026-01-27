"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, Agent } from "./contract";
import { TokenMetadata } from "./types";

export interface AgentData {
    id: string;
    owner: string;
    tokenURI: string;
    containerImageUri: string;
    metadata: TokenMetadata | null;
    price: bigint;
}

interface AgentsContextType {
    agents: Record<string, AgentData>;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const AgentsContext = createContext<AgentsContextType | undefined>(undefined);

export function AgentsProvider({ children }: { children: ReactNode }) {
    const [agents, setAgents] = useState<Record<string, AgentData>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const publicClient = usePublicClient();

    const fetchAllAgents = async () => {
        if (!publicClient) return;

        try {
            setLoading(true);
            setError(null);

            const newAgents: Record<string, AgentData> = {};

            // Use getAllAgents() to get all agent IDs from the ERC721 Enumerable contract
            let agentIds: bigint[] = [];
            try {
                agentIds = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: SOMNIA_AGENTS_ABI,
                    functionName: 'getAllAgents',
                }) as bigint[];
            } catch (err) {
                console.error("getAllAgents call failed, falling back to totalSupply enumeration:", err);
                // Fallback: try to enumerate using totalSupply and tokenByIndex
                try {
                    const totalSupply = await publicClient.readContract({
                        address: CONTRACT_ADDRESS,
                        abi: SOMNIA_AGENTS_ABI,
                        functionName: 'totalSupply',
                    }) as bigint;

                    for (let i = BigInt(0); i < totalSupply; i++) {
                        const tokenId = await publicClient.readContract({
                            address: CONTRACT_ADDRESS,
                            abi: SOMNIA_AGENTS_ABI,
                            functionName: 'tokenByIndex',
                            args: [i],
                        }) as bigint;
                        agentIds.push(tokenId);
                    }
                } catch (enumErr) {
                    console.error("Enumeration fallback failed:", enumErr);
                }
            }

            // Fetch details for each agent
            const agentPromises = agentIds.map(async (agentId) => {
                try {
                    // Use getAgent to get full agent details including owner
                    const agent = await publicClient.readContract({
                        address: CONTRACT_ADDRESS,
                        abi: SOMNIA_AGENTS_ABI,
                        functionName: 'getAgent',
                        args: [agentId]
                    }) as Agent;

                    // Fetch Metadata
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
                        owner: agent.owner,
                        tokenURI: agent.metadataUri,
                        containerImageUri: agent.containerImageUri,
                        price: agent.cost,
                        metadata
                    };
                } catch (err) {
                    console.error(`Failed to fetch agent ${agentId}:`, err);
                    return null;
                }
            });

            const agentsData = await Promise.all(agentPromises);

            agentsData.forEach(agent => {
                if (agent) {
                    newAgents[agent.id] = agent;
                }
            });

            setAgents(newAgents);

        } catch (err: unknown) {
            console.error("Failed to fetch agents:", err);
            const message = err instanceof Error ? err.message : "Failed to load agents";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch on mount
    useEffect(() => {
        fetchAllAgents();
    }, [publicClient]);

    return (
        <AgentsContext.Provider value={{ agents, loading, error, refresh: fetchAllAgents }}>
            {children}
        </AgentsContext.Provider>
    );
}

export function useAgents() {
    const context = useContext(AgentsContext);
    if (context === undefined) {
        throw new Error("useAgents must be used within an AgentsProvider");
    }
    return context;
}
