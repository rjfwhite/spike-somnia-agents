"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, webSocket, type Hex, encodeAbiParameters, keccak256 } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { COMMITTEE_CONTRACT_ADDRESS, COMMITTEE_ABI, SOMNIA_RPC_URL } from "@/lib/contract";
import { RefreshCw, Heart, Users, Shuffle, Clock, LogOut, AlertTriangle } from "lucide-react";

interface MemberEvent {
  type: "joined" | "left" | "timedOut";
  member: string;
  blockNumber: bigint;
  timestamp: number;
  txHash?: string;
}

export function CommitteeViewer() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<"state" | "events" | "actions">("state");
  const [events, setEvents] = useState<MemberEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");

  // Subcommittee election state
  const [subcommitteeSize, setSubcommitteeSize] = useState("3");
  const [subcommitteeSeed, setSubcommitteeSeed] = useState("");
  const [electedSubcommittee, setElectedSubcommittee] = useState<string[] | null>(null);
  const [isElecting, setIsElecting] = useState(false);

  // Read active members
  const { data: activeMembers, refetch: refetchMembers } = useReadContract({
    address: COMMITTEE_CONTRACT_ADDRESS,
    abi: COMMITTEE_ABI,
    functionName: "getActiveMembers",
  });

  // Read heartbeat interval
  const { data: heartbeatInterval } = useReadContract({
    address: COMMITTEE_CONTRACT_ADDRESS,
    abi: COMMITTEE_ABI,
    functionName: "HEARTBEAT_INTERVAL",
  });

  // Read last upkeep
  const { data: lastUpkeep, refetch: refetchLastUpkeep } = useReadContract({
    address: COMMITTEE_CONTRACT_ADDRESS,
    abi: COMMITTEE_ABI,
    functionName: "lastUpkeep",
  });

  // Check if current user is active
  const { data: isUserActive, refetch: refetchUserActive } = useReadContract({
    address: COMMITTEE_CONTRACT_ADDRESS,
    abi: COMMITTEE_ABI,
    functionName: "isActive",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Write contract for heartbeat
  const { writeContract: sendHeartbeat, data: heartbeatTxHash, isPending: isHeartbeatPending } = useWriteContract();
  const { isLoading: isHeartbeatConfirming, isSuccess: isHeartbeatSuccess } = useWaitForTransactionReceipt({
    hash: heartbeatTxHash,
  });

  // Write contract for leave
  const { writeContract: sendLeave, data: leaveTxHash, isPending: isLeavePending } = useWriteContract();
  const { isLoading: isLeaveConfirming, isSuccess: isLeaveSuccess } = useWaitForTransactionReceipt({
    hash: leaveTxHash,
  });

  // Refresh all data when heartbeat or leave succeeds
  useEffect(() => {
    if (isHeartbeatSuccess || isLeaveSuccess) {
      refetchMembers();
      refetchUserActive();
      refetchLastUpkeep();
    }
  }, [isHeartbeatSuccess, isLeaveSuccess, refetchMembers, refetchUserActive, refetchLastUpkeep]);

  // Watch for MemberJoined and MemberLeft events
  useEffect(() => {
    if ((COMMITTEE_CONTRACT_ADDRESS as string) === "0x0000000000000000000000000000000000000000") {
      setConnectionStatus("error");
      return;
    }

    const wsUrl = SOMNIA_RPC_URL.replace("https://", "wss://").replace("http://", "ws://") + "ws";
    const client = createPublicClient({
      transport: webSocket(wsUrl),
    });

    setConnectionStatus("connected");

    const unwatchJoined = client.watchContractEvent({
      address: COMMITTEE_CONTRACT_ADDRESS,
      abi: COMMITTEE_ABI,
      eventName: "MemberJoined",
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { member } = log.args as { member: string };
          setEvents((prev) => [
            {
              type: "joined",
              member,
              blockNumber: log.blockNumber,
              timestamp: Date.now(),
              txHash: log.transactionHash,
            },
            ...prev,
          ]);
          refetchMembers();
          refetchUserActive();
        });
      },
      onError: (error) => {
        console.error("Error watching MemberJoined:", error);
        setConnectionStatus("error");
      },
    });

    const unwatchLeft = client.watchContractEvent({
      address: COMMITTEE_CONTRACT_ADDRESS,
      abi: COMMITTEE_ABI,
      eventName: "MemberLeft",
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { member } = log.args as { member: string };
          setEvents((prev) => [
            {
              type: "left",
              member,
              blockNumber: log.blockNumber,
              timestamp: Date.now(),
              txHash: log.transactionHash,
            },
            ...prev,
          ]);
          refetchMembers();
          refetchUserActive();
        });
      },
      onError: (error) => {
        console.error("Error watching MemberLeft:", error);
        setConnectionStatus("error");
      },
    });

    const unwatchTimedOut = client.watchContractEvent({
      address: COMMITTEE_CONTRACT_ADDRESS,
      abi: COMMITTEE_ABI,
      eventName: "MemberTimedOut",
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { member } = log.args as { member: string };
          setEvents((prev) => [
            {
              type: "timedOut",
              member,
              blockNumber: log.blockNumber,
              timestamp: Date.now(),
              txHash: log.transactionHash,
            },
            ...prev,
          ]);
          refetchMembers();
          refetchUserActive();
        });
      },
      onError: (error) => {
        console.error("Error watching MemberTimedOut:", error);
        setConnectionStatus("error");
      },
    });

    return () => {
      unwatchJoined();
      unwatchLeft();
      unwatchTimedOut();
    };
  }, [refetchMembers, refetchUserActive]);

  const handleHeartbeat = () => {
    sendHeartbeat({
      address: COMMITTEE_CONTRACT_ADDRESS,
      abi: COMMITTEE_ABI,
      functionName: "heartbeatMembership",
    });
  };

  const handleLeave = () => {
    sendLeave({
      address: COMMITTEE_CONTRACT_ADDRESS,
      abi: COMMITTEE_ABI,
      functionName: "leaveMembership",
    });
  };

  const handleElectSubcommittee = async () => {
    if (!subcommitteeSize || parseInt(subcommitteeSize) < 1) return;

    setIsElecting(true);
    try {
      const client = createPublicClient({
        transport: http(SOMNIA_RPC_URL),
      });

      // Generate seed from input or create random one
      let seed: Hex;
      if (subcommitteeSeed.trim()) {
        // Hash the input to create a bytes32 seed
        seed = keccak256(encodeAbiParameters([{ type: "string" }], [subcommitteeSeed]));
      } else {
        // Generate random seed
        seed = keccak256(encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [BigInt(Date.now()), BigInt(Math.floor(Math.random() * 1000000))]
        ));
      }

      const result = await client.readContract({
        address: COMMITTEE_CONTRACT_ADDRESS,
        abi: COMMITTEE_ABI,
        functionName: "electSubcommittee",
        args: [BigInt(subcommitteeSize), seed],
      }) as string[];

      setElectedSubcommittee(result);
    } catch (err) {
      console.error("Failed to elect subcommittee:", err);
      setElectedSubcommittee(null);
    } finally {
      setIsElecting(false);
    }
  };

  const handleRefresh = () => {
    refetchMembers();
    refetchUserActive();
    refetchLastUpkeep();
  };

  const formatTimestamp = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if ((COMMITTEE_CONTRACT_ADDRESS as string) === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="glass-panel rounded-xl p-8 text-center">
        <div className="text-4xl mb-4 opacity-50">!</div>
        <h3 className="text-xl font-bold text-white mb-2">Committee Contract Not Deployed</h3>
        <p className="text-gray-400 mb-4">
          The Committee contract address is not configured. Please deploy the contract and update the address in{" "}
          <code className="text-cyan-400">lib/contract.ts</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {[
          { id: "state", label: "Current State", icon: Users },
          { id: "events", label: "Event Feed", icon: RefreshCw },
          { id: "actions", label: "Actions", icon: Heart },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === id
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Current State Tab */}
      {activeTab === "state" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Active Members</div>
                  <div className="text-2xl font-bold text-white">{activeMembers?.length?.toString() ?? "..."}</div>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Heartbeat Interval</div>
                  <div className="text-2xl font-bold text-white">
                    {heartbeatInterval ? `${Number(heartbeatInterval)}s` : "..."}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg ${isUserActive ? "bg-green-500/20" : "bg-red-500/20"} flex items-center justify-center`}>
                  <Heart className={`w-5 h-5 ${isUserActive ? "text-green-400" : "text-red-400"}`} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Your Status</div>
                  <div className={`text-lg font-bold ${isUserActive ? "text-green-400" : "text-red-400"}`}>
                    {!isConnected ? "Not Connected" : isUserActive ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Members List */}
          <div className="glass-panel rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Active Committee Members</h3>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {activeMembers && activeMembers.length > 0 ? (
              <div className="space-y-2">
                {activeMembers.map((member, i) => (
                  <div
                    key={member}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      member.toLowerCase() === address?.toLowerCase()
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
                        {i + 1}
                      </div>
                      <span className="font-mono text-sm text-white">{member}</span>
                      {member.toLowerCase() === address?.toLowerCase() && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          You
                        </span>
                      )}
                    </div>
                    <a
                      href={`https://shannon-explorer.somnia.network/address/${member}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-cyan-400 transition-colors"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No active committee members</p>
                <p className="text-xs mt-1">Send a heartbeat to join the committee</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Feed Tab */}
      {activeTab === "events" && (
        <div className="glass-panel rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionStatus === "connected" ? "bg-green-400" : "bg-red-400"
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  connectionStatus === "connected" ? "bg-green-500" : "bg-red-500"
                }`}></span>
              </span>
              Membership Event Stream
            </h3>
            <span className={`text-xs px-2 py-1 rounded-full border border-white/5 ${
              connectionStatus === "connected"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {connectionStatus === "connected" ? "Connected" : connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
            </span>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Waiting for membership changes...</p>
              <p className="text-xs mt-1">Events appear when members join or leave</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {events.map((event, i) => {
                const isJoined = event.type === "joined";
                const isTimedOut = event.type === "timedOut";
                const bgColor = isJoined ? "bg-green-500/5 border-green-500/20" : isTimedOut ? "bg-orange-500/5 border-orange-500/20" : "bg-red-500/5 border-red-500/20";
                const iconBg = isJoined ? "bg-green-500/20" : isTimedOut ? "bg-orange-500/20" : "bg-red-500/20";
                const textColor = isJoined ? "text-green-400" : isTimedOut ? "text-orange-400" : "text-red-400";
                const iconColor = isJoined ? "text-green-400" : isTimedOut ? "text-orange-400" : "text-red-400";
                const label = isJoined ? "Member Joined" : isTimedOut ? "Member Timed Out" : "Member Left";

                return (
                  <div
                    key={`${event.member}-${event.timestamp}-${i}`}
                    className={`p-4 rounded-xl border ${bgColor}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
                          {isJoined ? (
                            <Heart className={`w-5 h-5 ${iconColor}`} />
                          ) : isTimedOut ? (
                            <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
                          ) : (
                            <LogOut className={`w-5 h-5 ${iconColor}`} />
                          )}
                        </div>
                        <div>
                          <div className={`font-bold ${textColor}`}>
                            {label}
                          </div>
                          <div className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="font-mono text-sm text-gray-300 bg-black/20 p-2 rounded">
                      {event.member}
                    </div>

                    {event.txHash && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <a
                          href={`https://shannon-explorer.somnia.network/tx/${event.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-cyan-400 hover:underline"
                        >
                          {shortenAddress(event.txHash)}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === "actions" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Heartbeat Card */}
          <div className="glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center">
                <Heart className="w-6 h-6 text-pink-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Send Heartbeat</h3>
                <p className="text-xs text-gray-500">Join or refresh your committee membership</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your Status</div>
                <div className={`font-medium ${isUserActive ? "text-green-400" : "text-red-400"}`}>
                  {!isConnected ? "Wallet not connected" : isUserActive ? "Active in committee" : "Not in committee"}
                </div>
              </div>

              {lastUpkeep && (
                <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Last Upkeep</div>
                  <div className="font-mono text-sm text-gray-300">{formatTimestamp(lastUpkeep)}</div>
                </div>
              )}

              <button
                onClick={handleHeartbeat}
                disabled={!isConnected || isHeartbeatPending || isHeartbeatConfirming}
                className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  !isConnected
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                    : isHeartbeatPending || isHeartbeatConfirming
                    ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                    : "bg-pink-600 hover:bg-pink-500 text-white"
                }`}
              >
                {isHeartbeatPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : isHeartbeatConfirming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Heart className="w-4 h-4" />
                    Send Heartbeat
                  </>
                )}
              </button>

              {isHeartbeatSuccess && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                  Heartbeat sent successfully!
                </div>
              )}
            </div>
          </div>

          {/* Leave Card */}
          <div className="glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <LogOut className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Leave Committee</h3>
                <p className="text-xs text-gray-500">Explicitly leave the committee</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Note</div>
                <div className="text-sm text-gray-400">
                  You can leave the committee at any time. You can rejoin by sending a heartbeat.
                </div>
              </div>

              <button
                onClick={handleLeave}
                disabled={!isConnected || !isUserActive || isLeavePending || isLeaveConfirming}
                className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  !isConnected || !isUserActive
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                    : isLeavePending || isLeaveConfirming
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-red-600 hover:bg-red-500 text-white"
                }`}
              >
                {isLeavePending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : isLeaveConfirming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    Leave Committee
                  </>
                )}
              </button>

              {isLeaveSuccess && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                  Successfully left the committee!
                </div>
              )}
            </div>
          </div>

          {/* Elect Subcommittee Card */}
          <div className="glass-panel rounded-xl p-6 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Shuffle className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Elect Subcommittee</h3>
                <p className="text-xs text-gray-500">Test deterministic subcommittee selection</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">
                  Number of Members
                </label>
                <input
                  type="number"
                  min="1"
                  max={activeMembers?.length || 10}
                  value={subcommitteeSize}
                  onChange={(e) => setSubcommitteeSize(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-black/20 border border-white/10 text-white focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">
                  Seed (optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter a seed or leave empty for random"
                  value={subcommitteeSeed}
                  onChange={(e) => setSubcommitteeSeed(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleElectSubcommittee}
              disabled={isElecting || !activeMembers || activeMembers.length === 0}
              className={`w-full mt-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                isElecting
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : !activeMembers || activeMembers.length === 0
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {isElecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Electing...
                </>
              ) : (
                <>
                  <Shuffle className="w-4 h-4" />
                  Elect Subcommittee
                </>
              )}
            </button>

            {electedSubcommittee && (
              <div className="mt-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-xs text-cyan-400 uppercase tracking-wider mb-2">
                  Selected {electedSubcommittee.length} Members
                </div>
                <div className="space-y-1">
                  {electedSubcommittee.map((member, i) => (
                    <div key={member} className="flex items-center gap-2 text-xs">
                      <span className="text-cyan-400 font-bold">{i + 1}.</span>
                      <span className="font-mono text-gray-300">{member}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
