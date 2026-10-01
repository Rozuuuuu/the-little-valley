/**
 * Which build of the game this is, and whether a newer one has been published. Every push to
 * master is built and published with a version.json naming its commit; the installed app
 * compares that with its own.
 */

export interface BuildInfo {
  commit: string;
  short: string;
  date: string;
  message: string;
}

declare const __BUILD__: BuildInfo | undefined;

/** This build (set by vite.config.ts; "dev" under tests). */
export const BUILD: BuildInfo = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: 'dev', short: 'dev', date: new Date(0).toISOString(), message: '' };

/** Whether the published build is a different one from ours (development builds never update). */
export function isUpdate(current: BuildInfo, latest: BuildInfo | null): boolean {
  return !!latest && current.commit !== 'dev' && !!latest.commit && latest.commit !== 'dev' && latest.commit !== current.commit;
}
