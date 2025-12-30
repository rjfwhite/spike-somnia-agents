"use client";

import { AgentData } from "@/lib/agents-context";
import Link from "next/link";

export function AgentCard({ agent }: { agent: AgentData }) {
    const { id, metadata } = agent;

    return (
        <Link href={`/agent/${id}`} className="block">
            <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group active:scale-98 h-full flex flex-col">
                <div className="flex items-start gap-4">
                    {/* Image / Placeholder */}
                    <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                        {metadata?.image ? (
                            <img src={metadata.image} alt={metadata.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-2xl opacity-50">🤖</span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-bold text-white truncate group-hover:text-primary transition-colors">
                                {metadata?.name || `Agent #${id}`}
                            </h3>
                            <span className="text-xs font-mono text-gray-500 bg-black/30 px-2 py-0.5 rounded">
                                #{id}
                            </span>
                        </div>

                        <p className="text-xs text-gray-400 line-clamp-2">
                            {metadata?.description || "No description available"}
                        </p>

                        {(metadata?.agent_spec?.methods || metadata?.methods) && (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                {(metadata?.agent_spec?.methods || metadata?.methods)?.slice(0, 3).map((m: any) => (
                                    <span key={m.name} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 whitespace-nowrap">
                                        {m.name}
                                    </span>
                                ))}
                                {((metadata?.agent_spec?.methods || metadata?.methods)?.length ?? 0) > 3 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                                        +{(metadata?.agent_spec?.methods || metadata?.methods)?.length! - 3}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}
