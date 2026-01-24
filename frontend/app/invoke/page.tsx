"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DirectInvoker } from "@/components/DirectInvoker";

function InvokeContent() {
    const searchParams = useSearchParams();
    const container = searchParams.get("container") || undefined;
    const metadata = searchParams.get("metadata") || undefined;

    return (
        <DirectInvoker
            initialContainerUrl={container}
            initialMetadataUrl={metadata}
        />
    );
}

export default function InvokePage() {
    return (
        <div className="space-y-8">
            <section>
                <Suspense fallback={<div>Loading...</div>}>
                    <InvokeContent />
                </Suspense>
            </section>
        </div>
    );
}
