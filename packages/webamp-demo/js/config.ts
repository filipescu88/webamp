import { Track, URLTrack, PartialState } from "../../webamp/js/types";
// @ts-ignore
import lyubeKon from "../mp3/lyube-kon.mp3";
// @ts-ignore
import idzieZolnierz from "../mp3/idzie-zolnierz.mp3";
// @ts-ignore
import pokemony from "../mp3/pokemony.mp3";

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
 * The playlist a fresh page load starts with. These are bundled with the demo
 * (see `mp3/`), so they work offline and are always available.
 */
export const defaultInitialTracks: URLTrack[] = [
  {
    url: lyubeKon,
    duration: 224.64,
    metaData: {
      artist: "Matvey Music",
      title: "ЛЮБЭ - Конь",
    },
  },
  {
    url: idzieZolnierz,
    duration: 207.048,
    metaData: {
      artist: "Praktyka Arktyki",
      title: "Jacek Kowalski - Idzie Żołnierz",
    },
  },
  {
    url: pokemony,
    duration: 241.512,
    metaData: {
      artist: "Bartosz Kalinowski (Józef Pleśniak)",
      title: "Bartek Kalinowski - Pokemony",
    },
  },
];

export const initialTracks = config.initialTracks || defaultInitialTracks;

export const disableMarquee = config.disableMarquee || false;
export const initialState = config.initialState || undefined;
