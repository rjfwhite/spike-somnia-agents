"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, createPublicClient, webSocket, type Hex } from "viem";
import {
    SOMNIA_AGENTS_V2_ABI,
    AGENT_REGISTRY_V2_ABI,
    Agent
} from "@/lib/contract";
import { useNetwork } from "@/lib/network-context";
import { TokenMetadata, AbiFunction, getAbiFunctions } from "@/lib/types";
import { encodeFunctionCall, parseInputValue } from "@/lib/abi-utils";
import { generateSolidityExample, generateViemExample } from "@/lib/code-generators";
import { DecodedData } from "@/components/DecodedData";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ReceiptViewer, ResultDisplay, RequestDisplay } from "@/components/ReceiptViewer";
import { fetchReceipts } from "@/lib/receipts";
import {
    ArrowLeft,
    Loader2,
    Play,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    CheckCircle,
    Clock,
    AlertCircle,
    Code,
    FileJson,
    Copy,
    Check,
    RefreshCw
} from "lucide-react";
import Link from "next/link";

interface TrackedRequest {
    id: bigint;
    status: 'pending' | 'finalized' | 'failed' | 'timeout';
    finalCost?: bigint;
    rebate?: bigint;
    responses: Response[];
    txHash?: string;
    receipts?: any[];
    receiptsFetching?: boolean;
}

interface Response {
    validator: string;
    result: string;
    status: number;
    receipt: bigint;
    cost: bigint;
    timestamp: bigint;
}

export default function AgentRequestPage() {
    const params = useParams();
    const agentId = params.agentId as string;
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const { currentNetwork } = useNetwork();
    const SOMNIA_AGENTS_V2_ADDRESS = currentNetwork.contracts.somniaAgents;
    const AGENT_REGISTRY_V2_ADDRESS = currentNetwork.contracts.agentRegistry;
    const SOMNIA_RPC_URL = currentNetwork.rpcUrl;

    // Agent data state
    const [agent, setAgent] = useState<Agent | null>(null);
    const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Method selection state
    const [selectedMethod, setSelectedMethod] = useState<AbiFunction | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState<"run" | "solidity" | "viem">("run");
    const [copied, setCopied] = useState(false);
    const { data: requestDeposit } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "getRequestDeposit",
    });

    // Request tracking state
    const [trackedRequest, setTrackedRequest] = useState<TrackedRequest | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationError, setSimulationError] = useState<string | null>(null);

    // Write contract
    const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

    // Fetch agent from registry
    useEffect(() => {
        if (!publicClient || !agentId) return;

        const fetchAgent = async () => {
            setLoading(true);
            setError(null);

            try {
                const agentData = await publicClient.readContract({
                    address: AGENT_REGISTRY_V2_ADDRESS,
                    abi: AGENT_REGISTRY_V2_ABI,
                    functionName: "getAgent",
                    args: [BigInt(agentId)],
                }) as Agent;

                setAgent(agentData);

                // Fetch metadata
                if (agentData.metadataUri && (agentData.metadataUri.startsWith('http://') || agentData.metadataUri.startsWith('https://'))) {
                    try {
                        const res = await fetch(agentData.metadataUri);
                        if (res.ok) {
                            const meta = await res.json();
                            setMetadata(meta);
                            // Auto-select first method if available
                            const methods = getAbiFunctions(meta);
                            if (methods.length > 0) {
                                setSelectedMethod(methods[0]);
                            }
                        }
                    } catch (e) {
                        console.error("Failed to fetch metadata:", e);
                    }
                }
            } catch (err: any) {
                console.error("Failed to fetch agent:", err);
                if (err.message?.includes('AgentNotFound') || err.message?.includes('0x0ede9759')) {
                    setError(`Agent ${agentId} not found in the V2 registry`);
                } else {
                    setError(err.message || "Failed to load agent");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchAgent();
    }, [publicClient, agentId]);

    // Initialize input values when method changes
    useEffect(() => {
        if (!selectedMethod) return;
        const initialValues: Record<string, string> = {};
        selectedMethod.inputs.forEach((input) => {
            initialValues[input.name] = '';
        });
        setInputValues(initialValues);
    }, [selectedMethod]);

    // Watch for request events after transaction confirmed
    useEffect(() => {
        if (!isConfirmed || !txHash || !publicClient) return;

        const fetchRequestId = async () => {
            try {
                const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

                // Find RequestCreated event
                for (const log of receipt.logs) {
                    try {
                        if (log.address.toLowerCase() === SOMNIA_AGENTS_V2_ADDRESS.toLowerCase()) {
                            // RequestCreated event topic
                            const requestCreatedTopic = "0x"; // We'll match by log structure
                            if (log.topics[0]) {
                                // Extract requestId from topics (first indexed param after event sig)
                                const requestId = BigInt(log.topics[1] || 0);
                                if (requestId > 0) {
                                    setTrackedRequest({
                                        id: requestId,
                                        status: 'pending',
                                        responses: [],
                                        txHash,
                                    });
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        // Continue checking other logs
                    }
                }
            } catch (e) {
                console.error("Failed to get transaction receipt:", e);
            }
        };

        fetchRequestId();
    }, [isConfirmed, txHash, publicClient]);

    // Watch for responses and finalization
    useEffect(() => {
        if (!trackedRequest || trackedRequest.status !== 'pending' || !publicClient) return;

        const wsUrl = currentNetwork.wsUrl;
        const client = createPublicClient({
            transport: webSocket(wsUrl),
        });

        const unwatchFinalized = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "RequestFinalized",
            onLogs: async (logs) => {
                for (const log of logs) {
                    const { requestId, status, finalCost, rebate } = log.args as { requestId: bigint; status: number; finalCost: bigint; rebate: bigint };
                    if (requestId === trackedRequest.id) {
                        const finalStatus = status === 1 ? 'finalized' : status === 2 ? 'failed' : 'timeout';

                        setTrackedRequest(prev => prev ? {
                            ...prev,
                            status: finalStatus,
                            finalCost,
                            rebate,
                            receiptsFetching: true,
                        } : null);

                        // Fetch receipts after finalization
                        const receipts = await fetchReceipts(requestId.toString());
                        setTrackedRequest(prev => prev ? {
                            ...prev,
                            receipts,
                            receiptsFetching: false,
                        } : null);
                    }
                }
            },
        });

        return () => {
            unwatchFinalized();
        };
    }, [trackedRequest?.id, trackedRequest?.status, publicClient]);

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMethod || !agentId || !publicClient || !address) return;

        setSimulationError(null);
        setIsSimulating(true);
        setTrackedRequest(null);

        try {
            // Parse and encode the method call
            const values = selectedMethod.inputs.map(input => {
                const rawValue = inputValues[input.name] || '';
                return parseInputValue(rawValue, input.type);
            });
            const encodedPayload = encodeFunctionCall(selectedMethod, values);
            const deposit = requestDeposit as bigint;

            // Zero address for callback (we'll poll for results)
            const callbackAddress = "0x0000000000000000000000000000000000000000" as `0x${string}`;
            const callbackSelector = "0x00000000" as `0x${string}`;

            // Simulate first
            await publicClient.simulateContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress, callbackSelector, encodedPayload],
                value: deposit,
                account: address,
            });

            // Execute transaction
            setIsSimulating(false);
            writeContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress, callbackSelector, encodedPayload],
                value: deposit,
            });
        } catch (err: any) {
            setIsSimulating(false);
            let errorMessage = "Transaction would fail";

            if (err.message?.includes('AgentNotFound') || err.message?.includes('0x0ede9759')) {
                errorMessage = `Agent ${agentId} not found in the registry`;
            } else if (err.message?.includes('not enough active members')) {
                errorMessage = "Not enough active committee members to process requests";
            } else if (err.shortMessage) {
                errorMessage = err.shortMessage;
            } else if (err.message) {
                errorMessage = err.message;
            }

            setSimulationError(errorMessage);
        }
    };

    const handleRetryReceipts = async () => {
        if (!trackedRequest) return;

        setTrackedRequest(prev => prev ? {
            ...prev,
            receiptsFetching: true,
        } : null);

        const receipts = await fetchReceipts(trackedRequest.id.toString());
        setTrackedRequest(prev => prev ? {
            ...prev,
            receipts,
            receiptsFetching: false,
        } : null);
    };

    const methods = metadata ? getAbiFunctions(metadata) : [];
    const isLoading = isSimulating || isPending || isConfirming;

    const getCode = () => {
        if (!selectedMethod) return '';
        switch (activeTab) {
            case 'solidity': return generateSolidityExample(selectedMethod, agentId, undefined, SOMNIA_AGENTS_V2_ADDRESS);
            case 'viem': return generateViemExample(selectedMethod, agentId, undefined, SOMNIA_AGENTS_V2_ADDRESS);
            default: return '';
        }
    };

    const getLanguage = () => {
        switch (activeTab) {
            case 'solidity': return 'solidity';
            case 'viem': return 'typescript';
            default: return 'text';
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/requests-v2" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-400" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Loading Agent...</h1>
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="flex items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        <span className="text-gray-400">Loading agent data...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/requests-v2" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-400" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Agent Not Found</h1>
                    </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-red-400 font-bold text-sm">Error Loading Agent</h3>
                            <p className="text-red-300/80 text-sm mt-1">{error}</p>
                            <Link
                                href="/agents-v2"
                                className="inline-flex items-center gap-2 mt-3 text-sm text-purple-400 hover:text-purple-300"
                            >
                                Create an agent on the Agents v2 page
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/requests-v2" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-white">{metadata?.name || `Agent ${agentId}`}</h1>
                    <p className="text-gray-400 mt-1">{metadata?.description || 'No description available'}</p>
                </div>
                {metadata?.image && (
                    <img
                        src={metadata.image}
                        alt={metadata.name}
                        className="w-16 h-16 rounded-lg object-cover border border-white/10"
                    />
                )}
            </div>

            {/* Agent Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Agent ID</span>
                    <p className="font-mono text-lg text-white mt-1">{agentId}</p>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Cost</span>
                    <p className="text-lg text-green-400 font-mono mt-1">N/A</p>
                </div>
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Methods</span>
                    <p className="text-lg text-purple-400 mt-1">{methods.length} available</p>
                </div>
            </div>

            {/* Method Selection & Execution */}
            {methods.length > 0 ? (
                <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                        <h2 className="text-lg font-bold text-white">Execute Method</h2>
                        <p className="text-sm text-gray-400 mt-1">Select a method and provide parameters</p>
                    </div>

                    {/* Method Tabs */}
                    <div className="flex gap-1 p-2 border-b border-white/5 overflow-x-auto bg-black/20">
                        {methods.map((method, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedMethod(method)}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                                    selectedMethod?.name === method.name
                                        ? 'bg-purple-600 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {method.name}()
                            </button>
                        ))}
                    </div>

                    {/* Method Details & Form */}
                    {selectedMethod && (
                        <div className="p-6">
                            {/* Method signature */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <Code className="w-4 h-4 text-gray-500" />
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">Function Signature</span>
                                </div>
                                <code className="block bg-black/40 p-3 rounded-lg text-sm font-mono text-purple-300 overflow-x-auto">
                                    {selectedMethod.name}({selectedMethod.inputs.map(i => `${i.type} ${i.name}`).join(', ')})
                                    {selectedMethod.outputs.length > 0 && (
                                        <span className="text-gray-500">
                                            {' '}returns ({selectedMethod.outputs.map(o => `${o.type}${o.name ? ' ' + o.name : ''}`).join(', ')})
                                        </span>
                                    )}
                                </code>
                                {selectedMethod.description && (
                                    <p className="text-sm text-gray-400 mt-2">{selectedMethod.description}</p>
                                )}
                            </div>

                            {/* Tabs: Run / Solidity / TypeScript */}
                            <div className="flex items-center justify-between mb-4">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'run' ? 'Execute Method' : 'Integration Snippets'}
                                </h5>
                                <div className="flex bg-black/40 rounded-lg p-1 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('run')}
                                        className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1 ${activeTab === 'run'
                                            ? 'bg-purple-600 text-white font-bold shadow-sm'
                                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <Play className="w-3 h-3" /> Run
                                    </button>
                                    <div className="w-[1px] bg-white/10 mx-1"></div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('solidity')}
                                        className={`px-3 py-1.5 text-xs rounded-md transition-all ${activeTab === 'solidity'
                                            ? 'bg-white/10 text-white font-semibold'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                    >
                                        Solidity
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('viem')}
                                        className={`px-3 py-1.5 text-xs rounded-md transition-all ${activeTab === 'viem'
                                            ? 'bg-white/10 text-white font-semibold'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                    >
                                        TypeScript
                                    </button>
                                </div>
                            </div>

                            {/* Tab Content */}
                            {activeTab === 'run' ? (
                            <>
                            <form onSubmit={handleCreateRequest} className="space-y-4">
                                {selectedMethod.inputs.length > 0 ? (
                                    <div className="space-y-4">
                                        {selectedMethod.inputs.map((input) => (
                                            <div key={input.name}>
                                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                                    {input.name} <span className="text-purple-400">({input.type})</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={inputValues[input.name] || ''}
                                                    onChange={(e) => setInputValues({
                                                        ...inputValues,
                                                        [input.name]: e.target.value
                                                    })}
                                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                                    placeholder={
                                                        input.type.endsWith('[]') ? '["a", "b"] or a, b' :
                                                        input.type.startsWith('uint') || input.type.startsWith('int') ? '123' :
                                                        input.type === 'bool' ? 'true' :
                                                        input.type === 'address' ? '0x...' :
                                                        'value'
                                                    }
                                                    required
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic bg-black/20 p-3 rounded-lg">
                                        This method takes no parameters.
                                    </p>
                                )}

                                {/* Deposit */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                        Deposit (STT)
                                    </label>
                                    <div className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white font-mono">
                                        {requestDeposit ? formatEther(requestDeposit as bigint) : '...'} STT
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Required deposit. Unused funds are rebated after execution.
                                    </p>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isLoading || !isConnected}
                                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                                >
                                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {!isConnected ? "Connect Wallet" :
                                     isSimulating ? "Simulating..." :
                                     isPending ? "Confirming..." :
                                     isConfirming ? "Waiting..." :
                                     <>
                                         <Play className="w-4 h-4" />
                                         Execute {selectedMethod.name}()
                                     </>}
                                </button>
                            </form>

                            {/* Errors */}
                            {simulationError && (
                                <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                                    <p className="text-sm font-medium text-red-400 mb-1">Transaction Simulation Failed</p>
                                    <p className="text-sm text-red-300 font-mono bg-black/30 p-2 rounded mt-2 break-all">{simulationError}</p>
                                </div>
                            )}

                            {writeError && !simulationError && (
                                <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                                    <p className="text-sm font-medium text-red-400 mb-1">Transaction Error</p>
                                    <p className="text-sm text-red-300 font-mono bg-black/30 p-2 rounded mt-2 break-all">{writeError.message}</p>
                                </div>
                            )}

                            {/* Request Tracking */}
                            {trackedRequest && (
                                <div className="mt-6 space-y-4">
                                    <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                                        <h3 className="text-sm font-bold text-white">Request #{trackedRequest.id.toString()}</h3>
                                        {trackedRequest.status === 'pending' && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                                <Clock className="w-3 h-3" />
                                                Pending
                                            </span>
                                        )}
                                        {trackedRequest.status === 'finalized' && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                                <CheckCircle className="w-3 h-3" />
                                                Finalized
                                            </span>
                                        )}
                                        {trackedRequest.status === 'timeout' && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                                                <AlertCircle className="w-3 h-3" />
                                                Timed Out
                                            </span>
                                        )}
                                    </div>

                                    {trackedRequest.txHash && (
                                        <div className="text-xs">
                                            <span className="text-gray-500">Transaction: </span>
                                            <a
                                                href={`https://shannon-explorer.somnia.network/tx/${trackedRequest.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-purple-400 hover:underline font-mono"
                                            >
                                                {trackedRequest.txHash.slice(0, 10)}...{trackedRequest.txHash.slice(-8)}
                                            </a>
                                        </div>
                                    )}

                                    {/* Responses */}
                                    {trackedRequest.responses.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                Responses ({trackedRequest.responses.length})
                                            </h4>
                                            {trackedRequest.responses.map((response, idx) => (
                                                <div key={idx} className="bg-black/30 rounded-lg border border-white/5 p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="font-mono text-sm text-blue-400">
                                                            {response.validator.slice(0, 6)}...{response.validator.slice(-4)}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            Cost: {formatEther(response.cost)} STT
                                                        </span>
                                                    </div>

                                                    <span className={`text-xs ${response.status === 1 ? 'text-green-400' : response.status === 2 ? 'text-red-400' : 'text-gray-400'}`}>
                                                        {response.status === 1 ? 'Success' : response.status === 2 ? 'Failed' : 'Pending'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}


                                    {/* Receipts - contains the actual execution result */}
                                    {trackedRequest.status === 'finalized' && (
                                        trackedRequest.receiptsFetching ? (
                                            <div className="flex items-center gap-3 p-4 bg-black/30 rounded-lg border border-white/10">
                                                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                                                <span className="text-sm text-gray-500">Loading execution receipts...</span>
                                            </div>
                                        ) : trackedRequest.receipts && trackedRequest.receipts.length > 0 ? (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                    Execution Receipts
                                                </h4>
                                                <ReceiptViewer
                                                    receipts={trackedRequest.receipts}
                                                    abi={metadata?.abi}
                                                />
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-black/30 rounded-lg border border-white/10 flex items-center justify-between">
                                                <span className="text-sm text-gray-500">No execution receipts available yet</span>
                                                <button
                                                    onClick={handleRetryReceipts}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                    Retry
                                                </button>
                                            </div>
                                        )
                                    )}

                                    {/* Waiting indicator */}
                                    {trackedRequest.status === 'pending' && trackedRequest.responses.length === 0 && (
                                        <div className="flex items-center gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                            <div>
                                                <p className="text-sm text-blue-300">Waiting for committee responses...</p>
                                                <p className="text-xs text-blue-400/70 mt-1">
                                                    The subcommittee is executing your request
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Receipts during pending - allows checking execution progress */}
                                    {trackedRequest.status === 'pending' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                    Execution Receipts {trackedRequest.receipts && trackedRequest.receipts.length > 0 && `(${trackedRequest.receipts.length})`}
                                                </h4>
                                                <button
                                                    onClick={handleRetryReceipts}
                                                    disabled={trackedRequest.receiptsFetching}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${trackedRequest.receiptsFetching ? 'animate-spin' : ''}`} />
                                                    {trackedRequest.receiptsFetching ? 'Loading...' : 'Check Receipts'}
                                                </button>
                                            </div>
                                            {trackedRequest.receipts && trackedRequest.receipts.length > 0 ? (
                                                <ReceiptViewer
                                                    receipts={trackedRequest.receipts}
                                                    abi={metadata?.abi}
                                                />
                                            ) : (
                                                <p className="text-xs text-gray-500 p-3 bg-black/20 rounded-lg">
                                                    {trackedRequest.receiptsFetching
                                                        ? 'Fetching receipts...'
                                                        : 'No receipts yet. Click "Check Receipts" to look for execution data.'}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            </>
                            ) : (
                                <div className="relative group">
                                    <div className="rounded-lg overflow-hidden border border-white/5 shadow-inner">
                                        <SyntaxHighlighter
                                            language={getLanguage()}
                                            style={vscDarkPlus}
                                            customStyle={{
                                                margin: 0,
                                                padding: '1rem',
                                                fontSize: '0.75rem',
                                                backgroundColor: 'rgba(2, 6, 23, 0.8)'
                                            }}
                                            wrapLongLines={true}
                                        >
                                            {getCode()}
                                        </SyntaxHighlighter>
                                    </div>
                                    <button
                                        onClick={copyToClipboard}
                                        className="absolute top-2 right-2 px-2 py-1 bg-white/10 text-gray-300 text-xs rounded hover:bg-white/20 transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100"
                                    >
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="text-center space-y-4">
                        <FileJson className="w-12 h-12 mx-auto text-gray-500" />
                        <h3 className="text-lg font-semibold text-white">No Methods Available</h3>
                        <p className="text-gray-400 text-sm max-w-md mx-auto">
                            This agent doesn't have any methods defined in its metadata, or the metadata couldn't be loaded.
                        </p>
                        {agent?.metadataUri && (
                            <a
                                href={agent.metadataUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                            >
                                View Metadata URI
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contract Addresses</h3>
                <div className="space-y-2">
                    <div>
                        <span className="text-xs text-gray-500">SomniaAgents v2: </span>
                        <span className="font-mono text-xs text-purple-400">{SOMNIA_AGENTS_V2_ADDRESS}</span>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500">AgentRegistry v2: </span>
                        <span className="font-mono text-xs text-green-400">{AGENT_REGISTRY_V2_ADDRESS}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
