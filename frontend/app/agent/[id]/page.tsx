import { AgentViewer } from "@/components/AgentViewer";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function AgentPage({ params }: PageProps) {
    const { id } = await params;

    return (
        <div className="space-y-8">
            <section>
                <AgentViewer initialAgentId={id} />
            </section>
        </div>
    );
}
