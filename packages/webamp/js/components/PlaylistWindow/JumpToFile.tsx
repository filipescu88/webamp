import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Selectors from "../../selectors";
import * as Actions from "../../actionCreators";
import * as Utils from "../../utils";
import { filterTracks, findMatchRange, moveCursor } from "../../search";
import { useTypedSelector, useActionCreator } from "../../hooks";

function getNumberLength(number: number): number {
  return number.toString().length;
}

/*
 * "Jump to file": type to narrow the playlist down, arrow through the matches
 * and press enter to play one. It covers the track list while it is open, so
 * nothing about the playlist itself changes and closing it puts you back
 * exactly where you were.
 *
 * Opened with `J` (see `hotkeys.ts`), from the main window's playback menu, or
 * by holding a finger on the playlist on a touch screen.
 */
function JumpToFile() {
  const entries = useTypedSelector(Selectors.getSearchEntries);
  const tracks = useTypedSelector(Selectors.getTracks);
  const currentTrackId = useTypedSelector(Selectors.getCurrentTrackId);
  const style = useTypedSelector(Selectors.getSkinPlaylistStyle);

  const closeJumpToFile = useActionCreator(Actions.closeJumpToFile);
  const playTrackNow = useActionCreator(Actions.playTrackNow);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => filterTracks(query, entries), [query, entries]);
  // The query can shrink the list under the cursor, so never trust it blindly.
  const selected = moveCursor(cursor, 0, results.length);

  // On a phone this only works when the browser lets us, since the panel may be
  // opened without a user gesture (the `J` key). Tapping the field always works.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // `nearest` scrolls as little as possible, so arrowing through a long list
    // does not make it jump around.
    cursorRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected, results.length]);

  const play = useCallback(
    (id: number) => {
      playTrackNow(id);
      closeJumpToFile();
    },
    [closeJumpToFile, playTrackNow]
  );

  const playSelected = useCallback(() => {
    const result = results[selected];
    if (result != null) {
      play(result.id);
    }
  }, [play, results, selected]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Our keys are handled here rather than on the panel element, so that they
      // keep working after the field loses focus, `.stopPropagation()` keeps
      // them away from the global hotkeys (which listen on `document` in the
      // bubble phase).
      switch (e.keyCode) {
        case 38: // up arrow
          e.preventDefault();
          e.stopPropagation();
          setCursor((current) => moveCursor(current, -1, results.length));
          break;
        case 40: // down arrow
          e.preventDefault();
          e.stopPropagation();
          setCursor((current) => moveCursor(current, 1, results.length));
          break;
        case 13: // enter
          e.preventDefault();
          e.stopPropagation();
          playSelected();
          break;
        case 27: // escape
          e.preventDefault();
          e.stopPropagation();
          closeJumpToFile();
          break;
      }
    },
    [closeJumpToFile, playSelected, results.length]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const maxTrackNumberLength = getNumberLength(entries.length);
  const stripStyle = { backgroundColor: style.normalbg, color: style.current };

  return (
    <div className="jump-to-file">
      <div className="jump-to-file-strip" style={stripStyle}>
        <span>jump to file:</span>
        <input
          ref={inputRef}
          className="jump-to-file-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          aria-label="jump to file"
        />
        <span className="jump-to-file-count">
          {results.length} z {entries.length}
        </span>
      </div>
      <div className="jump-to-file-results" onClick={closeJumpToFile}>
        {results.length === 0 && (
          <div className="jump-to-file-row" style={{ color: style.normal }}>
            <span className="jump-to-file-title">brak trafień</span>
          </div>
        )}
        {results.map((entry, index) => {
          const isSelected = index === selected;
          const isCurrent = entry.id === currentTrackId;
          const rowFg = isCurrent ? style.current : style.normal;
          const range = findMatchRange(entry.name, query);
          return (
            <div
              key={entry.id}
              ref={isSelected ? cursorRef : undefined}
              className="jump-to-file-row"
              style={{
                backgroundColor: isSelected ? style.selectedbg : undefined,
                color: rowFg,
              }}
              onClick={() => play(entry.id)}
            >
              <span className="jump-to-file-title">
                {(entry.index + 1)
                  .toString()
                  .padStart(maxTrackNumberLength, "\u00A0")}
                .{" "}
                {range == null
                  ? entry.name
                  : [
                      entry.name.slice(0, range[0]),
                      // Inside the selected row the match is marked in the
                      // row's own colour; elsewhere it is inverted.
                      <span
                        key="match"
                        style={
                          isSelected
                            ? {
                                fontWeight: "bold",
                                textDecoration: "underline",
                              }
                            : {
                                backgroundColor: rowFg,
                                color: style.normalbg,
                              }
                        }
                      >
                        {entry.name.slice(range[0], range[1])}
                      </span>,
                      entry.name.slice(range[1]),
                    ]}
              </span>
              <span className="jump-to-file-duration">
                {Utils.getTimeStr(
                  tracks[entry.id] && tracks[entry.id].duration
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="jump-to-file-strip" style={stripStyle}>
        <span className="jump-to-file-hint">&#8593;&#8595; wybierz</span>
        <span className="jump-to-file-hint" onClick={playSelected}>
          Enter graj
        </span>
        <span className="jump-to-file-hint" onClick={closeJumpToFile}>
          <span className="jump-to-file-key">Esc </span>anuluj
        </span>
      </div>
    </div>
  );
}

export default JumpToFile;
