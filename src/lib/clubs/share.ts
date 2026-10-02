/**
 * A club's slice of a team's counted points, as a bar segment and as the
 * words its tip prints. Negative nights count as nothing, so a bar never
 * runs backwards; the share is of every club, not only the ones drawn.
 */
export type ClubShare = {
  readonly clubCode: string;
  /** Width of its segment, 0–100. */
  readonly percent: number;
  /** "34%", or "<1%" for a sliver that would otherwise read as nothing. */
  readonly label: string;
};

export function clubShares(
  clubs: readonly { readonly clubCode: string; readonly tenths: number }[],
  shown: number,
): ClubShare[] {
  const total = clubs.reduce((sum, club) => sum + Math.max(0, club.tenths), 0);
  if (total <= 0) return [];
  return clubs
    .slice(0, shown)
    .filter((club) => club.tenths > 0)
    .map((club) => {
      const percent = (club.tenths / total) * 100;
      return { clubCode: club.clubCode, percent, label: percent < 1 ? "<1%" : `${Math.round(percent)}%` };
    });
}
