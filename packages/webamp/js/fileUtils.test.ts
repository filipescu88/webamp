import { describe, it, expect } from "vitest";

import { getDroppedFiles } from "./fileUtils";

// Minimal fakes for the File System API objects a drop event gives us.
function fileEntry(
  name: string,
  file: File | null = new File(["x"], name)
): FileSystemFileEntry {
  return {
    name,
    isDirectory: false,
    isFile: true,
    isFileEntry: true,
    isDirectoryEntry: false,
    fullPath: `/${name}`,
    filesystem: {},
    getParent: () => {},
    toURL: () => "",
    file: (onSuccess: (resolved: File) => void, onError?: () => void) => {
      if (file == null) {
        onError?.();
      } else {
        onSuccess(file);
      }
    },
  } as unknown as FileSystemFileEntry;
}

/** A directory whose reader returns its entries in batches of `batchSize`. */
function dirEntry(
  name: string,
  entries: FileSystemEntry[],
  batchSize = 2
): FileSystemDirectoryEntry {
  return {
    name,
    isDirectory: true,
    isFile: false,
    isFileEntry: false,
    isDirectoryEntry: true,
    fullPath: `/${name}`,
    filesystem: {},
    getParent: () => {},
    toURL: () => "",
    createReader: () => {
      let index = 0;
      return {
        readEntries: (onSuccess: (batch: FileSystemEntry[]) => void) => {
          const batch = entries.slice(index, index + batchSize);
          index += batchSize;
          onSuccess(batch);
        },
      } as unknown as FileSystemDirectoryReader;
    },
  } as unknown as FileSystemDirectoryEntry;
}

function dataTransfer(
  entries: (FileSystemEntry | null)[],
  files: File[] = [],
  withItems = true
): DataTransfer {
  return {
    items: withItems
      ? entries.map((entry) => ({
          kind: "file",
          type: "",
          webkitGetAsEntry: () => entry,
        }))
      : [],
    files,
  } as unknown as DataTransfer;
}

const names = (files: File[]) => files.map((f) => f.name);

describe("getDroppedFiles", () => {
  it("returns directly dropped files untouched", async () => {
    const files = await getDroppedFiles(
      dataTransfer([
        fileEntry("song.mp3"),
        // Skins and EQ presets are dropped the same way, so they must not be
        // filtered out.
        fileEntry("skin.wsz"),
        fileEntry("preset.eqf"),
      ])
    );
    expect(names(files)).toEqual(["song.mp3", "skin.wsz", "preset.eqf"]);
  });

  it("collects the audio files out of a dropped folder", async () => {
    const folder = dirEntry("Music", [
      fileEntry("cover.jpg"),
      fileEntry("02 - Second.mp3"),
      fileEntry("01 - First.mp3"),
      fileEntry("album.cue"),
      fileEntry(".DS_Store"),
      fileEntry("._01 - First.mp3"), // macOS resource fork
      fileEntry("notes.txt"),
    ]);
    const files = await getDroppedFiles(dataTransfer([folder]));
    expect(names(files)).toEqual(["01 - First.mp3", "02 - Second.mp3"]);
  });

  it("looks inside nested folders", async () => {
    const subFolder = dirEntry("CD2", [
      fileEntry("03 - Third.flac"),
      fileEntry("04 - Fourth.ogg"),
    ]);
    const folder = dirEntry("Album", [
      subFolder,
      fileEntry("01 - First.mp3"),
      fileEntry("02 - Second.m4a"),
    ]);
    const files = await getDroppedFiles(dataTransfer([folder]));
    // Entries within a folder are sorted by name, and folders are read in
    // place, so the album's own tracks come first here.
    expect(names(files)).toEqual([
      "01 - First.mp3",
      "02 - Second.m4a",
      "03 - Third.flac",
      "04 - Fourth.ogg",
    ]);
  });

  it("reads all batches of a folder, not just the first", async () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      fileEntry(`0${i + 1} - Track.mp3`)
    );
    const folder = dirEntry("Music", entries, 2);
    const files = await getDroppedFiles(dataTransfer([folder]));
    expect(names(files)).toEqual([
      "01 - Track.mp3",
      "02 - Track.mp3",
      "03 - Track.mp3",
      "04 - Track.mp3",
      "05 - Track.mp3",
      "06 - Track.mp3",
      "07 - Track.mp3",
    ]);
  });

  it("skips files that cannot be read", async () => {
    const folder = dirEntry("Music", [
      fileEntry("broken.mp3", null),
      fileEntry("fine.mp3"),
    ]);
    const files = await getDroppedFiles(dataTransfer([folder]));
    expect(names(files)).toEqual(["fine.mp3"]);
  });

  it("handles a folder mixed with loose files", async () => {
    const files = await getDroppedFiles(
      dataTransfer([
        fileEntry("loose.mp3"),
        dirEntry("Music", [fileEntry("inside.mp3")]),
      ])
    );
    expect(names(files)).toEqual(["loose.mp3", "inside.mp3"]);
  });

  it("falls back to the file list when items are unavailable", async () => {
    const loose = new File(["x"], "fallback.mp3");
    const files = await getDroppedFiles(
      dataTransfer([], [loose], /* withItems */ false)
    );
    expect(names(files)).toEqual(["fallback.mp3"]);
  });

  it("falls back to the file list when no entry can be resolved", async () => {
    const loose = new File(["x"], "fallback.mp3");
    const files = await getDroppedFiles(dataTransfer([null], [loose]));
    expect(names(files)).toEqual(["fallback.mp3"]);
  });
});
