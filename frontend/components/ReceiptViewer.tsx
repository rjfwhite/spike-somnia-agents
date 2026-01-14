"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Step {
    name: string;
    [key: string]: any;
}

interface Receipt {
    steps: Step[];
    result?: string;
    [key: string]: any;
}

interface ReceiptViewerProps {
    receipts: Receipt[];
    abi?: any[]; // Optional ABI for decoding result
}

type ViewMode = 'single' | 'compare';

export function ReceiptViewer({ receipts, abi }: ReceiptViewerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('single');

    const currentReceipt = receipts[selectedIndex];

    // Find differences between receipts
    const diffs = useMemo(() => {
        if (receipts.length < 2) return null;

        const differences: { stepIndex: number; field: string; values: any[] }[] = [];
        const maxSteps = Math.max(...receipts.map(r => r.steps?.length || 0));

        for (let i = 0; i < maxSteps; i++) {
            const stepsAtIndex = receipts.map(r => r.steps?.[i]);
            const allFields = new Set<string>();
            stepsAtIndex.forEach(s => s && Object.keys(s).forEach(k => allFields.add(k)));

            for (const field of allFields) {
                const values = stepsAtIndex.map(s => s?.[field]);
                const firstValue = JSON.stringify(values[0]);
                const hasDiff = values.some(v => JSON.stringify(v) !== firstValue);
                if (hasDiff) {
                    differences.push({ stepIndex: i, field, values });
                }
            }
        }

        // Also check result field
        const results = receipts.map(r => r.result);
        const firstResult = results[0];
        if (results.some(r => r !== firstResult)) {
            differences.push({ stepIndex: -1, field: 'result', values: results });
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
                    <SingleReceiptView receipt={currentReceipt} abi={abi} />
                ) : (
                    <CompareView receipts={receipts} diffs={diffs} abi={abi} />
                )}
            </div>
        </div>
    );
}

function SingleReceiptView({ receipt, abi }: { receipt: Receipt; abi?: any[] }) {
    if (!receipt.steps || receipt.steps.length === 0) {
        return (
            <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(receipt, null, 2)}
            </pre>
        );
    }

    return (
        <div className="space-y-1">
            {/* Steps */}
            {receipt.steps.map((step, idx) => (
                <StepAccordion key={idx} step={step} index={idx} />
            ))}

            {/* Result */}
            {receipt.result && (
                <ResultDisplay result={receipt.result} abi={abi} />
            )}
        </div>
    );
}

function StepAccordion({ step, index, highlight }: { step: Step; index: number; highlight?: string[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const { name, ...rest } = step;
    const hasData = Object.keys(rest).length > 0;

    // Determine step status color based on name
    const getStepColor = (name: string) => {
        if (name.includes('error')) return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' };
        if (name.includes('completed') || name.includes('encoded')) return { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400' };
        if (name.includes('started')) return { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400' };
        return { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-400' };
    };

    const colors = getStepColor(name);

    return (
        <div className="flex items-start gap-3">
            {/* Step number indicator */}
            <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center text-[10px] font-bold ${colors.text}`}>
                    {index + 1}
                </div>
                {/* Connector line */}
                <div className="w-px flex-1 bg-white/10 min-h-[4px]" />
            </div>

            {/* Step content */}
            <div className="flex-1 pb-2">
                <button
                    onClick={() => hasData && setIsOpen(!isOpen)}
                    className={`w-full text-left bg-black/30 rounded-lg border border-white/5 overflow-hidden transition-all ${hasData ? 'hover:border-white/10 cursor-pointer' : ''}`}
                >
                    <div className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${colors.text}`}>{name}</span>
                            {hasData && (
                                <span className="text-[10px] text-gray-600">
                                    {Object.keys(rest).length} field{Object.keys(rest).length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {hasData && (
                            <span className="text-gray-500">
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                        )}
                    </div>
                </button>

                {/* Expandable content */}
                {isOpen && hasData && (
                    <div className="mt-1 bg-black/20 rounded-lg border border-white/5 px-3 py-2 space-y-1">
                        {Object.entries(rest).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-2 text-xs">
                                <span className={`text-gray-500 shrink-0 ${highlight?.includes(key) ? 'text-yellow-500' : ''}`}>
                                    {key}:
                                </span>
                                <span className={`font-mono break-all ${highlight?.includes(key) ? 'text-yellow-400 bg-yellow-500/10 px-1 rounded' : 'text-gray-300'}`}>
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ResultDisplay({ result, abi, label = "Result" }: { result: string; abi?: any[]; label?: string }) {
    const [isOpen, setIsOpen] = useState(true);

    // Try to decode the result if ABI is provided
    const decodedFields = useMemo(() => {
        if (!abi || !result || result === '0x') return null;

        try {
            // Find the function that was called (look for response_encoded step or use first function)
            const functions = abi.filter((item: any) => item.type === 'function');
            if (functions.length === 0) return null;

            // For now, try each function's outputs until one works
            for (const fn of functions) {
                if (!fn.outputs || fn.outputs.length === 0) continue;

                try {
                    // Dynamic import would be better, but for simplicity:
                    const { decodeAbiParameters } = require('viem');
                    const decoded = decodeAbiParameters(fn.outputs, result as `0x${string}`);

                    return fn.outputs.map((output: any, idx: number) => ({
                        name: output.name || `output_${idx}`,
                        type: output.type,
                        value: decoded[idx],
                    }));
                } catch {
                    continue;
                }
            }
        } catch {
            return null;
        }
        return null;
    }, [result, abi]);

    return (
        <div className="mt-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-green-400">{label}</span>
                    {decodedFields && (
                        <span className="text-[10px] text-green-600">
                            {decodedFields.length} field{decodedFields.length !== 1 ? 's' : ''} decoded
                        </span>
                    )}
                </div>
                <span className="text-green-500">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </button>

            {isOpen && (
                <div className="px-3 py-2 border-t border-green-500/10 space-y-2">
                    {/* Decoded fields */}
                    {decodedFields && (
                        <div className="space-y-1">
                            {decodedFields.map((field: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-2 text-xs">
                                    <span className="text-green-600 shrink-0">
                                        {field.name}
                                        <span className="text-green-800 ml-1">({field.type})</span>:
                                    </span>
                                    <span className="font-mono text-green-300 break-all">
                                        {formatValue(field.value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Raw hex */}
                    <div className="pt-1 border-t border-green-500/10">
                        <div className="text-[10px] text-green-700 mb-1">Raw hex:</div>
                        <div className="font-mono text-[10px] text-green-500/70 break-all bg-black/20 rounded px-2 py-1">
                            {result}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object') return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
    return String(value);
}

function CompareView({ receipts, diffs, abi }: { receipts: Receipt[]; diffs: { stepIndex: number; field: string; values: any[] }[] | null; abi?: any[] }) {
    if (!diffs || diffs.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="text-green-400 text-4xl mb-3">✓</div>
                <div className="text-white font-medium">All receipts are identical</div>
                <div className="text-gray-500 text-sm mt-1">No differences detected across {receipts.length} executions</div>
            </div>
        );
    }

    // Separate result diffs from step diffs
    const resultDiffs = diffs.filter(d => d.stepIndex === -1);
    const stepDiffs = diffs.filter(d => d.stepIndex !== -1);

    // Group step diffs by step
    const diffsByStep = stepDiffs.reduce((acc, diff) => {
        if (!acc[diff.stepIndex]) {
            acc[diff.stepIndex] = [];
        }
        acc[diff.stepIndex].push(diff);
        return acc;
    }, {} as Record<number, typeof diffs>);

    // Get all step names
    const maxSteps = Math.max(...receipts.map(r => r.steps?.length || 0));
    const stepNames = Array.from({ length: maxSteps }, (_, i) => {
        const step = receipts.find(r => r.steps?.[i])?.steps?.[i];
        return step?.name || `Step ${i + 1}`;
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

            {/* Step diffs */}
            <div className="space-y-3">
                {Object.entries(diffsByStep).map(([stepIndexStr, stepDiffsList]) => {
                    const stepIndex = parseInt(stepIndexStr);
                    return (
                        <div key={stepIndex} className="bg-black/30 rounded-lg border border-white/5 overflow-hidden">
                            <div className="px-3 py-2 border-b border-white/5 bg-black/20 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-[10px] font-bold text-yellow-400">
                                    {stepIndex + 1}
                                </span>
                                <span className="text-sm font-medium text-white">{stepNames[stepIndex]}</span>
                            </div>
                            <div className="divide-y divide-white/5">
                                {stepDiffsList.map((diff, idx) => (
                                    <div key={idx} className="px-3 py-2">
                                        <div className="text-xs text-yellow-500 font-medium mb-2">{diff.field}</div>
                                        <div className="grid gap-1">
                                            {diff.values.map((value, receiptIdx) => (
                                                <div key={receiptIdx} className="flex items-start gap-2 text-xs">
                                                    <span className="text-gray-600 w-20 shrink-0">Receipt {receiptIdx + 1}:</span>
                                                    <span className="font-mono text-gray-300 bg-black/30 px-2 py-0.5 rounded break-all">
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

            {/* Result diffs */}
            {resultDiffs.length > 0 && (
                <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-lg border border-red-500/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-red-500/10 bg-black/20">
                        <span className="text-sm font-semibold text-red-400">Result Differences</span>
                    </div>
                    <div className="px-3 py-2 space-y-2">
                        {resultDiffs[0].values.map((value, receiptIdx) => (
                            <div key={receiptIdx} className="space-y-1">
                                <div className="text-xs text-gray-500">Receipt {receiptIdx + 1}:</div>
                                <div className="font-mono text-[10px] text-red-300/70 break-all bg-black/20 rounded px-2 py-1">
                                    {value || '0x'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
