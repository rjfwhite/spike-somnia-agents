"use client";

import { CommitteeViewer } from "@/components/CommitteeViewer";

export default function CommitteePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Committee</h1>
        <p className="text-gray-400">
          View validator committee state, monitor membership changes, and test committee functions
        </p>
      </div>
      <CommitteeViewer />
    </div>
  );
}
