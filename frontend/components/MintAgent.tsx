"use client";

import Link from "next/link";
import { CONTRACT_ADDRESS } from "@/lib/contract";

export function MintAgent() {
  return (
    <div className="glass-panel rounded-xl shadow-xl p-8 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Register Agent</h2>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h3 className="text-blue-400 font-bold text-sm mb-2">New Contract Architecture</h3>
        <p className="text-gray-400 text-sm">
          This contract uses an oracle-based agent invocation system. Agent registration is now managed
          by the contract owner through the Admin panel.
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
          <h4 className="text-gray-400 font-semibold text-sm mb-2">To register a new agent:</h4>
          <ol className="text-gray-500 text-sm space-y-2 list-decimal list-inside">
            <li>Prepare your agent metadata JSON (name, description, ABI, etc.)</li>
            <li>Host the metadata at a public URL</li>
            <li>Deploy your agent container/service</li>
            <li>Contact the contract owner or use the Admin panel (if you have access)</li>
          </ol>
        </div>

        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
          <h4 className="text-gray-400 font-semibold text-sm mb-2">Agent Details Required:</h4>
          <ul className="text-gray-500 text-sm space-y-1">
            <li><span className="text-secondary">Agent ID:</span> Unique numeric identifier</li>
            <li><span className="text-secondary">Metadata URI:</span> URL to agent metadata JSON</li>
            <li><span className="text-secondary">Container Image URI:</span> URL to agent service endpoint</li>
            <li><span className="text-secondary">Cost:</span> Price in STT to invoke the agent</li>
          </ul>
        </div>

        <Link
          href="/admin"
          className="block w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 px-6 rounded-xl hover:from-blue-500 hover:to-cyan-500 font-bold shadow-lg shadow-blue-500/20 transition-all text-center"
        >
          Go to Admin Panel
        </Link>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-500">
          Contract: <span className="font-mono text-gray-600">{CONTRACT_ADDRESS}</span>
        </p>
      </div>
    </div>
  );
}

