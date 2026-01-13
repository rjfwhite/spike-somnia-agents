"use client";

import { useState, useEffect } from "react";
import type { TokenMetadata, MethodDefinition, AbiParameter } from "@/lib/types";
import { encodeAbi, decodeAbi, formatDecodedValue, parseInputValue } from "@/lib/abi-utils";
import { DecodedData } from "@/components/DecodedData";

const AGENT_HOST_URL = "http://35.226.219.86";

interface DirectInvokerProps {
    initialMetadataUrl?: string;
}

interface InvocationResult {
    status: 'pending' | 'success' | 'error';
    response?: string;
    decodedResponse?: any[];
    error?: string;
    receiptUrl?: string;
}

export function DirectInvoker({ initialMetadataUrl }: DirectInvokerProps) {
    const [metadataUrl, setMetadataUrl] = useState<string>(initialMetadataUrl || "");
    const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);
    const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, Record<string, string>>>({});
    const [invocationResults, setInvocationResults] = useState<Record<string, InvocationResult>>({});

    // Fetch metadata when URL changes
    const fetchMetadata = async () => {
        if (!metadataUrl) {
            setMetadata(null);
            return;
        }

        setMetadataLoading(true);
        setMetadataError(null);

        try {
            const response = await fetch(metadataUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch metadata: ${response.status}`);
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

    const getContainerImage = (): string | null => {
        if (!metadata) return null;
        // Support multiple field names for container image
        return metadata.agent_spec?.container_image
            || (metadata as any).container_image
            || (metadata as any).image
            || (metadata as any).container
            || null;
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
        const containerImage = getContainerImage();
        if (!containerImage) {
            setInvocationResults(prev => ({
                ...prev,
                [method.name]: { status: 'error', error: 'No container image found in metadata' }
            }));
            return;
        }

        setInvocationResults(prev => ({
            ...prev,
            [method.name]: { status: 'pending' }
        }));

        try {
            // Parse input values
            const values = method.inputs.map(input => {
                const rawValue = inputValues[method.name]?.[input.name] || '';
                return parseInputValue(rawValue, input.type);
            });

            // Encode the function call (method name + ABI-encoded params)
            const encodedParams = encodeAbi(method.inputs, values);

            // Create the request body: method name (as bytes) + encoded params
            // For simplicity, we'll encode method name as a string parameter followed by the call data
            const methodNameBytes = new TextEncoder().encode(method.name);
            const paramsBytes = hexToBytes(encodedParams);

            // Combine: 4 bytes for method name length + method name + params
            const methodNameLength = new Uint8Array(4);
            new DataView(methodNameLength.buffer).setUint32(0, methodNameBytes.length, false);

            const requestBody = new Uint8Array(4 + methodNameBytes.length + paramsBytes.length);
            requestBody.set(methodNameLength, 0);
            requestBody.set(methodNameBytes, 4);
            requestBody.set(paramsBytes, 4 + methodNameBytes.length);

            const requestId = crypto.randomUUID();

            const response = await fetch(AGENT_HOST_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Agent-Url': containerImage,
                    'X-Request-Id': requestId,
                },
                body: requestBody,
            });

            const responseBuffer = await response.arrayBuffer();
            const responseHex = bytesToHex(new Uint8Array(responseBuffer));

            if (!response.ok) {
                const errorText = new TextDecoder().decode(responseBuffer);
                throw new Error(`Agent returned ${response.status}: ${errorText}`);
            }

            // Try to decode the response
            let decodedResponse: any[] | undefined;
            if (method.outputs.length > 0 && responseHex !== '0x') {
                try {
                    decodedResponse = decodeAbi(method.outputs, responseHex as `0x${string}`);
                } catch (e) {
                    console.warn('Failed to decode response:', e);
                }
            }

            const receiptUrl = response.headers.get('X-Receipt-Url') || undefined;

            setInvocationResults(prev => ({
                ...prev,
                [method.name]: {
                    status: 'success',
                    response: responseHex,
                    decodedResponse,
                    receiptUrl,
                }
            }));
        } catch (err: any) {
            setInvocationResults(prev => ({
                ...prev,
                [method.name]: { status: 'error', error: err.message }
            }));
        }
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

                        {/* Container Image */}
                        {getContainerImage() && (
                            <div className="bg-secondary/5 p-4 rounded-xl border border-secondary/20">
                                <span className="text-xs font-bold text-secondary uppercase tracking-wider block mb-2">Container Image</span>
                                <span className="font-mono text-xs text-gray-300 bg-black/20 px-3 py-1.5 rounded-md border border-white/5 break-all block">
                                    {getContainerImage()}
                                </span>
                            </div>
                        )}

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
                        {result?.status === 'pending' ? 'Invoking...' : 'Invoke via HTTP'}
                    </button>

                    {/* Result */}
                    {result && result.status !== 'pending' && (
                        <div className={`p-4 rounded-lg border ${
                            result.status === 'success'
                                ? 'bg-green-500/10 border-green-500/20'
                                : 'bg-red-500/10 border-red-500/20'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {result.status === 'success' ? (
                                    <span className="text-green-400">✓</span>
                                ) : (
                                    <span className="text-red-400">✕</span>
                                )}
                                <span className={`text-sm font-bold ${
                                    result.status === 'success' ? 'text-green-300' : 'text-red-300'
                                }`}>
                                    {result.status === 'success' ? 'Success' : 'Error'}
                                </span>
                            </div>

                            {result.error && (
                                <p className="text-red-400 text-sm break-words">{result.error}</p>
                            )}

                            {result.response && (
                                <div className="mt-3">
                                    <DecodedData
                                        data={result.response}
                                        label="Response"
                                        method={method}
                                    />
                                </div>
                            )}

                            {result.receiptUrl && (
                                <div className="mt-3">
                                    <span className="text-xs text-gray-500 block mb-1">Receipt URL</span>
                                    <a
                                        href={result.receiptUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-secondary text-sm underline break-all"
                                    >
                                        {result.receiptUrl}
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
