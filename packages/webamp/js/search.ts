import deburr from "lodash/deburr";

export interface SearchEntry {
  id: number;
  /** Position in the playlist, so results can be numbered like the list is. */
  index: number;
  name: string;
}

/**
 * Case- and accent-insensitive form used for matching, so that "zolnierz"
 * finds "Żołnierz" and "JACEK" finds "Jacek".
 */
export function normalizeSearchText(text: string): string {
  return deburr(text).toLowerCase();
}

/**
 * A deliberately dumb substring match over the track's display name. No fuzzy
 * matching: a search that guesses is harder to trust than one that doesn't.
 * An empty query matches everything, so an empty list shows the whole playlist.
 */
export function filterTracks(
  query: string,
  entries: SearchEntry[]
): SearchEntry[] {
  const needle = normalizeSearchText(query.trim());
  if (needle === "") {
    return entries;
  }
  return entries.filter(({ name }) =>
    normalizeSearchText(name).includes(needle)
  );
}

/**
 * Where in `name` the query matched, so it can be highlighted. We compare
 * normalized slices of the original string instead of taking an index from a
 * normalized copy, because normalization can change a string's length
 * (ß normalizes to ss).
 */
export function findMatchRange(
  name: string,
  query: string
): [number, number] | null {
  const needle = normalizeSearchText(query.trim());
  if (needle === "") {
    return null;
  }
  for (let i = 0; i + needle.length <= name.length; i++) {
    if (normalizeSearchText(name.slice(i, i + needle.length)) === needle) {
      return [i, i + needle.length];
    }
  }
  return null;
}

/** Moves the cursor, clamped to the list: the ends do not wrap around. */
export function moveCursor(
  cursor: number,
  delta: number,
  length: number
): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(cursor + delta, 0), length - 1);
}
