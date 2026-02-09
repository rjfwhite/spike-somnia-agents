"use client";

import { useAgents } from "@/lib/agents-context";
import { AgentCard } from "@/components/AgentCard";

export function AgentList() {
    const { agents, loading } = useAgents();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-gray-400 animate-pulse">Loading agents...</div>
            </div>
        );
    }

    const agentList = Object.values(agents);
    const count = agentList.length;

    if (count === 0) {
        return (
            <div className="text-center py-12 text-gray-500 glass-panel rounded-xl">
                <p>No agents found on network.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">All Agents ({count})</h3>
            </div>

            <div className="flex flex-col gap-4">
                {agentList.map((agent) => (
                    <AgentCard
                        key={agent.id}
                        id={agent.id}
                        metadata={agent.metadata}
                        owner={agent.owner}
                        cost={undefined}
                    />
                ))}
            </div>
        </div>
    );
}
