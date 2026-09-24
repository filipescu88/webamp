import { Middleware } from "../../webamp/js/types";
import { getPlaylistTracks } from "../../webamp/js/selectors";
import { storeLocalFiles } from "./localFiles";

const PLAYLIST_CHANGING_ACTIONS = new Set([
  "REMOVE_TRACKS",
  "REMOVE_ALL_TRACKS",
  "REVERSE_LIST",
  "RANDOMIZE_LIST",
  "SET_TRACK_ORDER",
  "DRAG_SELECTED",
  "LOAD_MEDIA_FILES_INITIAL",
]);

/**
 * Keeps the stored local-file snapshot in sync with the visible playlist.
 * After any action that reorders/removes tracks, the snapshot is rewritten to
 * match the tracks still in the playlist (matched by name). Added files enter
 * the snapshot via setFilesAddedHandler; this middleware only prunes/reorders.
 */
export const playlistSyncMiddleware: Middleware = (store) => (next) => (
  action: any
) => {
  const result = next(action);
  if (PLAYLIST_CHANGING_ACTIONS.has(action.type)) {
    const state = store.getState();
    const names = new Set(
      getPlaylistTracks(state).map((t) => t.defaultName ?? t.title ?? "")
    );
    import("./localFiles").then(async ({ getStoredLocalFiles }) => {
      const stored = await getStoredLocalFiles();
      if (stored == null) {
        return;
      }
      const kept = stored.filter((e) => names.has(e.name));
      const ordered = [];
      for (const name of names) {
        const entry = kept.find((e) => e.name === name);
        if (entry != null) {
          ordered.push(entry);
        }
      }
      if (
        ordered.length !== stored.length ||
        ordered.some((e, i) => e !== stored[i])
      ) {
        storeLocalFiles(ordered);
      }
    });
  }
  return result;
};
