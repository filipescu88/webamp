import { describe, it, expect } from "vitest";

import { computeAutoFit, getNativeWindowSize } from "./autoFit";
import { WebampWindow } from "./reducers/windows";
import {
  WINDOW_HEIGHT,
  WINDOW_RESIZE_SEGMENT_HEIGHT,
  WINDOW_WIDTH,
} from "./constants";

const window = (overrides: Partial<WebampWindow> = {}): WebampWindow => ({
  title: "Test",
  size: [0, 0],
  open: true,
  shade: false,
  canResize: false,
  canShade: true,
  canDouble: false,
  position: { x: 0, y: 0 },
  ...overrides,
});

// A phone-sized viewport: the main window (275px wide) has to be scaled up to
// fill it.
const PHONE = { width: 390, height: 844 };

// The layout the demo uses on small screens: main window with the playlist
// directly below it.
const stackedLayout = () => ({
  main: window({ position: { x: 0, y: 0 } }),
  playlist: window({
    position: { x: 0, y: WINDOW_HEIGHT },
    canResize: true,
  }),
});

describe("getNativeWindowSize", () => {
  it("is the size of the window at a scale of 1", () => {
    expect(getNativeWindowSize(window())).toEqual({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });
  });

  it("grows with the window's resize segments", () => {
    expect(getNativeWindowSize(window({ size: [1, 2] }))).toEqual({
      width: WINDOW_WIDTH + 25,
      height: WINDOW_HEIGHT + 2 * WINDOW_RESIZE_SEGMENT_HEIGHT,
    });
  });

  it("is the shade height when the window is shaded", () => {
    expect(getNativeWindowSize(window({ shade: true })).height).toBe(14);
  });
});

describe("computeAutoFit", () => {
  it("scales the widest window to fill the viewport", () => {
    const { scale } = computeAutoFit({
      viewport: PHONE,
      windows: stackedLayout(),
    });
    expect(scale).toBeCloseTo(390 / 275);
    expect(275 * scale).toBeCloseTo(PHONE.width);
  });

  it("never scales up beyond maxScale", () => {
    const { scale } = computeAutoFit({
      viewport: { width: 2000, height: 1200 },
      windows: stackedLayout(),
      maxScale: 3,
    });
    expect(scale).toBe(3);
  });

  it("scales down when the viewport is narrower than a single window", () => {
    const { scale } = computeAutoFit({
      viewport: { width: 200, height: 400 },
      windows: stackedLayout(),
    });
    expect(scale).toBeCloseTo(200 / 275);
  });

  it("reports the viewport in unscaled units", () => {
    const { scale, viewport } = computeAutoFit({
      viewport: PHONE,
      windows: stackedLayout(),
    });
    expect(viewport).toEqual({
      width: PHONE.width / scale,
      height: PHONE.height / scale,
    });
  });

  it("grows the playlist to fill the leftover space", () => {
    const { viewport, playlistSize } = computeAutoFit({
      viewport: PHONE,
      windows: stackedLayout(),
    });
    expect(playlistSize).not.toBeNull();
    const [width, extraHeight] = playlistSize!;
    // The width is left alone
    expect(width).toBe(0);
    // ...and the playlist reaches (close to) the bottom of the viewport, in
    // whole resize segments.
    const bottom =
      WINDOW_HEIGHT +
      WINDOW_HEIGHT +
      extraHeight * WINDOW_RESIZE_SEGMENT_HEIGHT;
    expect(bottom).toBeLessThanOrEqual(viewport.height);
    expect(bottom + WINDOW_RESIZE_SEGMENT_HEIGHT).toBeGreaterThan(
      viewport.height
    );
  });

  it("does not grow the playlist over a window below it", () => {
    const windows = {
      ...stackedLayout(),
      milkdrop: window({ position: { x: 0, y: 500 } }),
    };
    const { playlistSize } = computeAutoFit({
      viewport: PHONE,
      windows,
    });
    expect(playlistSize).toEqual([0, 9]);
  });

  it("shrinks the scale when even the collapsed layout is too tall", () => {
    const viewport = { width: 390, height: 200 };
    const {
      scale,
      viewport: scaledViewport,
      playlistSize,
    } = computeAutoFit({
      viewport,
      windows: stackedLayout(),
    });
    // The shortest layout is main + the un-resized playlist.
    const collapsedHeight = WINDOW_HEIGHT * 2;
    expect(scale).toBeCloseTo(viewport.height / collapsedHeight);
    expect(collapsedHeight * scale).toBeCloseTo(viewport.height);
    expect(scaledViewport.height).toBeCloseTo(collapsedHeight);
    expect(playlistSize).toEqual([0, 0]);
  });

  it("leaves a shaded playlist alone", () => {
    const windows = {
      ...stackedLayout(),
      playlist: window({
        position: { x: 0, y: WINDOW_HEIGHT },
        canResize: true,
        shade: true,
      }),
    };
    expect(
      computeAutoFit({ viewport: PHONE, windows }).playlistSize
    ).toBeNull();
  });

  it("leaves a closed playlist alone", () => {
    const windows = {
      ...stackedLayout(),
      playlist: window({
        position: { x: 0, y: WINDOW_HEIGHT },
        open: false,
        canResize: true,
      }),
    };
    expect(
      computeAutoFit({ viewport: PHONE, windows }).playlistSize
    ).toBeNull();
  });

  it("does nothing when no windows are open", () => {
    const result = computeAutoFit({
      viewport: PHONE,
      windows: { main: window({ open: false }) },
    });
    expect(result).toEqual({ scale: 1, viewport: PHONE, playlistSize: null });
  });

  it("does nothing when the viewport has not been measured yet", () => {
    const viewport = { width: 0, height: 0 };
    expect(computeAutoFit({ viewport, windows: stackedLayout() })).toEqual({
      scale: 1,
      viewport,
      playlistSize: null,
    });
  });
});

/**
 * Mirror of what the action creator does with the result: grow the playlist
 * and center the layout in the viewport.
 */
function applyResult(
  windows: { [windowId: string]: WebampWindow },
  result: {
    viewport: { width: number; height: number };
    playlistSize: [number, number] | null;
  }
) {
  const grown = { ...windows };
  if (result.playlistSize != null) {
    grown.playlist = { ...grown.playlist, size: result.playlistSize };
  }
  const boxes = Object.values(grown)
    .filter((w) => w.open)
    .map((w) => {
      const size = getNativeWindowSize(w);
      return {
        left: w.position.x,
        top: w.position.y,
        width: size.width,
        height: size.height,
      };
    });
  const bounding = {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.left + b.width)),
    bottom: Math.max(...boxes.map((b) => b.top + b.height)),
  };
  const move = {
    x: Math.ceil(
      (result.viewport.width - (bounding.right - bounding.left)) / 2 -
        bounding.left
    ),
    y: Math.ceil(
      (result.viewport.height - (bounding.bottom - bounding.top)) / 2 -
        bounding.top
    ),
  };
  return Object.fromEntries(
    Object.entries(grown).map(([id, w]) => [
      id,
      {
        ...w,
        position: { x: w.position.x + move.x, y: w.position.y + move.y },
      },
    ])
  );
}

describe("computeAutoFit (applied)", () => {
  it("is idempotent: re-running it on the centered layout changes nothing", () => {
    const first = computeAutoFit({ viewport: PHONE, windows: stackedLayout() });
    const applied = applyResult(stackedLayout(), first);
    const second = computeAutoFit({ viewport: PHONE, windows: applied });
    expect(second).toEqual(first);
  });

  it("fills the viewport instead of leaving a gap at the bottom", () => {
    const result = computeAutoFit({
      viewport: PHONE,
      windows: stackedLayout(),
    });
    const applied = applyResult(stackedLayout(), result);
    const bottom = Math.max(
      ...Object.values(applied)
        .filter((w) => w.open)
        .map((w) => w.position.y + getNativeWindowSize(w).height)
    );
    // Nothing overflows...
    expect(bottom).toBeLessThanOrEqual(result.viewport.height);
    // ...and no room for another row of the playlist is left over.
    expect(result.viewport.height - bottom).toBeLessThan(
      WINDOW_RESIZE_SEGMENT_HEIGHT
    );
  });
});
