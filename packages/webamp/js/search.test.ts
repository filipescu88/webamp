import { describe, it, expect } from "vitest";

import {
  filterTracks,
  findMatchRange,
  moveCursor,
  normalizeSearchText,
  SearchEntry,
} from "./search";

const entries: SearchEntry[] = [
  { id: 0, index: 0, name: "Matvey Music - ЛЮБЭ - Конь" },
  {
    id: 1,
    index: 1,
    name: "Praktyka Arktyki - Jacek Kowalski - Idzie Żołnierz",
  },
  { id: 2, index: 2, name: "Bartosz Kalinowski (Józef Pleśniak) - Pokemony" },
];

const names = (result: SearchEntry[]) => result.map((entry) => entry.id);

describe("normalizeSearchText", () => {
  it("strips Polish diacritics and lowercases", () => {
    expect(normalizeSearchText("Żołnierz")).toBe("zolnierz");
    expect(normalizeSearchText("JÓZEF")).toBe("jozef");
    expect(normalizeSearchText("Łódź")).toBe("lodz");
  });
});

describe("filterTracks", () => {
  it("matches case-insensitively", () => {
    expect(names(filterTracks("JACEK", entries))).toEqual([1]);
  });

  it("matches without diacritics", () => {
    expect(names(filterTracks("zolnierz", entries))).toEqual([1]);
  });

  it("matches a substring in the middle of the name", () => {
    expect(names(filterTracks("kowal", entries))).toEqual([1]);
  });

  it("matches several tracks", () => {
    expect(names(filterTracks("ka", entries))).toEqual([1, 2]);
  });

  it("matches cyrillic titles", () => {
    expect(names(filterTracks("конь", entries))).toEqual([0]);
  });

  it("returns everything for an empty query", () => {
    expect(names(filterTracks("", entries))).toEqual([0, 1, 2]);
    expect(names(filterTracks("   ", entries))).toEqual([0, 1, 2]);
  });

  it("ignores surrounding whitespace", () => {
    expect(names(filterTracks("  jacek  ", entries))).toEqual([1]);
  });

  it("returns nothing when there is no match", () => {
    expect(filterTracks("zzz", entries)).toEqual([]);
  });

  it("does not guess", () => {
    // Fuzzy would match this; we deliberately do not.
    expect(filterTracks("prktyka", entries)).toEqual([]);
  });
});

describe("findMatchRange", () => {
  it("finds the matched range in the original string", () => {
    expect(findMatchRange("Jacek Kowalski", "kow")).toEqual([6, 9]);
  });

  it("finds a range that only matches without diacritics", () => {
    expect(findMatchRange("Idzie Żołnierz", "zol")).toEqual([6, 9]);
  });

  it("keeps the original casing", () => {
    const [start, end] = findMatchRange("Jacek Kowalski", "JACEK") as [
      number,
      number
    ];
    expect("Jacek Kowalski".slice(start, end)).toBe("Jacek");
  });

  it("returns null for an empty query", () => {
    expect(findMatchRange("Jacek", "")).toBeNull();
  });

  it("returns null when there is no match", () => {
    expect(findMatchRange("Jacek", "zzz")).toBeNull();
  });
});

describe("moveCursor", () => {
  it("moves within the list", () => {
    expect(moveCursor(0, 1, 3)).toBe(1);
    expect(moveCursor(2, -1, 3)).toBe(1);
  });

  it("does not wrap around", () => {
    expect(moveCursor(0, -1, 3)).toBe(0);
    expect(moveCursor(2, 1, 3)).toBe(2);
  });

  it("stays at zero when there is nothing to select", () => {
    expect(moveCursor(0, 1, 0)).toBe(0);
  });
});
