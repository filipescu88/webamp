import { describe, it, expect } from "vitest";

import {
  fileNameFromPath,
  isLoadableUrl,
  looksLikeHlsPlaylist,
  parsePlaylistFile,
  serializeM3U8,
  splitExtinfTitle,
} from "./playlistFile";

describe("serializeM3U8", () => {
  it("writes a header, an EXTINF line and an entry line per track", () => {
    const text = serializeM3U8([
      {
        url: "https://example.com/song.mp3",
        duration: 224,
        metaData: { artist: "Matvey Music", title: "ЛЮБЭ - Конь" },
      },
    ]);
    expect(text).toBe(
      "#EXTM3U\r\n" +
        "#EXTINF:224,Matvey Music - ЛЮБЭ - Конь\r\n" +
        "https://example.com/song.mp3\r\n"
    );
  });

  it("uses CRLF, so Winamp is happy", () => {
    const text = serializeM3U8([{ url: "https://example.com/a.mp3" }]);
    expect(text.split("\r\n").length).toBe(4);
    expect(text.includes("\n\n")).toBe(false);
  });

  it("writes -1 when the duration is unknown, and rounds known ones", () => {
    expect(serializeM3U8([{ url: "https://example.com/a.mp3" }])).toContain(
      "#EXTINF:-1,"
    );
    expect(
      serializeM3U8([{ url: "https://example.com/a.mp3", duration: 224.6 }])
    ).toContain("#EXTINF:225,");
    expect(
      serializeM3U8([{ url: "https://example.com/a.mp3", duration: -3 }])
    ).toContain("#EXTINF:-1,");
  });

  it("writes a local file as a bare file name, not as its blob URL", () => {
    const text = serializeM3U8([
      {
        url: "blob:https://win-amp.pl/6d1f-uuid",
        defaultName: "idzie-zolnierz.mp3",
        duration: 207,
        metaData: {
          artist: "Praktyka Arktyki",
          title: "Jacek Kowalski - Idzie Żołnierz",
        },
      },
    ]);
    expect(text).toContain(
      "#EXTINF:207,Praktyka Arktyki - Jacek Kowalski - Idzie Żołnierz"
    );
    expect(text).toContain("idzie-zolnierz.mp3");
    expect(text.includes("blob:")).toBe(false);
  });

  it("falls back to the file name when the track has no tags", () => {
    const text = serializeM3U8([
      { url: "blob:https://win-amp.pl/x", defaultName: "pokemony.mp3" },
    ]);
    expect(text).toContain("#EXTINF:-1,pokemony.mp3");
    expect(text).toContain("pokemony.mp3\r\n");
  });

  it("skips a local track whose file name we never learned", () => {
    const text = serializeM3U8([
      { url: "blob:https://win-amp.pl/x" },
      { url: "https://example.com/keep.mp3" },
    ]);
    expect(text).toBe(
      "#EXTM3U\r\n#EXTINF:-1,keep.mp3\r\nhttps://example.com/keep.mp3\r\n"
    );
  });

  it("keeps the URL for remote tracks untouched, query string and all", () => {
    const url = "https://example.com/a%20b/c.mp3?token=1&x=2#t=30";
    expect(serializeM3U8([{ url }])).toContain(`${url}\r\n`);
  });

  it("keeps tracks served next to the page instead of dropping them", () => {
    const text = serializeM3U8([
      {
        url: "/mp3/lyube-kon.mp3",
        duration: 224,
        metaData: { artist: "Matvey Music", title: "ЛЮБЭ - Конь" },
      },
      { url: "./mp3/a.mp3" },
    ]);
    expect(text).toContain(
      "#EXTINF:224,Matvey Music - ЛЮБЭ - Конь\r\n/mp3/lyube-kon.mp3\r\n"
    );
    expect(text).toContain("./mp3/a.mp3\r\n");
  });

  it("never emits a line break inside a title", () => {
    const text = serializeM3U8([
      {
        url: "https://example.com/a.mp3",
        metaData: { artist: "A\nB", title: "C\r\nD" },
      },
    ]);
    expect(text).toContain("#EXTINF:-1,A B - C D\r\n");
  });
});

describe("parsePlaylistFile", () => {
  it("parses a playlist written by Winamp, BOM and CRLF included", () => {
    const text =
      "\uFEFF#EXTM3U\r\n" +
      "#EXTINF:224,Matvey Music - ЛЮБЭ - Конь\r\n" +
      "C:\\Muzyka\\lyube-kon.mp3\r\n" +
      "#EXTINF:207,Praktyka Arktyki - Idzie Żołnierz\r\n" +
      "..\\mp3\\idzie-zolnierz.mp3\r\n";
    expect(parsePlaylistFile(text)).toEqual([
      {
        kind: "file",
        value: "lyube-kon.mp3",
        title: "Matvey Music - ЛЮБЭ - Конь",
        duration: 224,
      },
      {
        kind: "file",
        value: "idzie-zolnierz.mp3",
        title: "Praktyka Arktyki - Idzie Żołnierz",
        duration: 207,
      },
    ]);
  });

  it("accepts LF-only line endings", () => {
    const text = "#EXTM3U\n#EXTINF:10,A - B\nhttps://example.com/a.mp3\n";
    expect(parsePlaylistFile(text)).toEqual([
      {
        kind: "url",
        value: "https://example.com/a.mp3",
        title: "A - B",
        duration: 10,
      },
    ]);
  });

  it("ignores comments and blank lines, and keeps a URL's query string", () => {
    const text =
      "#EXTM3U\n\n# a note\nhttps://example.com/a.mp3?x=1&y=2\n#EXT-X-VERSION:3\n";
    expect(parsePlaylistFile(text)).toEqual([
      {
        kind: "url",
        value: "https://example.com/a.mp3?x=1&y=2",
        title: null,
        duration: null,
      },
    ]);
  });

  it("binds an EXTINF line to the following entry only", () => {
    const text =
      "#EXTINF:10,A\nhttps://example.com/a.mp3\n#EXTINF:20,B\nhttps://example.com/b.mp3\n";
    const [first, second] = parsePlaylistFile(text);
    expect(first.title).toBe("A");
    expect(second.title).toBe("B");
  });

  it("treats a trailing EXTINF with no entry as nothing at all", () => {
    expect(parsePlaylistFile("#EXTM3U\n#EXTINF:10,A\n")).toEqual([]);
  });

  it("reads -1 (and anything negative) as an unknown duration", () => {
    const text = "#EXTINF:-1,A\nhttps://example.com/a.mp3\n";
    expect(parsePlaylistFile(text)[0].duration).toBeNull();
  });

  it("treats file:// URLs and UNC paths as local files", () => {
    expect(parsePlaylistFile("file:///C:/Muzyka/a.mp3")[0]).toEqual({
      kind: "file",
      value: "a.mp3",
      title: null,
      duration: null,
    });
    expect(parsePlaylistFile("\\\\NAS\\music\\b.mp3")[0].value).toBe("b.mp3");
  });

  it("keeps a bare file name as the file name", () => {
    expect(parsePlaylistFile("idzie-zolnierz.mp3")[0]).toEqual({
      kind: "file",
      value: "idzie-zolnierz.mp3",
      title: null,
      duration: null,
    });
  });

  it("survives a title with commas in it", () => {
    const text = "#EXTINF:12,A, B - C\nhttps://example.com/a.mp3\n";
    expect(parsePlaylistFile(text)[0].title).toBe("A, B - C");
  });

  it("survives a playlist with no header at all", () => {
    expect(parsePlaylistFile("https://example.com/a.mp3\n").length).toBe(1);
  });
});

describe("round trip", () => {
  it("gives back what was written", () => {
    const tracks = [
      {
        url: "blob:https://win-amp.pl/1",
        defaultName: "lyube-kon.mp3",
        duration: 224,
        metaData: { artist: "Matvey Music", title: "ЛЮБЭ - Конь" },
      },
      {
        url: "https://example.com/b.mp3",
        duration: 12,
        metaData: { artist: "A", title: "B" },
      },
    ];
    const parsed = parsePlaylistFile(serializeM3U8(tracks));
    expect(parsed).toEqual([
      {
        kind: "file",
        value: "lyube-kon.mp3",
        title: "Matvey Music - ЛЮБЭ - Конь",
        duration: 224,
      },
      {
        kind: "url",
        value: "https://example.com/b.mp3",
        title: "A - B",
        duration: 12,
      },
    ]);
  });
});

describe("helpers", () => {
  it("isLoadableUrl separates addresses from file references", () => {
    expect(isLoadableUrl("https://example.com/a.mp3")).toBe(true);
    expect(isLoadableUrl("http://example.com/a.mp3")).toBe(true);
    expect(isLoadableUrl("data:audio/mpeg;base64,AAAA")).toBe(true);
    expect(isLoadableUrl("blob:https://win-amp.pl/1")).toBe(false);
    expect(isLoadableUrl("file:///C:/a.mp3")).toBe(false);
    expect(isLoadableUrl("C:\\Muzyka\\a.mp3")).toBe(false);
    expect(isLoadableUrl("a.mp3")).toBe(false);
  });

  it("isLoadableUrl accepts paths the page itself can resolve", () => {
    // The playlist often holds tracks served next to the page, e.g. the demo's
    // own bundled mp3s — those must not be dropped from a saved list.
    expect(isLoadableUrl("/mp3/lyube-kon.mp3")).toBe(true);
    expect(isLoadableUrl("./mp3/a.mp3")).toBe(true);
    expect(isLoadableUrl("../mp3/a.mp3")).toBe(true);
    expect(isLoadableUrl("//example.com/a.mp3")).toBe(true);
    // `dir/file.mp3` is ambiguous and is treated as a Winamp-style relative
    // path to a local file, since that is what it usually is.
    expect(isLoadableUrl("mp3/a.mp3")).toBe(false);
    expect(isLoadableUrl("..\\mp3\\a.mp3")).toBe(false);
  });

  it("fileNameFromPath keeps just the name", () => {
    expect(fileNameFromPath("C:\\Muzyka\\a.mp3")).toBe("a.mp3");
    expect(fileNameFromPath("sub/dir/b.mp3")).toBe("b.mp3");
    expect(fileNameFromPath("https://example.com/x/c.mp3?y=1")).toBe("c.mp3");
    expect(fileNameFromPath("a.mp3")).toBe("a.mp3");
  });

  it("splitExtinfTitle splits on the first separator", () => {
    expect(splitExtinfTitle("Artist - Title")).toEqual({
      artist: "Artist",
      title: "Title",
    });
    expect(splitExtinfTitle("A - B - C")).toEqual({
      artist: "A",
      title: "B - C",
    });
    expect(splitExtinfTitle("Just A Title")).toEqual({ title: "Just A Title" });
    expect(splitExtinfTitle(" - ")).toEqual({ title: "-" });
  });

  it("looksLikeHlsPlaylist spots a stream manifest", () => {
    expect(looksLikeHlsPlaylist("#EXTM3U\n#EXT-X-VERSION:3\n")).toBe(true);
    expect(looksLikeHlsPlaylist("#EXTM3U\n#EXTINF:1,A\n")).toBe(false);
  });
});
