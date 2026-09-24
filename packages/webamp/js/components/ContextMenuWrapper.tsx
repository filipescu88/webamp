import { ReactNode, useState, useEffect, useCallback } from "react";
import ContextMenu from "./ContextMenu";
import * as Selectors from "../selectors";
import { useTypedSelector } from "../hooks";

interface Props {
  renderContents(): ReactNode;
  children: ReactNode;
}

// Trigger a context menu at the user's cursor position when the user right
// clicks within this component.
// For a component that triggers relative to a given component when the user
// left-clicks see `<ContextMenuTarget />`.

// TODO: Consider using nested contexts to ensure we don't ever have multiple
// non-nested context menus open at a time.
export default function ContextMenuWraper({
  children,
  renderContents,
  ...passThroughProps
}: Props) {
  const [openPosition, setOpenPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const scale = useTypedSelector(Selectors.getScale);

  const closeMenu = useCallback(() => {
    setOpenPosition(null);
  }, []);

  const handleGlobalClick = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 2) {
        closeMenu();
      }
    },
    [closeMenu]
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { pageX, pageY, currentTarget } = e;
      // The menu is positioned in unscaled units, relative to the top left of
      // the Webamp container, so convert the cursor's page position.
      const rect = currentTarget.getBoundingClientRect();
      const originX = rect.left + window.scrollX;
      const originY = rect.top + window.scrollY;
      // TODO: We could do an initial render to see if the menu fits here
      // and do a second render if it does not.
      setOpenPosition({
        x: (pageX - originX) / scale,
        y: (pageY - originY) / scale,
      });
      e.preventDefault();
      e.stopPropagation();
    },
    [scale]
  );

  // Add click-away listeners when window is open
  useEffect(() => {
    if (openPosition == null) {
      return;
    }
    document.addEventListener("click", handleGlobalClick);
    document.body.addEventListener("contextmenu", closeMenu);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
      document.body.removeEventListener("contextmenu", closeMenu);
    };
  }, [openPosition, closeMenu, handleGlobalClick]);

  return (
    <div
      onContextMenu={handleRightClick}
      style={{ width: "100%", height: "100%" }}
      {...passThroughProps}
    >
      <ContextMenu
        selected={openPosition != null}
        offsetTop={openPosition?.y ?? 0}
        offsetLeft={openPosition?.x ?? 0}
      >
        {renderContents()}
      </ContextMenu>
      {children}
    </div>
  );
}
