"use client";

import { AgentData } from "@/lib/agents-context";
import Link from "next/link";

export function AgentCard({ agent }: { agent: AgentData }) {
    const { id, metadata } = agent;

    return (
        <Link href={`/agent/${id}`} className="block">
            <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group active:scale-[0.99]">
                <div className="flex items-center gap-6">
                    {/* Image */}
                    <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                        {metadata?.image ? (
                            <img src={metadata.image} alt={metadata.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-2xl opacity-50">🤖</span>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">

                        {/* Name & ID */}
                        <div className="md:col-span-3">
                            <h3 className="font-bold text-white truncate group-hover:text-primary transition-colors text-lg">
                                {metadata?.name || `Agent #${id}`}
                            </h3>
                            <span className="text-xs font-mono text-gray-500 bg-black/30 px-2 py-0.5 rounded inline-block mt-1">
                                #{id}
                            </span>
                        </div>

                        {/* Methods */}
                        <div className="md:col-span-4">
                            {metadata?.abi && metadata.abi.filter(item => item.type === 'function').length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {metadata.abi.filter(item => item.type === 'function').slice(0, 3).map((m) => (
                                        <span key={m.name} className="text-[10px] px-2 py-1 rounded bg-secondary/10 text-secondary border border-secondary/20 whitespace-nowrap font-mono">
                                            {m.name}
                                        </span>
                                    ))}
                                    {metadata.abi.filter(item => item.type === 'function').length > 3 && (
                                        <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-500 font-mono">
                                            +{metadata.abi.filter(item => item.type === 'function').length - 3}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div className="md:col-span-5">
                            <p className="text-sm text-gray-400 line-clamp-2">
                                {metadata?.description || "No description available"}
                            </p>
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </div>
                </div>
            </div>
        </Link>
    );
}
