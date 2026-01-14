"use client";

import { useState, useMemo } from "react";

interface Stage {
    name: string;
    [key: string]: any;
}

interface Receipt {
    stages: Stage[];
    [key: string]: any;
}

interface ReceiptViewerProps {
    receipts: Receipt[];
}

type ViewMode = 'single' | 'compare';

export function ReceiptViewer({ receipts }: ReceiptViewerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('single');

    const currentReceipt = receipts[selectedIndex];

    // Find differences between receipts
    const diffs = useMemo(() => {
        if (receipts.length < 2) return null;

        const differences: { stageIndex: number; field: string; values: any[] }[] = [];
        const maxStages = Math.max(...receipts.map(r => r.stages?.length || 0));

        for (let i = 0; i < maxStages; i++) {
            const stagesAtIndex = receipts.map(r => r.stages?.[i]);
            const allFields = new Set<string>();
            stagesAtIndex.forEach(s => s && Object.keys(s).forEach(k => allFields.add(k)));

            for (const field of allFields) {
                const values = stagesAtIndex.map(s => s?.[field]);
                const firstValue = JSON.stringify(values[0]);
                const hasDiff = values.some(v => JSON.stringify(v) !== firstValue);
                if (hasDiff) {
                    differences.push({ stageIndex: i, field, values });
                }
            }
        }

        return differences;
    }, [receipts]);

    const isDeterministic = !diffs || diffs.length === 0;

    if (!receipts.length) {
        return null;
    }

    return (
        <div className="bg-black/30 rounded-xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">Receipts</span>
                    <span className="text-xs text-gray-500">({receipts.length})</span>
                    {isDeterministic ? (
                        <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">
                            Deterministic
                        </span>
                    ) : (
                        <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                            {diffs?.length} difference{diffs && diffs.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* View Mode Toggle */}
                {receipts.length > 1 && (
                    <div className="flex bg-black/40 rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('single')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                viewMode === 'single'
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            Single
                        </button>
                        <button
                            onClick={() => setViewMode('compare')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                viewMode === 'compare'
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            Compare
                        </button>
                    </div>
                )}
            </div>

            {/* Receipt Navigation Tabs */}
            {receipts.length > 1 && viewMode === 'single' && (
                <div className="flex gap-1 px-4 py-2 border-b border-white/5 overflow-x-auto">
                    {receipts.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedIndex(idx)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                                selectedIndex === idx
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            Receipt {idx + 1}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="p-4">
                {viewMode === 'single' ? (
                    <SingleReceiptView receipt={currentReceipt} />
                ) : (
                    <CompareView receipts={receipts} diffs={diffs} />
                )}
            </div>
        </div>
    );
}

function SingleReceiptView({ receipt }: { receipt: Receipt }) {
    if (!receipt.stages || receipt.stages.length === 0) {
        return (
            <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(receipt, null, 2)}
            </pre>
        );
    }

    return (
        <div className="space-y-2">
            {receipt.stages.map((stage, idx) => (
                <StageCard key={idx} stage={stage} index={idx} />
            ))}
        </div>
    );
}

function StageCard({ stage, index, highlight }: { stage: Stage; index: number; highlight?: string[] }) {
    const { name, ...rest } = stage;
    const hasData = Object.keys(rest).length > 0;

    return (
        <div className="flex items-start gap-3">
            {/* Stage number indicator */}
            <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-400">
                    {index + 1}
                </div>
                {/* Connector line */}
                <div className="w-px h-full bg-white/10 min-h-[8px]" />
            </div>

            {/* Stage content */}
            <div className="flex-1 pb-3">
                <div className="bg-black/30 rounded-lg border border-white/5 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5 bg-black/20">
                        <span className="text-sm font-medium text-white">{name}</span>
                    </div>
                    {hasData && (
                        <div className="px-3 py-2 space-y-1">
                            {Object.entries(rest).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2 text-xs">
                                    <span className={`text-gray-500 ${highlight?.includes(key) ? 'text-yellow-500' : ''}`}>
                                        {key}:
                                    </span>
                                    <span className={`font-mono ${highlight?.includes(key) ? 'text-yellow-400 bg-yellow-500/10 px-1 rounded' : 'text-gray-300'}`}>
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CompareView({ receipts, diffs }: { receipts: Receipt[]; diffs: { stageIndex: number; field: string; values: any[] }[] | null }) {
    if (!diffs || diffs.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="text-green-400 text-4xl mb-3">✓</div>
                <div className="text-white font-medium">All receipts are identical</div>
                <div className="text-gray-500 text-sm mt-1">No differences detected across {receipts.length} executions</div>
            </div>
        );
    }

    // Group diffs by stage
    const diffsByStage = diffs.reduce((acc, diff) => {
        if (!acc[diff.stageIndex]) {
            acc[diff.stageIndex] = [];
        }
        acc[diff.stageIndex].push(diff);
        return acc;
    }, {} as Record<number, typeof diffs>);

    // Get all stage names
    const maxStages = Math.max(...receipts.map(r => r.stages?.length || 0));
    const stageNames = Array.from({ length: maxStages }, (_, i) => {
        const stage = receipts.find(r => r.stages?.[i])?.stages?.[i];
        return stage?.name || `Stage ${i + 1}`;
    });

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                <div className="text-red-400 text-sm font-medium">
                    {diffs.length} difference{diffs.length > 1 ? 's' : ''} found
                </div>
                <div className="text-gray-500 text-xs mt-1">
                    Comparing {receipts.length} receipts
                </div>
            </div>

            {/* Diff table */}
            <div className="space-y-3">
                {Object.entries(diffsByStage).map(([stageIndexStr, stageDiffs]) => {
                    const stageIndex = parseInt(stageIndexStr);
                    return (
                        <div key={stageIndex} className="bg-black/30 rounded-lg border border-white/5 overflow-hidden">
                            <div className="px-3 py-2 border-b border-white/5 bg-black/20 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-400">
                                    {stageIndex + 1}
                                </span>
                                <span className="text-sm font-medium text-white">{stageNames[stageIndex]}</span>
                            </div>
                            <div className="divide-y divide-white/5">
                                {stageDiffs.map((diff, idx) => (
                                    <div key={idx} className="px-3 py-2">
                                        <div className="text-xs text-yellow-500 font-medium mb-2">{diff.field}</div>
                                        <div className="grid gap-1">
                                            {diff.values.map((value, receiptIdx) => (
                                                <div key={receiptIdx} className="flex items-center gap-2 text-xs">
                                                    <span className="text-gray-600 w-20 shrink-0">Receipt {receiptIdx + 1}:</span>
                                                    <span className="font-mono text-gray-300 bg-black/30 px-2 py-0.5 rounded">
                                                        {value === undefined ? <span className="text-gray-600 italic">undefined</span> :
                                                         typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
