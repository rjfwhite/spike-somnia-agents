import { ManageResponders } from "@/components/ManageResponders";

export default function RespondersPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Manage Responders</h1>
            <div className="max-w-4xl">
                <ManageResponders />
            </div>
        </div>
    );
}
