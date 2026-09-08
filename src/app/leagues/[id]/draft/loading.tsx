import { Sheet } from "@/components/board";

export default function Loading() {
  return (
    <Sheet>
      <p className="slot-label text-ink-soft" role="status">
        Loading the room…
      </p>
      <div className="slot-waiting min-h-24" aria-hidden="true" />
    </Sheet>
  );
}
