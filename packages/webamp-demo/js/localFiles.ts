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

const DB_NAME = "webamp-local-files";
const STORE = "handles";
const KEY = "playlist";
// Handle of the playlist file saved from the playlist window's LIST OPTS menu.
const LIST_FILE_KEY = "listFile";

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
