"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
        <div className="bg-green-500/10 text-green-400 border border-green-500/30 px-3 sm:px-4 py-2 rounded-xl text-center w-full sm:w-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="font-mono text-xs font-bold">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2.5 sm:py-2 rounded-xl hover:bg-red-500/20 active:bg-red-500/30 font-semibold text-sm sm:text-base w-full sm:w-auto min-h-[44px] sm:min-h-0 transition-all"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="bg-gradient-to-r from-primary to-secondary text-white px-6 py-2.5 sm:py-2 rounded-xl hover:opacity-90 active:scale-95 font-bold text-sm sm:text-base w-full sm:w-auto min-h-[44px] sm:min-h-0 shadow-lg shadow-primary/20 transition-all"
    >
      Connect Wallet
    </button>
  );
}

