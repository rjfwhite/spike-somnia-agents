"use client";

import { useEffect, useState } from "react";
import { createPublicClient, webSocket, type Hex } from "viem";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, SOMNIA_RPC_URL } from "@/lib/contract";
import type { TokenMetadata, MethodDefinition } from "@/lib/types";
import { DecodedData } from "@/components/DecodedData";

interface RequestEvent {
  requestId: bigint;
  agentId: bigint;
  method: string;
  callData: string;
  blockNumber: bigint;
  timestamp: number;
  resolved: boolean;
  responseData?: string;
  success?: boolean;
  metadata?: TokenMetadata;
}

export function EventStream() {
  const [events, setEvents] = useState<Map<string, RequestEvent>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [metadataCache, setMetadataCache] = useState<Map<string, TokenMetadata>>(new Map());

  // Fetch metadata for an agent
  const fetchMetadata = async (agentId: bigint): Promise<TokenMetadata | null> => {
    const cacheKey = agentId.toString();

    // Check cache first
    if (metadataCache.has(cacheKey)) {
      return metadataCache.get(cacheKey)!;
    }

    try {
      // Fetch tokenURI from contract
      const response = await fetch(SOMNIA_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{
            to: CONTRACT_ADDRESS,
            data: `0xc87b56dd${agentId.toString(16).padStart(64, '0')}` // tokenURI(uint256)
          }, 'latest']
        })
      });

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Decode the result (it's a string)
      const hex = result.result;
      // Skip first 64 bytes (offset) and next 64 bytes (length), then decode
      const uriHex = hex.slice(130); // Skip 0x + 64 + 64
      let uri = '';
      for (let i = 0; i < uriHex.length; i += 2) {
        const byte = parseInt(uriHex.substr(i, 2), 16);
        if (byte === 0) break;
        uri += String.fromCharCode(byte);
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
    // Create WebSocket URL from HTTP URL
    const wsUrl = SOMNIA_RPC_URL.replace("https://", "wss://").replace("http://", "ws://") + "/ws";

    const client = createPublicClient({
      transport: webSocket(wsUrl, {
        reconnect: true,
      }),
    });

    setConnectionStatus("connected");

    // Watch for RequestCreated events
    const unwatchRequestCreated = client.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      eventName: "RequestCreated",
      onLogs: (logs) => {
        logs.forEach(async (log) => {
          const { requestId, agentId, method, callData } = log.args as {
            requestId: bigint;
            agentId: bigint;
            method: string;
            callData: string;
          };

          // Fetch metadata for this agent
          const metadata = await fetchMetadata(agentId);

          setEvents((prev) => {
            const newEvents = new Map(prev);
            const key = requestId.toString();
            newEvents.set(key, {
              requestId,
              agentId,
              method,
              callData,
              blockNumber: log.blockNumber,
              timestamp: Date.now(),
              resolved: false,
              metadata: metadata || undefined,
            });
            return newEvents;
          });
        });
      },
      onError: (error) => {
        console.error("Error watching RequestCreated:", error);
        setConnectionStatus("error");
      },
    });

    // Watch for RequestResolved events
    const unwatchRequestResolved = client.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: SOMNIA_AGENTS_ABI,
      eventName: "RequestResolved",
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { requestId, responseData, success } = log.args as {
            requestId: bigint;
            responseData: string;
            success: boolean;
          };

          setEvents((prev) => {
            const newEvents = new Map(prev);
            const key = requestId.toString();
            const existing = newEvents.get(key);

            if (existing) {
              newEvents.set(key, {
                ...existing,
                resolved: true,
                responseData,
                success,
              });
            } else {
              // If we don't have the request event, create a minimal entry
              newEvents.set(key, {
                requestId,
                agentId: BigInt(0),
                method: "Unknown",
                callData: "0x",
                blockNumber: log.blockNumber,
                timestamp: Date.now(),
                resolved: true,
                responseData,
                success,
              });
            }
            return newEvents;
          });
        });
      },
      onError: (error) => {
        console.error("Error watching RequestResolved:", error);
        setConnectionStatus("error");
      },
    });

    // Cleanup on unmount
    return () => {
      unwatchRequestCreated();
      unwatchRequestResolved();
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
            const statusStyle = !event.resolved
              ? "bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40"
              : event.success
                ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40"
                : "bg-red-500/5 border-red-500/20 hover:border-red-500/40";

            // Find the method definition from metadata abi
            const methods = event.metadata?.abi?.filter(item => item.type === 'function');
            const methodDef = methods?.find(m => m.name === event.method);

            return (
              <div
                key={event.requestId.toString()}
                className={`p-4 border rounded-xl transition-all ${statusStyle}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {!event.resolved ? (
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

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-gray-400 text-sm">Method:</span>
                      <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded text-sm">{event.method}</span>
                    </div>

                    <DecodedData data={event.callData} label="Call Data" method={methodDef} />

                    {event.resolved && event.responseData && (
                      <DecodedData data={event.responseData} label="Response" method={methodDef} />
                    )}
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
