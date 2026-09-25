import * as Selectors from "../selectors";

import * as Utils from "../utils";

import { computeAutoFit, getFittingBox, Viewport } from "../autoFit";
import { WINDOWS } from "../constants";
import { getPositionDiff, SizeDiff } from "../resizeUtils";
import { applyDiff } from "../snapUtils";
import { setDisplayScale } from "./display";
import {
  Action,
  Thunk,
  WindowId,
  WindowPositions,
  WindowLayout,
} from "../types";

// Dispatch an action and, if needed rearrange the windows to preserve
// the existing edge relationship.
//
// Works by checking the edges before the action is dispatched. Then,
// after dispatching, calculating what position change would be required
// to restore those relationships.
function withWindowGraphIntegrity(action: Action): Thunk {
  return (dispatch, getState) => {
    const state = getState();
    const graph = Selectors.getWindowGraph(state);
    const originalSizes = Selectors.getWindowSizes(state);

    dispatch(action);

    const newSizes = Selectors.getWindowSizes(getState());
    const sizeDiff: SizeDiff = {};
    for (const window of Object.keys(newSizes)) {
      const original = originalSizes[window];
      const current = newSizes[window];
      sizeDiff[window] = {
        height: current.height - original.height,
        width: current.width - original.width,
      };
    }

    const positionDiff = getPositionDiff(graph, sizeDiff);
    const windowPositions = Selectors.getWindowPositions(state);

    const newPositions = Utils.objectMap(windowPositions, (position, key) =>
      applyDiff(position, positionDiff[key])
    );

    dispatch(updateWindowPositions(newPositions));
  };
}

export function toggleDoubleSizeMode(): Thunk {
  return withWindowGraphIntegrity({ type: "TOGGLE_DOUBLESIZE_MODE" });
}

export function toggleLlamaMode(): Action {
  return { type: "TOGGLE_LLAMA_MODE" };
}

export function toggleEqualizerShadeMode(): Thunk {
  return withWindowGraphIntegrity({
    type: "TOGGLE_WINDOW_SHADE_MODE",
    windowId: "equalizer",
  });
}

export function toggleMainWindowShadeMode(): Thunk {
  return withWindowGraphIntegrity({
    type: "TOGGLE_WINDOW_SHADE_MODE",
    windowId: "main",
  });
}

export function togglePlaylistShadeMode(): Thunk {
  return withWindowGraphIntegrity({
    type: "TOGGLE_WINDOW_SHADE_MODE",
    windowId: "playlist",
  });
}

export function closeWindow(windowId: WindowId): Action {
  return { type: "CLOSE_WINDOW", windowId };
}

export function setFocusedWindow(window: WindowId | null): Action {
  return { type: "SET_FOCUSED_WINDOW", window };
}

export function setWindowSize(
  windowId: WindowId,
  size: [number, number]
): Action {
  return { type: "WINDOW_SIZE_CHANGED", windowId, size };
}

export function toggleWindow(windowId: WindowId): Action {
  return { type: "TOGGLE_WINDOW", windowId };
}

export function updateWindowPositions(
  positions: WindowPositions,
  absolute?: boolean
): Action {
  return { type: "UPDATE_WINDOW_POSITIONS", positions, absolute };
}

/**
 * The size of the visual viewport: what the user can actually see right now.
 *
 * Returns `null` when the browser does not report it, or when the user has
 * pinched to zoom — while zoomed the visual viewport is a small window into the
 * page, and the UI should keep its size instead of trying to fit into it.
 */
function getVisualViewportSize(): Viewport | null {
  const visualViewport = window.visualViewport;
  if (
    visualViewport == null ||
    (visualViewport.scale != null && visualViewport.scale > 1)
  ) {
    return null;
  }
  return { width: visualViewport.width, height: visualViewport.height };
}

/**
 * Measure the space available to the windows, in CSS pixels, i.e. before the
 * display scale is applied.
 *
 * This deliberately avoids both alternatives:
 *
 * - `Utils.getWindowSize()` reports the document's scroll size, which Webamp's
 *   own windows inflate when they overflow the viewport, which would make the
 *   measurement self-referential.
 * - `document.documentElement.clientWidth` reports the *layout* viewport, which
 *   can be much wider than the screen when a browser renders the page in a
 *   "desktop" viewport (for example when the `viewport` meta tag is ignored).
 *   Fitting to that would leave the UI hanging off the right edge.
 *
 * For the document we take the layout viewport. For a container we take its own
 * box — but either way the answer is clamped to the visual viewport, because on
 * a phone a box can include the space behind the browser's toolbars while the
 * user only ever sees the part above them. That clamping is what keeps the
 * fitted UI from ending up partly under Android's navigation bar.
 */
function getViewportSize(parentDomNode: HTMLElement): Viewport {
  if (parentDomNode === document.body || !parentDomNode) {
    const { documentElement } = document;
    return getFittingBox(
      {
        width: documentElement.clientWidth || window.innerWidth,
        height: documentElement.clientHeight || window.innerHeight,
      },
      getVisualViewportSize()
    );
  }
  // Deliberately not clamped to the visual viewport: this measurement is also
  // what `ensureWindowsAreOnScreen` uses to decide whether the windows still fit
  // on screen, and clamping it here would make that check stricter than it has
  // ever been, resetting window sizes the user picked. Auto-fit clamps for
  // itself, where fitting into the visible part is exactly what is wanted.
  return Utils.getElementSize(parentDomNode);
}

export function centerWindowsInContainer(
  container: HTMLElement,
  contained: boolean,
  align: Alignment = "center"
): Thunk {
  return (dispatch, getState) => {
    const state = getState();
    if (!Selectors.getPositionsAreRelative(state)) {
      return;
    }
    // Window positions are in unscaled units, so the container has to be
    // converted into those units before we can place the layout within it.
    const scale = Selectors.getScale(state);
    let left = 0;
    let top = 0;
    if (!contained) {
      const rect = container.getBoundingClientRect();
      left = (rect.left + window.scrollX) / scale;
      top = (rect.top + window.scrollY) / scale;
    }
    const { scrollWidth, scrollHeight } = container;
    dispatch(
      centerWindows(
        {
          left,
          top,
          width: scrollWidth / scale,
          height: scrollHeight / scale,
        },
        align
      )
    );
  };
}

export function centerWindowsInView(parentDomNode: HTMLElement): Thunk {
  const isBody = parentDomNode === document.body;
  const { width, height } = isBody
    ? { width: window.innerWidth, height: window.innerHeight }
    : Utils.getElementSize(parentDomNode);
  const left = isBody ? window.scrollX : 0;
  const top = isBody ? window.scrollY : 0;
  return centerWindows({ left, top, width, height });
}

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * `center` puts the layout in the middle of the box; `topLeft` puts its top-left
 * corner in the box's top-left corner.
 */
export type Alignment = "center" | "topLeft";

export function centerWindows(
  { left, top, width, height }: Box,
  align: Alignment = "center"
): Thunk {
  return (dispatch, getState) => {
    const state = getState();
    const windowsInfo = Selectors.getWindowsInfo(state);
    const getOpen = Selectors.getWindowOpen(state);

    // A layout has been supplied. We will compute the bounding box and
    // center the given layout.
    const bounding = Utils.calculateBoundingBox(
      windowsInfo.filter((w) => getOpen(w.key))
    );

    if (bounding == null) {
      // There are no windows to center
      return;
    }

    const boxHeight = bounding.bottom - bounding.top;
    const boxWidth = bounding.right - bounding.left;

    const move =
      align === "topLeft"
        ? {
            x: Math.ceil(left - bounding.left),
            y: Math.ceil(top - bounding.top),
          }
        : {
            x: Math.ceil(left - bounding.left + (width - boxWidth) / 2),
            y: Math.ceil(top - bounding.top + (height - boxHeight) / 2),
          };

    const newPositions = windowsInfo.reduce(
      (pos, w) => ({
        ...pos,
        [w.key]: { x: move.x + w.x, y: move.y + w.y },
      }),
      {}
    );

    dispatch(updateWindowPositions(newPositions, true));
  };
}

/**
 * Scale and arrange the windows so that they fill the given viewport, growing
 * the playlist to take up the leftover space.
 *
 * No-op unless `autoFitToViewport` is enabled.
 */
export function autoFitWindowsToViewport(parentDomNode: HTMLElement): Thunk {
  return (dispatch, getState) => {
    const state = getState();
    if (!Selectors.getAutoFitToViewport(state)) {
      // If auto-fit was just turned off, put the scale back.
      if (Selectors.getScale(state) !== 1) {
        dispatch(setDisplayScale(1));
      }
      return;
    }

    const { scale, viewport, playlistSize, layoutSize } = computeAutoFit({
      // Fit into what is actually visible. On a phone the container can extend
      // behind the browser's toolbars while the navigation bar sits over the
      // bottom of it, so the visual viewport is the right box here.
      viewport: getFittingBox(
        getViewportSize(parentDomNode),
        getVisualViewportSize()
      ),
      windows: state.windows.genWindows,
    });

    if (scale !== Selectors.getScale(state)) {
      dispatch(setDisplayScale(scale));
    }

    if (playlistSize != null) {
      const currentSize = state.windows.genWindows[WINDOWS.PLAYLIST].size;
      if (
        currentSize[0] !== playlistSize[0] ||
        currentSize[1] !== playlistSize[1]
      ) {
        dispatch(setWindowSize(WINDOWS.PLAYLIST, playlistSize));
      }
    }

    dispatch(
      centerWindows({
        // Centre horizontally, but pin to the top: the playlist can only be
        // resized in whole 29px steps, so there is always some leftover, and
        // centering would split it into a visible strip of page above the UI.
        // Pinned at the top, the whole leftover ends up below the playlist.
        left: 0,
        top: 0,
        width: viewport.width,
        height: layoutSize.height,
      })
    );
  };
}

export function browserWindowSizeChanged(
  size: {
    height: number;
    width: number;
  },
  parentDomNode: HTMLElement
): Thunk {
  return (dispatch, getState) => {
    // Auto-fit may change the scale, and the scale determines how much room
    // the windows have to lay themselves out in. Note that auto-fit centers
    // the layout itself, so we don't do it again here.
    dispatch(autoFitWindowsToViewport(parentDomNode));

    const state = getState();
    const scale = Selectors.getScale(state);
    // When auto-fit is on, `size` (the document's scroll size) is inflated by
    // our own scaled windows, so measure the viewport instead.
    const raw = Selectors.getAutoFitToViewport(state)
      ? getViewportSize(parentDomNode)
      : size;
    const scaled = {
      width: raw.width / scale,
      height: raw.height / scale,
    };

    dispatch({ type: "BROWSER_WINDOW_SIZE_CHANGED", ...scaled });
    dispatch(ensureWindowsAreOnScreen(parentDomNode));
  };
}

export function resetWindowSizes(): Action {
  return { type: "RESET_WINDOW_SIZES" };
}

export function stackWindows(): Thunk {
  return (dispatch, getState) => {
    dispatch(
      updateWindowPositions(Selectors.getStackedLayoutPositions(getState()))
    );
  };
}

export function setWindowLayout(layout?: WindowLayout): Thunk {
  return (dispatch) => {
    if (layout == null) {
      dispatch(stackWindows());
      return;
    }
    for (const id of ["playlist", "milkdrop"] as const) {
      const w = layout[id];
      if (w != null && w.size != null) {
        const { extraHeight: plusHeight, extraWidth: plusWidth } = w.size;
        dispatch(setWindowSize(id, [plusWidth, plusHeight]));
      }
    }
    for (const id of ["main", "playlist", "equalizer", "milkdrop"] as const) {
      const w = layout[id];
      if (w == null || w.closed) {
        dispatch(closeWindow(id));
      }
    }
    for (const id of ["main", "playlist", "equalizer"] as const) {
      if (layout[id]?.shadeMode) {
        dispatch({
          type: "TOGGLE_WINDOW_SHADE_MODE",
          windowId: id,
        });
      }
    }
    dispatch(
      updateWindowPositions(
        Utils.objectMap(layout, (w) => {
          // For some reason TypeScript cli thinks this
          // is nullable, but in VSCode it does not...
          if (w == null) throw new Error("w is null");
          return {
            x: w.position.left,
            y: w.position.top,
          };
        }),
        false
      )
    );
  };
}

export function ensureWindowsAreOnScreen(parentDomNode: HTMLElement): Thunk {
  return (dispatch, getState) => {
    const state = getState();

    const windowsInfo = Selectors.getWindowsInfo(state);
    const getOpen = Selectors.getWindowOpen(state);
    // Window positions are in unscaled units, so the viewport has to be
    // converted into those units before comparing the two.
    const scale = Selectors.getScale(state);
    const measured = getViewportSize(parentDomNode);
    const width = measured.width / scale;
    const height = measured.height / scale;
    const bounding = Utils.calculateBoundingBox(
      windowsInfo.filter((w) => getOpen(w.key))
    );
    if (bounding == null) {
      // There are no windows visible, so there's no work to do.
      return;
    }
    const positions = Selectors.getWindowPositions(state);

    // Are we good?
    if (
      bounding.left >= 0 &&
      bounding.top >= 0 &&
      bounding.right <= width &&
      bounding.bottom <= height
    ) {
      // My work here is done.
      return;
    }

    const boundingHeight = bounding.bottom - bounding.top;
    const boundingWidth = bounding.right - bounding.left;

    // Could we simply shift all the windows by a constant offset?
    if (boundingWidth <= width && boundingHeight <= height) {
      let moveY = 0;
      let moveX = 0;
      if (bounding.top <= 0) {
        moveY = bounding.top;
      } else if (bounding.bottom > height) {
        moveY = bounding.bottom - height;
      }

      if (bounding.left <= 0) {
        moveX = bounding.left;
      } else if (bounding.right > width) {
        moveX = bounding.right - width;
      }

      const newPositions = Utils.objectMap(positions, (position) => ({
        x: position.x - moveX,
        y: position.y - moveY,
      }));

      dispatch(updateWindowPositions(newPositions));
      return;
    }

    // TODO: Try moving the individual groups to try to fit them in

    // I give up. Just reset everything.
    dispatch(resetWindowSizes());
    dispatch(stackWindows());
    dispatch(centerWindowsInView(parentDomNode));
  };
}
