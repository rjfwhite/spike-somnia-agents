import { MintAgent } from "@/components/MintAgent";

export default function MintPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                Mint New Agent
            </h1>
            <div className="max-w-4xl">
                <MintAgent />
            </div>
        </div>
    );
}
