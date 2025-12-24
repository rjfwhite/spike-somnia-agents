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
        <div className="bg-green-100 text-green-800 px-3 sm:px-4 py-2 rounded-lg text-center w-full sm:w-auto">
          <span className="text-xs sm:text-sm">Connected: </span>
          <span className="font-mono text-xs">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="bg-red-600 text-white px-4 py-2.5 sm:py-2 rounded-lg hover:bg-red-700 active:bg-red-800 font-semibold text-sm sm:text-base w-full sm:w-auto min-h-[44px] sm:min-h-0"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="bg-blue-600 text-white px-6 py-2.5 sm:py-2 rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold text-sm sm:text-base w-full sm:w-auto min-h-[44px] sm:min-h-0"
    >
      Connect Wallet
    </button>
  );
}

