/**
 * A message strip in the style of the demo's other floating bars: navy, grey
 * bevel, monospace. Used instead of `alert()` so that "this only works in the
 * installed app" is explained in place, next to the player, rather than in a
 * modal the browser might block.
 */

const NOTICE_ID = "winamp-notice";
const DEFAULT_TIMEOUT_MS = 9000;

let hideTimer: number | null = null;

const BAR_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "10px",
  left: "10px",
  zIndex: "1001",
  maxWidth: "min(360px, calc(100vw - 20px))",
  background: "#000080",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: "12px",
  lineHeight: "1.4",
  padding: "8px 10px",
  border: "2px outset #c0c0c0",
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  // The message must never block the player underneath it: in a fitted layout
  // it lands right on top of the playlist buttons. Only the close button is
  // clickable.
  pointerEvents: "none",
};

const CLOSE_STYLE: Partial<CSSStyleDeclaration> = {
  background: "#c0c0c0",
  color: "#000",
  border: "1px solid #000",
  fontFamily: "inherit",
  fontSize: "12px",
  lineHeight: "1",
  padding: "1px 5px",
  cursor: "pointer",
  pointerEvents: "auto",
};

function ensureNotice(): HTMLDivElement | null {
  if (typeof document === "undefined" || document.body == null) {
    return null;
  }
  const existing = document.getElementById(NOTICE_ID);
  if (existing != null) {
    return existing as HTMLDivElement;
  }
  const node = document.createElement("div");
  node.id = NOTICE_ID;
  node.setAttribute("role", "status");
  Object.assign(node.style, BAR_STYLE);

  const text = document.createElement("span");
  text.dataset.role = "text";
  node.appendChild(text);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Zamknij";
  Object.assign(close.style, CLOSE_STYLE);
  close.addEventListener("click", hideNotice);
  node.appendChild(close);

  document.body.appendChild(node);
  return node;
}

/** Show a message; repeated calls replace the text and restart the timer. */
export function showNotice(
  message: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): void {
  const node = ensureNotice();
  if (node == null) {
    return;
  }
  const text = node.querySelector("[data-role=text]");
  if (text != null) {
    text.textContent = message;
  }
  node.style.display = "flex";
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (timeoutMs > 0) {
    hideTimer = window.setTimeout(() => hideNotice(), timeoutMs);
  }
}

export function hideNotice(): void {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  const node = document.getElementById(NOTICE_ID);
  if (node != null) {
    node.style.display = "none";
  }
}
