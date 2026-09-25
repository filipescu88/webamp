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
import { confirmBar, promptForUrl } from "./winampPrompt";
import {
  getStoredListFile,
  getStoredLocalFiles,
  hasWritePermissionNow,
  readPermissionOf,
  rememberLocalFiles,
  resolveStoredFiles,
  storeListFile,
  StoredEntry,
  supportsFileSystemAccess,
} from "./localFiles";
import type { DragEvent } from "react";

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
  const previous = sessionListFileHandle;
  const options: any = {
    suggestedName: previous?.name ?? SUGGESTED_NAME,
    types: [LIST_FILE_TYPE],
  };
  // Open next to the file used last time, when we may still look there. The
  // name is only a suggestion: it is the dialog that lets the user keep several
  // lists apart, so it is always shown rather than silently overwriting.
  if (previous != null && (await hasWritePermissionNow(previous))) {
    options.startIn = previous;
  }
  let handle: any;
  try {
    // @ts-ignore Not in all TS lib versions.
    handle = await window.showSaveFilePicker(options);
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
  const { tracks } = await tracksFromPlaylistText(text, "load");
  return tracks.length === 0 ? null : tracks;
}

/**
 * Turn the text of a playlist file into tracks. Shared by LOAD LIST and by
 * dropping a playlist file on the player, which Winamp treats the same way.
 */
async function tracksFromPlaylistText(
  text: string,
  context: "load" | "drop"
): Promise<{ tracks: Track[]; unknown: number; noAccess: number }> {
  if (looksLikeHlsPlaylist(text)) {
    showNotice(
      "Ten plik to manifest strumienia (HLS), a nie lista odtwarzania Winampa."
    );
    return { tracks: [], unknown: 0, noAccess: 0 };
  }
  const entries = parsePlaylistFile(text);
  if (entries.length === 0) {
    showNotice("W tym pliku nie ma żadnych utworów.");
    return { tracks: [], unknown: 0, noAccess: 0 };
  }
  const { tracks, unknown, noAccess } = await resolveEntries(entries);
  const skipped = unknown + noAccess;
  if (tracks.length === 0) {
    showNotice(messageForNothingLoaded(unknown, noAccess));
    return { tracks, unknown, noAccess };
  }
  const skippedNote =
    skipped === 0
      ? ""
      : `, pominięto ${skipped} (${describeSkipped(unknown, noAccess)})`;
  const verb = context === "drop" ? "Dodano z listy" : "Wczytano listę";
  showNotice(
    `${verb}: ${tracks.length} ${trackWord(tracks.length)}${skippedNote}`
  );
  return { tracks, unknown, noAccess };
}

async function resolveEntries(entries: ParsedPlaylistEntry[]): Promise<{
  tracks: Track[];
  unknown: number;
  noAccess: number;
}> {
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

  // Separate the files that may be read right now from the ones that need the
  // user to grant access. Granting requires a real click: a permission prompt
  // asked for after the file dialog has closed is silently denied, which is why
  // this is an explicit step of its own rather than part of the load.
  let files: File[] = [];
  const needsPermission: StoredEntry[] = [];
  for (const entry of wanted.values()) {
    const permission = await readPermissionOf(entry);
    if (permission === "granted") {
      files = files.concat(await resolveStoredFiles([entry]));
    } else if (permission === "prompt") {
      needsPermission.push(entry);
    }
  }
  if (needsPermission.length > 0) {
    const connected = await confirmBar({
      message: `Aplikacja pamięta ${needsPermission.length} ${fileWord(
        needsPermission.length
      )} z tej listy. Przyznać dostęp do plików na dysku?`,
      buttonLabel: "Przyznaj dostęp",
    });
    if (connected) {
      files = files.concat(await resolveStoredFiles(needsPermission));
    }
  }
  const fileByName = new Map(files.map((file) => [file.name, file]));

  const tracks: Track[] = [];
  let unknown = 0;
  let noAccess = 0;
  for (const entry of entries) {
    if (entry.kind === "url") {
      tracks.push(trackFromEntry(entry));
      continue;
    }
    const file = fileByName.get(entry.value);
    if (file != null) {
      tracks.push(trackFromEntry(entry, file));
      continue;
    }
    if (wanted.has(entry.value)) {
      noAccess += 1;
    } else {
      unknown += 1;
    }
  }
  return { tracks, unknown, noAccess };
}

/** 1 plik, 2 pliki, 5 plików. */
function fileWord(count: number): string {
  if (count === 1) {
    return "plik";
  }
  const last = count % 10;
  const tens = count % 100;
  if (last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14)) {
    return "pliki";
  }
  return "plików";
}

function describeSkipped(unknown: number, noAccess: number): string {
  const parts: string[] = [];
  if (unknown > 0) {
    parts.push(`nie ma w pamięci aplikacji: ${unknown}`);
  }
  if (noAccess > 0) {
    parts.push(`brak dostępu do pliku: ${noAccess}`);
  }
  return parts.join(", ");
}

function messageForNothingLoaded(unknown: number, noAccess: number): string {
  if (unknown > 0 && noAccess === 0) {
    return `Aplikacja nie pamięta tych plików z tej listy: ${unknown}. Dodaj je raz jeszcze (na przykład przez „Pliki z dysku…”) — zapamięta je i następnym razem wczytają się same.`;
  }
  if (noAccess > 0 && unknown === 0) {
    return `Nie ma dostępu do plików z tej listy: ${noAccess}. Dodaj je ponownie i zezwól na dostęp do plików.`;
  }
  return `Nie udało się wczytać żadnego utworu (${describeSkipped(
    unknown,
    noAccess
  )}).`;
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

const PLAYLIST_FILENAME_MATCHER = /\.m3u8?$/i;

/**
 * Handle files dropped on the player. A dropped playlist file means "load this
 * list", which is what it means in Winamp too — adding an `.m3u8` as a track
 * just leaves an unplayable entry in the playlist.
 *
 * Returns null when the drop is none of our business, so the library can go on
 * treating skins, EQ presets and audio files as before. The dropped files are
 * captured *synchronously*: like `dataTransfer.items`, the file list is only
 * readable while the drop event is being dispatched.
 */
export function handleDroppedListFiles(
  e: DragEvent<HTMLDivElement>
): Promise<Track[]> | null {
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (!dropped.some((file) => PLAYLIST_FILENAME_MATCHER.test(file.name))) {
    return null;
  }
  return expandDroppedFiles(dropped);
}

async function expandDroppedFiles(files: File[]): Promise<Track[]> {
  const tracks: Track[] = [];
  const plainFiles: File[] = [];
  for (const file of files) {
    if (PLAYLIST_FILENAME_MATCHER.test(file.name)) {
      try {
        const { tracks: fromList } = await tracksFromPlaylistText(
          await file.text(),
          "drop"
        );
        tracks.push(...fromList);
      } catch (err) {
        showNotice(
          `Nie udało się odczytać ${file.name}: ${describeError(err)}`
        );
      }
    } else {
      plainFiles.push(file);
    }
  }
  if (plainFiles.length > 0) {
    // These bypass addTracksFromReferences(), so remember them here — otherwise
    // they would not come back after a reload.
    void rememberLocalFiles(plainFiles);
    tracks.push(
      ...plainFiles.map((file) => ({ blob: file, defaultName: file.name }))
    );
  }
  return tracks;
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
