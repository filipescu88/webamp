import { describe, it, expect, vi } from "vitest";

import { resumeOnFirstUserGesture } from "./resumeContext";

function fakeContext(state = "suspended") {
  const context = {
    state,
    resume: vi.fn(async () => {
      context.state = "running";
    }),
  };
  return context as unknown as AudioContext & {
    state: string;
    resume: () => Promise<void>;
  };
}

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("resumeOnFirstUserGesture", () => {
  it("resumes a suspended context on a click", async () => {
    const context = fakeContext();
    const cleanup = resumeOnFirstUserGesture(context);
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.state).toBe("running");
    cleanup();
  });

  it("still sees the interaction when something stops its propagation", async () => {
    // Regression test: the playlist's track cells stop the propagation of the
    // click that starts playback, so a listener in the bubble phase (which is
    // what this used to be) never fired. Playback then stalled until something
    // else resumed the context.
    const context = fakeContext();
    const cleanup = resumeOnFirstUserGesture(context);

    const stopPropagation = vi.fn((e: Event) => e.stopPropagation());
    const cell = document.createElement("div");
    cell.addEventListener("click", stopPropagation);

    // Also guard against a bubble phase listener sneaking back in.
    const bubbleListener = vi.fn();
    document.body.addEventListener("click", bubbleListener);
    document.body.appendChild(cell);

    cell.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    await tick();

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(bubbleListener).not.toHaveBeenCalled();
    expect(context.resume).toHaveBeenCalledTimes(1);
    cleanup();
    cell.remove();
    document.body.removeEventListener("click", bubbleListener);
  });

  it("also listens for key presses and touches", async () => {
    const onKey = fakeContext();
    const cleanupKey = resumeOnFirstUserGesture(onKey);
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    await tick();
    expect(onKey.resume).toHaveBeenCalledTimes(1);
    cleanupKey();

    const onTouch = fakeContext();
    const cleanupTouch = resumeOnFirstUserGesture(onTouch);
    window.dispatchEvent(new Event("touchend", { bubbles: true }));
    await tick();
    expect(onTouch.resume).toHaveBeenCalledTimes(1);
    cleanupTouch();
  });

  it("leaves a running context alone", async () => {
    const context = fakeContext("running");
    resumeOnFirstUserGesture(context);
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it("stops listening once the context is running", async () => {
    const context = fakeContext();
    const cleanup = resumeOnFirstUserGesture(context);
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(context.resume).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("keeps listening while resume has not worked yet", async () => {
    // `resume()` needs a real user gesture, so an interaction that doesn't
    // count may leave the context suspended.
    const context = fakeContext();
    context.resume = vi.fn(async () => {}) as unknown as () => Promise<void>;
    const cleanup = resumeOnFirstUserGesture(context);
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(context.resume).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("cleanup removes the listeners", async () => {
    const context = fakeContext();
    const cleanup = resumeOnFirstUserGesture(context);
    cleanup();
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(context.resume).not.toHaveBeenCalled();
  });
});
