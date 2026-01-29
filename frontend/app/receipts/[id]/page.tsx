"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import { fetchReceipts } from "@/lib/receipts";

export default function ReceiptPage() {
    const params = useParams();
    const requestId = params.id as string;

    const [receipts, setReceipts] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!requestId) return;

        async function loadReceipts() {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchReceipts(requestId);
                setReceipts(data);
                if (data.length === 0) {
                    setError("No receipts found for this request ID");
                }
            } catch (err: any) {
                setError(err.message || "Failed to fetch receipts");
            } finally {
                setLoading(false);
            }
        }

        loadReceipts();
    }, [requestId]);

    return (
        <div className="space-y-8">
            <section>
                <div className="glass-panel rounded-2xl shadow-xl p-4 sm:p-8 space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Execution Receipt
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Viewing receipt for request
                        </p>
                        <div className="mt-2 font-mono text-xs text-gray-400 bg-black/30 px-3 py-2 rounded-lg break-all">
                            {requestId}
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="flex items-center gap-3 text-gray-400">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <span>Loading receipts...</span>
                            </div>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {receipts && receipts.length > 0 && !loading && (
                        <ReceiptViewer receipts={receipts} />
                    )}
                </div>
            </section>
        </div>
    );
}
