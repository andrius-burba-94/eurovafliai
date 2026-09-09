import { Bank, Field, selectStyles } from "@/components/board";
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
    <Bank framed label="Round" aside={`Round ${round}`}>
      <form
        method="get"
        action={`/leagues/${leagueId}/recap`}
        className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
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
        <SubmitButton
          testId="recap-show-round"
          pendingLabel="Opening that night…"
        >
          Show this night
        </SubmitButton>
      </form>
    </Bank>
  );
}
