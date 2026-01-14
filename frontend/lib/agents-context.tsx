"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "./contract";
import { TokenMetadata } from "./types";

export interface AgentData {
    id: string;
    tokenURI: string;
    metadata: TokenMetadata | null;
    price: bigint;
    owner: string;
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

    // 1. Get Max Agent ID
    const { data: maxIdData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: "getMaxAgentId",
    });

    const fetchAllAgents = async () => {
        if (!publicClient || maxIdData === undefined) return;

        try {
            setLoading(true);
            setError(null);

            const maxId = Number(maxIdData);
            const newAgents: Record<string, AgentData> = {};

            // If no agents, just return
            if (maxId === 0) {
                setAgents({});
                setLoading(false);
                return;
            }

            // 2. Fetch data parallelly without Multicall
            const agentPromises = [];
            for (let i = 1; i <= maxId; i++) {
                const id = BigInt(i);
                agentPromises.push((async () => {
                    try {
                        const [uri, price, owner] = await Promise.all([
                            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: SOMNIA_AGENTS_ABI, functionName: 'tokenURI', args: [id] }),
                            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: SOMNIA_AGENTS_ABI, functionName: 'agentPrice', args: [id] }),
                            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: SOMNIA_AGENTS_ABI, functionName: 'ownerOf', args: [id] })
                        ]);

                        const uriString = uri as string;

                        // Fetch Metadata
                        let metadata = null;
                        if (uriString && (uriString.startsWith('http://') || uriString.startsWith('https://'))) {
                            try {
                                const res = await fetch(uriString);
                                if (res.ok) {
                                    metadata = await res.json();
                                }
                            } catch (e) {
                                console.error(`Failed to fetch metadata for ${id}`, e);
                            }
                        }

                        return {
                            id: id.toString(),
                            tokenURI: uriString,
                            price: price as bigint,
                            owner: owner as string,
                            metadata
                        };
                    } catch (err) {
                        console.error(`Failed to fetch chain data for agent ${id}`, err);
                        return null;
                    }
                })());
            }

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

    // Initial fetch when maxId is available
    useEffect(() => {
        if (maxIdData !== undefined) {
            fetchAllAgents();
        }
    }, [maxIdData]);

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
