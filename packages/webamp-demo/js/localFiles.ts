/**
 * Persistent local-file playlist support.
 *
 * Preferred path (secure contexts, Chromium): File System Access API — store
 * FileSystemFileHandles in IndexedDB and re-resolve them on the next visit
 * (requires a user gesture + permission prompt on restore).
 *
 * Fallback (plain HTTP / other browsers): store the picked File objects
 * themselves in IndexedDB. Chrome persists the file bytes, so the playlist
 * survives a reload. Restore needs no permission prompt, but the playlist is
 * a snapshot — later edits to the files on disk are not picked up.
 */

import { AUDIO_FILENAME_MATCHER } from "../../webamp/js/fileUtils";

const DB_NAME = "webamp-local-files";
const STORE = "handles";
const KEY = "playlist";
// Handle of the playlist file saved from the playlist window's LIST OPTS menu.
const LIST_FILE_KEY = "listFile";
// Every file the app has ever been given, used to find a saved playlist's files
// again. Separate from KEY (what to restore on the next start) because the two
// have different lifetimes: clearing or trimming the playlist must not make the
// app forget a file that a saved list still refers to.
const KNOWN_KEY = "known";
// Guards against unbounded growth, per kind of entry: one holding a file handle
// is tiny, one holding a snapshot of the file's contents is not. Oldest entries
// go first. A playlist itself has no such limit — a folder of a thousand tracks
// loads all of them — so these only bound what the app can find again later.
const MAX_KNOWN_HANDLES = 10000;
const MAX_KNOWN_SNAPSHOTS = 200;

export interface StoredEntry {
  name: string;
  // FileSystemFileHandle (FSA path). Typed loosely since it is missing from
  // older TS libs.
  handle?: any;
  // Snapshot of the file (fallback path).
  file?: File;
}

export const supportsFileSystemAccess =
  typeof window !== "undefined" &&
  // @ts-ignore Not in all TS lib versions
  "showOpenFilePicker" in window &&
  // FSA is only exposed in secure contexts.
  (window as any).isSecureContext === true;

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".flac",
  ".m4a",
  ".aac",
  ".opus",
  ".weba",
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

function pickViaInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = AUDIO_EXTENSIONS.join(",");
    input.addEventListener("change", () => {
      resolve(Array.from(input.files ?? []));
    });
    input.click();
  });
}

/**
 * Let the user pick audio files, remember them in IndexedDB and return the
 * picked entries. Replaces any previously stored list.
 */
export async function pickAndStoreLocalFiles(): Promise<StoredEntry[]> {
  let entries: StoredEntry[];
  if (supportsFileSystemAccess) {
    // @ts-ignore Not in all TS lib versions
    const handles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: "Audio",
          accept: { "audio/*": AUDIO_EXTENSIONS },
        },
      ],
    });
    entries = handles.map((handle: any) => ({
      name: handle.name,
      handle,
    }));
  } else {
    // Insecure context (e.g. LAN http) or non-Chromium browser: snapshot
    // the files into IndexedDB instead.
    const files = await pickViaInput();
    entries = files.map((file) => ({ name: file.name, file }));
  }
  await idbSet(KEY, entries);
  return entries;
}

/** Returns the stored entries, or null when nothing was ever stored. */
export async function getStoredLocalFiles(): Promise<StoredEntry[] | null> {
  const entries = await idbGet<StoredEntry[]>(KEY);
  if (entries == null) {
    return null;
  }
  return entries;
}

/** Forgets the stored list. */
export async function clearStoredLocalFiles(): Promise<void> {
  await idbSet(KEY, []);
}

/**
 * Overwrite the stored playlist with the given entries (fire-and-forget).
 */
export function storeLocalFiles(entries: StoredEntry[]): Promise<void> {
  return idbSet(KEY, entries);
}

/**
 * Snapshot entries (fallback path) can be restored automatically on page load
 * — no user gesture needed. FSA-handle entries require a click + permission.
 */
export function canRestoreWithoutPrompt(entries: StoredEntry[]): boolean {
  return (
    entries.length > 0 &&
    entries.every((e) => e.handle == null && e.file instanceof File)
  );
}

/**
 * Resolve stored entries to Files. On the FSA path this must be called from a
 * user gesture so the permission prompt is allowed; on the fallback path the
 * File snapshots come straight out of IndexedDB. Entries whose file was
 * moved/renamed/deleted, or whose permission was denied, are silently skipped.
 */
export async function resolveStoredFiles(
  entries: StoredEntry[]
): Promise<File[]> {
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.handle != null) {
      try {
        const opts = { mode: "read" };
        let perm: string = await entry.handle.queryPermission(opts);
        if (perm !== "granted") {
          perm = await entry.handle.requestPermission(opts);
        }
        if (perm !== "granted") {
          continue;
        }
        files.push(await entry.handle.getFile());
      } catch {
        // File was moved, renamed or deleted since it was picked.
      }
    } else if (entry.file instanceof File) {
      files.push(entry.file);
    }
  }
  return files;
}

/**
 * Snapshot entries (`file`) can always be read. A handle whose permission is
 * only "prompt" needs a user gesture, so the caller has to ask for one.
 */
export type ReadPermission = "granted" | "prompt" | "denied";
export async function readPermissionOf(
  entry: StoredEntry
): Promise<ReadPermission> {
  if (entry.handle == null) {
    return entry.file instanceof File ? "granted" : "denied";
  }
  try {
    if (typeof entry.handle.queryPermission !== "function") {
      return "denied";
    }
    const state = await entry.handle.queryPermission({ mode: "read" });
    if (state === "granted") {
      return "granted";
    }
    return state === "prompt" ? "prompt" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * The playlist file the user last saved to, so that saving again overwrites
 * that file instead of asking for a location every time — which is how Winamp
 * behaves. Kept in the same store as the local-file entries.
 */
export async function getStoredListFile(): Promise<any | null> {
  const handle = await idbGet<any>(LIST_FILE_KEY);
  return handle ?? null;
}

export async function storeListFile(handle: any): Promise<void> {
  await idbSet(LIST_FILE_KEY, handle ?? null);
}

/**
 * Remember files the user added — by drag&drop, "ADD FILE", a dropped folder or
 * the file picker — merging them into the stored list and de-duplicating by
 * name.
 *
 * These names are what a saved playlist is matched against on the way back, so
 * this has to happen for every way a file can enter the playlist.
 *
 * Written to two places with two different lifetimes: the restore list (what to
 * offer on the next start, which mirrors the playlist) and the list of files the
 * app knows (which is never pruned — removing a track from the playlist is not
 * a request to forget the file, and a saved list may still point at it).
 */
export async function rememberLocalFiles(files: File[]): Promise<void> {
  const stored = (await getStoredLocalFiles()) ?? [];
  // Anything that is not music is dropped here too, so files added by accident
  // (a dropped zip, a cover image, a cue sheet) do not linger in the memory.
  const merged: StoredEntry[] = stored.filter(isMusicFile);
  for (const file of files) {
    if (
      isMusicFile(file) &&
      !merged.some((entry) => entry.name === file.name && entry.file != null)
    ) {
      merged.push({ name: file.name, file });
    }
  }
  await storeLocalFiles(merged);
  await rememberKnownFiles(files.filter(isMusicFile));
}

/**
 * Every file the app has ever been given, used to find a saved playlist's files
 * again. Deliberately never pruned: a file removed from the playlist should
 * still be found when a list that mentions it is loaded.
 */
export async function getKnownFiles(): Promise<StoredEntry[]> {
  const entries = await idbGet<StoredEntry[]>(KNOWN_KEY);
  return entries ?? [];
}

async function rememberKnownFiles(files: File[]): Promise<void> {
  const known = await getKnownFiles();
  const merged = known.filter(isMusicFile);
  for (const file of files) {
    if (!merged.some((entry) => entry.name === file.name)) {
      merged.push({ name: file.name, file });
    }
  }
  await idbSet(KNOWN_KEY, trimKnownFiles(merged));
}

/**
 * Keep each kind of entry within its own limit, dropping the oldest first and
 * leaving the order alone. Handles are cheap, snapshots are not.
 */
function trimKnownFiles(entries: StoredEntry[]): StoredEntry[] {
  const limits = { handle: MAX_KNOWN_HANDLES, snapshot: MAX_KNOWN_SNAPSHOTS };
  const counts = { handle: 0, snapshot: 0 };
  const kept = new Set<StoredEntry>();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    const kind = entry.handle != null ? "handle" : "snapshot";
    if (counts[kind] < limits[kind]) {
      counts[kind] += 1;
      kept.add(entry);
    }
  }
  return entries.filter((entry) => kept.has(entry));
}

/**
 * Nothing that is not playable music belongs in either memory.
 *
 * `StoredEntry` and `File` both carry a name, so one predicate covers both.
 */
function isMusicFile(file: { name: string }): boolean {
  return AUDIO_FILENAME_MATCHER.test(file.name);
}

/** Drop a file from both memories: the app can no longer reach it. */
export async function forgetFile(name: string): Promise<void> {
  const stored = (await getStoredLocalFiles()) ?? [];
  await storeLocalFiles(stored.filter((entry) => entry.name !== name));
  const known = await getKnownFiles();
  await idbSet(
    KNOWN_KEY,
    known.filter((entry) => entry.name !== name)
  );
}

/**
 * Forget a remembered file if it has been moved or deleted since it was picked.
 *
 * Only a `NotFoundError` counts: the app may simply not be allowed to look right
 * now, and the file is then perfectly fine — pruning it would lose a file the
 * user still has.
 */
export async function forgetFileIfMissing(
  entry: StoredEntry
): Promise<boolean> {
  if (entry.handle == null) {
    return false; // A snapshot lives in IndexedDB; it cannot go missing.
  }
  try {
    await entry.handle.getFile();
    return false;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotFoundError") {
      await forgetFile(entry.name);
      return true;
    }
    return false;
  }
}

/**
 * Everything the app can still find by name: the files it has seen before (and
 * may still have permission for) first, then whatever the stored playlist
 * refers to.
 */
export async function getKnownAndStoredFiles(): Promise<StoredEntry[]> {
  const known = await getKnownFiles();
  const stored = (await getStoredLocalFiles()) ?? [];
  const seen = new Set(known.map((entry) => entry.name));
  return known.concat(stored.filter((entry) => !seen.has(entry.name)));
}

/** Whether a remembered file can be written to right now, without prompting. */
export async function hasWritePermissionNow(handle: any): Promise<boolean> {
  try {
    if (handle == null || typeof handle.queryPermission !== "function") {
      return false;
    }
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}
