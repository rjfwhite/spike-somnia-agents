"use client";

import { useSearchParams } from "next/navigation";
import { DirectInvoker } from "@/components/DirectInvoker";

export default function InvokePage() {
    const searchParams = useSearchParams();
    const container = searchParams.get("container") || undefined;
    const metadata = searchParams.get("metadata") || undefined;

    return (
        <div className="space-y-8">
            <section>
                <DirectInvoker
                    initialContainerUrl={container}
                    initialMetadataUrl={metadata}
                />
            </section>
        </div>
    );
}
