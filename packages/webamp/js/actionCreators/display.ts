import { Action } from "../types";

/**
 * Set the scale that the whole UI is rendered at. The windows are scaled with
 * a CSS transform, so their layout sizes scale along with their rendered
 * sizes.
 */
export function setDisplayScale(scale: number): Action {
  return { type: "SET_DISPLAY_SCALE", scale };
}

/**
 * Enable/disable automatically scaling and arranging the windows so that they
 * fill the viewport.
 */
export function setAutoFitToViewport(enabled: boolean): Action {
  return { type: "SET_AUTO_FIT_TO_VIEWPORT", enabled };
}
