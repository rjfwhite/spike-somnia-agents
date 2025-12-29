import { WalletConnect } from "@/components/WalletConnect";
import { ContractReader } from "@/components/ContractReader";
import { AgentViewer } from "@/components/AgentViewer";
import { MintAgent } from "@/components/MintAgent";
import { CreateRequest } from "@/components/CreateRequest";
import { ManageResponders } from "@/components/ManageResponders";
import { EventStreamWrapper } from "@/components/EventStreamWrapper";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">Somnia Agents</h1>
            <p className="text-sm sm:text-base text-gray-700 font-medium">NFT-based AI Agents Platform</p>
          </div>
          <WalletConnect />
        </header>

        {/* Live Event Stream */}
        <div className="mb-6 sm:mb-8">
          <EventStreamWrapper />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Contract Info */}
          <ContractReader />

          {/* Agent Viewer */}
          <AgentViewer />

          {/* Mint Agent */}
          <MintAgent />

          {/* Create Request */}
          <CreateRequest />

          {/* Manage Responders */}
          <ManageResponders />
        </div>

        {/* Footer */}
        <footer className="mt-8 sm:mt-12 text-center px-2">
          <p className="text-xs sm:text-sm text-gray-700 font-medium">
            Contract: <span className="font-mono text-gray-900 break-all">0x9De7...7160</span> on Somnia Network
          </p>
        </footer>
      </div>
    </div>
  );
}
