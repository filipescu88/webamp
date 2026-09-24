import { describe, it, expect } from "vitest";

import playlist from "./playlist";

const initialState = () => playlist(undefined, { type: "@@init" });

describe("playlist reducer", () => {
  it("starts with the search panel closed", () => {
    expect(initialState().searchOpen).toBe(false);
  });

  it("opens and closes the search panel", () => {
    const opened = playlist(initialState(), { type: "OPEN_JUMP_TO_FILE" });
    expect(opened.searchOpen).toBe(true);
    expect(playlist(opened, { type: "CLOSE_JUMP_TO_FILE" }).searchOpen).toBe(
      false
    );
  });

  it("opening the search does not touch the track list or the selection", () => {
    const withTracks = playlist(initialState(), {
      type: "SET_TRACK_ORDER",
      trackOrder: [1, 2, 3],
    });
    const selected = playlist(withTracks, { type: "CLICKED_TRACK", index: 1 });
    const opened = playlist(selected, { type: "OPEN_JUMP_TO_FILE" });
    expect(opened.trackOrder).toEqual([1, 2, 3]);
    expect(opened.selectedTracks).toEqual([2]);
    expect(opened.currentTrack).toBe(selected.currentTrack);
  });

  it("replaces the selection wholesale", () => {
    const withTracks = playlist(initialState(), {
      type: "SET_TRACK_ORDER",
      trackOrder: [1, 2, 3],
    });
    const selected = playlist(withTracks, { type: "CLICKED_TRACK", index: 0 });
    expect(selected.selectedTracks).toEqual([1]);
    expect(
      playlist(selected, { type: "SET_SELECTED_TRACKS", ids: [2, 3] })
        .selectedTracks
    ).toEqual([2, 3]);
  });

  it("does not alias the array it is given", () => {
    const ids = [2, 3];
    const next = playlist(initialState(), { type: "SET_SELECTED_TRACKS", ids });
    ids.push(4);
    expect(next.selectedTracks).toEqual([2, 3]);
  });
});
