import * as Sentry from "@sentry/browser";
// @ts-ignore
import createMiddleware from "redux-sentry-middleware";
// @ts-ignore
import isButterchurnSupported from "butterchurn/dist/isSupported.min";
import { loggerMiddleware } from "./eventLogger";
import * as SoundCloud from "./SoundCloud";

import { Action, Options, AppState, WindowLayout } from "../../webamp/js/types";
import { WINDOW_HEIGHT } from "../../webamp/js/constants";

import { getButterchurnOptions } from "./butterchurnOptions";
import dropboxFilePicker from "./dropboxFilePicker";
import availableSkins from "./availableSkins";
import {
  pickAndStoreLocalFiles,
  getStoredLocalFiles,
  resolveStoredFiles,
  storeLocalFiles,
  StoredEntry,
} from "./localFiles";
import {
  setCustomMediaFileDialog,
  setFilesAddedHandler,
} from "../../webamp/js/actionCreators/files";
import {
  handleAddUrlEvent,
  handleLoadListEvent,
  handleSaveListEvent,
} from "./playlistListHandlers";

import {
  initialState,
  initialTracks as configuredInitialTracks,
} from "./config";
import screenshotInitialState from "./screenshotInitialState";
import { InjectableDependencies, PrivateOptions } from "../../webamp/js/webampLazy";
import { playlistSyncMiddleware } from "./playlistSyncMiddleware";

const NOISY_ACTION_TYPES = new Set([
  "STEP_MARQUEE",
  "UPDATE_TIME_ELAPSED",
  "UPDATE_WINDOW_POSITIONS",
  "SET_VOLUME",
  "SET_BALANCE",
  "SET_BAND_VALUE",
]);

const MIN_MILKDROP_WIDTH = 725;

/**
 * Phones and other small/touch devices don't have room for the full window
 * stack at its natural size, so instead of a fixed layout we let Webamp scale
 * the UI up to fill the viewport and grow the playlist to fill the rest of the
 * screen. See the `autoFitToViewport` option.
 */
function isSmallViewport(): boolean {
  return (
    window.innerWidth < 700 || window.matchMedia("(pointer: coarse)").matches
  );
}

let lastActionType: string | null = null;

// Filter out consecutive common actions
function filterBreadcrumbActions(action: Action) {
  const noisy =
    lastActionType != null &&
    NOISY_ACTION_TYPES.has(action.type) &&
    NOISY_ACTION_TYPES.has(lastActionType);
  lastActionType = action.type;
  return !noisy;
}

const sentryMiddleware = createMiddleware(Sentry, {
  filterBreadcrumbActions,
  stateTransformer: getDebugData,
});

export async function getWebampConfig(
  screenshot: boolean,
  skinUrl: string | null,
  soundCloudPlaylist: SoundCloud.SoundCloudPlaylist | null
): Promise<Options & PrivateOptions & InjectableDependencies> {
  let __butterchurnOptions;
  if (isButterchurnSupported()) {
    const startWithMilkdropHidden = true;

    __butterchurnOptions = getButterchurnOptions(startWithMilkdropHidden);
  }

  let windowLayout: WindowLayout | undefined;
  const autoFitToViewport = isSmallViewport();
  if (autoFitToViewport) {
    // Only the main window and the playlist, stacked so that the playlist
    // starts right below the main window. Auto-fit grows the playlist to fill
    // whatever is left of the screen, and scales the whole thing to fit the
    // width. The equalizer and Milkdrop stay closed, since there is no room
    // for them, but the user can still open them from the main window.
    windowLayout = {
      main: { position: { left: 0, top: 0 } },
      equalizer: {
        position: { left: 0, top: WINDOW_HEIGHT },
        closed: true,
      },
      playlist: { position: { left: 0, top: WINDOW_HEIGHT } },
      milkdrop: {
        position: { left: 0, top: WINDOW_HEIGHT },
        closed: true,
      },
    };
  } else if (isButterchurnSupported()) {
    // Give the playlist roughly 3x its default height, but never more than
    // the browser viewport can fit: main (0..116) + equalizer (116..232) +
    // playlist (232..bottom). If the windows don't fit on screen,
    // ensureWindowsAreOnScreen() resets all window sizes, so we must stay
    // within the viewport ourselves.
    const SEGMENT_PX = 29; // WINDOW_RESIZE_SEGMENT_HEIGHT
    const PLAYLIST_TOP = 232;
    const PLAYLIST_BASE_PX = 116; // window height at extraHeight: 0 (≈4 tracks)
    const MARGIN_PX = 10;
    const viewportHeight = window.innerHeight;
    const availableForPlaylist = viewportHeight - PLAYLIST_TOP - MARGIN_PX;
    // 3x the base window = base + 2 extra base-heights, converted to segments
    const desiredSegments = Math.floor(
      (PLAYLIST_BASE_PX * 3 - PLAYLIST_BASE_PX) / SEGMENT_PX
    ); // = 8 segments ≈ 12 rows ≈ 3x the ≈4-row default
    const maxSegments = Math.max(
      0,
      Math.floor((availableForPlaylist - PLAYLIST_BASE_PX) / SEGMENT_PX)
    );
    const extraHeight = Math.min(desiredSegments, maxSegments);

    windowLayout = {
      main: { position: { left: 0, top: 0 } },
      equalizer: { position: { left: 0, top: 116 } },
      playlist: {
        position: { left: 0, top: 232 },
        size: { extraHeight, extraWidth: 0 },
      },
      milkdrop: {
        position: { left: 0, top: 348 },
        size: { extraHeight: 0, extraWidth: 0 },
      },
    };
  }

  const initialSkin = !skinUrl ? undefined : { url: skinUrl };

  // The Eject button, "File..." menu item and the "L" hotkey all route through
  // openMediaFileDialog(). Point them at our local-file picker so that any way
  // of adding files persists the playlist.
  setCustomMediaFileDialog(async () => {
    const entries = await pickAndStoreLocalFiles();
    const files = await resolveStoredFiles(entries);
    return files.map((file) => ({
      blob: file,
      defaultName: file.name,
    }));
  });

  // Drag&drop, ADD FILE and ADD DIR go through addTracksFromReferences().
  // Those operations APPEND to the playlist, so merge the new files into the
  // stored snapshot (deduped by name) instead of replacing it — otherwise only
  // the files from the last operation would be restored after a reload.
  setFilesAddedHandler((files) => {
    getStoredLocalFiles().then((stored) => {
      const merged: StoredEntry[] = [...(stored ?? [])];
      for (const file of files) {
        if (!merged.some((e) => e.name === file.name && e.file != null)) {
          merged.push({ name: file.name, file });
        }
      }
      storeLocalFiles(merged);
    });
  });

  return {
    initialSkin,
    // eslint-disable-next-line no-nested-ternary
    initialTracks: screenshot
      ? undefined
      : soundCloudPlaylist != null
      ? SoundCloud.tracksFromPlaylist(soundCloudPlaylist)
      : configuredInitialTracks,
    availableSkins,
    windowLayout,
    autoFitToViewport,
    filePickers: [
      dropboxFilePicker,
      {
        contextMenuName: "Pliki z dysku...",
        filePicker: async () => {
          const entries = await pickAndStoreLocalFiles();
          const files = await resolveStoredFiles(entries);
          return files.map((file) => ({
            blob: file,
            defaultName: file.name,
          }));
        },
        requiresNetwork: false,
      },
    ],
    enableHotkeys: true,
    enableMediaSession: true,
    // The playlist window's LIST OPTS menu: without these the library answers
    // with `alert("Not supported in Webamp")`. See playlistListHandlers.ts.
    handleSaveListEvent,
    handleLoadListEvent,
    handleAddUrlEvent,
    handleTrackDropEvent: (e) => {
      const trackJson = e.dataTransfer.getData("text/json");
      if (trackJson == null) {
        return null;
      }
      try {
        const track = JSON.parse(trackJson);
        return [track];
      } catch (_err) {
        return null;
      }
    },
    requireJSZip: () =>
      // @ts-ignore
      import(/* webpackChunkName: "jszip" */ "jszip/dist/jszip"),
    requireMusicMetadata: () =>
      // @ts-ignore
      import(/* webpackChunkName: "music-metadata" */ "music-metadata"),
    __initialState: screenshot ? screenshotInitialState : initialState,
    __butterchurnOptions,
    __customMiddlewares: [sentryMiddleware, loggerMiddleware, playlistSyncMiddleware],
  };
}

function getDebugData(state: AppState) {
  return {
    ...state,
    display: {
      ...state.display,
      skinGenLetterWidths: "[[REDACTED]]",
      skinImages: "[[REDACTED]]",
      skinCursors: "[[REDACTED]]",
      skinRegion: "[[REDACTED]]",
    },
  };
}
