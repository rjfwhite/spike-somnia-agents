"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createPublicClient, http } from "viem";
import { ReceiptViewer, RequestDisplay } from "@/components/ReceiptViewer";
import { fetchReceipts } from "@/lib/receipts";
import {
    AGENT_REGISTRY_V2_ADDRESS,
    AGENT_REGISTRY_V2_ABI,
    SOMNIA_RPC_URL,
    Agent
} from "@/lib/contract";
import { Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function ReceiptPage() {
    const params = useParams();
    const requestId = params.id as string;

    const [receipts, setReceipts] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Agent resolution state
    const [agentId, setAgentId] = useState<string | null>(null);
    const [agent, setAgent] = useState<Agent | null>(null);
    const [metadata, setMetadata] = useState<any | null>(null);
    const [agentLoading, setAgentLoading] = useState(false);

    useEffect(() => {
        if (!requestId) return;

        async function loadReceipts() {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchReceipts(requestId);
                setReceipts(data);
                if (data.length === 0) {
                    setError("No receipts found for this request ID");
                } else {
                    // Check if any receipt has an agentId
                    const receiptWithAgent = data.find(r => r.agentId);
                    if (receiptWithAgent?.agentId) {
                        setAgentId(receiptWithAgent.agentId);
                    }
                }
            } catch (err: any) {
                setError(err.message || "Failed to fetch receipts");
            } finally {
                setLoading(false);
            }
        }

        loadReceipts();
    }, [requestId]);

    // Fetch agent data when agentId is available
    useEffect(() => {
        if (!agentId) return;
        const currentAgentId = agentId;

        async function loadAgent() {
            setAgentLoading(true);

            try {
                const client = createPublicClient({
                    transport: http(SOMNIA_RPC_URL),
                });

                const agentData = await client.readContract({
                    address: AGENT_REGISTRY_V2_ADDRESS,
                    abi: AGENT_REGISTRY_V2_ABI,
                    functionName: "getAgent",
                    args: [BigInt(currentAgentId)],
                }) as Agent;

                setAgent(agentData);

                // Fetch metadata/agent.json
                if (agentData.metadataUri && (agentData.metadataUri.startsWith('http://') || agentData.metadataUri.startsWith('https://'))) {
                    try {
                        const res = await fetch(agentData.metadataUri);
                        if (res.ok) {
                            const meta = await res.json();
                            setMetadata(meta);
                        }
                    } catch (e) {
                        console.error("Failed to fetch agent metadata:", e);
                    }
                }
            } catch (err: any) {
                console.error("Failed to fetch agent:", err);
            } finally {
                setAgentLoading(false);
            }
        }

        loadAgent();
    }, [agentId]);

    // Get the request hex from the first receipt if available
    const requestHex = receipts?.[0]?.request;

    return (
        <div className="space-y-8">
            <section>
                <div className="glass-panel rounded-2xl shadow-xl p-4 sm:p-8 space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Execution Receipt
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Viewing receipt for request
                        </p>
                        <div className="mt-2 font-mono text-xs text-gray-400 bg-black/30 px-3 py-2 rounded-lg break-all">
                            {requestId}
                        </div>
                    </div>

                    {/* Agent Info */}
                    {agentId && (
                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {metadata?.image && (
                                        <img
                                            src={metadata.image}
                                            alt={metadata.name}
                                            className="w-10 h-10 rounded-lg object-cover border border-white/10"
                                        />
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Agent:</span>
                                            {agentLoading ? (
                                                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                                            ) : (
                                                <span className="text-sm font-medium text-purple-400">
                                                    {metadata?.name || `Agent #${agentId}`}
                                                </span>
                                            )}
                                        </div>
                                        {metadata?.description && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                                {metadata.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Link
                                    href={`/request-v2/${agentId}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    View Agent
                                </Link>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="flex items-center gap-3 text-gray-400">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <span>Loading receipts...</span>
                            </div>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {receipts && receipts.length > 0 && !loading && (
                        <div className="space-y-4">
                            {/* Decoded Request */}
                            {requestHex && metadata?.abi && (
                                <RequestDisplay
                                    request={requestHex}
                                    abi={metadata.abi}
                                    label="Request Payload"
                                />
                            )}

                            {/* Receipt Viewer with ABI for result decoding */}
                            <ReceiptViewer
                                receipts={receipts}
                                abi={metadata?.abi}
                            />
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
