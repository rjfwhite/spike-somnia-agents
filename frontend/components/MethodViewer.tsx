"use client";

import { useState } from "react";
import { AbiFunction } from "@/lib/types";
import { generateSolidityExample, generateViemExample, generateExpressExample } from "@/lib/code-generators";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { MethodInvoker } from "./MethodInvoker";

interface MethodViewerProps {
    method: AbiFunction;
    isExpanded: boolean;
    onToggle: () => void;
    agentId?: string;
    price?: bigint;
}

export function MethodViewer({ method, isExpanded, onToggle, agentId, price }: MethodViewerProps) {
    const [activeTab, setActiveTab] = useState<"solidity" | "viem" | "express" | "run">("run");
    const [copied, setCopied] = useState(false);

    const getCode = () => {
        switch (activeTab) {
            case 'solidity': return generateSolidityExample(method, agentId, price);
            case 'viem': return generateViemExample(method, agentId, price);
            case 'express': return generateExpressExample(method, agentId, price);
            default: return '';
        }
    };

    const getLanguage = () => {
        switch (activeTab) {
            case 'solidity': return 'solidity'; // react-syntax-highlighter typically supports this or we fall back
            case 'viem':
            case 'express': return 'javascript';
            default: return 'text';
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden transition-all duration-200 hover:border-white/20">
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition-colors flex justify-between items-center"
            >
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary/80">function</span>
                    <span className="font-mono text-sm font-bold text-white tracking-wide">
                        {method.name}
                    </span>
                </div>
                <span className="text-gray-400">
                    {isExpanded ? "▼" : "▶"}
                </span>
            </button>

            {isExpanded && (
                <div className="p-4 space-y-5 bg-black/20 border-t border-white/5">
                    {method.description && (
                        <p className="text-sm text-gray-400 italic">{method.description}</p>
                    )}

                    {/* Inputs */}
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Signature</span>
                            <div className="mt-2 font-mono text-xs text-gray-300 bg-black/30 p-2 rounded border border-white/5 overflow-x-auto whitespace-nowrap">
                                <span className="text-purple-400">{method.name}</span>
                                <span className="text-gray-500">(</span>
                                {method.inputs.map((p, i) => (
                                    <span key={i}>
                                        {i > 0 && ", "}
                                        <span className="text-secondary">{p.type}</span> <span className="text-white">{p.name}</span>
                                    </span>
                                ))}
                                <span className="text-gray-500">)</span>
                                {method.outputs.length > 0 && (
                                    <>
                                        <span className="text-gray-500"> returns (</span>
                                        {method.outputs.map((p, i) => (
                                            <span key={i}>
                                                {i > 0 && ", "}
                                                <span className="text-secondary">{p.type}</span> <span className="text-white">{p.name}</span>
                                            </span>
                                        ))}
                                        <span className="text-gray-500">)</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                {activeTab === 'run' ? 'Execute Method' : 'Integration Snippets'}
                            </h5>
                            <div className="flex bg-black/40 rounded-lg p-1 gap-1">
                                <button
                                    onClick={() => setActiveTab('run')}
                                    className={`px-3 py-1 text-[10px] rounded-md transition-all flex items-center gap-1 ${activeTab === 'run'
                                        ? 'bg-primary text-white font-bold shadow-sm shadow-primary/20'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span>▶</span> Run
                                </button>
                                <div className="w-[1px] bg-white/10 mx-1"></div>
                                {(['solidity', 'viem', 'express'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-3 py-1 text-[10px] rounded-md transition-all ${activeTab === tab
                                            ? 'bg-white/10 text-white font-semibold'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                            }`}
                                    >
                                        {tab === 'viem' ? 'JS' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeTab === 'run' ? (
                            <div className="bg-black/20 rounded-lg border border-white/5 p-1">
                                {agentId ? (
                                    <MethodInvoker method={method} agentId={agentId} price={price} />
                                ) : (
                                    <div className="p-4 text-center text-sm text-gray-500">
                                        Agent ID is required to run this method.
                                    </div>
                                )}
                            </div>
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
                                    className="absolute top-2 right-2 px-2 py-1 bg-white/10 text-gray-300 text-[10px] rounded hover:bg-white/20 transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100"
                                >
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

