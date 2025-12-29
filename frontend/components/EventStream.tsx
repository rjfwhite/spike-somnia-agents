"use client";

import { useEffect, useState } from "react";
import { createPublicClient, webSocket, type Hex } from "viem";
import { CONTRACT_ADDRESS, SOMNIA_AGENTS_ABI, SOMNIA_RPC_URL } from "@/lib/contract";
import type { TokenMetadata, MethodDefinition } from "@/lib/types";
import { decodeAbi, formatDecodedValue } from "@/lib/abi-utils";

function DecodedData({
  data,
  label,
  method
}: {
  data: string;
  label: string;
  method?: MethodDefinition;
}) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Try to decode using ABI if method is provided
  let decodedValues: any[] | null = null;
  let decodeError: string | null = null;

  if (method && data && data !== '0x') {
    try {
      const params = label === "Call Data" ? method.inputs : method.outputs;
      if (params && params.length > 0) {
        decodedValues = decodeAbi(params, data as Hex);
      }
    } catch (err: any) {
      decodeError = err.message;
    }
  }

  return (
    <div className="mt-2 bg-white rounded border border-gray-300 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}:</span>
        <div className="flex gap-1">
          {decodedValues && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            >
              {showRaw ? "Show decoded" : "Show raw"}
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className="text-xs px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {!showRaw && decodedValues ? (
        <div className="space-y-1">
          {decodedValues.map((value, idx) => {
            const params = label === "Call Data" ? method!.inputs : method!.outputs;
            const param = params[idx];
            return (
              <div key={idx} className="bg-green-50 p-2 rounded">
                <span className="text-xs font-semibold text-gray-700">{param.name}:</span>
                <div className="font-mono text-xs text-green-800 mt-1">
                  {formatDecodedValue(value, param.type)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">({param.type})</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="font-mono text-xs text-gray-900 break-all bg-gray-50 p-2 rounded">
          {data}
        </div>
      )}

      {decodeError && !showRaw && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
          Failed to decode: {decodeError}
        </div>
      )}
    </div>
  );
}

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
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4 border border-gray-200 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Live Event Stream</h2>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
              }`}
          />
          <span className="text-xs sm:text-sm font-medium text-gray-700">
            {connectionStatus === "connected"
              ? "Live"
              : connectionStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>
        </div>
      </div>

      {eventList.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm sm:text-base">Waiting for events...</p>
          <p className="text-xs sm:text-sm mt-2">Create a request to see it appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {eventList.map((event) => {
            const bgColor = !event.resolved
              ? "bg-blue-50 border-blue-300"
              : event.success
                ? "bg-green-50 border-green-300"
                : "bg-red-50 border-red-300";

            // Find the method definition from metadata
            const methods = event.metadata?.agent_spec?.methods || event.metadata?.methods;
            const methodDef = methods?.find(m => m.name === event.method);

            return (
              <div
                key={event.requestId.toString()}
                className={`p-3 sm:p-4 border rounded-lg transition-all ${bgColor}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {!event.resolved ? (
                      <svg
                        className="w-5 h-5 text-blue-600 animate-pulse"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ) : event.success ? (
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700 bg-white px-2 py-1 rounded">
                        Request #{event.requestId.toString()}
                      </span>
                      <span className="text-xs font-semibold text-gray-700 bg-white px-2 py-1 rounded">
                        Agent #{event.agentId.toString()}
                      </span>
                      {event.resolved && event.success && (
                        <span className="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">
                          ✓ Success
                        </span>
                      )}
                      {event.resolved && event.success === false && (
                        <span className="text-xs font-semibold text-red-700 bg-red-200 px-2 py-1 rounded">
                          ✗ Error
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mt-2">
                      Method: <span className="font-mono text-purple-700">{event.method}</span>
                    </p>

                    <DecodedData data={event.callData} label="Call Data" method={methodDef} />

                    {event.resolved && event.responseData && (
                      <DecodedData data={event.responseData} label="Response" method={methodDef} />
                    )}

                    <p className="text-xs text-gray-500 mt-2">
                      Block: {event.blockNumber.toString()} • {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
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
