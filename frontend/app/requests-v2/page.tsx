"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, createPublicClient, webSocket, decodeErrorResult, type Hex } from "viem";
import {
    SOMNIA_AGENTS_V2_ADDRESS,
    SOMNIA_AGENTS_V2_ABI,
    AGENT_REGISTRY_V2_ADDRESS,
    AGENT_REGISTRY_V2_ABI,
    COMMITTEE_CONTRACT_ADDRESS,
    COMMITTEE_ABI,
    SOMNIA_RPC_URL,
    Agent
} from "@/lib/contract";
import { TokenMetadata, getAbiFunctions } from "@/lib/types";
import {
    Activity,
    Send,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronUp,
    Search,
    RefreshCw,
    Users,
    Zap,
    ExternalLink
} from "lucide-react";

interface RequestEvent {
    requestId: bigint;
    agentId?: bigint;
    requester?: string;
    maxCost?: bigint;
    payload?: string;
    subcommittee?: string[];
    finalCost?: bigint;
    rebate?: bigint;
    validator?: string;
    timestamp: number;
    txHash?: string;
    blockNumber?: bigint;
    type: 'created' | 'response' | 'finalized' | 'timeout';
}

interface RequestDetails {
    requester: string;
    callbackAddress: string;
    callbackSelector: string;
    subcommittee: string[];
    threshold: bigint;
    createdAt: bigint;
    finalized: boolean;
    responseCount: bigint;
    consensusType: number;
    agentCost: bigint;
    maxCost: bigint;
    finalCost: bigint;
}

interface Response {
    validator: string;
    result: string;
    receipt: bigint;
    price: bigint;
    timestamp: bigint;
}

export default function RequestsV2Page() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const [events, setEvents] = useState<Map<string, RequestEvent[]>>(new Map());
    const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [lookupRequestId, setLookupRequestId] = useState("");
    const [lookupResult, setLookupResult] = useState<{ details: RequestDetails; responses: Response[] } | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // Create request form state
    const [agentId, setAgentId] = useState("");
    const [payload, setPayload] = useState("0x");
    const [maxCost, setMaxCost] = useState("0.01");
    const [callbackAddress, setCallbackAddress] = useState("0x0000000000000000000000000000000000000000");
    const [callbackSelector, setCallbackSelector] = useState("0x00000000");
    const [simulationError, setSimulationError] = useState<string | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);

    // Contract state reads
    const { data: nextRequestId, refetch: refetchNextId } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "nextRequestId",
    });

    const { data: oldestPendingId } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "oldestPendingId",
    });

    const { data: defaultSubcommitteeSize } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "defaultSubcommitteeSize",
    });

    const { data: defaultThreshold } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "defaultThreshold",
    });

    const { data: requestTimeout } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "requestTimeout",
    });

    const { data: maxExecutionFee } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "maxExecutionFee",
    });

    // Read active committee members
    const { data: activeMembers } = useReadContract({
        address: COMMITTEE_CONTRACT_ADDRESS,
        abi: COMMITTEE_ABI,
        functionName: "getActiveMembers",
    });

    // Write contract for creating requests
    const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

    // Watch for events via WebSocket
    useEffect(() => {
        const wsUrl = SOMNIA_RPC_URL.replace("https://", "wss://").replace("http://", "ws://") + "ws";
        const client = createPublicClient({
            transport: webSocket(wsUrl),
        });

        setConnectionStatus("connected");

        const unwatchCreated = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "RequestCreated",
            onLogs: (logs) => {
                logs.forEach((log) => {
                    const { requestId, agentId, requester, maxCost, payload, subcommittee } = log.args as {
                        requestId: bigint;
                        agentId: bigint;
                        requester: string;
                        maxCost: bigint;
                        payload: string;
                        subcommittee: string[];
                    };

                    const event: RequestEvent = {
                        requestId,
                        agentId,
                        requester,
                        maxCost,
                        payload,
                        subcommittee,
                        timestamp: Date.now(),
                        txHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        type: 'created'
                    };

                    setEvents(prev => {
                        const newEvents = new Map(prev);
                        const key = requestId.toString();
                        const existing = newEvents.get(key) || [];
                        newEvents.set(key, [...existing, event]);
                        return newEvents;
                    });
                });
            },
            onError: (error) => {
                console.error("Error watching RequestCreated:", error);
                setConnectionStatus("error");
            },
        });

        const unwatchResponse = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "ResponseSubmitted",
            onLogs: (logs) => {
                logs.forEach((log) => {
                    const { requestId, validator } = log.args as {
                        requestId: bigint;
                        validator: string;
                    };

                    const event: RequestEvent = {
                        requestId,
                        validator,
                        timestamp: Date.now(),
                        txHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        type: 'response'
                    };

                    setEvents(prev => {
                        const newEvents = new Map(prev);
                        const key = requestId.toString();
                        const existing = newEvents.get(key) || [];
                        newEvents.set(key, [...existing, event]);
                        return newEvents;
                    });
                });
            },
            onError: (error) => {
                console.error("Error watching ResponseSubmitted:", error);
            },
        });

        const unwatchFinalized = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "RequestFinalized",
            onLogs: (logs) => {
                logs.forEach((log) => {
                    const { requestId, finalCost, rebate } = log.args as {
                        requestId: bigint;
                        finalCost: bigint;
                        rebate: bigint;
                    };

                    const event: RequestEvent = {
                        requestId,
                        finalCost,
                        rebate,
                        timestamp: Date.now(),
                        txHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        type: 'finalized'
                    };

                    setEvents(prev => {
                        const newEvents = new Map(prev);
                        const key = requestId.toString();
                        const existing = newEvents.get(key) || [];
                        newEvents.set(key, [...existing, event]);
                        return newEvents;
                    });
                });
            },
            onError: (error) => {
                console.error("Error watching RequestFinalized:", error);
            },
        });

        const unwatchTimeout = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "RequestTimedOut",
            onLogs: (logs) => {
                logs.forEach((log) => {
                    const { requestId } = log.args as {
                        requestId: bigint;
                    };

                    const event: RequestEvent = {
                        requestId,
                        timestamp: Date.now(),
                        txHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        type: 'timeout'
                    };

                    setEvents(prev => {
                        const newEvents = new Map(prev);
                        const key = requestId.toString();
                        const existing = newEvents.get(key) || [];
                        newEvents.set(key, [...existing, event]);
                        return newEvents;
                    });
                });
            },
            onError: (error) => {
                console.error("Error watching RequestTimedOut:", error);
            },
        });

        return () => {
            unwatchCreated();
            unwatchResponse();
            unwatchFinalized();
            unwatchTimeout();
        };
    }, []);

    // Refetch contract state after successful request
    useEffect(() => {
        if (isConfirmed) {
            refetchNextId();
            setTimeout(() => {
                resetWrite();
                setShowCreateForm(false);
            }, 3000);
        }
    }, [isConfirmed, refetchNextId, resetWrite]);

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agentId || !maxCost || !publicClient || !address) return;

        setSimulationError(null);
        setIsSimulating(true);

        const costInWei = parseEther(maxCost);

        try {
            // Simulate the transaction first to get detailed revert reasons
            await publicClient.simulateContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress as `0x${string}`, callbackSelector as `0x${string}`, payload as `0x${string}`],
                value: costInWei,
                account: address,
            });

            // If simulation passes, proceed with the actual transaction
            setIsSimulating(false);
            writeContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress as `0x${string}`, callbackSelector as `0x${string}`, payload as `0x${string}`],
                value: costInWei,
            });
        } catch (err: any) {
            setIsSimulating(false);
            // Don't console.error - we're handling this gracefully

            // Extract the revert reason from the error
            let errorMessage = "Transaction would fail";

            // First check if viem already decoded the error nicely in the message
            // Format: "Error: AgentNotFound(uint256 agentId) (1221414)"
            const viemErrorMatch = err.message?.match(/Error: (\w+)\([^)]*\)\s*\(([^)]+)\)/);
            if (viemErrorMatch) {
                const [, errorName, args] = viemErrorMatch;
                if (errorName === 'AgentNotFound') {
                    errorMessage = `Agent not found: ID ${args} does not exist in the AgentRegistry. Create the agent first on the Agents v2 page.`;
                    setSimulationError(errorMessage);
                    return;
                } else {
                    errorMessage = `${errorName}(${args})`;
                    setSimulationError(errorMessage);
                    return;
                }
            }

            // Try to decode custom error from the error data
            const errorData = err.cause?.data || err.data;
            if (errorData && errorData.startsWith('0x')) {
                try {
                    // Try decoding with SomniaAgents ABI (includes AgentRegistry errors)
                    const decoded = decodeErrorResult({
                        abi: SOMNIA_AGENTS_V2_ABI,
                        data: errorData as Hex,
                    }) as { errorName: string; args?: readonly unknown[] };

                    if (decoded.errorName === 'AgentNotFound') {
                        const agentIdArg = decoded.args?.[0];
                        errorMessage = `Agent not found: ID ${agentIdArg?.toString() || agentId} does not exist in the AgentRegistry`;
                    } else if (decoded.errorName === 'NotAgentOwner') {
                        errorMessage = `Not the agent owner`;
                    } else {
                        errorMessage = `${decoded.errorName}: ${JSON.stringify(decoded.args)}`;
                    }
                } catch (decodeErr) {
                    // If decoding fails, check for known error signatures
                    if (errorData.startsWith('0x0ede9759')) {
                        // AgentNotFound(uint256)
                        errorMessage = `Agent not found: ID ${agentId} does not exist in the AgentRegistry. Create the agent first on the Agents v2 page.`;
                    } else if (errorData.startsWith('0x08c379a0')) {
                        // Error(string) - standard revert with message
                        // Try to extract the message
                        try {
                            const msgLength = parseInt(errorData.slice(138, 202), 16);
                            const msgHex = errorData.slice(202, 202 + msgLength * 2);
                            const message = Buffer.from(msgHex, 'hex').toString('utf8');
                            errorMessage = message;
                        } catch {
                            errorMessage = `Revert: ${errorData}`;
                        }
                    } else {
                        errorMessage = `Unknown error: ${errorData.slice(0, 10)}... (check https://openchain.xyz/signatures?query=${errorData.slice(0, 10)})`;
                    }
                }
            } else if (err.cause?.reason) {
                errorMessage = err.cause.reason;
            } else if (err.cause?.message) {
                errorMessage = err.cause.message;
            } else if (err.message) {
                // Try to parse the error message for revert reasons
                const match = err.message.match(/reverted with reason string '([^']+)'/);
                if (match) {
                    errorMessage = match[1];
                } else if (err.message.includes("SomniaAgents:")) {
                    const agentMatch = err.message.match(/SomniaAgents: ([^"]+)/);
                    if (agentMatch) {
                        errorMessage = `SomniaAgents: ${agentMatch[1]}`;
                    }
                } else if (err.message.includes("0x0ede9759")) {
                    errorMessage = `Agent not found: ID ${agentId} does not exist in the AgentRegistry. Create the agent first on the Agents v2 page.`;
                } else if (err.message.includes("not enough active members")) {
                    errorMessage = `Not enough active committee members. Need ${defaultSubcommitteeSize || 3}, have ${(activeMembers as string[])?.length || 0}`;
                } else if (err.shortMessage) {
                    errorMessage = err.shortMessage;
                } else {
                    errorMessage = err.message;
                }
            }

            setSimulationError(errorMessage);
        }
    };

    const handleLookupRequest = async () => {
        if (!lookupRequestId || !publicClient) return;

        setLookupLoading(true);
        setLookupError(null);
        setLookupResult(null);

        try {
            const details = await publicClient.readContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "getRequest",
                args: [BigInt(lookupRequestId)],
            }) as [string, string, string, string[], bigint, bigint, boolean, bigint, number, bigint, bigint, bigint];

            const responses = await publicClient.readContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "getResponses",
                args: [BigInt(lookupRequestId)],
            }) as Response[];

            setLookupResult({
                details: {
                    requester: details[0],
                    callbackAddress: details[1],
                    callbackSelector: details[2],
                    subcommittee: details[3],
                    threshold: details[4],
                    createdAt: details[5],
                    finalized: details[6],
                    responseCount: details[7],
                    consensusType: details[8],
                    agentCost: details[9],
                    maxCost: details[10],
                    finalCost: details[11],
                },
                responses,
            });
        } catch (err) {
            console.error("Failed to lookup request:", err);
            setLookupError(err instanceof Error ? err.message : "Request not found or overwritten");
        } finally {
            setLookupLoading(false);
        }
    };

    const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    // Convert events map to sorted list (by most recent activity)
    const eventsList = Array.from(events.entries())
        .map(([requestId, events]) => ({
            requestId,
            events,
            latestTimestamp: Math.max(...events.map(e => e.timestamp)),
            status: getRequestStatus(events),
        }))
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    function getRequestStatus(events: RequestEvent[]): 'pending' | 'finalized' | 'timeout' {
        if (events.some(e => e.type === 'timeout')) return 'timeout';
        if (events.some(e => e.type === 'finalized')) return 'finalized';
        return 'pending';
    }

    const isLoading = isSimulating || isPending || isConfirming;
    const activeMemberCount = (activeMembers as string[])?.length || 0;
    const requiredMembers = Number(defaultSubcommitteeSize) || 3;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Requests</h1>
                    <p className="text-gray-400 mt-2">Monitor and create agent requests on SomniaAgents v2</p>
                </div>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {showCreateForm ? <ChevronUp className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {showCreateForm ? 'Hide Form' : 'Create Request'}
                </button>
            </div>

            {/* Contract State Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <StatCard label="Next Request ID" value={nextRequestId?.toString() || '0'} icon={<Zap className="w-4 h-4" />} />
                <StatCard label="Oldest Pending" value={oldestPendingId?.toString() || '0'} icon={<Clock className="w-4 h-4" />} />
                <StatCard label="Subcommittee Size" value={defaultSubcommitteeSize?.toString() || '3'} icon={<Users className="w-4 h-4" />} />
                <StatCard label="Threshold" value={defaultThreshold?.toString() || '2'} icon={<CheckCircle className="w-4 h-4" />} />
                <StatCard label="Timeout" value={requestTimeout ? `${Number(requestTimeout)}s` : '60s'} icon={<Clock className="w-4 h-4" />} />
                <StatCard label="Max Fee" value={maxExecutionFee ? `${formatEther(maxExecutionFee)} STT` : '1 STT'} icon={<AlertCircle className="w-4 h-4" />} />
                <StatCard
                    label="Active Members"
                    value={`${activeMemberCount}/${requiredMembers}`}
                    icon={<Users className="w-4 h-4" />}
                    highlight={activeMemberCount < requiredMembers ? 'red' : 'green'}
                />
            </div>

            {/* Warning if not enough members */}
            {activeMemberCount < requiredMembers && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-yellow-400 font-bold text-sm">Not Enough Committee Members</h3>
                            <p className="text-yellow-300/80 text-sm mt-1">
                                Creating requests requires at least {requiredMembers} active committee members, but only {activeMemberCount} are currently active.
                                Members need to join via the Committee page and send heartbeats to stay active.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Request Form */}
            {showCreateForm && (
                <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Create New Request</h2>
                    <form onSubmit={handleCreateRequest} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                    Agent ID
                                </label>
                                <input
                                    type="text"
                                    value={agentId}
                                    onChange={(e) => setAgentId(e.target.value)}
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                    placeholder="Agent ID from registry"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                    Max Cost (STT)
                                </label>
                                <input
                                    type="text"
                                    value={maxCost}
                                    onChange={(e) => setMaxCost(e.target.value)}
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                    placeholder="0.01"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                Payload (hex)
                            </label>
                            <input
                                type="text"
                                value={payload}
                                onChange={(e) => setPayload(e.target.value)}
                                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                placeholder="0x..."
                            />
                            <p className="text-xs text-gray-500 mt-1">ABI-encoded function call data</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                    Callback Address
                                </label>
                                <input
                                    type="text"
                                    value={callbackAddress}
                                    onChange={(e) => setCallbackAddress(e.target.value)}
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                    placeholder="0x0000..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                    Callback Selector
                                </label>
                                <input
                                    type="text"
                                    value={callbackSelector}
                                    onChange={(e) => setCallbackSelector(e.target.value)}
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                    placeholder="0x00000000"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !isConnected}
                            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isSimulating ? "Simulating..." : isPending ? "Confirming..." : isConfirming ? "Waiting..." : "Create Request"}
                        </button>
                    </form>

                    {/* Simulation Error - shows detailed revert reason */}
                    {simulationError && (
                        <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                            <p className="text-sm font-medium text-red-400 mb-1">Transaction Simulation Failed</p>
                            <p className="text-sm text-red-300 font-mono bg-black/30 p-2 rounded mt-2 break-all">{simulationError}</p>
                        </div>
                    )}

                    {/* Write Error - for wallet/tx errors */}
                    {writeError && !simulationError && (
                        <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                            <p className="text-sm font-medium text-red-400 mb-1">Transaction Error</p>
                            <p className="text-sm text-red-300 font-mono bg-black/30 p-2 rounded mt-2 break-all">{writeError.message}</p>
                        </div>
                    )}

                    {isConfirmed && txHash && (
                        <div className="mt-4 p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                            <p className="text-sm font-medium text-green-400">Request created successfully!</p>
                            <a
                                href={`https://shannon-explorer.somnia.network/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                            >
                                View transaction <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Request Lookup */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Lookup Request</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={lookupRequestId}
                        onChange={(e) => setLookupRequestId(e.target.value)}
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                        placeholder="Enter request ID"
                    />
                    <button
                        onClick={handleLookupRequest}
                        disabled={lookupLoading || !lookupRequestId}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Lookup
                    </button>
                </div>

                {lookupError && (
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{lookupError}</p>
                    </div>
                )}

                {lookupResult && (
                    <div className="mt-4 space-y-4">
                        <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Request Details</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500">Requester:</span>
                                    <p className="font-mono text-blue-400">{shortenAddress(lookupResult.details.requester)}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Status:</span>
                                    <p className={lookupResult.details.finalized ? 'text-green-400' : 'text-yellow-400'}>
                                        {lookupResult.details.finalized ? 'Finalized' : 'Pending'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Responses:</span>
                                    <p className="text-white">{lookupResult.details.responseCount.toString()} / {lookupResult.details.threshold.toString()}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Consensus:</span>
                                    <p className="text-white">{lookupResult.details.consensusType === 0 ? 'Majority' : 'Threshold'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Max Cost:</span>
                                    <p className="font-mono text-white">{formatEther(lookupResult.details.maxCost)} STT</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Final Cost:</span>
                                    <p className="font-mono text-white">{formatEther(lookupResult.details.finalCost)} STT</p>
                                </div>
                            </div>

                            <div className="mt-4">
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Subcommittee</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {lookupResult.details.subcommittee.map((addr, i) => (
                                        <span key={i} className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-xs font-mono text-purple-400">
                                            {shortenAddress(addr)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {lookupResult.responses.length > 0 && (
                            <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                    Responses ({lookupResult.responses.length})
                                </h4>
                                <div className="space-y-2">
                                    {lookupResult.responses.map((response, i) => (
                                        <div key={i} className="p-3 bg-black/30 rounded-lg border border-white/5">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-mono text-sm text-blue-400">{shortenAddress(response.validator)}</span>
                                                <span className="text-xs text-gray-500">
                                                    Price: {formatEther(response.price)} STT
                                                </span>
                                            </div>
                                            <div className="text-xs">
                                                <span className="text-gray-500">Result: </span>
                                                <span className="font-mono text-green-400 break-all">
                                                    {response.result.length > 66
                                                        ? `${response.result.slice(0, 34)}...${response.result.slice(-32)}`
                                                        : response.result
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Live Event Stream */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionStatus === "connected" ? "bg-green-400" : "bg-red-400"}`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${connectionStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}></span>
                        </span>
                        Live Events
                    </h3>
                    <span className={`text-xs px-2 py-1 rounded-full border ${
                        connectionStatus === "connected"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}>
                        {connectionStatus === "connected" ? "Connected" : "Disconnected"}
                    </span>
                </div>

                {eventsList.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">Waiting for events...</p>
                        <p className="text-xs mt-1">Create a request to see it appear here</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {eventsList.map(({ requestId, events, status }) => (
                            <RequestEventCard
                                key={requestId}
                                requestId={requestId}
                                events={events}
                                status={status}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">SomniaAgents v2 Contract</h3>
                <p className="font-mono text-sm text-purple-400 break-all">{SOMNIA_AGENTS_V2_ADDRESS}</p>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: 'red' | 'green' }) {
    const borderColor = highlight === 'red' ? 'border-red-500/30' : highlight === 'green' ? 'border-green-500/30' : 'border-white/10';
    const textColor = highlight === 'red' ? 'text-red-400' : highlight === 'green' ? 'text-green-400' : 'text-white';

    return (
        <div className={`bg-slate-900/50 border ${borderColor} rounded-lg p-3`}>
            <div className="flex items-center gap-2 text-gray-500 mb-1">
                {icon}
                <span className="text-xs uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-lg font-bold ${textColor} font-mono`}>{value}</p>
        </div>
    );
}

function RequestEventCard({
    requestId,
    events,
    status,
}: {
    requestId: string;
    events: RequestEvent[];
    status: 'pending' | 'finalized' | 'timeout';
}) {
    const [expanded, setExpanded] = useState(false);
    const createdEvent = events.find(e => e.type === 'created');
    const responseEvents = events.filter(e => e.type === 'response');
    const finalizedEvent = events.find(e => e.type === 'finalized');
    const timeoutEvent = events.find(e => e.type === 'timeout');

    const statusColors = {
        pending: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        finalized: 'bg-green-500/10 border-green-500/20 text-green-400',
        timeout: 'bg-red-500/10 border-red-500/20 text-red-400',
    };

    const statusIcons = {
        pending: <Loader2 className="w-4 h-4 animate-spin" />,
        finalized: <CheckCircle className="w-4 h-4" />,
        timeout: <XCircle className="w-4 h-4" />,
    };

    return (
        <div className={`rounded-lg border ${statusColors[status]} p-4`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {statusIcons[status]}
                    <div>
                        <span className="font-mono font-bold text-white">Request #{requestId}</span>
                        {createdEvent?.agentId && (
                            <span className="ml-2 text-xs text-gray-500">Agent #{createdEvent.agentId.toString()}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                        {responseEvents.length} response{responseEvents.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-white/10 rounded">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="mt-4 space-y-3 text-sm">
                    {createdEvent && (
                        <div className="p-3 bg-black/20 rounded-lg">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Created</div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-gray-500">Requester: </span>
                                    <span className="font-mono text-blue-400">{createdEvent.requester?.slice(0, 10)}...</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Max Cost: </span>
                                    <span className="font-mono text-white">{createdEvent.maxCost ? formatEther(createdEvent.maxCost) : '?'} STT</span>
                                </div>
                            </div>
                            {createdEvent.subcommittee && (
                                <div className="mt-2">
                                    <span className="text-gray-500">Subcommittee: </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {createdEvent.subcommittee.map((addr, i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 rounded text-xs font-mono text-purple-400">
                                                {addr.slice(0, 8)}...
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {responseEvents.length > 0 && (
                        <div className="p-3 bg-black/20 rounded-lg">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Responses ({responseEvents.length})</div>
                            {responseEvents.map((event, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                    <span className="font-mono text-blue-400">{event.validator?.slice(0, 10)}...</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {finalizedEvent && (
                        <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                            <div className="text-xs text-green-400 uppercase tracking-wider mb-2">Finalized</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-gray-500">Final Cost: </span>
                                    <span className="font-mono text-white">{finalizedEvent.finalCost ? formatEther(finalizedEvent.finalCost) : '?'} STT</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Rebate: </span>
                                    <span className="font-mono text-green-400">{finalizedEvent.rebate ? formatEther(finalizedEvent.rebate) : '0'} STT</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {timeoutEvent && (
                        <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                            <div className="text-xs text-red-400 uppercase tracking-wider">Request Timed Out</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
