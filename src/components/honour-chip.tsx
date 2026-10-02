import { Glyph, type GlyphName } from "@/components/glyphs";
import { InfoTip } from "@/components/info-tip";
import { HONOUR_MEANING, type BadgeId } from "@/lib/season/badges";

/** The honours in the order they are shown: most flattering first. */
export const HONOURS: readonly {
  readonly id: BadgeId;
  readonly label: string;
  readonly glyph: GlyphName;
  readonly ink: string;
  readonly tone: string;
}[] = [
  { id: "on-fire", label: "On fire", glyph: "flame", ink: "text-live", tone: "border-live/50 bg-live-sunk" },
  { id: "crowned", label: "Crowned", glyph: "crown", ink: "text-gold", tone: "border-gold/50 bg-gold/10" },
  { id: "spoon-collector", label: "Wooden spoon", glyph: "spoon", ink: "text-wood", tone: "border-wood/60 bg-wood/15" },
];

/** An honour's glyph and name, with what it means behind it (`InfoTip`). */
export function HonourChip({ id, title }: { id: BadgeId; title?: string }) {
  const honour = HONOURS.find((row) => row.id === id)!;
  return (
    <InfoTip
      testId={`honour-chip-${id}`}
      triggerClassName="inline-flex min-h-8 items-center gap-1.5 rounded-full font-bold underline decoration-dotted decoration-ink-faint underline-offset-4"
      trigger={
        <>
          <Glyph name={honour.glyph} size={14} className={honour.ink} />
          {title ?? honour.label}
        </>
      }
    >
      {HONOUR_MEANING[id]}
    </InfoTip>
  );
}
