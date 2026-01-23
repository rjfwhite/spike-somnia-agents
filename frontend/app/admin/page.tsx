"use client";

import { AdminPanel } from "@/components/AdminPanel";

export default function AdminPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
                <p className="text-gray-400 mt-2">Manage agent configurations on the contract</p>
            </div>

            <AdminPanel />
        </div>
    );
}
