import { Field, selectStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";

export function RoundPicker({
  leagueId,
  season,
  round,
  rounds,
}: {
  leagueId: string;
  season: string;
  round: number;
  rounds: readonly number[];
}) {
  return (
    <form
      method="get"
      action={`/leagues/${leagueId}/recap`}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="season" value={season} />
      <Field label="Euroleague round">
        <select
          name="round"
          data-testid="recap-round"
          className={selectStyles}
          defaultValue={String(round)}
        >
          {rounds.map((n) => (
            <option key={n} value={n}>
              Round {n}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton testId="recap-show-round" pendingLabel="Opening that night…">
        Show this night
      </SubmitButton>
    </form>
  );
}
