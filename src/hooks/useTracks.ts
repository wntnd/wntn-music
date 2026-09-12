import { useCallback, useEffect, useRef, useState } from "react";
import { loadTracks, type Track } from "../lib/tracks";

const PAGE = 24;

/**
 * Catalog in pages. `loadMore` appends the next page; feed `sentinelRef` to an
 * element at the end of the list and it loads as that element scrolls into view.
 */
export function useTracks(opts: { artist?: string; sort?: "new" | "popular" } = {}) {
  const { artist, sort } = opts;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // guards against a scroll event firing a second request for the same page
  const busy = useRef(false);
  const offset = useRef(0);

  useEffect(() => {
    let alive = true;
    offset.current = 0;
    setLoading(true);
    loadTracks({ limit: PAGE, offset: 0, artist, sort })
      .then((page) => {
        if (!alive) return;
        setTracks(page.items);
        setTotal(page.total);
        setHasMore(page.hasMore);
        offset.current = page.items.length;
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [artist, sort]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await loadTracks({ limit: PAGE, offset: offset.current, artist, sort });
      setTracks((prev) => {
        // de-dupe: a track inserted between requests can shift the window
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...page.items.filter((t) => !seen.has(t.id))];
      });
      offset.current += page.items.length;
      setHasMore(page.hasMore);
      setTotal(page.total);
    } catch {
      setHasMore(false);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, artist, sort]);

  // React 19 would run a cleanup returned from a callback ref; React 18 ignores
  // it. Returning one here left every observer connected, so each page loaded
  // added another watcher of the same sentinel, all still calling loadMore.
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || !hasMore) return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) void loadMore();
        },
        // start fetching before the sentinel is actually on screen
        { rootMargin: "600px" },
      );
      io.observe(node);
      observer.current = io;
    },
    [hasMore, loadMore],
  );

  return { tracks, total, loading, loadingMore, hasMore, error, loadMore, sentinelRef };
}
