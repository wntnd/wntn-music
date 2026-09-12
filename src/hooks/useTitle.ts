import { useEffect } from "react";

const BASE = "wntn.music";

/** Sets document.title for the lifetime of a route, restoring the base on exit. */
export function useTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [title]);
}
