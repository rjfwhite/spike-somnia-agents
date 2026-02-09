"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, Agent } from "@/lib/contract";
import { uploadFile } from "@/lib/files";
import { X, Check, FileJson, Package, ExternalLink, Loader2, Trash2, AlertTriangle } from "lucide-react";

type InputMode = 'upload' | 'url';

interface UploadState {
    file: File | null;
    url: string | null;
    uploading: boolean;
    progress: number;
    error: string | null;
}

interface AgentManagerProps {
    agentId: string;
    initialValues?: {
        metadataUri?: string;
        containerImageUri?: string;
    };
}

export function AgentManager({ agentId, initialValues }: AgentManagerProps) {
    const { address, isConnected } = useAccount();

    // Read existing agent data
    const { data: agentData, isLoading: isLoadingAgent, refetch } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: "getAgent",
        args: [BigInt(agentId)],
    });

    const agent = agentData as Agent | undefined;
    const agentExists = agent && agent.owner !== "0x0000000000000000000000000000000000000000";
    const isOwner = agentExists && agent.owner.toLowerCase() === address?.toLowerCase();

    // Metadata mode - default to 'url' if we have a metadataUri, otherwise 'upload'
    const [metadataMode, setMetadataMode] = useState<InputMode>(initialValues?.metadataUri ? 'url' : 'upload');
    const [metadataUrl, setMetadataUrl] = useState(initialValues?.metadataUri || "");

    // Container image mode - default to 'url' if we have a containerImageUri, otherwise 'upload'
    const [containerMode, setContainerMode] = useState<InputMode>(initialValues?.containerImageUri ? 'url' : 'upload');
    const [containerUrl, setContainerUrl] = useState(initialValues?.containerImageUri || "");

    // Pre-fill from existing agent data
    useEffect(() => {
        if (agentExists && !initialValues?.metadataUri && !initialValues?.containerImageUri) {
            setMetadataUrl(agent.metadataUri);
            setContainerUrl(agent.containerImageUri);
            setMetadataMode('url');
            setContainerMode('url');
        }
    }, [agentExists, agent, initialValues]);

    // JSON upload state
    const [jsonUpload, setJsonUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });

    // Container image upload state
    const [containerUpload, setContainerUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });

    // Write contract hooks
    const { writeContract: writeSetAgent, data: setAgentHash, isPending: isSettingAgent, error: setAgentError } = useWriteContract();
    const { writeContract: writeDeleteAgent, data: deleteAgentHash, isPending: isDeletingAgent, error: deleteAgentError } = useWriteContract();

    // Wait for transactions
    const { isLoading: isConfirmingSet, isSuccess: isSetConfirmed } = useWaitForTransactionReceipt({ hash: setAgentHash });
    const { isLoading: isConfirmingDelete, isSuccess: isDeleteConfirmed } = useWaitForTransactionReceipt({ hash: deleteAgentHash });

    // Refetch agent data after successful transactions
    useEffect(() => {
        if (isSetConfirmed || isDeleteConfirmed) {
            refetch();
        }
    }, [isSetConfirmed, isDeleteConfirmed, refetch]);

    // Delete confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Handle container image tarball upload
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

    // Handle JSON file selection and upload
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

        let finalMetadataUri = metadataUrl;
        if (metadataMode === 'upload') {
            if (jsonUpload.url) {
                finalMetadataUri = jsonUpload.url;
            } else {
                return;
            }
        }

        let finalContainerUri = containerUrl;
        if (containerMode === 'upload') {
            if (containerUpload.url) {
                finalContainerUri = containerUpload.url;
            } else {
                return;
            }
        }

        writeSetAgent({
            address: CONTRACT_ADDRESS,
            abi: SOMNIA_AGENTS_ABI,
            functionName: "setAgent",
            args: [BigInt(agentId), finalMetadataUri, finalContainerUri],
        });
    };

    const handleDeleteAgent = () => {
        writeDeleteAgent({
            address: CONTRACT_ADDRESS,
            abi: SOMNIA_AGENTS_ABI,
            functionName: "deleteAgent",
            args: [BigInt(agentId)],
        });
        setShowDeleteConfirm(false);
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

    if (!isConnected) {
        return (
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-yellow-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Wallet Not Connected</h3>
                    <p className="text-gray-400 text-sm">
                        Please connect your wallet to create or manage agents.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoadingAgent) {
        return (
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="text-gray-400">Loading agent data...</span>
                </div>
            </div>
        );
    }

    const isLoading = isSettingAgent || isConfirmingSet || isDeletingAgent || isConfirmingDelete;
    const canEdit = !agentExists || isOwner;

    return (
        <div className="space-y-6">
            {/* Connected Account */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Connected Account</h3>
                <p className="font-mono text-sm text-blue-400 break-all">{address}</p>
            </div>

            {/* Agent Status */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agent Status</h3>
                {agentExists ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-sm text-green-400">Agent exists on-chain</span>
                        </div>
                        <div className="text-xs text-gray-500">
                            Owner: <span className="font-mono text-gray-400">{agent.owner}</span>
                        </div>
                        {!isOwner && (
                            <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
                                You are not the owner of this agent. Only the owner can update or delete it.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                        <span className="text-sm text-gray-400">Agent does not exist yet - you can create it</span>
                    </div>
                )}
            </div>

            {/* Agent Form */}
            {canEdit && (
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                    <h2 className="text-lg font-bold text-white mb-4">
                        {agentExists ? "Update Agent" : "Create Agent"}
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        {agentExists
                            ? "Update the agent's metadata, container image URI, and invocation cost."
                            : "Configure and register this agent on-chain. You will become the owner."}
                    </p>

                    <form onSubmit={handleSetAgent} className="space-y-6">
                        {/* Agent ID (read-only) */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                                Agent ID
                            </label>
                            <div className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-gray-400 font-mono">
                                {agentId}
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

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            {(isSettingAgent || isConfirmingSet) && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isSettingAgent ? "Confirming..." : isConfirmingSet ? "Waiting for confirmation..." : agentExists ? "Update Agent" : "Create Agent"}
                        </button>
                    </form>

                    {/* Transaction Results */}
                    {setAgentError && (
                        <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                            <p className="text-sm font-medium text-red-400">Error</p>
                            <p className="text-xs text-gray-400 mt-1">{setAgentError.message}</p>
                        </div>
                    )}

                    {isSetConfirmed && setAgentHash && (
                        <div className="mt-4 p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                            <p className="text-sm font-medium text-green-400">Success!</p>
                            <p className="text-xs text-gray-400 mt-1">Agent {agentExists ? "updated" : "created"} successfully.</p>
                            <a
                                href={`https://shannon-explorer.somnia.network/tx/${setAgentHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline mt-2 inline-flex items-center gap-1"
                            >
                                View transaction <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Section */}
            {agentExists && isOwner && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
                    <h2 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h2>
                    <p className="text-gray-400 text-sm mb-4">
                        Deleting an agent will burn the NFT and remove all associated data from the contract.
                        This action cannot be undone.
                    </p>

                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Agent
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-red-300">Are you sure you want to delete this agent?</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleDeleteAgent}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {(isDeletingAgent || isConfirmingDelete) && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isDeletingAgent ? "Confirming..." : isConfirmingDelete ? "Deleting..." : "Yes, Delete"}
                                </button>
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {deleteAgentError && (
                        <div className="mt-4 p-4 rounded-lg border bg-red-500/10 border-red-500/20">
                            <p className="text-sm font-medium text-red-400">Error</p>
                            <p className="text-xs text-gray-400 mt-1">{deleteAgentError.message}</p>
                        </div>
                    )}

                    {isDeleteConfirmed && (
                        <div className="mt-4 p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                            <p className="text-sm font-medium text-green-400">Agent Deleted</p>
                            <p className="text-xs text-gray-400 mt-1">The agent has been successfully deleted.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contract Address</h3>
                <p className="font-mono text-sm text-green-400 break-all">{CONTRACT_ADDRESS}</p>
            </div>
        </div>
    );
}
