import { EventStream } from "@/components/EventStream";

export default function LivePage() {
    return (
        <div className="h-[calc(100vh-8rem)]">
            <EventStream />
        </div>
    );
}
