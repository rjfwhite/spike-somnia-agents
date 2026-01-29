"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function ReceiptsPage() {
    const [requestId, setRequestId] = useState("");
    const router = useRouter();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (requestId.trim()) {
            router.push(`/receipts/${requestId.trim()}`);
        }
    };

    return (
        <div className="space-y-8">
            <section>
                <div className="glass-panel rounded-2xl shadow-xl p-4 sm:p-8 space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Execution Receipts
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Look up execution receipts by request ID
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="requestId" className="block text-sm font-medium text-gray-400 mb-2">
                                Request ID
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    id="requestId"
                                    value={requestId}
                                    onChange={(e) => setRequestId(e.target.value)}
                                    placeholder="Enter request ID..."
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-mono text-sm"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={!requestId.trim()}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                        >
                            <Search className="w-4 h-4" />
                            View Receipt
                        </button>
                    </form>

                    <div className="border-t border-white/10 pt-6">
                        <h3 className="text-sm font-medium text-gray-400 mb-3">What are receipts?</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">
                            Every agent invocation produces an execution receipt—a detailed log of each step
                            the agent took during execution. Receipts provide transparency and auditability
                            for agent operations. The final result is what validators reach consensus on,
                            while receipt steps show what one node did to compute that result.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
