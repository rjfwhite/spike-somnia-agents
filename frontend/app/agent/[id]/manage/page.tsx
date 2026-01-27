"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { AgentManager } from "@/components/AgentManager";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

function ManageContent({ agentId }: { agentId: string }) {
    const searchParams = useSearchParams();

    // Read initial values from URL query params (from CLI publish)
    const initialValues = {
        metadataUri: searchParams.get('metadataUri') || '',
        containerImageUri: searchParams.get('containerImageUri') || '',
        cost: searchParams.get('cost') || '',
    };

    const hasInitialValues = initialValues.metadataUri || initialValues.containerImageUri;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link
                    href={`/agent/${agentId}`}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-white">Manage Agent #{agentId}</h1>
                    <p className="text-gray-400 mt-1">Create or update this agent on the contract</p>
                </div>
            </div>

            {hasInitialValues && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-blue-400 text-xl">i</span>
                        <div>
                            <h3 className="text-blue-400 font-bold text-sm">Agent Published</h3>
                            <p className="text-blue-300/80 text-xs mt-1">
                                Your agent files have been uploaded. Review the details below and click &quot;Create/Update Agent&quot; to register on-chain.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <AgentManager agentId={agentId} initialValues={initialValues} />
        </div>
    );
}

export default function ManageAgentPage({ params }: PageProps) {
    const { id } = use(params);

    return (
        <Suspense fallback={
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Manage Agent</h1>
                    <p className="text-gray-400 mt-2">Loading...</p>
                </div>
            </div>
        }>
            <ManageContent agentId={id} />
        </Suspense>
    );
}
