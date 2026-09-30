import Link from "next/link";

/**
 * The draft as a file, one tap from the pages that show it.
 *
 * A `<details>` of plain links to the export handler, so it works without
 * JavaScript and every choice is a URL someone can paste into the chat. The
 * export page stays the place to pick an exact mix; this menu is the three
 * files people actually ask for.
 */
export function DownloadMenu({ leagueId }: { leagueId: string }) {
  const base = `/leagues/${leagueId}/export`;
  const files = [
    { label: "Draft results", detail: "CSV", query: "include=results&format=csv" },
    { label: "Rosters as drafted", detail: "CSV", query: "include=rosters&format=csv" },
    {
      label: "Everything",
      detail: "JSON",
      query: "include=results&include=rosters&include=order&include=pool&format=json",
    },
  ];

  return (
    <details data-testid="download-menu" className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-rule-strong px-4 text-sm font-semibold hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live [&::-webkit-details-marker]:hidden">
        Download
        <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-180">
          &#9662;
        </span>
      </summary>
      <ul
        role="list"
        className="absolute right-0 z-20 mt-2 flex w-64 flex-col overflow-hidden rounded-card border border-rule-strong bg-stock-high py-1"
      >
        {files.map((file) => (
          <li key={file.label}>
            <a
              href={`${base}/download?${file.query}`}
              className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
            >
              {file.label}
              <span className="slot-label text-ink-soft">{file.detail}</span>
            </a>
          </li>
        ))}
        <li className="border-t border-rule">
          <Link
            href={base}
            className="flex min-h-11 items-center px-4 text-sm text-ink-soft hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
          >
            Choose what to include&hellip;
          </Link>
        </li>
      </ul>
    </details>
  );
}
