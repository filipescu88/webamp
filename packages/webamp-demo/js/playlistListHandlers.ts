/**
 * "SAVE LIST" / "LOAD LIST" / "ADD URL" for the playlist window's LIST OPTS
 * menu.
 *
 * The library stops at `alert("Not supported in Webamp")` for these three
 * buttons unless the embedding app supplies the documented hooks
 * (`handleSaveListEvent`, `handleLoadListEvent`, `handleAddUrlEvent`). They are
 * supplied here, and they are deliberately app-window only: in a browser tab
 * the same buttons explain where the feature lives instead.
 *
 * The saved file is a Winamp `.m3u8` list. Remote tracks keep their URL, local
 * ones are written as a bare file name — a browser cannot read a path from disk
 * — and on load those names are matched against the files the app already
 * remembers (see `localFiles.ts`), so a saved list can be opened again without
 * re-picking anything that is still in place.
 */

import { getPlaylistTracks } from "../../webamp/js/selectors";
import {
  looksLikeHlsPlaylist,
  parsePlaylistFile,
  serializeM3U8,
  splitExtinfTitle,
  ParsedPlaylistEntry,
} from "../../webamp/js/playlistFile";
import { AppState, PlaylistTrack, Track } from "../../webamp/js/types";
import { isInstalledApp } from "./appMode";
import { showNotice } from "./notice";
import { promptForUrl } from "./winampPrompt";
import {
  getStoredListFile,
  getStoredLocalFiles,
  resolveStoredFiles,
  storeListFile,
  StoredEntry,
  supportsFileSystemAccess,
} from "./localFiles";

const APP_ONLY_MESSAGE =
  "Listy można zapisywać i wczytywać tylko w zainstalowanej aplikacji. " +
  "Zainstaluj ją z menu ⋮ → „Zainstaluj win-amp.pl jako aplikację”.";

const LIST_FILE_TYPE = {
  description: "Lista odtwarzania Winampa",
  accept: { "audio/x-mpegurl": [".m3u8", ".m3u"] },
};

const SUGGESTED_NAME = "winamp-lista.m3u8";

/** The bits of the Webamp instance these hooks need. */
interface ListHost {
  store: { getState: () => AppState };
}

let host: ListHost | null = null;
// Kept in memory as well as in IndexedDB: reading it must not delay the click
// handler that opens the save dialog.
let sessionListFileHandle: any = null;

/** Called once, right after the Webamp instance is constructed. */
export function attachListHost(webamp: ListHost): void {
  host = webamp;
  getStoredListFile()
    .then((handle) => {
      sessionListFileHandle = handle;
    })
    .catch(() => {
      sessionListFileHandle = null;
    });
}

function currentPlaylistTracks(): PlaylistTrack[] | null {
  if (host == null) {
    return null;
  }
  return getPlaylistTracks(host.store.getState());
}

/** Hook for the library: `handleSaveListEvent`. */
export function handleSaveListEvent(): null {
  // The tracks the library passes in have no file name and no duration (see
  // `getUserTracks`), so the playlist is read from the store instead.
  void saveCurrentList();
  return null;
}

/** Hook for the library: `handleLoadListEvent`. */
export async function handleLoadListEvent(): Promise<Track[] | null> {
  return loadListFromFile();
}

/** Hook for the library: `handleAddUrlEvent`. */
export async function handleAddUrlEvent(): Promise<Track[] | null> {
  return addUrlFromUser();
}

async function saveCurrentList(): Promise<void> {
  if (!isInstalledApp()) {
    showNotice(APP_ONLY_MESSAGE);
    return;
  }
  const tracks = currentPlaylistTracks();
  if (tracks == null) {
    showNotice("Nie udało się odczytać playlisty.");
    return;
  }
  if (tracks.length === 0) {
    showNotice("Lista jest pusta — nie ma czego zapisać.");
    return;
  }
  if (!supportsFileSystemAccess) {
    showNotice(
      "Zapisywanie listy wymaga Chrome lub Edge w trybie zainstalowanej aplikacji."
    );
    return;
  }
  const text = serializeM3U8(tracks.map(trackForFile));
  const name = await writeListFile(text);
  if (name != null) {
    showNotice(
      `Zapisano listę: ${name} (${tracks.length} ${trackWord(tracks.length)})`
    );
  }
}

function trackForFile(track: PlaylistTrack) {
  return {
    url: track.url,
    defaultName: track.defaultName ?? null,
    duration: track.duration,
    metaData: {
      artist: track.artist ?? "",
      title: track.title ?? "",
      album: track.album,
    },
  };
}

async function writeListFile(text: string): Promise<string | null> {
  const blob = new Blob([text], { type: "audio/x-mpegurl;charset=utf-8" });
  let handle = sessionListFileHandle;
  if (handle != null && !(await hasWritePermission(handle))) {
    handle = null;
  }
  if (handle == null) {
    try {
      // @ts-ignore Not in all TS lib versions.
      handle = await window.showSaveFilePicker({
        suggestedName: SUGGESTED_NAME,
        types: [LIST_FILE_TYPE],
      });
    } catch (err) {
      if (!isAbortError(err)) {
        showNotice(`Nie udało się otworzyć okna zapisu: ${describeError(err)}`);
      }
      return null;
    }
    if (handle == null) {
      return null;
    }
    sessionListFileHandle = handle;
    try {
      await storeListFile(handle);
    } catch {
      // Remembering the file is a convenience; failing to do so is not fatal.
    }
  }
  try {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return (handle.name as string | undefined) ?? SUGGESTED_NAME;
  } catch (err) {
    showNotice(`Nie udało się zapisać listy: ${describeError(err)}`);
    return null;
  }
}

async function hasWritePermission(handle: any): Promise<boolean> {
  const opts = { mode: "readwrite" };
  try {
    if (typeof handle.queryPermission !== "function") {
      return true;
    }
    if ((await handle.queryPermission(opts)) === "granted") {
      return true;
    }
    return (await handle.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

async function loadListFromFile(): Promise<Track[] | null> {
  if (!isInstalledApp()) {
    showNotice(APP_ONLY_MESSAGE);
    return null;
  }
  const file = await pickListFile();
  if (file == null) {
    return null;
  }
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    showNotice(`Nie udało się odczytać pliku: ${describeError(err)}`);
    return null;
  }
  if (looksLikeHlsPlaylist(text)) {
    showNotice(
      "Ten plik to manifest strumienia (HLS), a nie lista odtwarzania Winampa."
    );
    return null;
  }
  const entries = parsePlaylistFile(text);
  if (entries.length === 0) {
    showNotice("W tym pliku nie ma żadnych utworów.");
    return null;
  }
  const { tracks, skipped } = await resolveEntries(entries);
  if (tracks.length === 0) {
    showNotice(
      skipped === 1
        ? "Nie udało się wczytać listy: jedyny utwór to plik lokalny, którego aplikacja już nie pamięta."
        : `Nie udało się wczytać listy: ${skipped} plików lokalnych, których aplikacja już nie pamięta.`
    );
    return null;
  }
  const skippedNote =
    skipped === 0
      ? ""
      : `, pominięto ${skipped} (pliki lokalne, których aplikacja nie pamięta)`;
  showNotice(
    `Wczytano listę: ${tracks.length} ${trackWord(tracks.length)}${skippedNote}`
  );
  return tracks;
}

async function resolveEntries(
  entries: ParsedPlaylistEntry[]
): Promise<{ tracks: Track[]; skipped: number }> {
  const stored = (await getStoredLocalFiles()) ?? [];
  const storedByName = new Map(stored.map((entry) => [entry.name, entry]));
  const wanted = new Map<string, StoredEntry>();
  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }
    const match = storedByName.get(entry.value);
    if (match != null) {
      wanted.set(entry.value, match);
    }
  }
  // One pass over the wanted files, so the browser asks for access once.
  const files =
    wanted.size === 0
      ? []
      : await resolveStoredFiles(Array.from(wanted.values()));
  const fileByName = new Map(files.map((file) => [file.name, file]));

  const tracks: Track[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (entry.kind === "url") {
      tracks.push(trackFromEntry(entry));
      continue;
    }
    const file = fileByName.get(entry.value);
    if (file == null) {
      skipped += 1;
      continue;
    }
    tracks.push(trackFromEntry(entry, file));
  }
  return { tracks, skipped };
}

function trackFromEntry(entry: ParsedPlaylistEntry, file?: File): Track {
  const track: Track =
    file != null
      ? { blob: file, defaultName: file.name }
      : { url: entry.value };
  if (entry.duration != null) {
    track.duration = entry.duration;
  }
  // A local file's tags are read from the file itself. For a URL the title from
  // the list saves a round trip.
  if (file == null && entry.title != null) {
    const { artist, title } = splitExtinfTitle(entry.title);
    track.metaData = { artist: artist ?? "", title };
  }
  return track;
}

interface PickedListFile {
  name: string;
  text: () => Promise<string>;
}

async function pickListFile(): Promise<PickedListFile | null> {
  if (supportsFileSystemAccess) {
    try {
      // @ts-ignore Not in all TS lib versions.
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [LIST_FILE_TYPE],
      });
      if (handle == null) {
        return null;
      }
      const file = (await handle.getFile()) as File;
      return { name: file.name, text: () => file.text() };
    } catch (err) {
      if (!isAbortError(err)) {
        showNotice(`Nie udało się otworzyć pliku: ${describeError(err)}`);
      }
      return null;
    }
  }
  // Without the File System Access API, reading a picked file still works.
  const file = await pickFileViaInput();
  return file == null ? null : { name: file.name, text: () => file.text() };
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".m3u,.m3u8,audio/x-mpegurl,audio/mpegurl";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    // A cancelled picker fires no event in most browsers, so this promise
    // simply never settles — nothing happens, which is what the user asked for.
    input.click();
  });
}

async function addUrlFromUser(): Promise<Track[] | null> {
  if (!isInstalledApp()) {
    showNotice(APP_ONLY_MESSAGE);
    return null;
  }
  const answer = await promptForUrl();
  const url = answer?.trim() ?? "";
  if (url === "") {
    return null;
  }
  if (isPlaylistUrl(url)) {
    return addFromRemoteList(url);
  }
  return [{ url }];
}

function isPlaylistUrl(url: string): boolean {
  return /\.(m3u8?|pls)(\?|#|$)/i.test(url);
}

async function addFromRemoteList(url: string): Promise<Track[] | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const entries = parsePlaylistFile(await response.text()).filter(
      (entry) => entry.kind === "url"
    );
    if (entries.length === 0) {
      showNotice("W tej liście nie ma adresów, które da się wczytać.");
      return null;
    }
    showNotice(
      `Dodano ${entries.length} ${trackWord(entries.length)} z listy.`
    );
    return entries.map((entry) => trackFromEntry(entry));
  } catch (err) {
    showNotice(`Nie udało się pobrać listy: ${describeError(err)}`);
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.message !== "") {
    return err.message;
  }
  return String(err);
}

/** 1 utwór, 2 utwory, 5 utworów. */
function trackWord(count: number): string {
  if (count === 1) {
    return "utwór";
  }
  const last = count % 10;
  const tens = count % 100;
  if (last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14)) {
    return "utwory";
  }
  return "utworów";
}
