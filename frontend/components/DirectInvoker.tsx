"use client";

import { useState, useEffect } from "react";
import type { TokenMetadata, MethodDefinition, AbiParameter } from "@/lib/types";
import { encodeFunctionCall, decodeAbi, parseInputValue } from "@/lib/abi-utils";
import { hexToBytes } from "viem";
import { ReceiptViewer, ResultDisplay, RequestDisplay } from "@/components/ReceiptViewer";
import { fetchReceipts } from "@/lib/receipts";

const INVOKE_API_URL = "/api/invoke";
const METADATA_API_URL = "/api/metadata";

interface DirectInvokerProps {
    initialMetadataUrl?: string;
    initialContainerUrl?: string;
}

interface SingleInvocation {
    response?: string;
    decodedResponse?: any[];
    error?: string;
}

interface InvocationResult {
    status: 'pending' | 'success' | 'error';
    invocations: SingleInvocation[];
    receipts?: any[];
    request?: string; // The encoded calldata
    progress?: number;
    total?: number;
}

export function DirectInvoker({ initialMetadataUrl, initialContainerUrl }: DirectInvokerProps) {
    const [metadataUrl, setMetadataUrl] = useState<string>(initialMetadataUrl || "https://agents.src.host/new-test-agent.json");
    const [containerImageUrl, setContainerImageUrl] = useState<string>(initialContainerUrl || "https://storage.googleapis.com/my-public-stuff/my-container-9000.tar");
    const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);
    const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, Record<string, string>>>({});
    const [invocationResults, setInvocationResults] = useState<Record<string, InvocationResult>>({});
    const [repeatCount, setRepeatCount] = useState<number>(1);

    // Fetch metadata when URL changes
    const fetchMetadata = async () => {
        if (!metadataUrl) {
            setMetadata(null);
            return;
        }

        setMetadataLoading(true);
        setMetadataError(null);

        try {
            const proxyUrl = `${METADATA_API_URL}?url=${encodeURIComponent(metadataUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch metadata: ${response.status}`);
            }
            const data = await response.json();
            setMetadata(data);

            // Initialize input values for all methods from abi
            const methods = (data.abi || []).filter((item: any) => item.type === 'function');
            const initialInputs: Record<string, Record<string, string>> = {};
            methods.forEach((method: MethodDefinition) => {
                initialInputs[method.name] = {};
                method.inputs.forEach((input: AbiParameter) => {
                    initialInputs[method.name][input.name] = '';
                });
            });
            setInputValues(initialInputs);
        } catch (err: any) {
            setMetadataError(err.message);
            setMetadata(null);
        } finally {
            setMetadataLoading(false);
        }
    };

    const getMethods = (): MethodDefinition[] => {
        if (!metadata?.abi) return [];
        return metadata.abi.filter(item => item.type === 'function');
    };

    const invokeMethod = async (method: MethodDefinition) => {
        if (!containerImageUrl) {
            setInvocationResults(prev => ({
                ...prev,
                [method.name]: { status: 'error', invocations: [{ error: 'Please enter a container image URL' }] }
            }));
            return;
        }

        const total = repeatCount;
        const requestId = crypto.randomUUID(); // Same requestId for all invocations

        // Parse input values and encode once (same for all invocations)
        const values = method.inputs.map(input => {
            const rawValue = inputValues[method.name]?.[input.name] || '';
            return parseInputValue(rawValue, input.type);
        });
        const encodedCall = encodeFunctionCall(method, values);
        const requestBody = hexToBytes(encodedCall);

        setInvocationResults(prev => ({
            ...prev,
            [method.name]: { status: 'pending', invocations: [], request: encodedCall, progress: 0, total }
        }));

        const invocations: SingleInvocation[] = [];

        for (let i = 0; i < total; i++) {
            try {

                const response = await fetch(INVOKE_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Agent-Url': containerImageUrl,
                        'X-Request-Id': requestId,
                    },
                    body: new Blob([requestBody as BlobPart]),
                });

                const data = await response.json();

                if (data.error) {
                    invocations.push({ error: data.error });
                } else if (data.agentStatus && data.agentStatus >= 400) {
                    invocations.push({ error: `Agent returned status ${data.agentStatus}` });
                } else {
                    const responseHex = data.response as string;

                    // Try to decode the response
                    let decodedResponse: any[] | undefined;
                    if (method.outputs.length > 0 && responseHex && responseHex !== '0x') {
                        try {
                            decodedResponse = decodeAbi(method.outputs, responseHex as `0x${string}`);
                        } catch (e) {
                            console.warn('Failed to decode response:', e);
                        }
                    }

                    invocations.push({
                        response: responseHex,
                        decodedResponse,
                    });
                }
            } catch (err: any) {
                invocations.push({ error: err.message });
            }

            // Update progress
            setInvocationResults(prev => ({
                ...prev,
                [method.name]: { status: 'pending', invocations: [...invocations], progress: i + 1, total }
            }));
        }

        // Wait a moment for receipts to be uploaded, then fetch
        await new Promise(resolve => setTimeout(resolve, 1000));
        const receipts = await fetchReceipts(requestId);

        const hasErrors = invocations.some(inv => inv.error);
        setInvocationResults(prev => ({
            ...prev,
            [method.name]: {
                status: hasErrors ? 'error' : 'success',
                invocations,
                receipts,
                request: encodedCall,
            }
        }));
    };

    return (
        <div className="glass-panel rounded-2xl shadow-xl p-4 sm:p-8 space-y-6">
            <div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                    Direct Agent Invocation
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                    Invoke agents directly via HTTP without blockchain transactions
                </p>
            </div>

            <div className="space-y-6">
                {/* Container Image URL Input */}
                <div>
                    <label htmlFor="containerImageUrl" className="block text-sm font-semibold text-gray-300 mb-2">
                        Container Image URL
                    </label>
                    <input
                        id="containerImageUrl"
                        type="url"
                        value={containerImageUrl}
                        onChange={(e) => setContainerImageUrl(e.target.value)}
                        className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all font-mono text-sm"
                        placeholder="https://example.com/agent.tar"
                    />
                    <p className="text-xs text-gray-500 mt-1">URL to the tarred container image (used in X-Agent-Url header)</p>
                </div>

                {/* Metadata URL Input */}
                <div>
                    <label htmlFor="metadataUrl" className="block text-sm font-semibold text-gray-300 mb-2">
                        Agent Metadata URL
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="metadataUrl"
                            type="url"
                            value={metadataUrl}
                            onChange={(e) => setMetadataUrl(e.target.value)}
                            className="flex-1 px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all font-mono text-sm"
                            placeholder="https://example.com/agent-metadata.json"
                        />
                        <button
                            onClick={fetchMetadata}
                            disabled={!metadataUrl || metadataLoading}
                            className="px-6 py-3 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
                        >
                            {metadataLoading ? 'Loading...' : 'Load'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">URL to the agent metadata JSON (defines methods/ABI)</p>
                </div>

                {/* Repeat Count */}
                <div>
                    <label htmlFor="repeatCount" className="block text-sm font-semibold text-gray-300 mb-2">
                        Repeat Invocations
                    </label>
                    <input
                        id="repeatCount"
                        type="number"
                        min={1}
                        max={20}
                        value={repeatCount}
                        onChange={(e) => setRepeatCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="w-32 px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Run each invocation multiple times to detect nondeterminism</p>
                </div>

                {metadataError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
                        Error: {metadataError}
                    </div>
                )}

                {/* Agent Info */}
                {metadata && (
                    <div className="glass-panel rounded-xl p-6 space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2"></div>

                        {/* Basic Info */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h3 className="text-2xl font-bold text-white">{metadata.name}</h3>
                                <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-full">
                                    HTTP
                                </span>
                            </div>
                            {metadata.description && (
                                <p className="text-gray-400 leading-relaxed text-sm max-w-prose">
                                    {metadata.description}
                                </p>
                            )}
                        </div>

                        {/* Methods */}
                        {getMethods().length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    Methods
                                    <span className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded-full">
                                        {getMethods().length}
                                    </span>
                                </h4>
                                <div className="space-y-3">
                                    {getMethods().map((method) => (
                                        <MethodCard
                                            key={method.name}
                                            method={method}
                                            isExpanded={expandedMethod === method.name}
                                            onToggle={() => setExpandedMethod(expandedMethod === method.name ? null : method.name)}
                                            inputValues={inputValues[method.name] || {}}
                                            onInputChange={(name, value) => {
                                                setInputValues(prev => ({
                                                    ...prev,
                                                    [method.name]: {
                                                        ...prev[method.name],
                                                        [name]: value
                                                    }
                                                }));
                                            }}
                                            onInvoke={() => invokeMethod(method)}
                                            result={invocationResults[method.name]}
                                            abi={(metadata as any)?.abi}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

interface MethodCardProps {
    method: MethodDefinition;
    isExpanded: boolean;
    onToggle: () => void;
    inputValues: Record<string, string>;
    onInputChange: (name: string, value: string) => void;
    onInvoke: () => void;
    result?: InvocationResult;
    abi?: any[];
}

function MethodCard({ method, isExpanded, onToggle, inputValues, onInputChange, onInvoke, result, abi }: MethodCardProps) {
    return (
        <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-primary font-mono font-bold">{method.name}</span>
                    {method.inputs.length > 0 && (
                        <span className="text-xs text-gray-500">
                            ({method.inputs.map(i => i.type).join(', ')})
                        </span>
                    )}
                </div>
                <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {isExpanded && (
                <div className="p-4 pt-0 space-y-4">
                    {method.description && (
                        <p className="text-gray-500 text-sm">{method.description}</p>
                    )}

                    {/* Inputs */}
                    {method.inputs.length > 0 ? (
                        <div className="space-y-3">
                            {method.inputs.map((input) => (
                                <div key={input.name}>
                                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                        {input.name} <span className="text-secondary/70">({input.type})</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={inputValues[input.name] || ''}
                                        onChange={(e) => onInputChange(input.name, e.target.value)}
                                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                                        placeholder={
                                            input.type.endsWith('[]') ? '["a", "b"] or a, b' :
                                                input.type.startsWith('uint') || input.type.startsWith('int') ? '123' :
                                                    input.type === 'bool' ? 'true' : 'value'
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic">This method takes no parameters.</p>
                    )}

                    {/* Invoke Button */}
                    <button
                        onClick={onInvoke}
                        disabled={result?.status === 'pending'}
                        className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg shadow-green-600/20"
                    >
                        {result?.status === 'pending'
                            ? `Invoking... ${result.progress || 0}/${result.total || 1}`
                            : 'Invoke via HTTP'}
                    </button>

                    {/* Results */}
                    {result && result.invocations && result.invocations.length > 0 && (
                        <div className="space-y-3">
                            {/* Request */}
                            {result.request && (
                                <RequestDisplay request={result.request} abi={abi} />
                            )}

                            {/* Consensus Summary */}
                            {(() => {
                                const responses = result.invocations
                                    .filter(inv => !inv.error && inv.response)
                                    .map(inv => inv.response);
                                const errors = result.invocations.filter(inv => inv.error);
                                const total = result.invocations.length;

                                // Count occurrences of each response
                                const counts = responses.reduce((acc, r) => {
                                    acc[r!] = (acc[r!] || 0) + 1;
                                    return acc;
                                }, {} as Record<string, number>);

                                // Find the most common response
                                const entries = Object.entries(counts);
                                const [topResponse, topCount] = entries.length > 0
                                    ? entries.reduce((a, b) => b[1] > a[1] ? b : a)
                                    : ['', 0];

                                const consensusThreshold = Math.ceil(total * 2 / 3);
                                const hasConsensus = topCount >= consensusThreshold;

                                if (result.status === 'pending') {
                                    return (
                                        <div className="p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-yellow-400">⏳</span>
                                                <span className="text-sm font-bold text-yellow-300">
                                                    Running... ({result.progress}/{result.total})
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }

                                if (errors.length === total) {
                                    return (
                                        <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-red-400">✕</span>
                                                <span className="text-sm font-bold text-red-300">
                                                    All {total} invocation{total > 1 ? 's' : ''} failed
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs text-red-400">
                                                {errors[0]?.error}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className={`p-3 rounded-lg border ${
                                        hasConsensus
                                            ? 'bg-green-500/10 border-green-500/20'
                                            : 'bg-red-500/10 border-red-500/20'
                                    }`}>
                                        <div className="flex items-center gap-2">
                                            {hasConsensus ? (
                                                <>
                                                    <span className="text-green-400">✓</span>
                                                    <span className="text-sm font-bold text-green-300">
                                                        Consensus ({topCount}/{total})
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-red-400">✕</span>
                                                    <span className="text-sm font-bold text-red-300">
                                                        Consensus Failed
                                                    </span>
                                                    <span className="text-xs text-red-400">
                                                        ({topCount}/{total} agree, need {consensusThreshold})
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {hasConsensus && topResponse && (
                                            <ResultDisplay
                                                result={topResponse}
                                                abi={abi}
                                                label="Consensus Result"
                                            />
                                        )}
                                        {errors.length > 0 && (
                                            <div className="mt-2 text-xs text-gray-500">
                                                {errors.length} error{errors.length > 1 ? 's' : ''} ignored
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Receipts (fetched once for all invocations) */}
                            {result.status !== 'pending' && (
                                result.receipts && result.receipts.length > 0 ? (
                                    <ReceiptViewer receipts={result.receipts} abi={abi} />
                                ) : (
                                    <div className="bg-black/30 rounded-xl border border-white/10 px-4 py-3">
                                        <span className="text-sm text-gray-500">No receipts available</span>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

