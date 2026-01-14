"use client";

import { useState, useEffect } from "react";
import type { TokenMetadata, MethodDefinition, AbiParameter } from "@/lib/types";
import { encodeFunctionCall, decodeAbi, parseInputValue } from "@/lib/abi-utils";
import { hexToBytes } from "viem";
import { DecodedData } from "@/components/DecodedData";

const INVOKE_API_URL = "/api/invoke";
const METADATA_API_URL = "/api/metadata";

// Helper to check if all receipts across invocations are identical
function checkReceiptsDeterminism(invocations: SingleInvocation[]): { deterministic: boolean; differences?: string[] } {
    const successfulInvocations = invocations.filter(inv => !inv.error && inv.receipts);
    if (successfulInvocations.length < 2) {
        return { deterministic: true };
    }

    const firstReceipts = JSON.stringify(successfulInvocations[0].receipts);
    const differences: string[] = [];

    for (let i = 1; i < successfulInvocations.length; i++) {
        const currentReceipts = JSON.stringify(successfulInvocations[i].receipts);
        if (currentReceipts !== firstReceipts) {
            differences.push(`Run 1 vs Run ${i + 1}`);
        }
    }

    return {
        deterministic: differences.length === 0,
        differences: differences.length > 0 ? differences : undefined,
    };
}

function ReceiptDeterminismBadge({ invocations }: { invocations: SingleInvocation[] }) {
    const { deterministic, differences } = checkReceiptsDeterminism(invocations);

    if (deterministic) {
        return (
            <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">
                Deterministic
            </span>
        );
    }

    return (
        <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full" title={differences?.join(', ')}>
            Non-deterministic ({differences?.length} diff{differences && differences.length > 1 ? 's' : ''})
        </span>
    );
}

interface DirectInvokerProps {
    initialMetadataUrl?: string;
}

interface SingleInvocation {
    response?: string;
    decodedResponse?: any[];
    receipts?: any[];
    error?: string;
}

interface InvocationResult {
    status: 'pending' | 'success' | 'error';
    invocations: SingleInvocation[];
    progress?: number;
    total?: number;
}

export function DirectInvoker({ initialMetadataUrl }: DirectInvokerProps) {
    const [metadataUrl, setMetadataUrl] = useState<string>(initialMetadataUrl || "");
    const [containerImageUrl, setContainerImageUrl] = useState<string>("");
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

            // Initialize input values for all methods
            const methods = data.agent_spec?.methods || data.methods || [];
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
        if (!metadata) return [];

        // Support multiple formats:
        // 1. agent_spec.methods (nested format)
        // 2. methods (flat format)
        // 3. abi array with type: "function" entries
        if (metadata.agent_spec?.methods) {
            return metadata.agent_spec.methods;
        }
        if (metadata.methods) {
            return metadata.methods;
        }

        // Handle ABI format - filter for functions and convert to MethodDefinition
        const abi = (metadata as any).abi;
        if (Array.isArray(abi)) {
            return abi
                .filter((item: any) => item.type === 'function')
                .map((item: any) => ({
                    name: item.name,
                    description: item.description,
                    inputs: item.inputs || [],
                    outputs: item.outputs || [],
                }));
        }

        return [];
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

        setInvocationResults(prev => ({
            ...prev,
            [method.name]: { status: 'pending', invocations: [], progress: 0, total }
        }));

        const invocations: SingleInvocation[] = [];

        for (let i = 0; i < total; i++) {
            try {
                // Parse input values
                const values = method.inputs.map(input => {
                    const rawValue = inputValues[method.name]?.[input.name] || '';
                    return parseInputValue(rawValue, input.type);
                });

                // Encode the function call (4-byte selector + ABI-encoded params)
                const encodedCall = encodeFunctionCall(method, values);
                const requestBody = hexToBytes(encodedCall);

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
                        receipts: data.receipts,
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

        const hasErrors = invocations.some(inv => inv.error);
        setInvocationResults(prev => ({
            ...prev,
            [method.name]: {
                status: hasErrors ? 'error' : 'success',
                invocations,
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
}

function MethodCard({ method, isExpanded, onToggle, inputValues, onInputChange, onInvoke, result }: MethodCardProps) {
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
                            {/* Summary */}
                            <div className={`p-3 rounded-lg border ${
                                result.status === 'success'
                                    ? 'bg-green-500/10 border-green-500/20'
                                    : result.status === 'pending'
                                    ? 'bg-yellow-500/10 border-yellow-500/20'
                                    : 'bg-red-500/10 border-red-500/20'
                            }`}>
                                <div className="flex items-center gap-2">
                                    {result.status === 'success' && <span className="text-green-400">✓</span>}
                                    {result.status === 'pending' && <span className="text-yellow-400">⏳</span>}
                                    {result.status === 'error' && <span className="text-red-400">✕</span>}
                                    <span className={`text-sm font-bold ${
                                        result.status === 'success' ? 'text-green-300' :
                                        result.status === 'pending' ? 'text-yellow-300' : 'text-red-300'
                                    }`}>
                                        {result.invocations.length} invocation{result.invocations.length > 1 ? 's' : ''}
                                        {result.status === 'pending' && ` (${result.progress}/${result.total})`}
                                    </span>
                                    {result.invocations.length > 1 && result.status !== 'pending' && (
                                        <ReceiptDeterminismBadge invocations={result.invocations} />
                                    )}
                                </div>
                            </div>

                            {/* Individual Results */}
                            {result.invocations.map((inv, idx) => (
                                <div key={idx} className="bg-black/20 rounded-lg p-3 border border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs text-gray-500">Run {idx + 1}</span>
                                        {inv.error ? (
                                            <span className="text-red-400 text-xs">Error: {inv.error}</span>
                                        ) : (
                                            <span className="text-green-400 text-xs">Success</span>
                                        )}
                                    </div>

                                    {inv.response && (
                                        <div className="mt-2">
                                            <DecodedData
                                                data={inv.response}
                                                label="Response"
                                                method={method}
                                            />
                                        </div>
                                    )}

                                    {inv.receipts && inv.receipts.length > 0 && (
                                        <div className="mt-2">
                                            <span className="text-xs text-gray-500 block mb-1">
                                                Receipts ({inv.receipts.length})
                                            </span>
                                            <pre className="bg-black/40 rounded-lg p-2 text-xs text-gray-300 overflow-auto max-h-48 font-mono">
                                                {JSON.stringify(inv.receipts, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

