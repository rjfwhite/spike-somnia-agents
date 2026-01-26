"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useAccount } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { formatEther, decodeEventLog } from "viem";
import type { AbiFunction } from "@/lib/types";
import { encodeFunctionCall, parseInputValue } from "@/lib/abi-utils";
import { DecodedData } from "@/components/DecodedData";

interface MethodInvokerProps {
    agentId: string;
    method: AbiFunction;
    price?: bigint;
}

interface TrackedRequest {
    id: bigint;
    status: 'pending' | 'responded' | 'failed';
    response?: string;
    success?: boolean;
    responseTxHash?: string;
}

// Zero address for callback (oracle-based invocation - responses go through oracle)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_SELECTOR = "0x00000000" as const;

export function MethodInvoker({ agentId, method, price }: MethodInvokerProps) {
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [trackedRequest, setTrackedRequest] = useState<TrackedRequest | null>(null);

    const publicClient = usePublicClient();
    const { address: userAddress } = useAccount();
    const { data: hash, writeContract, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
        hash,
    });

    // Initialize inputs
    useEffect(() => {
        const initialValues: Record<string, string> = {};
        method.inputs.forEach((input) => {
            initialValues[input.name] = '';
        });
        setInputValues(initialValues);
    }, [method]);

    // Watch for receipt to extract requestId from AgentRequested event
    useEffect(() => {
        if (receipt && isSuccess && !trackedRequest) {
            const logs = receipt.logs;
            for (const log of logs) {
                try {
                    const decoded = decodeEventLog({
                        abi: SOMNIA_AGENTS_ABI,
                        data: log.data,
                        topics: log.topics,
                    });

                    if (decoded.eventName === 'AgentRequested') {
                        const { requestId } = decoded.args as { requestId: bigint };
                        setTrackedRequest({
                            id: requestId,
                            status: 'pending'
                        });
                        break;
                    }
                } catch (e) {
                    // Ignore decoding errors for other events
                }
            }
        }
    }, [receipt, isSuccess]);

    // Watch for AgentResponded event
    useEffect(() => {
        if (!trackedRequest || trackedRequest.status !== 'pending' || !publicClient) return;

        const unwatch = publicClient.watchContractEvent({
            address: CONTRACT_ADDRESS,
            abi: SOMNIA_AGENTS_ABI,
            eventName: 'AgentResponded',
            onLogs: (logs) => {
                for (const log of logs) {
                    const { requestId, response, success } = log.args as {
                        requestId: bigint;
                        response: string;
                        success: boolean;
                    };

                    if (requestId === trackedRequest.id) {
                        setTrackedRequest(prev => ({
                            ...prev!,
                            status: 'responded',
                            response,
                            success,
                            responseTxHash: log.transactionHash,
                        }));
                        break;
                    }
                }
            }
        });

        return () => unwatch();
    }, [trackedRequest?.id, trackedRequest?.status, publicClient]);

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setTrackedRequest(null);

        try {
            const values = method.inputs.map(input => {
                const rawValue = inputValues[input.name] || '';
                return parseInputValue(rawValue, input.type);
            });

            // Encode the full function call (selector + parameters)
            const encodedRequest = encodeFunctionCall(method, values);

            // Build the AgentRequestData struct
            const requestData = {
                agentId: BigInt(agentId),
                request: encodedRequest,
                callbackAddress: ZERO_ADDRESS,
                callbackSelector: ZERO_SELECTOR,
            };

            writeContract({
                address: CONTRACT_ADDRESS,
                abi: SOMNIA_AGENTS_ABI,
                functionName: "requestAgent",
                args: [requestData],
                value: price || BigInt(0),
            });
        } catch (err: unknown) {
            console.error('Failed to encode call data:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert(`Failed to encode call data: ${errorMessage}`);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-lg p-4">
                <form onSubmit={handleCreateRequest} className="space-y-4">
                    {method.inputs.length > 0 ? (
                        <div className="space-y-4">
                            {method.inputs.map((input) => (
                                <div key={input.name}>
                                    <label htmlFor={`input-${input.name}`} className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                        {input.name} <span className="text-secondary/70">({input.type})</span>
                                    </label>
                                    <input
                                        id={`input-${input.name}`}
                                        type="text"
                                        value={inputValues[input.name] || ''}
                                        onChange={(e) => setInputValues({
                                            ...inputValues,
                                            [input.name]: e.target.value
                                        })}
                                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                                        placeholder={
                                            input.type.endsWith('[]') ? '["a", "b"] or a, b' :
                                                input.type.startsWith('uint') || input.type.startsWith('int') ? '123' :
                                                    input.type === 'bool' ? 'true' :
                                                        'value'
                                        }
                                        required
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic">This method takes no parameters.</p>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isPending || isConfirming}
                            className="w-full bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg shadow-primary/20"
                        >
                            {isPending ? "Confirming..." : isConfirming ? "Broadcasting..." : "Run Method"}
                        </button>
                    </div>

                    {price && price > BigInt(0) && (
                        <div className="text-center">
                            <p className="text-xs text-gray-400 mt-2">
                                Cost: <span className="text-green-400">{formatEther(price)} STT</span> + Gas
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-xs break-words">
                            Error: {error.message}
                        </div>
                    )}
                </form>
            </div>

            {/* Results Display */}
            {(hash || trackedRequest) && (
                <div className="bg-black/40 rounded-lg border border-white/5 p-4 space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-white/5 pb-2">Execution Result</h4>

                    {hash && (
                        <div className="space-y-1">
                            <span className="text-xs text-gray-500 block">Transaction Hash</span>
                            <a
                                href={`https://shannon-explorer.somnia.network/tx/${hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-secondary break-all bg-black/30 px-2 py-1 rounded block hover:text-primary hover:underline transition-colors"
                            >
                                {hash}
                            </a>
                        </div>
                    )}

                    {trackedRequest && (
                        <div className={`mt-2 p-3 rounded-lg border ${trackedRequest.status === 'responded'
                            ? trackedRequest.success
                                ? 'bg-green-500/10 border-green-500/20'
                                : 'bg-red-500/10 border-red-500/20'
                            : trackedRequest.status === 'failed'
                                ? 'bg-red-500/10 border-red-500/20'
                                : 'bg-blue-500/10 border-blue-500/20'
                            }`}>

                            <div className="flex items-center gap-2 mb-2">
                                {trackedRequest.status === 'pending' ? (
                                    <span className="animate-spin w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full"></span>
                                ) : trackedRequest.success ? (
                                    <span className="text-green-400">✓</span>
                                ) : (
                                    <span className="text-red-400">✕</span>
                                )}
                                <span className={`text-sm font-bold ${trackedRequest.status === 'pending' ? 'text-blue-300' :
                                    trackedRequest.success ? 'text-green-300' : 'text-red-300'
                                    }`}>
                                    {trackedRequest.status === 'pending' ? 'Waiting for Oracle Response...' :
                                        trackedRequest.success ? 'Execution Successful' : 'Execution Failed'}
                                </span>
                            </div>

                            <div className="mt-2 text-xs text-gray-500 space-y-1">
                                <p>Request ID: {trackedRequest.id.toString()}</p>
                                {trackedRequest.responseTxHash && (
                                    <p>
                                        Response TX:{' '}
                                        <a
                                            href={`https://shannon-explorer.somnia.network/tx/${trackedRequest.responseTxHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-secondary hover:text-primary hover:underline transition-colors"
                                        >
                                            {trackedRequest.responseTxHash.slice(0, 10)}...{trackedRequest.responseTxHash.slice(-8)}
                                        </a>
                                    </p>
                                )}
                            </div>

                            {trackedRequest.response && (
                                <div className="mt-3">
                                    <DecodedData
                                        data={trackedRequest.response}
                                        label="Return Value"
                                        method={method}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
