"use client";

import { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI } from "@/lib/contract";
import type { TokenMetadata, MethodDefinition, AbiParameter } from "@/lib/types";

export function AgentViewer() {
  const [agentId, setAgentId] = useState<string>("1");
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set());

  // Read agent metadata URI
  const { data: tokenURI, error, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SOMNIA_AGENTS_ABI,
    functionName: "tokenURI",
    args: agentId ? [BigInt(agentId)] : undefined,
  });

  // Fetch metadata JSON when tokenURI changes
  useEffect(() => {
    if (!tokenURI) {
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
  }, [tokenURI]);

  const toggleMethod = (methodName: string) => {
    const newExpanded = new Set(expandedMethods);
    if (newExpanded.has(methodName)) {
      newExpanded.delete(methodName);
    } else {
      newExpanded.add(methodName);
    }
    setExpandedMethods(newExpanded);
  };

  const formatAbiParam = (param: AbiParameter): string => {
    return `${param.type} ${param.name}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4 border border-gray-200">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">View Agent</h2>

      <div className="space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="agentId" className="block text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">
            Agent ID
          </label>
          <input
            id="agentId"
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter agent ID"
            min="1"
          />
        </div>

        {agentId && (
          <div className="space-y-3">
            {/* Token URI */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-md border border-gray-200">
              {error ? (
                <p className="text-red-600 font-semibold text-sm">Agent not found</p>
              ) : isLoading ? (
                <p className="text-gray-700 font-medium text-sm">Loading URI...</p>
              ) : (
                <div className="flex flex-col">
                  <span className="text-gray-700 font-medium mb-1.5 sm:mb-2 text-sm">Token URI:</span>
                  <span className="font-mono text-xs sm:text-sm break-all text-gray-900">
                    {tokenURI?.toString() || "No URI set"}
                  </span>
                </div>
              )}
            </div>

            {/* Metadata Display */}
            {tokenURI && (
              <div className="bg-white border border-gray-300 rounded-lg p-4 space-y-4">
                {metadataLoading ? (
                  <p className="text-gray-700 font-medium text-sm">Loading metadata...</p>
                ) : metadataError ? (
                  <p className="text-red-600 font-semibold text-sm">Error: {metadataError}</p>
                ) : metadata ? (
                  <>
                    {/* Basic Info */}
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-gray-900">{metadata.name}</h3>
                      {metadata.description && (
                        <p className="text-sm text-gray-700">{metadata.description}</p>
                      )}
                    </div>

                    {/* Display Image */}
                    {metadata.image && (
                      <div>
                        <img
                          src={metadata.image}
                          alt={metadata.name}
                          className="max-w-full h-auto rounded-md border border-gray-200"
                        />
                      </div>
                    )}

                    {/* Container Image - support both flat and nested */}
                    {(metadata.agent_spec?.image || (metadata as any).image) && (
                      <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                        <span className="text-sm font-semibold text-gray-900 block mb-1">Container Image:</span>
                        <span className="font-mono text-xs break-all text-gray-800">
                          {metadata.agent_spec?.image || (metadata as any).image}
                        </span>
                      </div>
                    )}

                    {/* Agent Details - support both flat and nested */}
                    {(metadata.agent_spec?.version || metadata.version) && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">Version:</span> {metadata.agent_spec?.version || metadata.version}
                        </div>
                        {(metadata.agent_spec?.author || metadata.author) && (
                          <div className="text-sm text-gray-700">
                            <span className="font-semibold">Author:</span> {metadata.agent_spec?.author || metadata.author}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Methods - support both flat and nested */}
                    {((metadata.agent_spec?.methods || metadata.methods)?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-md font-bold text-gray-900">
                          Methods ({(metadata.agent_spec?.methods || metadata.methods)?.length})
                        </h4>
                        <div className="space-y-2">
                          {(metadata.agent_spec?.methods || metadata.methods)?.map((method: MethodDefinition) => (
                            <div key={method.name} className="border border-gray-300 rounded-md">
                              <button
                                onClick={() => toggleMethod(method.name)}
                                className="w-full px-3 py-2 text-left bg-gray-50 hover:bg-gray-100 transition-colors flex justify-between items-center"
                              >
                                <span className="font-mono text-sm font-semibold text-gray-900">
                                  {method.name}
                                </span>
                                <span className="text-gray-500">
                                  {expandedMethods.has(method.name) ? "▼" : "▶"}
                                </span>
                              </button>

                              {expandedMethods.has(method.name) && (
                                <div className="p-3 space-y-3 bg-white">
                                  {method.description && (
                                    <p className="text-sm text-gray-700 italic">{method.description}</p>
                                  )}

                                  {/* Inputs */}
                                  <div>
                                    <span className="text-xs font-semibold text-gray-700 uppercase">Inputs:</span>
                                    {method.inputs.length === 0 ? (
                                      <p className="text-xs text-gray-500 mt-1">None</p>
                                    ) : (
                                      <ul className="mt-1 space-y-1">
                                        {method.inputs.map((param, idx) => (
                                          <li key={idx} className="font-mono text-xs text-gray-800">
                                            {formatAbiParam(param)}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>

                                  {/* Outputs */}
                                  <div>
                                    <span className="text-xs font-semibold text-gray-700 uppercase">Outputs:</span>
                                    {method.outputs.length === 0 ? (
                                      <p className="text-xs text-gray-500 mt-1">None</p>
                                    ) : (
                                      <ul className="mt-1 space-y-1">
                                        {method.outputs.map((param, idx) => (
                                          <li key={idx} className="font-mono text-xs text-gray-800">
                                            {formatAbiParam(param)}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
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
