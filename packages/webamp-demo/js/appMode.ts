/**
 * Is this page running as an installed app rather than as a web page?
 *
 * The spec has exactly five display modes: `browser` (an ordinary tab) plus
 * the four an installed app can report. Chromium answers these through
 * `matchMedia`, and which one you get depends on how the app was installed:
 * a page installed without a web manifest opens in a window that keeps a
 * minimal set of navigation controls and reports `minimal-ui`, not
 * `standalone`. Checking only `standalone` therefore misses it.
 *
 * iOS Safari has no `display-mode` support at all and uses
 * `navigator.standalone` instead.
 *
 * The distinction matters because saving/loading playlists is an app-window
 * feature: a separate window is what makes it feel like a program rather than
 * a page with a download button.
 */

const APP_DISPLAY_MODES = [
  "standalone",
  "minimal-ui",
  "window-controls-overlay",
  "fullscreen",
];

export function isInstalledApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof window.matchMedia === "function") {
    for (const mode of APP_DISPLAY_MODES) {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) {
        return true;
      }
    }
  }
  // Not in the TS lib for every version.
  return (window.navigator as any).standalone === true;
}
