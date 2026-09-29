import { Bank, Field, selectStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";

const SEASON_CODE = /^E\d{4}$/i;
const FIRST_FANTASY_SEASON = 2026;

export function resolveSeason(
  value: string | string[] | undefined,
  currentSeason: string,
): string {
  return typeof value === "string" && SEASON_CODE.test(value) && Number(value.slice(1)) >= FIRST_FANTASY_SEASON
    ? value.toUpperCase()
    : currentSeason;
}

export function seasonOptions(
  season: string,
  currentSeason: string,
): string[] {
  const currentYear = Number(currentSeason.slice(1));
  const previousSeason = `E${currentYear - 1}`;
  return [...new Set([currentSeason, ...(currentYear - 1 >= FIRST_FANTASY_SEASON ? [previousSeason] : []), season])].filter(
    (option) => SEASON_CODE.test(option) && Number(option.slice(1)) >= FIRST_FANTASY_SEASON,
  );
}

export function SeasonControl({
  action,
  season,
  currentSeason,
}: {
  action: string;
  season: string;
  currentSeason: string;
}) {
  // One season to choose from is not a choice; the control waits for a second.
  const options = seasonOptions(season, currentSeason);
  if (options.length < 2) return null;
  return (
    <Bank framed label="Season">
      <form
        method="get"
        action={action}
        className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Field label="Euroleague season">
          <select
            name="season"
            data-testid="season-select"
            className={selectStyles}
            defaultValue={season}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
                {option === currentSeason ? " · current" : ""}
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton
          testId="season-submit"
          tone="ink"
          pendingLabel="Opening season…"
        >
          Show season
        </SubmitButton>
      </form>
    </Bank>
  );
}
