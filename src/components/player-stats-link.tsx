"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { PlayerProfile, GameLogLine } from "@/lib/stats/queries";
import { formatTenths } from "@/lib/stats/scoring";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";

type Profile = { player: PlayerProfile; log: GameLogLine[] };

export function PlayerStatsLink({
  id,
  name,
  href,
  className,
  ariaLabel,
  children,
}: {
  id: string;
  name: string;
  href?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);

  function show(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(true);
  }

  return <>
    <Link ref={link} href={href ?? `/players/${id}`} onClick={show} className={className} aria-label={ariaLabel}>{children}</Link>
    {open ? <PlayerStatsModal id={id} name={name} profileHref={href ?? `/players/${id}`} onClose={() => { setOpen(false); link.current?.focus(); }} /> : null}
  </>;
}

function PlayerStatsModal({ id, name, profileHref, onClose }: { id: string; name: string; profileHref: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const controller = new AbortController();
    fetch(`/api/players/${id}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Profile unavailable");
        return response.json() as Promise<Profile>;
      })
      .then(setProfile)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, [id]);

  const player = profile?.player;
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="player-stats-title" className="fixed inset-0 m-auto max-h-[min(90dvh,46rem)] w-[min(92vw,36rem)] overflow-y-auto rounded-lg border border-panel-border bg-stock-panel p-5 text-ink backdrop:bg-black/70 sm:p-7" data-testid="player-stats-modal">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <PlayerPortrait personCode={player?.personCode} name={player?.name ?? name} className="!h-[4.5rem] !w-16" />
        <div className="min-w-0"><p className="slot-label text-live">Player profile</p><h2 id="player-stats-title" className="truncate text-xl font-semibold">{player?.name ?? name}</h2>{player ? <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft"><ClubCrest clubCode={player.clubCode} />{player.clubName} · {player.position}</p> : null}</div>
      </div>
      <button type="button" onClick={() => dialog.current?.close()} aria-label="Close player stats" className="grid size-11 shrink-0 place-items-center rounded border border-rule-strong text-xl focus-visible:outline-2 focus-visible:outline-live">×</button>
    </div>
    {!profile && !error ? <p role="status" className="mt-6 text-sm text-ink-soft">Loading player stats…</p> : null}
    {error ? <p role="alert" className="mt-6 text-sm text-loss">Player stats are unavailable right now. <Link href={profileHref} className="underline">Open profile page</Link></p> : null}
    {player ? <>
      {player.status !== "active" ? <p className="mt-4 text-sm text-loss">Status: {player.status}</p> : null}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Recent PIR" value={player.last5 ? formatTenths(player.last5.pirTenths) : null} />
        <Metric label="Recent games" value={player.last5 ? String(player.last5.games) : null} />
        <Metric label="Last-season PIR" value={player.previousSeason ? formatTenths(player.previousSeason.pir) : null} />
        <Metric label="Last-season fantasy" value={player.previousSeason?.fantasy != null ? formatTenths(player.previousSeason.fantasy) : null} />
      </div>
      <h3 className="mt-6 border-b border-panel-border pb-2 text-sm font-semibold">Recent games</h3>
      {profile!.log.length ? <ol className="divide-y divide-panel-border text-sm">{[...profile!.log].reverse().slice(0, 5).map((game) => <li key={game.id} className="flex justify-between gap-3 py-2"><span>Round {game.round} · {game.clubCode}</span><span className="tabular-nums text-ink-soft">PIR {game.pir} · FP {formatTenths(game.fantasyTenths)}</span></li>)}</ol> : <p className="mt-3 text-sm text-ink-soft">No stored games this season.</p>}
      <Link href={profileHref} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-live underline underline-offset-4">Full profile and game log →</Link>
    </> : null}
  </dialog>;
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return <dl className="rounded border border-panel-border bg-stock p-3"><dt className="slot-label">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value ?? "—"}</dd></dl>;
}
