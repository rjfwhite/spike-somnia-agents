"use client";

import dynamic from "next/dynamic";

const EventStream = dynamic(() => import("@/components/EventStream").then(mod => ({ default: mod.EventStream })), {
  ssr: false,
  loading: () => (
    <div className="glass-panel rounded-xl shadow-xl p-6 lg:col-span-2 space-y-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
          Live Event Stream
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full border border-white/5 bg-blue-500/10 text-blue-400">
            ○ Connecting...
          </span>
        </div>
      </div>
    </div>
  ),
});

export function EventStreamWrapper() {
  return <EventStream />;
}
