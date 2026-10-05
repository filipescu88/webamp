import { Track, URLTrack, PartialState } from "../../webamp/js/types";

interface Config {
  initialTracks?: Track[];
  audioUrl?: string;
  skinUrl?: string;
  disableMarquee?: boolean;
  initialState?: PartialState;
}

const { hash } = window.location;
let config: Config = {};
if (hash) {
  try {
    config = JSON.parse(decodeURIComponent(hash).slice(1));
  } catch (_e) {
    console.error("Failed to decode config from hash: ", hash);
  }
}

// Backwards compatibility with the old syntax
if (config.audioUrl && !config.initialTracks) {
  config.initialTracks = [{ url: config.audioUrl }];
}

export const SHOW_DESKTOP_ICONS = true;

if ("URLSearchParams" in window) {
  // const params = new URLSearchParams(location.search);
  // SHOW_DESKTOP_ICONS = Boolean(params.get("icons"));
}

export const skinUrl = config.skinUrl ?? null;

/**
 * The playlist a fresh page load starts with. The demo no longer bundles any
 * music: nothing is served from this repo, and the visitor brings their own
 * files (or a saved list), which the app remembers for the next start.
 */
export const defaultInitialTracks: URLTrack[] = [];

export const initialTracks = config.initialTracks || defaultInitialTracks;

export const disableMarquee = config.disableMarquee || false;
export const initialState = config.initialState || undefined;
