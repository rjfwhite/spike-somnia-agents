"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, createPublicClient, webSocket, decodeErrorResult, type Hex } from "viem";
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
import { TokenMetadata, AbiFunction, getAbiFunctions } from "@/lib/types";
import { DecodedData } from "@/components/DecodedData";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import { fetchReceipts } from "@/lib/receipts";
import Link from "next/link";
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
    ExternalLink,
    Bot,
    Play,
    List
} from "lucide-react";

interface RequestEvent {
    requestId: bigint;
    agentId?: bigint;
    maxCostPerAgent?: bigint;
    payload?: string;
    subcommittee?: string[];
    validator?: string;
    receipt?: bigint;
    timestamp: number;
    txHash?: string;
    blockNumber?: bigint;
    status?: number;
    type: 'created' | 'finalized';
}

interface RequestDetails {
    requester: string;
    callbackAddress: string;
    callbackSelector: string;
    subcommittee: string[];
    threshold: bigint;
    createdAt: bigint;
    status: number;
    responseCount: bigint;
    consensusType: number;
    maxCost: bigint;
    finalCost: bigint;
}

interface Response {
    validator: string;
    result: string;
    status: number;
    receipt: bigint;
    cost: bigint;
    timestamp: bigint;
}

interface AgentWithMetadata {
    id: string;
    agent: Agent;
    metadata: TokenMetadata | null;
    loading: boolean;
}

export default function RequestsV2Page() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const [events, setEvents] = useState<Map<string, RequestEvent[]>>(new Map());
    const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showAgentBrowser, setShowAgentBrowser] = useState(false);
    const [lookupRequestId, setLookupRequestId] = useState("");
    const [lookupResult, setLookupResult] = useState<{ details: RequestDetails; responses: Response[]; agentMetadata?: TokenMetadata | null; receipts?: any[]; receiptsOnly?: boolean } | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [receiptsLoading, setReceiptsLoading] = useState(false);

    // Agent browser state
    const [allAgents, setAllAgents] = useState<AgentWithMetadata[]>([]);
    const [agentsLoading, setAgentsLoading] = useState(false);

    // Create request form state
    const [agentId, setAgentId] = useState("");
    const [payload, setPayload] = useState("0x");
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

    const { data: maxPerAgentFee } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "maxPerAgentFee",
    });

    const { data: requestDeposit } = useReadContract({
        address: SOMNIA_AGENTS_V2_ADDRESS,
        abi: SOMNIA_AGENTS_V2_ABI,
        functionName: "getRequestDeposit",
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

    // Fetch all agents from registry
    const fetchAllAgents = useCallback(async () => {
        if (!publicClient) return;

        setAgentsLoading(true);
        try {
            const agentIds = await publicClient.readContract({
                address: AGENT_REGISTRY_V2_ADDRESS,
                abi: AGENT_REGISTRY_V2_ABI,
                functionName: "getAllAgents",
            }) as bigint[];

            // Fetch each agent's details
            const agentsWithMetadata: AgentWithMetadata[] = await Promise.all(
                agentIds.map(async (id) => {
                    try {
                        const agent = await publicClient.readContract({
                            address: AGENT_REGISTRY_V2_ADDRESS,
                            abi: AGENT_REGISTRY_V2_ABI,
                            functionName: "getAgent",
                            args: [id],
                        }) as Agent;

                        let metadata: TokenMetadata | null = null;
                        if (agent.metadataUri && (agent.metadataUri.startsWith('http://') || agent.metadataUri.startsWith('https://'))) {
                            try {
                                const res = await fetch(agent.metadataUri);
                                if (res.ok) {
                                    metadata = await res.json();
                                }
                            } catch (e) {
                                // Ignore metadata fetch errors
                            }
                        }

                        return {
                            id: id.toString(),
                            agent,
                            metadata,
                            loading: false,
                        };
                    } catch (e) {
                        return {
                            id: id.toString(),
                            agent: { agentId: id, owner: '', metadataUri: '', containerImageUri: '', cost: BigInt(0) },
                            metadata: null,
                            loading: false,
                        };
                    }
                })
            );

            setAllAgents(agentsWithMetadata);
        } catch (e) {
            console.error("Failed to fetch agents:", e);
        } finally {
            setAgentsLoading(false);
        }
    }, [publicClient]);

    // Load agents when browser is opened
    useEffect(() => {
        if (showAgentBrowser && allAgents.length === 0 && !agentsLoading) {
            fetchAllAgents();
        }
    }, [showAgentBrowser, allAgents.length, agentsLoading, fetchAllAgents]);

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
                    const { requestId, agentId, maxCostPerAgent, payload, subcommittee } = log.args as {
                        requestId: bigint;
                        agentId: bigint;
                        maxCostPerAgent: bigint;
                        payload: string;
                        subcommittee: string[];
                    };

                    const event: RequestEvent = {
                        requestId,
                        agentId,
                        maxCostPerAgent,
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

        const unwatchFinalized = client.watchContractEvent({
            address: SOMNIA_AGENTS_V2_ADDRESS,
            abi: SOMNIA_AGENTS_V2_ABI,
            eventName: "RequestFinalized",
            onLogs: (logs) => {
                logs.forEach((log) => {
                    const { requestId, status } = log.args as {
                        requestId: bigint;
                        status: number;
                    };

                    const event: RequestEvent = {
                        requestId,
                        status,
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

        return () => {
            unwatchCreated();
            unwatchFinalized();
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
        if (!agentId || !requestDeposit || !publicClient || !address) return;

        setSimulationError(null);
        setIsSimulating(true);

        const deposit = requestDeposit as bigint;

        try {
            // Simulate the transaction first to get detailed revert reasons
            await publicClient.simulateContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress as `0x${string}`, callbackSelector as `0x${string}`, payload as `0x${string}`],
                value: deposit,
                account: address,
            });

            // If simulation passes, proceed with the actual transaction
            setIsSimulating(false);
            writeContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "createRequest",
                args: [BigInt(agentId), callbackAddress as `0x${string}`, callbackSelector as `0x${string}`, payload as `0x${string}`],
                value: deposit,
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
            }) as unknown as [string, string, string, string[], bigint, bigint, number, bigint, number, bigint, bigint];

            const responses = await publicClient.readContract({
                address: SOMNIA_AGENTS_V2_ADDRESS,
                abi: SOMNIA_AGENTS_V2_ABI,
                functionName: "getResponses",
                args: [BigInt(lookupRequestId)],
            }) as Response[];

            // Try to get the agent metadata for response decoding
            // First, we need to find the agentId from the events
            let agentMetadata: TokenMetadata | null = null;

            // Check if we have a RequestCreated event in our cache with this request ID
            const requestEvents = events.get(lookupRequestId);
            const createdEvent = requestEvents?.find(e => e.type === 'created');
            if (createdEvent?.agentId) {
                try {
                    const agent = await publicClient.readContract({
                        address: AGENT_REGISTRY_V2_ADDRESS,
                        abi: AGENT_REGISTRY_V2_ABI,
                        functionName: "getAgent",
                        args: [createdEvent.agentId],
                    }) as Agent;

                    if (agent.metadataUri && (agent.metadataUri.startsWith('http://') || agent.metadataUri.startsWith('https://'))) {
                        const res = await fetch(agent.metadataUri);
                        if (res.ok) {
                            agentMetadata = await res.json();
                        }
                    }
                } catch (e) {
                    // Ignore - we just won't be able to decode responses
                }
            }

            // Fetch receipts for execution details
            let receipts: any[] = [];
            try {
                receipts = await fetchReceipts(lookupRequestId);
            } catch (e) {
                // Ignore - receipts may not be available
            }

            setLookupResult({
                details: {
                    requester: details[0],
                    callbackAddress: details[1],
                    callbackSelector: details[2],
                    subcommittee: details[3],
                    threshold: details[4],
                    createdAt: details[5],
                    status: details[6],
                    responseCount: details[7],
                    consensusType: details[8],
                    maxCost: details[9],
                    finalCost: details[10],
                },
                responses,
                agentMetadata,
                receipts,
            });
        } catch (err) {
            console.error("Failed to lookup request:", err);
            setLookupError(err instanceof Error ? err.message : "Request not found or overwritten");
        } finally {
            setLookupLoading(false);
        }
    };

    const handleRefreshReceipts = async () => {
        if (!lookupRequestId) return;

        setReceiptsLoading(true);
        try {
            const receipts = await fetchReceipts(lookupRequestId);
            if (lookupResult) {
                setLookupResult(prev => prev ? { ...prev, receipts } : null);
            } else {
                // Show receipts even without a full lookup
                setLookupResult({
                    details: {
                        requester: '',
                        callbackAddress: '',
                        callbackSelector: '',
                        subcommittee: [],
                        threshold: BigInt(0),
                        createdAt: BigInt(0),
                        status: 0,
                        responseCount: BigInt(0),
                        consensusType: 0,
                        maxCost: BigInt(0),
                        finalCost: BigInt(0),
                    },
                    responses: [],
                    receipts,
                    receiptsOnly: true,
                });
            }
        } catch (e) {
            // Ignore - receipts may not be available
        } finally {
            setReceiptsLoading(false);
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

    function getRequestStatus(events: RequestEvent[]): 'pending' | 'finalized' | 'failed' | 'timeout' {
        const finalized = events.find(e => e.type === 'finalized');
        if (finalized) {
            if (finalized.status === 3) return 'timeout';
            if (finalized.status === 2) return 'failed';
            return 'finalized';
        }
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
                <StatCard label="Per Agent Fee" value={maxPerAgentFee ? `${formatEther(maxPerAgentFee)} STT` : '0.01 STT'} icon={<AlertCircle className="w-4 h-4" />} />
                <StatCard
                    label="Active Members"
                    value={`${activeMemberCount}/${requiredMembers}`}
                    icon={<Users className="w-4 h-4" />}
                    highlight={activeMemberCount < requiredMembers ? 'red' : 'green'}
                />
            </div>

            {/* Agent Browser */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg overflow-hidden">
                <button
                    onClick={() => setShowAgentBrowser(!showAgentBrowser)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Bot className="w-5 h-5 text-purple-400" />
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-white">Browse Agents</h3>
                            <p className="text-xs text-gray-500">Select an agent to make a request with automatic encoding</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {allAgents.length > 0 && (
                            <span className="text-xs text-gray-500">{allAgents.length} agents</span>
                        )}
                        {showAgentBrowser ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                    </div>
                </button>

                {showAgentBrowser && (
                    <div className="border-t border-white/10 p-4">
                        {agentsLoading ? (
                            <div className="flex items-center justify-center py-8 gap-3">
                                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                                <span className="text-gray-400">Loading agents...</span>
                            </div>
                        ) : allAgents.length === 0 ? (
                            <div className="text-center py-8">
                                <Bot className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                                <p className="text-gray-500">No agents found in the registry</p>
                                <Link
                                    href="/agents-v2"
                                    className="inline-flex items-center gap-2 mt-3 text-sm text-purple-400 hover:text-purple-300"
                                >
                                    Create an agent
                                    <ExternalLink className="w-4 h-4" />
                                </Link>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {allAgents.map((agentData) => {
                                    const methods = agentData.metadata ? getAbiFunctions(agentData.metadata) : [];
                                    return (
                                        <Link
                                            key={agentData.id}
                                            href={`/request-v2/${agentData.id}`}
                                            className="block p-4 bg-black/30 hover:bg-black/40 border border-white/5 hover:border-purple-500/30 rounded-lg transition-all group"
                                        >
                                            <div className="flex items-start gap-3">
                                                {agentData.metadata?.image ? (
                                                    <img
                                                        src={agentData.metadata.image}
                                                        alt={agentData.metadata.name || 'Agent'}
                                                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                                        <Bot className="w-5 h-5 text-purple-400" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                                                        {agentData.metadata?.name || `Agent ${agentData.id}`}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 font-mono">ID: {agentData.id}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs text-green-400 font-mono">
                                                            Agent
                                                        </span>
                                                        {methods.length > 0 && (
                                                            <span className="text-xs text-gray-500">
                                                                {methods.length} method{methods.length !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Play className="w-4 h-4 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                            </div>
                                            {agentData.metadata?.description && (
                                                <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                                    {agentData.metadata.description}
                                                </p>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/5">
                            <button
                                onClick={() => fetchAllAgents()}
                                disabled={agentsLoading}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${agentsLoading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                            <Link
                                href="/agents-v2"
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                            >
                                <List className="w-3 h-3" />
                                Manage Agents
                            </Link>
                        </div>
                    </div>
                )}
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
                    <h2 className="text-lg font-bold text-white mb-2">Create New Request (Advanced)</h2>
                    <p className="text-sm text-gray-400 mb-4">
                        For automatic payload encoding, use the{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setShowCreateForm(false);
                                setShowAgentBrowser(true);
                            }}
                            className="text-purple-400 hover:text-purple-300 underline"
                        >
                            Agent Browser
                        </button>{' '}
                        above to select an agent and its methods.
                    </p>
                    <form onSubmit={handleCreateRequest} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                    Agent ID
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={agentId}
                                        onChange={(e) => setAgentId(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                                        placeholder="Agent ID from registry"
                                        required
                                    />
                                    {allAgents.length > 0 && (
                                        <select
                                            value=""
                                            onChange={(e) => setAgentId(e.target.value)}
                                            className="px-2 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                                        >
                                            <option value="">Select...</option>
                                            {allAgents.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.metadata?.name || `Agent ${a.id}`}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                {agentId && allAgents.length > 0 && (
                                    <Link
                                        href={`/request-v2/${agentId}`}
                                        className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-1"
                                    >
                                        <Play className="w-3 h-3" />
                                        Use automatic encoding for this agent
                                    </Link>
                                )}
                            </div>
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
                    <button
                        onClick={handleRefreshReceipts}
                        disabled={receiptsLoading || !lookupRequestId}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                        title="Check for receipts without full lookup"
                    >
                        {receiptsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Receipts
                    </button>
                </div>

                {lookupError && (
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{lookupError}</p>
                    </div>
                )}

                {lookupResult && (
                    <div className="mt-4 space-y-4">
                        {!lookupResult.receiptsOnly && (
                        <>
                        <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Request Details</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500">Requester:</span>
                                    <p className="font-mono text-blue-400">{shortenAddress(lookupResult.details.requester)}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Status:</span>
                                    <p className={lookupResult.details.status !== 0 ? 'text-green-400' : 'text-yellow-400'}>
                                        {lookupResult.details.status === 0 ? 'Pending' : lookupResult.details.status === 1 ? 'Success' : lookupResult.details.status === 2 ? 'Failed' : 'TimedOut'}
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
                                    <span className="text-gray-500">Deposit:</span>
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
                                    Response Details ({lookupResult.responses.length})
                                </h4>
                                <div className="space-y-3">
                                    {lookupResult.responses.map((response, i) => {
                                        const statusLabel = response.status === 1 ? 'Success' : response.status === 2 ? 'Failed' : 'Pending';
                                        const statusColor = response.status === 1 ? 'text-green-400' : response.status === 2 ? 'text-red-400' : 'text-gray-400';

                                        return (
                                            <div key={i} className="p-3 bg-black/30 rounded-lg border border-white/5">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-mono text-sm text-blue-400">{shortenAddress(response.validator)}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
                                                        {response.cost > 0n && (
                                                            <span className="text-xs text-gray-500">
                                                                Cost: {formatEther(response.cost)} STT
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        </>
                        )}

                        {/* Execution Receipts */}
                        <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    Execution Receipts {lookupResult.receipts && lookupResult.receipts.length > 0 && `(${lookupResult.receipts.length})`}
                                </h4>
                                <button
                                    onClick={handleRefreshReceipts}
                                    disabled={receiptsLoading}
                                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-50"
                                    title="Refresh receipts"
                                >
                                    <RefreshCw className={`w-3 h-3 ${receiptsLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                            {lookupResult.receipts && lookupResult.receipts.length > 0 ? (
                                <ReceiptViewer
                                    receipts={lookupResult.receipts}
                                    abi={lookupResult.agentMetadata?.abi}
                                />
                            ) : (
                                <p className="text-sm text-gray-500">
                                    {receiptsLoading ? 'Loading receipts...' : 'No receipts available yet. Try refreshing.'}
                                </p>
                            )}
                        </div>
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
                        {eventsList.length > 0 && (
                            <span className="flex items-center gap-2 ml-2 text-xs font-normal">
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    {eventsList.filter(e => e.status === 'pending').length} pending
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                    {eventsList.filter(e => e.status === 'finalized').length} completed
                                </span>
                                {eventsList.some(e => e.status === 'timeout' || e.status === 'failed') && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                        {eventsList.filter(e => e.status === 'timeout' || e.status === 'failed').length} failed/timed out
                                    </span>
                                )}
                            </span>
                        )}
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
    status: 'pending' | 'finalized' | 'failed' | 'timeout';
}) {
    const [expanded, setExpanded] = useState(false);
    const createdEvent = events.find(e => e.type === 'created');
    const finalizedEvent = events.find(e => e.type === 'finalized');

    const statusColors: Record<string, string> = {
        pending: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        finalized: 'bg-green-500/10 border-green-500/20 text-green-400',
        failed: 'bg-red-500/10 border-red-500/20 text-red-400',
        timeout: 'bg-red-500/10 border-red-500/20 text-red-400',
    };

    const statusIcons: Record<string, React.ReactNode> = {
        pending: <Loader2 className="w-4 h-4 animate-spin" />,
        finalized: <CheckCircle className="w-4 h-4" />,
        failed: <XCircle className="w-4 h-4" />,
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
                    <span className="text-xs text-gray-500 capitalize">{status}</span>
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
                                    <span className="text-gray-500">Cost Per Agent: </span>
                                    <span className="font-mono text-white">{createdEvent.maxCostPerAgent ? formatEther(createdEvent.maxCostPerAgent) : '?'} STT</span>
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

                    {finalizedEvent && (
                        <div className={`p-3 rounded-lg border ${status === 'finalized' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                            <div className={`text-xs uppercase tracking-wider ${status === 'finalized' ? 'text-green-400' : 'text-red-400'}`}>
                                {status === 'finalized' ? 'Finalized' : status === 'failed' ? 'Failed' : 'Timed Out'}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
