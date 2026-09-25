import React from "react";
import * as Sentry from "@sentry/browser";
import ReactDOM from "react-dom/client";
// @ts-ignore
import isButterchurnSupported from "butterchurn/dist/isSupported.min";
import { getWebampConfig } from "./webampConfig";
import * as SoundCloud from "./SoundCloud";
import { attachListHost } from "./playlistListHandlers";

import WebampLazy from "../../webamp/js/webampLazy";

import { disableMarquee, skinUrl as configSkinUrl } from "./config";
import DemoDesktop from "./DemoDesktop";
// import { choreograph } from "./choreography";

declare global {
  interface Window {
    __webamp: WebampLazy;
  }
}

const DEFAULT_DOCUMENT_TITLE = document.title;

/**
 * Renders the measurements we need to debug viewport/sizing problems on a
 * phone, where there is no dev tools. Enabled by adding `?debug` to the URL.
 */
function mountDebugOverlay() {
  const node = document.createElement("div");
  node.style.cssText = [
    "position: fixed",
    "left: 0",
    "bottom: 0",
    "z-index: 100000",
    "background: #000",
    "color: #0f0",
    "font: 11px monospace",
    "line-height: 1.4",
    "padding: 4px 6px",
    "white-space: pre",
    "pointer-events: none",
  ].join(";");
  const render = () => {
    const visualViewport = window.visualViewport;
    const state = window.__webamp?.store.getState();
    node.textContent = [
      `inner  ${window.innerWidth} x ${window.innerHeight}`,
      `client ${document.documentElement.clientWidth} x ${document.documentElement.clientHeight}`,
      `visual ${Math.round(visualViewport?.width ?? 0)} x ${Math.round(
        visualViewport?.height ?? 0
      )} @ ${visualViewport?.scale ?? "-"}`,
      `screen ${window.screen.width} x ${window.screen.height} dpr ${window.devicePixelRatio}`,
      `scale  ${state == null ? "-" : state.display.scale.toFixed(3)}`,
    ].join("\n");
  };
  render();
  document.body.appendChild(node);
  window.addEventListener("resize", render);
  window.visualViewport?.addEventListener("resize", render);
  window.visualViewport?.addEventListener("scroll", render);
}

let screenshot = false;
let debug = false;
let skinUrl = configSkinUrl;
let backgroundColor: null | string = null;
let soundcloudPlaylistId: null | string = null;
if ("URLSearchParams" in window) {
  const params = new URLSearchParams(location.search);
  screenshot = Boolean(params.get("screenshot"));
  debug = params.has("debug");
  skinUrl = params.get("skinUrl") || skinUrl;
  backgroundColor = params.get("bg");
  soundcloudPlaylistId = params.get("scPlaylist");
}

function supressDragAndDrop(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer == null) {
    return;
  }
  e.dataTransfer.effectAllowed = "none";
  e.dataTransfer.dropEffect = "none";
}

window.addEventListener("dragenter", supressDragAndDrop);
window.addEventListener("dragover", supressDragAndDrop);
window.addEventListener("drop", supressDragAndDrop);

try {
  // TODO: Get this working in Vite.
  const COMMITHASH = undefined;
  Sentry.init({
    dsn: "https://12b6be8ef7c44f28ac37ab5ed98fd294@sentry.io/146021",
    release: typeof COMMITHASH === "undefined" ? "DEV" : COMMITHASH,
  });
} catch (e) {
  // Archive.org tries to rewrite the DSN to point to a archive.org version
  // since it looks like a URL. When this happens, Sentry crashes.
  console.error(e);
}

async function main() {
  const about = document.getElementsByClassName("about")[0] as HTMLDivElement;
  if (screenshot) {
    about.style.visibility = "hidden";
  }
  if (!WebampLazy.browserIsSupported()) {
    (
      document.getElementById("browser-compatibility") as HTMLDivElement
    ).style.display = "block";
    (document.getElementById("app") as HTMLDivElement).style.visibility =
      "hidden";
    return;
  }
  about.classList.add("loaded");

  if (isButterchurnSupported()) {
    const butterchurnShare = document.getElementById("butterchurn-share");
    if (butterchurnShare != null) {
      butterchurnShare.style.display = "flex";
    }
  }
  let soundcloudPlaylist = null;
  if (soundcloudPlaylistId != null) {
    // @ts-ignore
    soundcloudPlaylist = await SoundCloud.getPlaylist(soundcloudPlaylistId);
  }
  const config = await getWebampConfig(screenshot, skinUrl, soundcloudPlaylist);

  const webamp = new WebampLazy(config);

  // The LIST OPTS hooks (save/load list, add URL) need the instance to read the
  // playlist from, and the instance needs the hooks at construction time.
  attachListHost(webamp);

  if (disableMarquee || screenshot) {
    webamp.store.dispatch({ type: "DISABLE_MARQUEE" });
  }
  if (screenshot) {
    window.document.body.style.backgroundColor = "#000";
    webamp.store.dispatch({ type: "TOGGLE_REPEAT" });
    webamp.store.dispatch({ type: "TOGGLE_SHUFFLE" });
    webamp.store.dispatch({ type: "SET_EQ_AUTO", value: true });
    webamp.store.dispatch({
      type: "SET_DUMMY_VIZ_DATA",
      data: {
        0: 11.75,
        8: 11.0625,
        16: 8.5,
        24: 7.3125,
        32: 6.75,
        40: 6.4375,
        48: 6.25,
        56: 5.875,
        64: 5.625,
        72: 5.25,
        80: 5.125,
        88: 4.875,
        96: 4.8125,
        104: 4.375,
        112: 3.625,
        120: 1.5625,
      },
    });
  }

  webamp.onTrackDidChange((track) => {
    document.title =
      track == null
        ? DEFAULT_DOCUMENT_TITLE
        : `${track.metaData.title} - ${track.metaData.artist} \u00B7 ${DEFAULT_DOCUMENT_TITLE}`;
  });

  // Expose a file input in the DOM for testing.
  const fileInput = document.createElement("input");
  fileInput.id = "webamp-file-input";
  fileInput.style.display = "none";
  fileInput.type = "file";
  fileInput.addEventListener("change", (e) => {
    // @ts-ignore We know this will always be a file input
    const firstFile = e.target.files[0];
    if (firstFile == null) {
      return;
    }
    const url = URL.createObjectURL(firstFile);
    webamp.setSkinFromUrl(url);
  });
  document.body.appendChild(fileInput);

  // Expose webamp instance for debugging and integration tests.
  window.__webamp = webamp;

  await webamp.renderWhenReady(
    document.getElementById("app") as HTMLDivElement
  );

  if (debug) {
    mountDebugOverlay();
  }

  // choreograph(webamp);

  if (!screenshot) {
    if (backgroundColor != null) {
      window.document.body.style.backgroundColor = backgroundColor;
    }
    const div = document.getElementById("demo-desktop");
    if (div == null) {
      throw new Error("Could not locate #demo-desktop div");
    }
    const root = ReactDOM.createRoot(div);
    root.render(
      <DemoDesktop webamp={webamp} soundCloudPlaylist={soundcloudPlaylist} />
    );
  }
}

main();
