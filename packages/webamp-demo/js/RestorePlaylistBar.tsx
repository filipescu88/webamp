import React, { useEffect, useState } from "react";
import WebampLazy from "../../webamp/js/webampLazy";
import {
  canRestoreWithoutPrompt,
  getStoredLocalFiles,
  resolveStoredFiles,
  StoredEntry,
} from "./localFiles";

interface Props {
  webamp: WebampLazy;
}

/**
 * Restores the last used local-file playlist.
 *
 * Snapshot playlists (stored File objects, plain-HTTP fallback) restore
 * automatically on page load. FSA-handle playlists need a click, because
 * re-resolving FileSystemFileHandles requires a user gesture for the
 * permission prompt — for those a bar with a "Przywróć" button is shown.
 */
const RestorePlaylistBar = ({ webamp }: Props) => {
  const [entries, setEntries] = useState<StoredEntry[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoredMsg, setRestoredMsg] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const stored = await getStoredLocalFiles();
        if (stored == null || stored.length === 0 || canceled) {
          return;
        }
        if (canRestoreWithoutPrompt(stored)) {
          // Automatic restore — no gesture, no prompt.
          const files = await resolveStoredFiles(stored);
          if (!canceled && files.length > 0) {
            webamp.appendTracks(
              files.map((file) => ({ blob: file, defaultName: file.name }))
            );
          }
          return;
        }
        if (!canceled) {
          setEntries(stored);
        }
      } catch (e) {
        console.error("Playlist restore failed", e);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [webamp]);

  if (entries == null || dismissed) {
    return restoredMsg != null ? (
      <div
        style={{
          position: "fixed",
          bottom: 10,
          right: 10,
          zIndex: 1000,
          background: "#000080",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 12,
          padding: "8px 10px",
          border: "2px outset #c0c0c0",
        }}
      >
        {restoredMsg}
      </div>
    ) : null;
  }

  const restore = async () => {
    setRestoring(true);
    try {
      const files = await resolveStoredFiles(entries);
      if (files.length > 0) {
        webamp.appendTracks(
          files.map((file) => ({ blob: file, defaultName: file.name }))
        );
        setEntries(null);
        setRestoredMsg(
          `Przywrócono listę (${files.length} ${
            files.length === 1 ? "utwór" : "utworów"
          })`
        );
        setTimeout(() => setRestoredMsg(null), 6000);
      } else {
        setDismissed(true);
      }
    } catch {
      setDismissed(true);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 10,
        right: 10,
        zIndex: 1000,
        background: "#000080",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 12,
        padding: "8px 10px",
        border: "2px outset #c0c0c0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>
        Przywrócić poprzednią listę ({entries.length}{" "}
        {entries.length === 1 ? "utwór" : "utworów"})?
      </span>
      <button onClick={restore} disabled={restoring}>
        {restoring ? "..." : "Przywróć"}
      </button>
      <button onClick={() => setDismissed(true)}>×</button>
    </div>
  );
};

export default RestorePlaylistBar;
