"use client";

import { TokenMetadata } from "@/lib/types";
import Link from "next/link";
import { Settings, ExternalLink } from "lucide-react";

interface AgentCardProps {
    id: string;
    metadata: TokenMetadata | null;
    owner?: string;
    cost?: bigint;
    showActions?: boolean;
}

export function AgentCard({ id, metadata, owner, cost, showActions }: AgentCardProps) {
    const formatAddress = (addr: string) => {
        if (!addr) return "";
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const formatCost = (cost: bigint) => {
        const costInEth = Number(cost) / 1e18;
        return costInEth.toFixed(4);
    };

    const functions = metadata?.abi?.filter(item => item.type === 'function') || [];

    const content = (
        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group active:scale-[0.99]">
            <div className="flex items-start gap-4">
                {/* Image */}
                <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                    {metadata?.image ? (
                        <img src={metadata.image} alt={metadata.name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xl opacity-50">🤖</span>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-white group-hover:text-primary transition-colors">
                            {metadata?.name || `Agent #${id}`}
                        </h3>
                        <span className="text-xs font-mono text-gray-500 bg-black/30 px-1.5 py-0.5 rounded">
                            #{id}
                        </span>
                        {owner && (
                            <span className="text-xs font-mono text-purple-400/60" title={owner}>
                                {formatAddress(owner)}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    {metadata?.description && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-1">
                            {metadata.description}
                        </p>
                    )}

                    {/* Methods & Cost row */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {functions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {functions.slice(0, 4).map((m) => (
                                    <span key={m.name} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 font-mono">
                                        {m.name}
                                    </span>
                                ))}
                                {functions.length > 4 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 font-mono">
                                        +{functions.length - 4}
                                    </span>
                                )}
                            </div>
                        )}
                        {cost !== undefined && (
                            <span className="text-xs text-gray-500">
                                {formatCost(cost)} STT
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions or Arrow */}
                {showActions ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                            href={`/agent/${id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View
                        </Link>
                        <Link
                            href={`/agent/${id}/manage`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 rounded-lg transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Manage
                        </Link>
                    </div>
                ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Link href={`/agent/${id}`} className="block">
            {content}
        </Link>
    );
}
