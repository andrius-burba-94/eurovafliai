import { selectStyles } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";

/**
 * "Whose team" — a plain GET form, so switching teams is a link the browser
 * can go back from and still works before the page has hydrated. `keep` holds
 * the other query values (round, season) the page must not lose on the way.
 */
export function TeamPicker({
  action,
  keep,
  members,
  value,
  testId,
}: {
  action: string;
  keep: Readonly<Record<string, string>>;
  members: readonly { id: string; teamName: string; name: string }[];
  value: string;
  testId: string;
}) {
  return (
    <form method="get" action={action} className="flex min-w-0 items-center gap-2" data-testid={`${testId}-picker`}>
      {Object.entries(keep).map(([name, kept]) => (
        <input key={name} type="hidden" name={name} value={kept} />
      ))}
      <select name="member" aria-label="Whose team" defaultValue={value} data-testid={`${testId}-member`} className={`${selectStyles} max-w-56 min-w-0 font-semibold`}>
        {members.map((row) => (
          <option key={row.id} value={row.id}>
            {row.teamName.trim() ? row.teamName : row.name}
          </option>
        ))}
      </select>
      <SubmitButton testId={`${testId}-show`} tone="ink" pendingLabel="Opening…" compact>
        Show
      </SubmitButton>
    </form>
  );
}
