"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { AGENT_REGISTRY_V2_ABI, Agent } from "@/lib/contract";
import { useNetwork } from "@/lib/network-context";
import { TokenMetadata, getAbiFunctions } from "@/lib/types";
import { uploadFile } from "@/lib/files";
import {
    Plus,
    Loader2,
    Wallet,
    X,
    Check,
    FileJson,
    Package,
    ExternalLink,
    AlertTriangle,
    Dices,
    ChevronDown,
    ChevronUp,
    Trash2,
    Edit3,
    Eye,
    Play
} from "lucide-react";
import Link from "next/link";
import { MethodViewer } from "@/components/MethodViewer";

type InputMode = 'upload' | 'url';

interface UploadState {
    file: File | null;
    url: string | null;
    uploading: boolean;
    progress: number;
    error: string | null;
}

interface AgentData {
    id: string;
    owner: string;
    metadataUri: string;
    containerImageUri: string;
    metadata: TokenMetadata | null;
}

export default function AgentsPage() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const { currentNetwork } = useNetwork();
    const AGENT_REGISTRY_V2_ADDRESS = currentNetwork.contracts.agentRegistry;
    const [agents, setAgents] = useState<AgentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingAgent, setEditingAgent] = useState<AgentData | null>(null);

    // Form state
    const [agentId, setAgentId] = useState("");
    const [metadataMode, setMetadataMode] = useState<InputMode>('upload');
    const [metadataUrl, setMetadataUrl] = useState("");
    const [containerMode, setContainerMode] = useState<InputMode>('upload');
    const [containerUrl, setContainerUrl] = useState("");
    const [jsonUpload, setJsonUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });
    const [containerUpload, setContainerUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });

    // Write contract hook for setAgent
    const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

    // Delete contract hook
    const { writeContract: writeDelete, data: deleteHash, isPending: isDeleting, error: deleteError } = useWriteContract();
    const { isLoading: isConfirmingDelete, isSuccess: isDeleteConfirmed } = useWaitForTransactionReceipt({ hash: deleteHash });

    // Get agent IDs owned by connected address
    const { data: agentIds, isLoading: isLoadingIds, error: idsError, refetch } = useReadContract({
        address: AGENT_REGISTRY_V2_ADDRESS,
        abi: AGENT_REGISTRY_V2_ABI,
        functionName: "getAgentsByOwner",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    // Fetch agent details and metadata
    useEffect(() => {
        if (!publicClient || !agentIds || (agentIds as bigint[]).length === 0) {
            setAgents([]);
            setLoading(false);
            return;
        }

        const fetchAgentDetails = async () => {
            setLoading(true);
            setError(null);

            try {
                const agentPromises = (agentIds as bigint[]).map(async (agentId) => {
                    const agent = await publicClient.readContract({
                        address: AGENT_REGISTRY_V2_ADDRESS,
                        abi: AGENT_REGISTRY_V2_ABI,
                        functionName: "getAgent",
                        args: [agentId],
                    }) as Agent;

                    let metadata = null;
                    if (agent.metadataUri && (agent.metadataUri.startsWith('http://') || agent.metadataUri.startsWith('https://'))) {
                        try {
                            const res = await fetch(agent.metadataUri);
                            if (res.ok) {
                                metadata = await res.json();
                            }
                        } catch (e) {
                            console.error(`Failed to fetch metadata for agent ${agentId}`, e);
                        }
                    }

                    return {
                        id: agentId.toString(),
                        owner: agent.owner,
                        metadataUri: agent.metadataUri,
                        containerImageUri: agent.containerImageUri,
                        metadata,
                    };
                });

                const agentsData = await Promise.all(agentPromises);
                setAgents(agentsData);
            } catch (err) {
                console.error("Failed to fetch agent details:", err);
                setError(err instanceof Error ? err.message : "Failed to load agents");
            } finally {
                setLoading(false);
            }
        };

        fetchAgentDetails();
    }, [publicClient, agentIds]);

    // Refetch after successful create/update
    useEffect(() => {
        if (isConfirmed) {
            refetch();
            // Reset form after success
            setTimeout(() => {
                resetForm();
                setShowCreateForm(false);
                setEditingAgent(null);
                resetWrite();
            }, 2000);
        }
    }, [isConfirmed, refetch, resetWrite]);

    // Refetch after successful delete
    useEffect(() => {
        if (isDeleteConfirmed) {
            refetch();
        }
    }, [isDeleteConfirmed, refetch]);

    const resetForm = () => {
        setAgentId("");
        setMetadataMode('upload');
        setMetadataUrl("");
        setContainerMode('upload');
        setContainerUrl("");
        setJsonUpload({ file: null, url: null, uploading: false, progress: 0, error: null });
        setContainerUpload({ file: null, url: null, uploading: false, progress: 0, error: null });
    };

    const generateAgentId = useCallback(() => {
        const randomBytes = new Uint8Array(8);
        crypto.getRandomValues(randomBytes);
        let bigIntValue = BigInt(0);
        for (let i = 0; i < randomBytes.length; i++) {
            bigIntValue = (bigIntValue << BigInt(8)) | BigInt(randomBytes[i]);
        }
        setAgentId(bigIntValue.toString());
    }, []);

    const handleContainerUpload = useCallback(async (file: File) => {
        const validExtensions = ['.tar', '.tar.gz', '.tgz'];
        const isValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

        if (!isValidExtension) {
            setContainerUpload(prev => ({ ...prev, error: 'Please select a container image tarball (.tar, .tar.gz, .tgz)' }));
            return;
        }

        setContainerUpload({ file, url: null, uploading: true, progress: 0, error: null });

        try {
            const result = await uploadFile(file, {
                pathname: `agents/containers/${Date.now()}-${file.name}`,
                onProgress: (progress) => setContainerUpload(prev => ({ ...prev, progress })),
            });
            setContainerUpload(prev => ({ ...prev, url: result.url, uploading: false }));
        } catch (err) {
            setContainerUpload(prev => ({
                ...prev,
                uploading: false,
                error: err instanceof Error ? err.message : 'Upload failed'
            }));
        }
    }, []);

    const handleJsonUpload = useCallback(async (file: File) => {
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            setJsonUpload(prev => ({ ...prev, error: 'Please select a JSON file' }));
            return;
        }

        try {
            const text = await file.text();
            const json = JSON.parse(text);

            if (!json.name || !json.abi) {
                setJsonUpload(prev => ({ ...prev, error: 'Invalid metadata: must have "name" and "abi" fields' }));
                return;
            }

            setJsonUpload({ file, url: null, uploading: true, progress: 0, error: null });

            const result = await uploadFile(file, {
                pathname: `agents/metadata/${Date.now()}-${file.name}`,
                onProgress: (progress) => setJsonUpload(prev => ({ ...prev, progress })),
            });
            setJsonUpload(prev => ({ ...prev, url: result.url, uploading: false }));
        } catch (err) {
            setJsonUpload(prev => ({
                ...prev,
                uploading: false,
                error: err instanceof Error ? err.message : 'Invalid JSON file'
            }));
        }
    }, []);

    const handleSetAgent = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!agentId) return;

        let finalMetadataUri = metadataUrl;
        if (metadataMode === 'upload') {
            if (jsonUpload.url) {
                finalMetadataUri = jsonUpload.url;
            } else {
                return;
            }
        }
        if (!finalMetadataUri) return;

        let finalContainerUri = containerUrl;
        if (containerMode === 'upload') {
            if (containerUpload.url) {
                finalContainerUri = containerUpload.url;
            } else {
                return;
            }
        }
        if (!finalContainerUri) return;

        writeContract({
            address: AGENT_REGISTRY_V2_ADDRESS,
            abi: AGENT_REGISTRY_V2_ABI,
            functionName: "setAgent",
            args: [BigInt(agentId), finalMetadataUri, finalContainerUri],
        });
    };

    const handleDeleteAgent = (agentId: string) => {
        if (confirm(`Are you sure you want to delete agent ${agentId}? This action cannot be undone.`)) {
            writeDelete({
                address: AGENT_REGISTRY_V2_ADDRESS,
                abi: AGENT_REGISTRY_V2_ABI,
                functionName: "deleteAgent",
                args: [BigInt(agentId)],
            });
        }
    };

    const handleEditAgent = (agent: AgentData) => {
        setEditingAgent(agent);
        setAgentId(agent.id);
        setMetadataMode('url');
        setMetadataUrl(agent.metadataUri);
        setContainerMode('url');
        setContainerUrl(agent.containerImageUri);
        setShowCreateForm(true);
    };

    const FileDropZone = ({
        accept,
        onFile,
        onClear,
        upload,
        label,
        icon: Icon,
        hint,
    }: {
        accept: string;
        onFile: (f: File) => void;
        onClear: () => void;
        upload: UploadState;
        label: string;
        icon: typeof FileJson;
        hint: string;
    }) => (
        <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                {label}
            </label>
            {upload.url ? (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{upload.file?.name}</p>
                            <a
                                href={upload.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-400 hover:underline flex items-center gap-1"
                            >
                                View uploaded file <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <button
                            type="button"
                            onClick={onClear}
                            className="p-1 hover:bg-white/10 rounded flex-shrink-0"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>
            ) : upload.uploading ? (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-sm text-blue-300">Uploading... {upload.progress}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                            className="bg-blue-500 h-full transition-all duration-300"
                            style={{ width: `${upload.progress}%` }}
                        />
                    </div>
                </div>
            ) : (
                <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg p-6 text-center transition-colors">
                        <Icon className="w-8 h-8 mx-auto text-gray-500 mb-2" />
                        <p className="text-sm text-gray-400">Drop file here or click to browse</p>
                        <p className="text-xs text-gray-600 mt-1">{hint}</p>
                    </div>
                    <input
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onFile(file);
                            e.target.value = '';
                        }}
                    />
                </label>
            )}
            {upload.error && (
                <p className="text-xs text-red-400 mt-1">{upload.error}</p>
            )}
        </div>
    );

    const isLoading = isPending || isConfirming;

    if (!isConnected) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Agents</h1>
                    <p className="text-gray-400 mt-2">Manage your agents on the AgentRegistry contract</p>
                </div>

                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center">
                            <Wallet className="w-8 h-8 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Connect Your Wallet</h3>
                        <p className="text-gray-400 text-sm max-w-md mx-auto">
                            Connect your wallet to view and manage your agents on the AgentRegistry contract.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Agents</h1>
                    <p className="text-gray-400 mt-2">Manage your agents on the AgentRegistry contract</p>
                </div>
                <button
                    onClick={() => {
                        if (showCreateForm) {
                            setShowCreateForm(false);
                            setEditingAgent(null);
                            resetForm();
                        } else {
                            setShowCreateForm(true);
                        }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {showCreateForm ? (
                        <>
                            <ChevronUp className="w-4 h-4" />
                            Hide Form
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4" />
                            Create Agent
                        </>
                    )}
                </button>
            </div>

            {/* Connected Address */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Connected Address</h3>
                <p className="font-mono text-sm text-blue-400 break-all">{address}</p>
            </div>

            {/* Create/Edit Form */}
            {showCreateForm && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                    <h2 className="text-lg font-bold text-white mb-4">
                        {editingAgent ? `Edit Agent ${editingAgent.id}` : 'Create New Agent'}
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Configure an agent with metadata and container image URI.
                        {!editingAgent && " If the agent doesn't exist, it will be minted to your address."}
                    </p>

                    <form onSubmit={handleSetAgent} className="space-y-6">
                        <div>
                            <label htmlFor="agentId" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                Agent ID
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="agentId"
                                    type="text"
                                    value={agentId}
                                    onChange={(e) => setAgentId(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                                    placeholder="Enter a unique uint64 ID"
                                    required
                                    disabled={!!editingAgent}
                                />
                                {!editingAgent && (
                                    <button
                                        type="button"
                                        onClick={generateAgentId}
                                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                                        title="Generate random ID"
                                    >
                                        <Dices className="w-4 h-4" />
                                        <span className="hidden sm:inline">Generate</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Metadata Section */}
                        <div className="space-y-4 p-4 bg-black/20 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white">Agent Metadata</h3>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMetadataMode('upload')}
                                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                            metadataMode === 'upload'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMetadataMode('url')}
                                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                            metadataMode === 'url'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        URL
                                    </button>
                                </div>
                            </div>

                            {metadataMode === 'url' ? (
                                <div>
                                    <input
                                        type="text"
                                        value={metadataUrl}
                                        onChange={(e) => setMetadataUrl(e.target.value)}
                                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                        placeholder="https://example.com/agent-metadata.json"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">URL to the agent metadata JSON</p>
                                </div>
                            ) : (
                                <FileDropZone
                                    accept=".json,application/json"
                                    onFile={handleJsonUpload}
                                    onClear={() => setJsonUpload({ file: null, url: null, uploading: false, progress: 0, error: null })}
                                    upload={jsonUpload}
                                    label="Metadata JSON"
                                    icon={FileJson}
                                    hint="Upload your agent metadata JSON file"
                                />
                            )}
                        </div>

                        {/* Container Image Section */}
                        <div className="space-y-4 p-4 bg-black/20 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white">Container Image</h3>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setContainerMode('upload')}
                                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                            containerMode === 'upload'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setContainerMode('url')}
                                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                            containerMode === 'url'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        URL
                                    </button>
                                </div>
                            </div>

                            {containerMode === 'url' ? (
                                <div>
                                    <input
                                        type="text"
                                        value={containerUrl}
                                        onChange={(e) => setContainerUrl(e.target.value)}
                                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                        placeholder="https://example.com/agent.tar.gz"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">URL to the container image tarball</p>
                                </div>
                            ) : (
                                <FileDropZone
                                    accept=".tar,.tar.gz,.tgz"
                                    onFile={handleContainerUpload}
                                    onClear={() => setContainerUpload({ file: null, url: null, uploading: false, progress: 0, error: null })}
                                    upload={containerUpload}
                                    label="Container Image Tarball"
                                    icon={Package}
                                    hint="Upload a .tar, .tar.gz, or .tgz container image"
                                />
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isPending ? "Confirming..." : isConfirming ? "Waiting for confirmation..." : editingAgent ? "Update Agent" : "Create Agent"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateForm(false);
                                    setEditingAgent(null);
                                    resetForm();
                                }}
                                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>

                    {writeError && (
                        <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                            <p className="text-sm font-medium text-red-400">Error</p>
                            <p className="text-xs text-gray-400 mt-1">{writeError.message}</p>
                        </div>
                    )}

                    {isConfirmed && hash && (
                        <div className="mt-4 p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                            <p className="text-sm font-medium text-green-400">Success!</p>
                            <p className="text-xs text-gray-400 mt-1">Agent {editingAgent ? 'updated' : 'created'} successfully.</p>
                            <a
                                href={`${currentNetwork.explorerUrl}/tx/${hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mt-2"
                            >
                                View transaction <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Loading State */}
            {(isLoadingIds || loading) && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="flex items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-gray-400">Loading your agents...</span>
                    </div>
                </div>
            )}

            {/* Error State */}
            {(idsError || error) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <p className="text-red-400 text-sm">{idsError?.message || error}</p>
                </div>
            )}

            {/* No Agents */}
            {!isLoadingIds && !loading && agents.length === 0 && !showCreateForm && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-8">
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto bg-gray-500/10 rounded-full flex items-center justify-center">
                            <Plus className="w-8 h-8 text-gray-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">No Agents Yet</h3>
                        <p className="text-gray-400 text-sm max-w-md mx-auto">
                            You haven&apos;t created any agents yet. Create your first agent to get started.
                        </p>
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create Your First Agent
                        </button>
                    </div>
                </div>
            )}

            {/* Agent List */}
            {!isLoadingIds && !loading && agents.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Your Agents ({agents.length})</h3>
                    <div className="flex flex-col gap-4">
                        {agents.map((agent) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                onEdit={handleEditAgent}
                                onDelete={handleDeleteAgent}
                                isDeleting={isDeleting || isConfirmingDelete}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AgentRegistry Contract</h3>
                <p className="font-mono text-sm text-green-400 break-all">{AGENT_REGISTRY_V2_ADDRESS}</p>
            </div>
        </div>
    );
}

function AgentCard({
    agent,
    onEdit,
    onDelete,
    isDeleting,
}: {
    agent: AgentData;
    onEdit: (agent: AgentData) => void;
    onDelete: (agentId: string) => void;
    isDeleting: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
    const metadata = agent.metadata;
    const methods = metadata ? getAbiFunctions(metadata) : [];

    return (
        <div className="bg-slate-900/50 border border-white/10 rounded-lg overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        {metadata?.image && (
                            <img
                                src={metadata.image}
                                alt={metadata.name || 'Agent'}
                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            />
                        )}
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-white truncate">
                                {metadata?.name || `Agent ${agent.id}`}
                            </h3>
                            <p className="text-xs text-gray-500 font-mono">ID: {agent.id}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-mono text-blue-400">
                            Agent
                        </span>
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            {expanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>

                {metadata?.description && (
                    <p className="text-sm text-gray-400 mt-2 line-clamp-2">{metadata.description}</p>
                )}

                {methods.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {methods.slice(0, 4).map((method, i) => (
                            <span
                                key={i}
                                className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400 font-mono"
                            >
                                {method.name}()
                            </span>
                        ))}
                        {methods.length > 4 && (
                            <span className="px-2 py-1 text-xs text-gray-500">
                                +{methods.length - 4} more
                            </span>
                        )}
                    </div>
                )}
            </div>

            {expanded && (
                <div className="border-t border-white/10 p-4 space-y-4 bg-black/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Metadata URI</h4>
                            <a
                                href={agent.metadataUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-400 hover:underline break-all"
                            >
                                {agent.metadataUri}
                            </a>
                        </div>
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Container Image URI</h4>
                            <a
                                href={agent.containerImageUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-400 hover:underline break-all"
                            >
                                {agent.containerImageUri}
                            </a>
                        </div>
                    </div>

                    {/* Methods with code generation */}
                    {methods.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Methods ({methods.length})</h4>
                            {methods.map((method) => (
                                <MethodViewer
                                    key={method.name}
                                    method={method}
                                    isExpanded={expandedMethod === method.name}
                                    onToggle={() => setExpandedMethod(expandedMethod === method.name ? null : method.name)}
                                    agentId={agent.id}
                                />
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Link
                            href={`/request/${agent.id}`}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-sm font-medium rounded-lg transition-colors"
                        >
                            <Play className="w-4 h-4" />
                            Make Request
                        </Link>
                        <button
                            onClick={() => onEdit(agent)}
                            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                        >
                            <Edit3 className="w-4 h-4" />
                            Edit
                        </button>
                        <button
                            onClick={() => onDelete(agent.id)}
                            disabled={isDeleting}
                            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isDeleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
