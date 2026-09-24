import {
  SHADE_WINDOW_HEIGHT,
  WINDOW_HEIGHT,
  WINDOW_RESIZE_SEGMENT_HEIGHT,
  WINDOW_RESIZE_SEGMENT_WIDTH,
  WINDOW_WIDTH,
  WINDOWS,
} from "./constants";
import { WebampWindow } from "./reducers/windows";

export type Viewport = { width: number; height: number };

/**
 * Auto-fit never scales the UI up more than this by default. Without a cap, a
 * wide desktop viewport would render an absurdly large Winamp.
 */
export const DEFAULT_MAX_AUTO_FIT_SCALE = 2;

/**
 * The size a window has when the transform scale is 1. The layout model always
 * works in these "unscaled" units; the display scale is applied on top of them
 * as a CSS transform.
 */
export function getNativeWindowSize(w: WebampWindow): Viewport {
  return {
    width: WINDOW_WIDTH + w.size[0] * WINDOW_RESIZE_SEGMENT_WIDTH,
    height: w.shade
      ? SHADE_WINDOW_HEIGHT
      : WINDOW_HEIGHT + w.size[1] * WINDOW_RESIZE_SEGMENT_HEIGHT,
  };
}

export interface AutoFitResult {
  /** The transform scale to apply to the whole UI. */
  scale: number;
  /**
   * The viewport in unscaled units, i.e. the box the windows need to fit into:
   * the real viewport divided by the scale.
   */
  viewport: Viewport;
  /**
   * The size the playlist should be given so that it grows to fill the space
   * left over at the bottom of the layout. `null` if the playlist can't grow
   * (closed, shaded, or not resizable).
   */
  playlistSize: [number, number] | null;
}

interface Input {
  /** The space, in CSS pixels, that the UI should fit into. */
  viewport: Viewport;
  windows: { [windowId: string]: WebampWindow };
  maxScale?: number;
}

/**
 * Compute how to scale and arrange the given windows so that they fill the
 * given viewport without anything being cut off.
 *
 * The windows are scaled so that the widest one fills the viewport, and the
 * playlist is grown to fill the leftover space at the bottom. If even the
 * most compact layout is too tall for the viewport, the scale is reduced
 * until it fits.
 */
export function computeAutoFit({
  viewport,
  windows,
  maxScale = DEFAULT_MAX_AUTO_FIT_SCALE,
}: Input): AutoFitResult {
  const open = Object.values(windows).filter((w) => w.open);
  if (open.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { scale: 1, viewport, playlistSize: null };
  }

  const playlist = windows[WINDOWS.PLAYLIST];
  // Growing the playlist is the only lever we have on the layout's height.
  const canGrowPlaylist =
    playlist != null && playlist.open && playlist.canResize && !playlist.shade;

  // Only the layout's *relative* geometry matters. That keeps this function
  // idempotent: centering the layout moves every window by the same amount, so
  // running this again picks the same scale and the same playlist size.
  const boxes = open.map((w) => {
    const size = getNativeWindowSize(w);
    return {
      top: w.position.y,
      left: w.position.x,
      width: size.width,
      height: size.height,
      window: w,
    };
  });
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const contentWidth = right - left;
  const playlistTop = playlist == null ? 0 : playlist.position.y - top;

  // Fill the width, but never scale up beyond `maxScale`.
  let scale = Math.min(maxScale, viewport.width / contentWidth);

  // If the layout is too tall even with the playlist collapsed, shrink it.
  const collapsedHeight = Math.max(
    ...boxes.map(
      (b) =>
        b.top -
        top +
        (b.window === playlist && !b.window.shade ? WINDOW_HEIGHT : b.height)
    )
  );
  if (collapsedHeight * scale > viewport.height) {
    scale = viewport.height / collapsedHeight;
  }
  if (!(scale > 0)) {
    // Degenerate input (zero height, NaN, ...). Render something sane instead.
    return { scale: 1, viewport, playlistSize: null };
  }

  const scaledViewport = {
    width: viewport.width / scale,
    height: viewport.height / scale,
  };

  let playlistSize: [number, number] | null = null;
  if (canGrowPlaylist && playlist != null) {
    // Never grow the playlist over a window that sits below it.
    const obstacles = open
      .filter((w) => w.position.y > playlist.position.y)
      .map((w) => w.position.y - top);
    const bottomLimit = Math.min(scaledViewport.height, ...obstacles);
    const extra = Math.floor(
      (bottomLimit - playlistTop - WINDOW_HEIGHT) / WINDOW_RESIZE_SEGMENT_HEIGHT
    );
    playlistSize = [playlist.size[0], Math.max(0, extra)];
  }

  return { scale, viewport: scaledViewport, playlistSize };
}
