import { z } from "zod";

/** Bumped only when a response shape changes in a way an installed app cannot read. */
export const API_VERSION = 1;

/** Where Google's code is bounced back into the app, and the page that bounces it. */
export const APP_AUTH_REDIRECT = "eurovafliai://auth";
export const APP_CALLBACK_PATH = "/auth/app-callback";

export const metaSchema = z.object({
  apiVersion: z.number().int(),
  /** An installed build older than this is told to update rather than misbehave. */
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export const timeSchema = z.object({ now: z.number().int() });

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
