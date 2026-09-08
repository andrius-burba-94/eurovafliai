import { Sheet } from "@/components/board";

export default function Loading() {
  return (
    <Sheet>
      <p className="slot-label text-ink-soft" role="status">
        Loading the sheet…
      </p>
      <div className="slot-waiting min-h-16" aria-hidden="true" />
    </Sheet>
  );
}
