/**
 * Reading and writing Winamp playlist files (`.m3u` / `.m3u8`).
 *
 * Deliberately free of DOM, store and file-system access: this is pure string
 * handling so that it can be unit tested, and so that the demo can use it from
 * the `handleSaveListEvent` / `handleLoadListEvent` hooks without the library
 * having to know anything about saving playlists.
 *
 * Format notes, so that the output is something Winamp actually accepts:
 *
 * - `#EXTM3U` header, then one `#EXTINF:<seconds>,<title>` plus one entry line
 *   per track. An unknown duration is written as `-1`, which is what Winamp
 *   itself writes.
 * - UTF-8 (hence the `.m3u8` extension), so that non-ASCII tags survive —
 *   Polish and Cyrillic in particular.
 * - A local file is written as a bare file name. A browser cannot know, nor
 *   later reopen, a path on disk; and Winamp resolves a bare name relative to
 *   the folder the playlist file lives in.
 * - CRLF line endings, matching Winamp.
 */

/** The subset of a playlist track this module needs. */
export interface PlaylistFileTrack {
  /** Absolute URL, or a `blob:` URL for a file the user added from disk. */
  url: string;
  /** File name, for tracks that came from disk. */
  defaultName?: string | null;
  duration?: number | null;
  metaData?: {
    artist?: string;
    title?: string;
    album?: string;
  } | null;
}

export interface ParsedPlaylistEntry {
  /**
   * `url` for anything we can load directly; `file` for a reference to a file
   * the browser cannot reach on its own (we only keep its name).
   */
  kind: "url" | "file";
  /** The URL to load, or the file name to look for locally. */
  value: string;
  /** Title from the preceding `#EXTINF` line, when there was one. */
  title: string | null;
  /** Duration in seconds from `#EXTINF`, when it was known. */
  duration: number | null;
}

const WINDOWS_DRIVE_MATCHER = /^[a-zA-Z]:[\\/]/;
const UNC_PATH_MATCHER = /^\\\\/;
// `scheme:` at the start of the line, e.g. `https:`, `file:`, `blob:`.
const SCHEME_MATCHER = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
// Schemes we must not hand to the player: `file:` and `blob:` point at things
// a browser tab cannot open later (an object URL dies with the page), so they
// are treated as (unresolvable) local file references instead.
const NON_LOADABLE_SCHEMES = new Set(["file", "blob"]);

/**
 * A path without a scheme that the page can still resolve on its own:
 * `/mp3/a.mp3`, `./a.mp3`, `../mp3/a.mp3`. A bare name (`a.mp3`) is
 * deliberately *not* one of these: that is how a file added from disk is
 * written down, and it means "look for this file locally".
 */
function looksLikeDocumentRelativeUrl(value: string): boolean {
  return (
    value.startsWith("/") || value.startsWith("./") || value.startsWith("../")
  );
}

/** True for lines the player can be handed as a track URL. */
export function isLoadableUrl(value: string): boolean {
  if (WINDOWS_DRIVE_MATCHER.test(value) || UNC_PATH_MATCHER.test(value)) {
    return false;
  }
  const match = SCHEME_MATCHER.exec(value);
  if (match == null) {
    return looksLikeDocumentRelativeUrl(value);
  }
  return !NON_LOADABLE_SCHEMES.has(match[1].toLowerCase());
}

/**
 * Reduce a path or URL to just its file name: `C:\Music\a.mp3`, `sub/a.mp3`,
 * `file:///C:/Music/a.mp3` and `a.mp3` all become `a.mp3`.
 */
export function fileNameFromPath(value: string): string {
  const withoutQuery = value.split("#")[0].split("?")[0];
  const parts = withoutQuery.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return (last ?? "").trim();
}

/**
 * The best name we have for a track: the file name for something that came
 * from disk, or the last path segment for a URL we can still resolve later.
 * A dead `blob:` URL yields nothing — its trailing token is not a file name.
 */
function fallbackName(track: PlaylistFileTrack): string | null {
  const name = track.defaultName?.trim();
  if (name != null && name !== "") {
    return name;
  }
  if (isLoadableUrl(track.url)) {
    const fromUrl = fileNameFromPath(track.url);
    if (fromUrl !== "") {
      return fromUrl;
    }
  }
  return null;
}

function titleFor(track: PlaylistFileTrack): string | null {
  const artist = track.metaData?.artist?.trim() ?? "";
  const title = track.metaData?.title?.trim() ?? "";
  if (artist !== "" && title !== "") {
    return `${artist} - ${title}`;
  }
  if (title !== "") {
    return title;
  }
  if (artist !== "") {
    return artist;
  }
  // No tags at all: Winamp falls back to the file name.
  return fallbackName(track);
}

/**
 * The line that tells the player (or Winamp) where the track lives, or null
 * when there is nothing usable to write: a `blob:` track whose file name we
 * never learned cannot be found again, so it is left out rather than written as
 * a dead object URL.
 */
function entryLineFor(track: PlaylistFileTrack): string | null {
  if (isLoadableUrl(track.url)) {
    return track.url;
  }
  return fallbackName(track);
}

/** Serialize tracks to the text of a `.m3u8` playlist file. */
export function serializeM3U8(tracks: PlaylistFileTrack[]): string {
  const lines: string[] = ["#EXTM3U"];
  for (const track of tracks) {
    const entry = entryLineFor(track);
    if (entry == null) {
      continue;
    }
    const duration =
      typeof track.duration === "number" && Number.isFinite(track.duration)
        ? Math.round(track.duration)
        : -1;
    const seconds = duration >= 0 ? duration : -1;
    const title = (titleFor(track) ?? "").replace(/[\r\n]+/g, " ").trim();
    lines.push(`#EXTINF:${seconds},${title}`);
    lines.push(entry);
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Split the `Artist - Title` string Winamp writes in `#EXTINF` lines. The
 * first separator wins, so `A - B - C` is artist `A`, title `B - C`.
 */
export function splitExtinfTitle(title: string): {
  artist?: string;
  title: string;
} {
  const separator = title.indexOf(" - ");
  if (separator === -1) {
    return { title: title.trim() };
  }
  const artist = title.slice(0, separator).trim();
  const rest = title.slice(separator + 3).trim();
  if (artist === "" || rest === "") {
    return { title: title.trim() };
  }
  return { artist, title: rest };
}

/**
 * True when the text looks like an HLS stream playlist rather than a Winamp
 * list. Both formats use the `.m3u8` extension, and the difference matters:
 * HLS is a streaming manifest, not a list of files.
 */
export function looksLikeHlsPlaylist(text: string): boolean {
  return /^#EXT-X-/m.test(text);
}

/**
 * Parse the text of a playlist file. Unreadable lines are skipped rather than
 * throwing, since a hand-edited file should still yield whatever it can.
 */
export function parsePlaylistFile(text: string): ParsedPlaylistEntry[] {
  const entries: ParsedPlaylistEntry[] = [];
  let pending: { title: string | null; duration: number | null } | null = null;
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    if (line.startsWith("#")) {
      const extinf = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)\s*,(.*)$/i.exec(line);
      if (extinf != null) {
        const seconds = Number(extinf[1]);
        const title = extinf[2].trim();
        pending = {
          duration:
            Number.isFinite(seconds) && seconds >= 0
              ? Math.round(seconds)
              : null,
          title: title === "" ? null : title,
        };
      }
      // Every other comment — including `#EXT-X-…` HLS tags — is ignored.
      continue;
    }
    const info = pending;
    pending = null;
    if (isLoadableUrl(line)) {
      entries.push({
        kind: "url",
        value: line,
        title: info?.title ?? null,
        duration: info?.duration ?? null,
      });
    } else {
      entries.push({
        kind: "file",
        value: fileNameFromPath(line),
        title: info?.title ?? null,
        duration: info?.duration ?? null,
      });
    }
  }
  return entries;
}
