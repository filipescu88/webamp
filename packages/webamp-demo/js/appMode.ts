/**
 * Is this page running as an installed app rather than as a web page?
 *
 * Chromium reports the manifest display mode through `matchMedia`; iOS Safari
 * has no `display-mode` support and uses `navigator.standalone` instead. The
 * distinction matters because saving/loading playlists is an app-window
 * feature: a separate window is what makes it feel like a program and not a
 * page with a download button.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  // Not in the TS lib for every version.
  const iosStandalone = (window.navigator as any).standalone === true;
  return standalone || iosStandalone;
}
