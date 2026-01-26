"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, webSocket, decodeFunctionData, type Hex } from "viem";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, SOMNIA_RPC_URL } from "@/lib/contract";
import type { TokenMetadata, AbiFunction } from "@/lib/types";
import { decodeAbi, formatDecodedValue } from "@/lib/abi-utils";

interface RequestEvent {
  requestId: bigint;
  agentId: bigint;
  blockNumber: bigint;
  timestamp: number;
  request?: string;
  requestTxHash?: string;
  responded: boolean;
  response?: string;
  responseTxHash?: string;
  success?: boolean;
  metadata?: TokenMetadata;
  decodedMethod?: string;
  decodedInputs?: { name: string; type: string; value: string }[];
  decodedOutputs?: { name: string; type: string; value: string }[];
}

// Helper to decode function call data using agent's ABI
function decodeRequestData(requestData: string, metadata: TokenMetadata | null): {
  method?: string;
  inputs?: { name: string; type: string; value: string }[];
} {
  if (!requestData || requestData === '0x' || !metadata?.abi) {
    return {};
  }

  try {
    // Get the function selector (first 4 bytes)
    const selector = requestData.slice(0, 10);

    // Find matching function in ABI
    const functions = metadata.abi.filter(item => item.type === 'function') as AbiFunction[];

    for (const fn of functions) {
      // Build viem-compatible ABI for this function
      const viemAbi = [{
        type: 'function' as const,
        name: fn.name,
        inputs: fn.inputs.map(p => ({ type: p.type, name: p.name })),
        outputs: fn.outputs.map(p => ({ type: p.type, name: p.name })),
      }];

      try {
        const decoded = decodeFunctionData({
          abi: viemAbi,
          data: requestData as Hex,
        });

        if (decoded.functionName === fn.name) {
          const inputs = fn.inputs.map((input, i) => ({
            name: input.name,
            type: input.type,
            value: formatDecodedValue(decoded.args?.[i], input.type),
          }));

          return { method: fn.name, inputs };
        }
      } catch {
        // Try next function
      }
    }
  } catch (err) {
    console.error('Failed to decode request data:', err);
  }

  return {};
}

// Helper to decode response data using agent's ABI
function decodeResponseData(responseData: string, methodName: string | undefined, metadata: TokenMetadata | null): {
  outputs?: { name: string; type: string; value: string }[];
} {
  if (!responseData || responseData === '0x' || !metadata?.abi || !methodName) {
    return {};
  }

  try {
    const functions = metadata.abi.filter(item => item.type === 'function') as AbiFunction[];
    const fn = functions.find(f => f.name === methodName);

    if (fn && fn.outputs.length > 0) {
      const decoded = decodeAbi(fn.outputs, responseData as Hex);
      const outputs = fn.outputs.map((output, i) => ({
        name: output.name || `output${i}`,
        type: output.type,
        value: formatDecodedValue(decoded[i], output.type),
      }));

      return { outputs };
    }
  } catch (err) {
    console.error('Failed to decode response data:', err);
  }

  return {};
}

export function EventStream() {
  const [events, setEvents] = useState<Map<string, RequestEvent>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [metadataCache, setMetadataCache] = useState<Map<string, TokenMetadata>>(new Map());

  // Fetch metadata for an agent using the new contract's getAgentUri function
  const fetchMetadata = async (agentId: bigint): Promise<TokenMetadata | null> => {
    const cacheKey = agentId.toString();

    // Check cache first
    if (metadataCache.has(cacheKey)) {
      return metadataCache.get(cacheKey)!;
    }

    try {
      // Create a client for reading contract data
      const client = createPublicClient({
        transport: http(SOMNIA_RPC_URL),
      });

      // Get agent URI from contract
      const uri = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: SOMNIA_AGENTS_ABI,
        functionName: 'getAgentUri',
        args: [agentId],
      }) as string;

      if (!uri) {
        return null;
      }

      // Fetch metadata JSON
      const metadataResponse = await fetch(uri);
      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
      }

      const metadata = await metadataResponse.json();

      // Cache it
      setMetadataCache(prev => new Map(prev).set(cacheKey, metadata));

      return metadata;
    } catch (err) {
      console.error(`Failed to fetch metadata for agent ${agentId}:`, err);
      return null;
    }
  };

  useEffect(() => {
    // Use WebSocket for real-time event streaming
    const wsUrl = SOMNIA_RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://') + 'ws';
    const client = createPublicClient({
      transport: webSocket(wsUrl),
    });

    setConnectionStatus("connected");

    // Watch for AgentRequested events (new contract)
    const unwatchAgentRequested = client.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      eventName: "AgentRequested",
      onLogs: (logs) => {
        logs.forEach(async (log) => {
          const { requestId, agentId, request } = log.args as {
            requestId: bigint;
            agentId: bigint;
            request: string;
          };

          // Fetch metadata for this agent
          const metadata = await fetchMetadata(agentId);

          // Decode the request data
          const { method, inputs } = decodeRequestData(request, metadata);

          setEvents((prev) => {
            const newEvents = new Map(prev);
            const key = requestId.toString();
            newEvents.set(key, {
              requestId,
              agentId,
              blockNumber: log.blockNumber,
              timestamp: Date.now(),
              request,
              requestTxHash: log.transactionHash,
              responded: false,
              metadata: metadata || undefined,
              decodedMethod: method,
              decodedInputs: inputs,
            });
            return newEvents;
          });
        });
      },
      onError: (error) => {
        console.error("Error watching AgentRequested:", error);
        setConnectionStatus("error");
      },
    });

    // Watch for AgentResponded events (new contract)
    const unwatchAgentResponded = client.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      eventName: "AgentResponded",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { requestId, agentId, response, success } = log.args as {
            requestId: bigint;
            agentId: bigint;
            response: string;
            success: boolean;
          };

          setEvents((prev) => {
            const newEvents = new Map(prev);
            const key = requestId.toString();
            const existing = newEvents.get(key);

            // Decode response using existing metadata and method
            const { outputs } = decodeResponseData(
              response,
              existing?.decodedMethod,
              existing?.metadata || null
            );

            if (existing) {
              newEvents.set(key, {
                ...existing,
                responded: true,
                response,
                responseTxHash: log.transactionHash,
                success,
                decodedOutputs: outputs,
              });
            } else {
              // If we don't have the request event, create a minimal entry
              newEvents.set(key, {
                requestId,
                agentId,
                blockNumber: log.blockNumber,
                timestamp: Date.now(),
                responded: true,
                response,
                responseTxHash: log.transactionHash,
                success,
                decodedOutputs: outputs,
              });
            }
            return newEvents;
          });
        }
      },
      onError: (error) => {
        console.error("Error watching AgentResponded:", error);
        setConnectionStatus("error");
      },
    });

    // Cleanup on unmount
    return () => {
      unwatchAgentRequested();
      unwatchAgentResponded();
    };
  }, []);

  // Convert map to sorted array (newest first)
  const eventList = Array.from(events.values()).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="glass-panel rounded-xl shadow-xl p-6 lg:col-span-2 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionStatus === "connected" ? "bg-green-400" : "bg-red-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${connectionStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}></span>
          </span>
          Live Event Stream
        </h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full border border-white/5 ${connectionStatus === "connected"
            ? "bg-green-500/10 text-green-400"
            : "bg-red-500/10 text-red-400"
            }`}>
            {connectionStatus === "connected"
              ? "● Connected"
              : connectionStatus === "connecting"
                ? "○ Connecting..."
                : "✕ Disconnected"}
          </span>
        </div>
      </div>

      {eventList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-gray-500 space-y-2 min-h-[200px]">
          <div className="text-4xl opacity-20 mb-2">📡</div>
          <p className="font-medium">Waiting for events...</p>
          <p className="text-xs">Create a request to see it appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {eventList.map((event) => {
            const statusStyle = !event.responded
              ? "bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40"
              : event.success
                ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40"
                : "bg-red-500/5 border-red-500/20 hover:border-red-500/40";

            return (
              <div
                key={event.requestId.toString()}
                className={`p-4 border rounded-xl transition-all ${statusStyle}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {!event.responded ? (
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 animate-pulse">
                        ⏳
                      </div>
                    ) : event.success ? (
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                        ✓
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                        ✕
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-gray-500">
                        Request #{event.requestId.toString()}
                        <span className="text-gray-700">•</span>
                        Agent #{event.agentId.toString()}
                      </div>
                      <div className="flex-1"></div>
                      <div className="text-xs text-gray-500 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Agent name and method */}
                    <div className="flex items-center gap-3 mb-3">
                      {event.metadata && (
                        <span className="font-bold text-white text-sm">{event.metadata.name || `Agent #${event.agentId.toString()}`}</span>
                      )}
                      {event.decodedMethod && (
                        <span className="font-mono text-sm px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {event.decodedMethod}()
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full ${!event.responded
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                        : event.success
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        {!event.responded ? 'In Flight...' : event.success ? 'Success' : 'Failed'}
                      </span>
                    </div>

                    {/* Decoded Inputs */}
                    {event.decodedInputs && event.decodedInputs.length > 0 && (
                      <div className="mt-2 bg-black/20 p-3 rounded-lg border border-white/5">
                        <span className="text-gray-500 text-[10px] uppercase tracking-wider block mb-2">Request Parameters</span>
                        <div className="space-y-1">
                          {event.decodedInputs.map((input, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-gray-500 shrink-0">{input.name}:</span>
                              <span className="font-mono text-cyan-400 break-all">{input.value}</span>
                              <span className="text-gray-600 shrink-0">({input.type})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Decoded Outputs */}
                    {event.responded && event.decodedOutputs && event.decodedOutputs.length > 0 && (
                      <div className="mt-2 bg-black/20 p-3 rounded-lg border border-green-500/10">
                        <span className="text-green-500 text-[10px] uppercase tracking-wider block mb-2">Response</span>
                        <div className="space-y-1">
                          {event.decodedOutputs.map((output, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-gray-500 shrink-0">{output.name}:</span>
                              <span className="font-mono text-green-400 break-all">{output.value}</span>
                              <span className="text-gray-600 shrink-0">({output.type})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw response if no decoded outputs */}
                    {event.responded && event.response && (!event.decodedOutputs || event.decodedOutputs.length === 0) && (
                      <div className="mt-2 bg-black/20 p-3 rounded-lg border border-white/5">
                        <span className="text-gray-500 text-[10px] uppercase tracking-wider block mb-2">Raw Response</span>
                        <span className="font-mono text-xs text-secondary break-all">{event.response}</span>
                      </div>
                    )}

                    <div className="text-[10px] text-gray-600 mt-2 space-y-1">
                      <div>Block {event.blockNumber.toString()}</div>
                      {event.requestTxHash && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Request TX:</span>
                          <a
                            href={`https://shannon-explorer.somnia.network/tx/${event.requestTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-secondary hover:text-primary hover:underline transition-colors"
                          >
                            {event.requestTxHash.slice(0, 10)}...{event.requestTxHash.slice(-8)}
                          </a>
                        </div>
                      )}
                      {event.responseTxHash && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Response TX:</span>
                          <a
                            href={`https://shannon-explorer.somnia.network/tx/${event.responseTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-secondary hover:text-primary hover:underline transition-colors"
                          >
                            {event.responseTxHash.slice(0, 10)}...{event.responseTxHash.slice(-8)}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
