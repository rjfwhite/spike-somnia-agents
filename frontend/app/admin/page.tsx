"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminPanel } from "@/components/AdminPanel";

function AdminContent() {
    const searchParams = useSearchParams();

    // Read initial values from URL query params
    const initialValues = {
        agentId: searchParams.get('agentId') || '',
        metadataUri: searchParams.get('metadataUri') || '',
        containerImageUri: searchParams.get('containerImageUri') || '',
        cost: searchParams.get('cost') || '',
    };

    const hasInitialValues = initialValues.metadataUri || initialValues.containerImageUri;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
                <p className="text-gray-400 mt-2">Manage agent configurations on the contract</p>
            </div>

            {hasInitialValues && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-blue-400 text-xl">✓</span>
                        <div>
                            <h3 className="text-blue-400 font-bold text-sm">Agent Published</h3>
                            <p className="text-blue-300/80 text-xs mt-1">
                                Your agent files have been uploaded. Review the details below and click &quot;Set Agent Details&quot; to register.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <AdminPanel initialValues={initialValues} />
        </div>
    );
}

export default function AdminPage() {
    return (
        <Suspense fallback={
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
                    <p className="text-gray-400 mt-2">Manage agent configurations on the contract</p>
                </div>
                <div className="text-gray-500">Loading...</div>
            </div>
        }>
            <AdminContent />
        </Suspense>
    );
}
