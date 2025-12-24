import { WalletConnect } from "@/components/WalletConnect";
import { ContractReader } from "@/components/ContractReader";
import { AgentViewer } from "@/components/AgentViewer";
import { MintAgent } from "@/components/MintAgent";
import { CreateRequest } from "@/components/CreateRequest";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Somnia Agents</h1>
            <p className="text-gray-700 font-medium">NFT-based AI Agents Platform</p>
          </div>
          <WalletConnect />
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contract Info */}
          <ContractReader />

          {/* Agent Viewer */}
          <AgentViewer />

          {/* Mint Agent */}
          <MintAgent />

          {/* Create Request */}
          <CreateRequest />
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-sm text-gray-700 font-medium">
            Contract: <span className="font-mono text-gray-900">0x1B8c...593f</span> on Somnia Network
          </p>
        </footer>
      </div>
    </div>
  );
}
