import * as Sentry from "@sentry/browser";
// @ts-ignore
import createMiddleware from "redux-sentry-middleware";
// @ts-ignore
import isButterchurnSupported from "butterchurn/dist/isSupported.min";
import { loggerMiddleware } from "./eventLogger";
import * as SoundCloud from "./SoundCloud";

import { Action, Options, AppState, WindowLayout } from "../../webamp/js/types";

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
  initialState,
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
  let windowLayout: WindowLayout | undefined;
  if (isButterchurnSupported()) {
    const startWithMilkdropHidden = skinUrl != null || screenshot;

    __butterchurnOptions = getButterchurnOptions(startWithMilkdropHidden);

    if (
      startWithMilkdropHidden ||
      document.body.clientWidth < MIN_MILKDROP_WIDTH
    ) {
      windowLayout = {
        main: { position: { left: 0, top: 0 } },
        equalizer: { position: { left: 0, top: 116 } },
        playlist: {
          position: { left: 0, top: 232 },
          size: { extraHeight: 0, extraWidth: 0 },
        },
        milkdrop: {
          position: { left: 0, top: 348 },
          size: { extraHeight: 0, extraWidth: 0 },
        },
      };
    } else {
      windowLayout = {
        main: { position: { left: 0, top: 0 } },
        equalizer: { position: { left: 0, top: 116 } },
        playlist: {
          position: { left: 0, top: 232 },
          size: { extraHeight: 4, extraWidth: 0 },
        },
        milkdrop: {
          position: { left: 275, top: 0 },
          size: { extraHeight: 12, extraWidth: 7 },
        },
      };
    }
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
      : undefined,
    availableSkins,
    windowLayout,
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
