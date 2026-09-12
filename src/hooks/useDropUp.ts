import { useLayoutEffect, useRef, useState } from "react";

/**
 * Decides whether a popover opens downward or flips above its trigger. A menu
 * anchored to a row near the bottom of the window would otherwise render off
 * screen with no way to reach it.
 */
export function useDropUp<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  estimatedHeight = 260,
) {
  const anchorRef = useRef<T>(null);
  const [up, setUp] = useState(false);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setUp(below < estimatedHeight && rect.top > below);
  }, [open, estimatedHeight]);

  return { anchorRef, up, placement: up ? "bottom-full mb-1" : "top-full mt-1" };
}
