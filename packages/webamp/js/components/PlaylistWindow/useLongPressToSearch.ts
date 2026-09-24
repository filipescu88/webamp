import { useEffect, useRef } from "react";

import * as Actions from "../../actionCreators";
import * as Selectors from "../../selectors";
import { useActionCreator, useTypedSelector } from "../../hooks";

const LONG_PRESS_MS = 500;
/** Moving further than this means the finger is dragging, not holding. */
const MOVE_TOLERANCE_PX = 10;
/** How long after a long press we swallow the events it leaves behind. */
const SWALLOW_MS = 800;

/*
 * Holding a finger on the playlist opens the search ("jump to file"), which is
 * how it is reachable on a phone — there is no `J` key and no keyboard until
 * something is focused.
 *
 * This is built on raw touch events with a timer rather than on the
 * `contextmenu` event that long presses fire on Android, because iOS Safari
 * does not support `contextmenu` at all.
 *
 * Two side effects of the press need cleaning up:
 *  - the track under the finger selects itself on touchstart (that is the track
 *    cells' own behaviour), so we remember the selection before the press and
 *    put it back when the search opens;
 *  - Android then fires `contextmenu` for the same press, which would drop the
 *    app's context menu (unreadable at phone scale) on top of the search, so we
 *    eat that as well as the trailing click, which could otherwise land on one
 *    of the results and start a track.
 *
 * Everything the handlers read lives in a ref and the effect is bound once on
 * purpose: the press itself selects a track, so anything that made this effect
 * re-run would tear the pending timer down before it ever fires.
 */
export default function useLongPressToSearch(): void {
  const openJumpToFile = useActionCreator(Actions.openJumpToFile);
  const setSelectedTracks = useActionCreator(Actions.setSelectedTracks);
  const searchOpen = useTypedSelector(Selectors.getSearchOpen);
  const selectedTracks = useTypedSelector(Selectors.getSelectedTrackIds);

  const stateRef = useRef({
    openJumpToFile,
    setSelectedTracks,
    searchOpen,
    selectedTracks,
  });
  stateRef.current = {
    openJumpToFile,
    setSelectedTracks,
    searchOpen,
    selectedTracks,
  };

  useEffect(() => {
    const node = document.getElementById("playlist-window");
    if (node == null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let swallowUntil = 0;
    let startPoint: { x: number; y: number } | null = null;
    let selectionBeforePress: number[] = [];
    // True from the moment a finger goes down on the playlist until it comes
    // back up. While this is set we eat `contextmenu`, because on Android the
    // browser fires its own long-press menu at roughly the same moment our
    // timer fires: whoever wins that race, the menu must not appear.
    let pressActive = false;

    const cancel = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      startPoint = null;
    };

    const endPress = () => {
      pressActive = false;
      cancel();
    };

    const handleTouchStart = (e: TouchEvent) => {
      pressActive = true;
      const { searchOpen: open, selectedTracks: selected } = stateRef.current;
      if (open || e.touches.length !== 1) {
        cancel();
        return;
      }
      // Registered in the capture phase, so this runs before the track cell
      // under the finger marks itself as selected.
      selectionBeforePress = Array.from(selected);
      startPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        swallowUntil = Date.now() + SWALLOW_MS;
        stateRef.current.setSelectedTracks(selectionBeforePress);
        stateRef.current.openJumpToFile();
        // If the browser's own long-press menu did open before this ran, the
        // menu only closes on a click outside it or on a `contextmenu` on the
        // body, so ask it to close itself.
        setTimeout(() => {
          document.body.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
          );
        }, 120);
      }, LONG_PRESS_MS);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startPoint == null) {
        return;
      }
      const touch = e.touches[0];
      if (touch == null) {
        cancel();
        return;
      }
      if (
        Math.abs(touch.clientX - startPoint.x) > MOVE_TOLERANCE_PX ||
        Math.abs(touch.clientY - startPoint.y) > MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    };

    const handleEventToSwallow = (e: Event) => {
      const isMenu = e.type === "contextmenu";
      // A touch long press means "search" on the playlist, so a touch
      // `contextmenu` (Android's own long-press menu, which fires at its own
      // moment and can land before, during or after our timer) is always
      // swallowed. A right click with a mouse keeps its menu.
      const fromTouch = isMenu && (e as PointerEvent).pointerType === "touch";
      // A click is only swallowed in the moment right after a long press, so
      // that the tap which follows cannot land on one of the results.
      const swallowing =
        Date.now() < swallowUntil || (isMenu && pressActive) || fromTouch;
      if (swallowing) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    node.addEventListener("touchstart", handleTouchStart, true);
    node.addEventListener("touchmove", handleTouchMove, true);
    node.addEventListener("touchend", endPress, true);
    node.addEventListener("touchcancel", endPress, true);
    node.addEventListener("click", handleEventToSwallow, true);
    node.addEventListener("contextmenu", handleEventToSwallow, true);
    return () => {
      cancel();
      node.removeEventListener("touchstart", handleTouchStart, true);
      node.removeEventListener("touchmove", handleTouchMove, true);
      node.removeEventListener("touchend", endPress, true);
      node.removeEventListener("touchcancel", endPress, true);
      node.removeEventListener("click", handleEventToSwallow, true);
      node.removeEventListener("contextmenu", handleEventToSwallow, true);
    };
  }, []);
}
