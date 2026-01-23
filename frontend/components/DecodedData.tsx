"use client";

import { useState } from "react";
import type { AbiFunction } from "@/lib/types";
import { decodeAbi, formatDecodedValue } from "@/lib/abi-utils";
import { type Hex } from "viem";

export function DecodedData({
    data,
    label,
    method
}: {
    data: string;
    label: string;
    method?: AbiFunction;
}) {
    const [copied, setCopied] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(data);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    // Try to decode using ABI if method is provided
    let decodedValues: any[] | null = null;
    let decodeError: string | null = null;

    if (method && data && data !== '0x') {
        try {
            const params = label === "Call Data" ? method.inputs : method.outputs;
            if (params && params.length > 0) {
                decodedValues = decodeAbi(params, data as Hex);
            }
        } catch (err: any) {
            decodeError = err.message;
        }
    }

    return (
        <div className="mt-3 bg-black/30 rounded-lg border border-white/5 p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                <div className="flex gap-2">
                    {decodedValues && (
                        <button
                            onClick={() => setShowRaw(!showRaw)}
                            className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors uppercase font-medium tracking-wide"
                        >
                            {showRaw ? "Show decoded" : "Show raw"}
                        </button>
                    )}
                    <button
                        onClick={copyToClipboard}
                        className="text-[10px] px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary-300 rounded transition-colors flex items-center gap-1 uppercase font-medium tracking-wide"
                    >
                        {copied ? (
                            <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy
                            </>
                        )}
                    </button>
                </div>
            </div>

            {!showRaw && decodedValues ? (
                <div className="space-y-2">
                    {decodedValues.map((value, idx) => {
                        const params = label === "Call Data" ? method!.inputs : method!.outputs;
                        const param = params[idx];
                        return (
                            <div key={idx} className="bg-white/5 p-2 rounded border border-white/5">
                                <span className="text-xs font-semibold text-gray-400">{param.name}</span>
                                <div className="font-mono text-xs text-secondary mt-1 break-all">
                                    {formatDecodedValue(value, param.type)}
                                </div>
                                <div className="text-[10px] text-gray-600 mt-0.5 font-mono">({param.type})</div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="font-mono text-xs text-gray-400 break-all bg-black/20 p-2 rounded border border-white/5">
                    {data}
                </div>
            )}

            {decodeError && !showRaw && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-500/20">
                    Failed to decode: {decodeError}
                </div>
            )}
        </div>
    );
}
