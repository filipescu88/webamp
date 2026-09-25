/**
 * A one-line input bar, styled like the rest of the demo's floating widgets.
 * Used for "ADD URL", where the browser's own `prompt()` dialog would look out
 * of place and can be blocked.
 */

const PROMPT_ID = "winamp-prompt";
const CONFIRM_ID = "winamp-confirm";
const OK_LABEL = "Dodaj";
const CANCEL_LABEL = "Anuluj";

const CONFIRM_BAR_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "10px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: "1002",
  maxWidth: "min(420px, calc(100vw - 20px))",
  background: "#000080",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: "12px",
  lineHeight: "1.4",
  padding: "8px 10px",
  border: "2px outset #c0c0c0",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const CONFIRM_BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  background: "#c0c0c0",
  color: "#000",
  border: "2px outset #ffffff",
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "2px 10px",
  cursor: "pointer",
  flexShrink: "0",
};

const BAR_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  bottom: "10px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: "1002",
  background: "#000080",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px 10px",
  border: "2px outset #c0c0c0",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const INPUT_STYLE: Partial<CSSStyleDeclaration> = {
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "2px 4px",
  border: "2px inset #c0c0c0",
  background: "#fff",
  color: "#000",
  width: "260px",
  maxWidth: "50vw",
};

const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  background: "#c0c0c0",
  color: "#000",
  border: "2px outset #ffffff",
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "2px 10px",
  cursor: "pointer",
};

/**
 * A bar with one button and a cancel, styled like the rest of the demo's
 * floating widgets. Used when an action needs an explicit user gesture — the
 * browser only shows a file-access permission prompt for a real click, and a
 * prompt asked for after a file dialog has already been dismissed is silently
 * denied.
 */
export function confirmBar({
  message,
  buttonLabel,
  cancelLabel = "Anuluj",
}: {
  message: string;
  buttonLabel: string;
  cancelLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || document.body == null) {
      resolve(false);
      return;
    }
    document.getElementById(CONFIRM_ID)?.remove();

    const bar = document.createElement("div");
    bar.id = CONFIRM_ID;
    Object.assign(bar.style, CONFIRM_BAR_STYLE);

    const text = document.createElement("span");
    text.textContent = message;

    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = buttonLabel;
    Object.assign(ok.style, CONFIRM_BUTTON_STYLE);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = cancelLabel;
    Object.assign(cancel.style, CONFIRM_BUTTON_STYLE);

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      bar.remove();
      resolve(value);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        finish(true);
      }
    };

    ok.addEventListener("click", () => finish(true));
    cancel.addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKeyDown, true);

    bar.appendChild(text);
    bar.appendChild(ok);
    bar.appendChild(cancel);
    document.body.appendChild(bar);
  });
}

/**
 * Ask the user for a URL. Resolves with the typed value, or null when the user
 * cancels (Escape, the Cancel button, or a click outside the bar).
 */
export function promptForUrl(
  label = "Adres utworu lub listy:",
  initialValue = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || document.body == null) {
      resolve(null);
      return;
    }
    document.getElementById(PROMPT_ID)?.remove();

    const bar = document.createElement("div");
    bar.id = PROMPT_ID;
    Object.assign(bar.style, BAR_STYLE);

    const caption = document.createElement("span");
    caption.textContent = label;

    const input = document.createElement("input");
    input.type = "text";
    input.value = initialValue;
    input.spellcheck = false;
    input.placeholder = "https://…";
    Object.assign(input.style, INPUT_STYLE);

    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = OK_LABEL;
    Object.assign(ok.style, BUTTON_STYLE);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = CANCEL_LABEL;
    Object.assign(cancel.style, BUTTON_STYLE);

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
      bar.remove();
      resolve(value);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        finish(input.value);
      }
    };
    // Losing the window (e.g. switching tabs) cancels, so the bar cannot be
    // left behind unnoticed.
    const onBlur = () => finish(null);

    ok.addEventListener("click", () => finish(input.value));
    cancel.addEventListener("click", () => finish(null));
    // Keystrokes must not reach Webamp's global hotkeys while typing.
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());

    bar.appendChild(caption);
    bar.appendChild(input);
    bar.appendChild(ok);
    bar.appendChild(cancel);
    document.body.appendChild(bar);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    input.focus();
    input.select();
  });
}
