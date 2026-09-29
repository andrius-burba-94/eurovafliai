import type { RecordModel } from "pocketbase";

import type { CrestShape, TeamColor } from "@/lib/teams/identity";

import type { LeagueSettings } from "./settings";

/** A `leagues` record as it comes back from PocketBase. */
export type LeagueRecord = RecordModel & {
  name: string;
  season: string;
  commissioner: string;
  invite_code: string;
  settings: unknown;
  status: "setup" | "drafting" | "season" | "complete";
};

/** A `league_members` record, optionally with its user expanded. */
export type MemberRecord = RecordModel & {
  league: string;
  user: string;
  team_name: string;
  team_color?: string;
  team_crest?: string;
  draft_position?: number;
  can_manage?: boolean;
  autodraft_enabled: boolean;
  is_ready: boolean;
  expand?: {
    user?: RecordModel & { name?: string; email?: string; avatar?: string };
  };
};

/** A league with its settings parsed and its members resolved — what a page renders. */
export type LeagueWithMembers = {
  league: LeagueRecord;
  settings: LeagueSettings;
  members: Member[];
  /** True when the viewer is this league's commissioner. */
  isCommissioner: boolean;
};

export type Member = {
  id: string;
  userId: string;
  name: string;
  teamName: string;
  /** The member's crest colour and shape — chosen, or the default for their place. */
  color: TeamColor;
  crest: CrestShape;
  isCommissioner: boolean;
  isYou: boolean;
  /** Has said they are at their phone and ready to draft. */
  isReady: boolean;
  /** Slot in the draft order, 1…N. Null until the order is rolled or set. */
  draftPosition: number | null;
  /** The commissioner granted them the league's management powers. */
  canManage: boolean;
};
