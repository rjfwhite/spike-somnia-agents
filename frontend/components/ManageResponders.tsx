"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { SOMNIA_AGENTS_ABI } from "@/lib/contract";
import { useNetwork } from "@/lib/network-context";

export function ManageResponders() {
  const { currentNetwork } = useNetwork();
  const CONTRACT_ADDRESS = currentNetwork.contracts.legacyContract;
  // Read contract owner
  const { data: owner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "owner",
  });

  // Read oracle hub address
  const { data: oracleHub } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "oracleHub",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-500">Oracle-Based Invocation</h2>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h3 className="text-blue-400 font-bold text-sm mb-2">New Architecture</h3>
        <p className="text-gray-400 text-sm">
          This contract uses an oracle-based agent invocation system. Instead of manual responders,
          the OracleHub handles request routing and response delivery automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Oracle Hub Info */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-6 h-full border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="w-1.5 h-6 bg-green-500 rounded-full"></span>
            Oracle Hub
          </h3>
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              The Oracle Hub handles HTTP requests to agent containers and delivers responses back to the contract.
            </p>
            <div className="bg-black/20 p-4 rounded-lg border border-white/5">
              <span className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Oracle Hub Address</span>
              <span className="font-mono text-sm text-green-400 break-all">{oracleHub?.toString() || "Loading..."}</span>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-6 h-full border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
            How It Works
          </h3>
          <ol className="text-gray-400 text-sm space-y-3 list-decimal list-inside">
            <li>User calls <code className="text-secondary bg-black/30 px-1 rounded">requestAgent()</code> with agent ID and request data</li>
            <li>Contract emits <code className="text-secondary bg-black/30 px-1 rounded">AgentRequested</code> event and forwards to Oracle Hub</li>
            <li>Oracle Hub makes HTTP request to the agent's container endpoint</li>
            <li>Oracle calls back <code className="text-secondary bg-black/30 px-1 rounded">onOracleResponse()</code> with the result</li>
            <li>Response is delivered to the specified callback contract</li>
          </ol>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contract Owner */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-4 border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>
            Contract Owner
          </h3>
          <p className="text-gray-400 text-sm">
            The contract owner can configure agent details and update the oracle hub.
          </p>
          <div className="bg-black/20 p-4 rounded-lg border border-white/5">
            <span className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Owner Address</span>
            <span className="font-mono text-sm text-purple-400 break-all">{owner?.toString() || "Loading..."}</span>
          </div>
        </div>

        {/* Admin Link */}
        <div className="glass-panel rounded-xl shadow-xl p-6 space-y-4 border border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-yellow-500 rounded-full"></span>
            Manage Agents
          </h3>
          <p className="text-gray-400 text-sm">
            Use the Admin panel to configure agent details including metadata URI, container endpoint, and invocation cost.
          </p>
          <Link
            href="/admin"
            className="block w-full bg-gradient-to-r from-yellow-600 to-orange-600 text-white py-3 px-6 rounded-xl hover:from-yellow-500 hover:to-orange-500 font-bold shadow-lg shadow-yellow-500/20 transition-all text-center"
          >
            Go to Admin Panel
          </Link>
        </div>
      </div>
    </div>
  );
}
