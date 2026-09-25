import { Middleware } from "../../webamp/js/types";
import { getPlaylistTracks } from "../../webamp/js/selectors";
import { storeLocalFiles } from "./localFiles";

/**
 * Actions after which the *restore* list — what to offer on the next start — is
 * re-synced with the visible playlist, so a track the user removed does not come
 * back by itself.
 *
 * This touches only that restore list. Which files the app knows, i.e. the
 * memory a saved playlist is matched against, is kept separately and is never
 * pruned here: removing a track from the playlist is not a request to forget the
 * file.
 *
 * Two actions are deliberately absent:
 *
 * - `LOAD_MEDIA_FILES_INITIAL` happens before the restore runs, and pruning
 *   there emptied the restore list on every start.
 * - `REMOVE_ALL_TRACKS` fires in the middle of loading a list (the library
 *   clears the playlist before adding what the list contains), so pruning there
 *   threw away the very files that had just been read from the list.
 */
const PLAYLIST_CHANGING_ACTIONS = new Set([
  "REMOVE_TRACKS",
  "REVERSE_LIST",
  "RANDOMIZE_LIST",
  "SET_TRACK_ORDER",
  "DRAG_SELECTED",
]);

/**
 * Keeps the stored local-file snapshot in sync with the visible playlist.
 * After any action that reorders/removes tracks, the snapshot is rewritten to
 * match the tracks still in the playlist (matched by name). Added files enter
 * the snapshot via setFilesAddedHandler; this middleware only prunes/reorders.
 */
export const playlistSyncMiddleware: Middleware =
  (store) => (next) => (action: any) => {
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
