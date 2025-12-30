import { AgentList } from "@/components/AgentList";
import { ContractReader } from "@/components/ContractReader";

export default function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">Network Overview</h2>
        <ContractReader />
      </section>

      <section>
        <AgentList />
      </section>
    </div>
  );
}
