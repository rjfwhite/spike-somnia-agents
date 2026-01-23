"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "./contract";
import { TokenMetadata } from "./types";

// Maximum agent ID to scan (since there's no getMaxAgentId in the new contract)
const MAX_AGENT_ID_TO_SCAN = 100;

export interface AgentData {
    id: string;
    tokenURI: string;
    containerImageUri: string;
    metadata: TokenMetadata | null;
    price: bigint;
    exists: boolean;
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

            // Scan agent IDs from 0 to MAX_AGENT_ID_TO_SCAN
            // The new contract uses agentDetails(uint256) which returns (metadataUri, containerImageUri, cost, exists)
            const agentPromises = [];
            for (let i = 0; i <= MAX_AGENT_ID_TO_SCAN; i++) {
                const id = BigInt(i);
                agentPromises.push((async () => {
                    try {
                        // Read agent details from contract
                        const details = await publicClient.readContract({
                            address: CONTRACT_ADDRESS,
                            abi: SOMNIA_AGENTS_ABI,
                            functionName: 'agentDetails',
                            args: [id]
                        }) as [string, string, bigint, boolean];

                        const [metadataUri, containerImageUri, cost, exists] = details;

                        // Skip if agent doesn't exist
                        if (!exists) {
                            return null;
                        }

                        // Fetch Metadata
                        let metadata = null;
                        if (metadataUri && (metadataUri.startsWith('http://') || metadataUri.startsWith('https://'))) {
                            try {
                                const res = await fetch(metadataUri);
                                if (res.ok) {
                                    metadata = await res.json();
                                }
                            } catch (e) {
                                console.error(`Failed to fetch metadata for agent ${id}`, e);
                            }
                        }

                        return {
                            id: id.toString(),
                            tokenURI: metadataUri,
                            containerImageUri,
                            price: cost,
                            exists,
                            metadata
                        };
                    } catch (err) {
                        // Agent doesn't exist or contract call failed
                        return null;
                    }
                })());
            }

            const agentsData = await Promise.all(agentPromises);

            agentsData.forEach(agent => {
                if (agent && agent.exists) {
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
