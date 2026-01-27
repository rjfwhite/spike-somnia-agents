"use client";

import { useState, useCallback } from "react";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, SOMNIA_RPC_URL, SOMNIA_CHAIN_ID } from "@/lib/contract";
import { uploadFile } from "@/lib/files";
import { X, Check, FileJson, Package, ExternalLink, Loader2 } from "lucide-react";

// WARNING: This is extremely insecure - private key exposed in frontend
// Only use for testnet/development purposes
const OWNER_PRIVATE_KEY = "0x93816d6fbb0ae93839d852aae7d822dd0989d2526b5feb53d59b48669201f30a" as const;

// Define Somnia testnet chain
const somniaTestnet = {
    id: SOMNIA_CHAIN_ID,
    name: "Somnia Testnet",
    nativeCurrency: {
        name: "STT",
        symbol: "STT",
        decimals: 18,
    },
    rpcUrls: {
        default: { http: [SOMNIA_RPC_URL] },
    },
} as const;

type InputMode = 'upload' | 'url';

interface UploadState {
    file: File | null;
    url: string | null;
    uploading: boolean;
    progress: number;
    error: string | null;
}

interface AdminPanelProps {
    initialValues?: {
        agentId?: string;
        metadataUri?: string;
        containerImageUri?: string;
        cost?: string;
    };
}

export function AdminPanel({ initialValues }: AdminPanelProps = {}) {
    const [agentId, setAgentId] = useState(initialValues?.agentId || "");
    const [cost, setCost] = useState(initialValues?.cost || "");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; hash?: string } | null>(null);

    // Metadata mode - default to 'url' if we have a metadataUri, otherwise 'upload'
    const [metadataMode, setMetadataMode] = useState<InputMode>(initialValues?.metadataUri ? 'url' : 'upload');
    const [metadataUrl, setMetadataUrl] = useState(initialValues?.metadataUri || "");

    // Container image mode - default to 'url' if we have a containerImageUri, otherwise 'upload'
    const [containerMode, setContainerMode] = useState<InputMode>(initialValues?.containerImageUri ? 'url' : 'upload');
    const [containerUrl, setContainerUrl] = useState(initialValues?.containerImageUri || "");

    // JSON upload state
    const [jsonUpload, setJsonUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });

    // Container image upload state
    const [containerUpload, setContainerUpload] = useState<UploadState>({
        file: null, url: null, uploading: false, progress: 0, error: null
    });

    const account = privateKeyToAccount(OWNER_PRIVATE_KEY);

    const walletClient = createWalletClient({
        account,
        chain: somniaTestnet,
        transport: http(SOMNIA_RPC_URL),
    });

    // Handle container image tarball upload
    const handleContainerUpload = useCallback(async (file: File) => {
        // Validate it's a tarball
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
        // Validate it's JSON
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            setJsonUpload(prev => ({ ...prev, error: 'Please select a JSON file' }));
            return;
        }

        // Read and validate JSON content
        try {
            const text = await file.text();
            const json = JSON.parse(text);

            // Basic validation
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

    const handleSetAgentDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResult(null);

        try {
            let finalMetadataUri = metadataUrl;

            if (metadataMode === 'upload') {
                if (jsonUpload.url) {
                    finalMetadataUri = jsonUpload.url;
                } else {
                    setResult({ success: false, message: 'Please upload a metadata JSON file' });
                    setIsLoading(false);
                    return;
                }
            }

            if (!finalMetadataUri) {
                setResult({ success: false, message: 'Metadata URI is required' });
                setIsLoading(false);
                return;
            }

            // Determine container image URI
            let finalContainerUri = containerUrl;
            if (containerMode === 'upload') {
                if (containerUpload.url) {
                    finalContainerUri = containerUpload.url;
                } else {
                    setResult({ success: false, message: 'Please upload a container image tarball' });
                    setIsLoading(false);
                    return;
                }
            }

            if (!finalContainerUri) {
                setResult({ success: false, message: 'Container image URI is required' });
                setIsLoading(false);
                return;
            }

            const costInWei = cost ? parseEther(cost) : BigInt(0);

            const hash = await walletClient.writeContract({
                address: CONTRACT_ADDRESS,
                abi: SOMNIA_AGENTS_ABI,
                functionName: "setAgentDetails",
                args: [BigInt(agentId), finalMetadataUri, finalContainerUri, costInWei],
            });

            setResult({
                success: true,
                message: `Agent details updated successfully!`,
                hash,
            });
        } catch (error: unknown) {
            console.error("Failed to set agent details:", error);
            setResult({
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsLoading(false);
        }
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
                    <div className="bg-black/30 rounded px-2 py-1.5">
                        <p className="text-xs text-gray-500 mb-0.5">Canonical URL:</p>
                        <a
                            href={upload.url}
                            download
                            className="text-xs text-blue-300 font-mono break-all select-all hover:text-blue-200 hover:underline"
                        >
                            {upload.url}
                        </a>
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

    return (
        <div className="space-y-6">
            {/* Security Warning */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl">!</span>
                    <div>
                        <h3 className="text-red-400 font-bold text-sm">Security Warning</h3>
                        <p className="text-red-300/80 text-xs mt-1">
                            This admin panel uses an embedded private key. Only use on testnet for development purposes.
                            Never use this pattern in production.
                        </p>
                    </div>
                </div>
            </div>

            {/* Owner Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Owner Account</h3>
                <p className="font-mono text-sm text-blue-400 break-all">{account.address}</p>
            </div>

            {/* Set Agent Details Form */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-6">
                <h2 className="text-lg font-bold text-white mb-4">Set Agent Details</h2>
                <p className="text-gray-400 text-sm mb-6">
                    Configure an agent with metadata, container image URI, and invocation cost.
                </p>

                <form onSubmit={handleSetAgentDetails} className="space-y-6">
                    <div>
                        <label htmlFor="agentId" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Agent ID
                        </label>
                        <input
                            id="agentId"
                            type="text"
                            value={agentId}
                            onChange={(e) => setAgentId(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                            placeholder="1"
                            required
                        />
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

                    <div>
                        <label htmlFor="cost" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                            Cost (STT)
                        </label>
                        <input
                            id="cost"
                            type="text"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono"
                            placeholder="0.001"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Cost in STT tokens to invoke this agent</p>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-4 rounded-lg transition-all shadow-lg"
                    >
                        {isLoading ? "Updating..." : "Set Agent Details"}
                    </button>
                </form>

                {result && (
                    <div className={`mt-4 p-4 rounded-lg border ${result.success
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                        }`}>
                        <p className={`text-sm font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                            {result.success ? 'Success!' : 'Error'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{result.message}</p>
                        {result.hash && (
                            <a
                                href={`https://shannon-explorer.somnia.network/tx/${result.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline mt-2 inline-flex items-center gap-1"
                            >
                                View transaction <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Contract Info */}
            <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contract Address</h3>
                <p className="font-mono text-sm text-green-400 break-all">{CONTRACT_ADDRESS}</p>
                <p className="text-xs text-gray-500 mt-2">Chain ID: {SOMNIA_CHAIN_ID}</p>
            </div>
        </div>
    );
}
