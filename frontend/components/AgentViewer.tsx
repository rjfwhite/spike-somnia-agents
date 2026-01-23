"use client";

import { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import type { TokenMetadata, AbiFunction } from "@/lib/types";
import { getAbiFunctions } from "@/lib/types";
import { MethodViewer } from "./MethodViewer";

export function AgentViewer({ initialAgentId }: { initialAgentId?: string }) {
  const [agentId, setAgentId] = useState<string>(initialAgentId || "1");
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set());

  // Read agent details from new contract
  // Returns: (metadataUri, containerImageUri, cost, exists)
  const { data: agentDetails, error, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "agentDetails",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  // Extract values from agent details
  const tokenURI = agentDetails ? (agentDetails as [string, string, bigint, boolean])[0] : undefined;
  const containerImageUri = agentDetails ? (agentDetails as [string, string, bigint, boolean])[1] : undefined;
  const price = agentDetails ? (agentDetails as [string, string, bigint, boolean])[2] : undefined;
  const agentExists = agentDetails ? (agentDetails as [string, string, bigint, boolean])[3] : false;

  // Fetch metadata JSON when tokenURI changes
  useEffect(() => {
    if (!tokenURI || !agentExists) {
      setMetadata(null);
      return;
    }

    const fetchMetadata = async () => {
      setMetadataLoading(true);
      setMetadataError(null);

      try {
        const uri = tokenURI.toString();
        const response = await fetch(uri);

        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.status}`);
        }

        const data = await response.json();
        setMetadata(data);
      } catch (err: any) {
        setMetadataError(err.message);
        setMetadata(null);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [tokenURI, agentExists]);

  const toggleMethod = (methodName: string) => {
    const newExpanded = new Set(expandedMethods);
    if (newExpanded.has(methodName)) {
      newExpanded.delete(methodName);
    } else {
      newExpanded.add(methodName);
    }
    setExpandedMethods(newExpanded);
  };

  return (
    <div className="glass-panel rounded-2xl shadow-xl p-4 sm:p-8 space-y-6">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">View Agent</h2>

      <div className="space-y-6">
        <div>
          <label htmlFor="agentId" className="block text-sm font-semibold text-gray-300 mb-2">
            Agent ID
          </label>
          <input
            id="agentId"
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            placeholder="Enter agent ID"
            min="1"
          />
        </div>

        {agentId && (
          <div className="space-y-6">
            {/* Agent Details */}
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              {error ? (
                <p className="text-red-400 font-semibold text-sm flex items-center gap-2">
                  Error loading agent
                </p>
              ) : isLoading ? (
                <p className="text-gray-400 font-medium text-sm animate-pulse">Loading agent details...</p>
              ) : !agentExists ? (
                <p className="text-yellow-400 font-semibold text-sm flex items-center gap-2">
                  Agent not found (ID: {agentId})
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col">
                    <span className="text-gray-500 font-medium mb-2 text-xs uppercase tracking-wider">Metadata URI</span>
                    <span className="font-mono text-xs sm:text-sm break-all text-secondary/80 bg-secondary/5 p-2 rounded-lg border border-secondary/10">
                      {tokenURI?.toString() || "No URI set"}
                    </span>
                  </div>
                  {containerImageUri && (
                    <div className="flex flex-col">
                      <span className="text-gray-500 font-medium mb-2 text-xs uppercase tracking-wider">Container Image URI</span>
                      <span className="font-mono text-xs sm:text-sm break-all text-green-400/80 bg-green-500/5 p-2 rounded-lg border border-green-500/10">
                        {containerImageUri}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Display */}
            {tokenURI && agentExists && (
              <div className="glass-panel rounded-xl p-6 space-y-6 relative overflow-hidden">
                {/* Decorative background blob */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2"></div>

                {metadataLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <p className="text-gray-400 font-medium text-sm animate-pulse">Loading metadata...</p>
                  </div>
                ) : metadataError ? (
                  <p className="text-red-400 font-semibold text-sm">Error: {metadataError}</p>
                ) : metadata ? (
                  <>
                    {/* Basic Info */}
                    <div className="space-y-3">
                      <h3 className="text-3xl font-bold text-white max-w-lg">{metadata.name}</h3>
                      {metadata.description && (
                        <div className="text-gray-400 leading-relaxed text-sm max-w-prose">
                          {metadata.description}
                        </div>
                      )}
                    </div>

                    {/* Display Image */}
                    {metadata.image && (
                      <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl w-32 h-32 flex-shrink-0 bg-black/30">
                        <img
                          src={metadata.image}
                          alt={metadata.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Agent Details */}
                    {metadata.version && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                          <span className="block text-xs text-gray-500 uppercase mb-1">Version</span>
                          <span className="text-white font-mono text-sm">{metadata.version}</span>
                        </div>
                        {metadata.author && (
                          <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                            <span className="block text-xs text-gray-500 uppercase mb-1">Author</span>
                            <span className="text-white font-medium text-sm">{metadata.author}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Methods from ABI */}
                    {getAbiFunctions(metadata).length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                          Methods
                          <span className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded-full">
                            {getAbiFunctions(metadata).length}
                          </span>
                        </h4>
                        <div className="space-y-3">
                          {getAbiFunctions(metadata).map((method: AbiFunction) => (
                            <MethodViewer
                              key={method.name}
                              method={method}
                              isExpanded={expandedMethods.has(method.name)}
                              onToggle={() => toggleMethod(method.name)}
                              agentId={agentId}
                              price={price ? (typeof price === 'bigint' ? price : undefined) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
