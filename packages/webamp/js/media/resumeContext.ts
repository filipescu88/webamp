/**
 * Browsers refuse to start (or keep running) an AudioContext until the page has
 * been interacted with. Webamp routes the media element's output through that
 * context, so while it is suspended playback stalls: the element reports that
 * it is playing, but its time never advances and nothing is audible.
 *
 * This resumes the context on the first user interaction and returns a function
 * that removes the listeners.
 *
 * The listeners are registered on `window` in the **capture** phase on purpose:
 * parts of our own UI stop the propagation of the very interaction that starts
 * playback (the playlist's track cells stop `click` events), and a listener in
 * the bubble phase would never see those. That is why starting playback with a
 * double click on a track used to do nothing until something else — like the
 * play button — resumed the context.
 */
export function resumeOnFirstUserGesture(context: AudioContext): () => void {
  if (context.state !== "suspended") {
    return () => {};
  }

  const removeListeners = () => {
    window.removeEventListener("touchend", resume, true);
    window.removeEventListener("click", resume, true);
    window.removeEventListener("keydown", resume, true);
  };

  const resume = async () => {
    await context.resume();
    // Keep listening until it actually made it: `resume()` needs a real user
    // gesture, so an early event that isn't one (a synthetic click, say) may
    // not be enough.
    if (context.state === "running") {
      removeListeners();
    }
  };

  window.addEventListener("touchend", resume, true);
  window.addEventListener("click", resume, true);
  window.addEventListener("keydown", resume, true);

  return removeListeners;
}
