"use client";

import dynamic from "next/dynamic";

const EventStream = dynamic(() => import("@/components/EventStream").then(mod => ({ default: mod.EventStream })), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border border-gray-200">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Live Event Stream</h2>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-xs sm:text-sm font-medium text-gray-700">Connecting...</span>
        </div>
      </div>
    </div>
  ),
});

export function EventStreamWrapper() {
  return <EventStream />;
}
