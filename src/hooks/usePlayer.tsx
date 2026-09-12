import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "../lib/tracks";
import { trackApi, type PlaybackSync } from "../lib/api";

// Cross-tab playback sync. "tabs" only stops the other tabs when this one
// starts (no two tabs playing at once); "full" also mirrors queue + position
// so every tab shows the same thing.
const SYNC_CHANNEL = "wntn-player";
type SyncMessage =
  | { type: "playing"; from: string }
  | { type: "state"; from: string; queue: Track[]; index: number; time: number };

type PlayerState = {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  /** Relative seek read off the audio element, so repeated taps accumulate. */
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  playAt: (i: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (i: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  syncMode: PlaybackSync;
  setSyncMode: (m: PlaybackSync) => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: RepeatMode;
  cycleRepeat: () => void;
};

export type RepeatMode = "off" | "all" | "one";

/** Fisher-Yates over the queue indices, with the playing track pinned first so
 *  turning shuffle on never cuts the song you're listening to. */
function shuffledOrder(length: number, current: number): number[] {
  const rest: number[] = [];
  for (let i = 0; i < length; i++) if (i !== current) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return current >= 0 && current < length ? [current, ...rest] : rest;
}

const Ctx = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // restored from localStorage; writes are debounced so a slider drag doesn't
  // hammer storage on every pointer move
  const [volume, setVol] = useState(() => {
    const saved = Number(localStorage.getItem("volume"));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
  });
  // cached locally so the very first message isn't missed while /auth/me loads
  const [syncMode, setSyncMode] = useState<PlaybackSync>(
    () => (localStorage.getItem("playbackSync") as PlaybackSync | null) ?? "tabs",
  );

  const current = index >= 0 ? queue[index] ?? null : null;

  // Shuffle is a *permutation of the queue*, not a dice roll per skip. Rolling
  // a random index every next() replayed tracks and skipped others forever, and
  // left prev() with nothing to walk back through.
  const [shuffleOrder, setShuffleOrder] = useState<number[] | null>(null);
  const shuffle = shuffleOrder !== null;
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const tabId = useRef(Math.random().toString(36).slice(2));
  const channelRef = useRef<BroadcastChannel | null>(null);
  // handlers read these through refs so the channel is only wired up once
  const syncRef = useRef(syncMode);
  syncRef.current = syncMode;
  // id of a track adopted from another tab (mirror it, don't start playing)
  const mirroredId = useRef<string | null>(null);
  // set while a track switch is waiting for the element to become playable
  const wantPlay = useRef(false);

  // ended-handler and media-session action handlers need the latest next()/prev();
  // keep them in refs to dodge stale closures (registered once, called later)
  const nextRef = useRef<() => void>(() => {});
  const prevRef = useRef<() => void>(() => {});
  const endRef = useRef<() => void>(() => {});

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => endRef.current();
    const onPlay = () => {
      wantPlay.current = false;
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    // the element is ready now — honour a play that lost the race with load()
    const onCanPlay = () => {
      if (!wantPlay.current) return;
      wantPlay.current = false;
      audio.play().catch(() => {});
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("canplay", onCanPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  // one channel for the tab's lifetime; incoming messages act on the audio element
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (!msg || msg.from === tabId.current || syncRef.current === "off") return;
      if (msg.type === "playing") {
        audioRef.current?.pause();
        return;
      }
      if (msg.type === "state" && syncRef.current === "full") {
        mirroredId.current = msg.queue[msg.index]?.id ?? null;
        setQueue(msg.queue);
        setIndex(msg.index);
        // the other tab keeps the audio; mirror position without stealing playback
        if (audioRef.current && Math.abs(audioRef.current.currentTime - msg.time) > 2)
          audioRef.current.currentTime = msg.time;
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const post = (msg: SyncMessage) => {
    if (syncRef.current === "off") return;
    channelRef.current?.postMessage(msg);
  };

  // announce playback so other tabs can stop (and mirror state in "full" mode)
  useEffect(() => {
    if (!isPlaying) return;
    post({ type: "playing", from: tabId.current });
    if (syncRef.current === "full")
      post({
        type: "state",
        from: tabId.current,
        queue,
        index,
        time: audioRef.current?.currentTime ?? 0,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, index]);

  // a shuffled order is a permutation of *this* queue — reshuffle when the
  // queue grows or shrinks, otherwise it points at indices that moved
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    setShuffleOrder((o) => (o === null ? null : shuffledOrder(queue.length, indexRef.current)));
  }, [queue.length]);

  // load + play whenever the current track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    // the previous track's position and length would otherwise stay on screen
    // until loadedmetadata fires — a visible jump on every skip
    setCurrentTime(0);
    setDuration(0);
    audio.src = current.song;
    audio.volume = volume;
    audio.load();

    // A track adopted from another tab is mirrored, not taken over. Keyed by id
    // rather than a bare flag: a remote update that doesn't change the track
    // would otherwise leave the flag set and mute the *next* real switch.
    if (mirroredId.current === current.id) {
      mirroredId.current = null;
      return;
    }

    // play() right after setting src races the new load and rejects with
    // AbortError, which used to silently leave playback stopped. Ask to play,
    // and let the canplay handler start it once the element is actually ready.
    wantPlay.current = true;
    audio.play().catch((err: DOMException) => {
      if (err.name !== "NotAllowedError") return; // AbortError -> canplay retries
      wantPlay.current = false; // autoplay blocked: wait for a user gesture
    });
    void trackApi.play(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    // debounce the write: only persist once the slider settles
    const t = setTimeout(() => localStorage.setItem("volume", String(volume)), 400);
    return () => clearTimeout(t);
  }, [volume]);

  function play(track: Track, q?: Track[]) {
    const list = q && q.length ? q : queue.length ? queue : [track];
    const i = list.findIndex((t) => t.id === track.id);
    if (i === -1) {
      setQueue([track]);
      setIndex(0);
    } else {
      setQueue(list);
      setIndex(i);
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  }

  // The play order: the queue as-is, or the shuffled permutation when on.
  const playOrder = shuffleOrder ?? queue.map((_, i) => i);
  const orderPos = playOrder.indexOf(index);
  const atOrderEnd = orderPos === playOrder.length - 1;

  function step(dir: 1 | -1) {
    if (!queue.length) return index;
    if (orderPos === -1) return playOrder[dir === 1 ? 0 : playOrder.length - 1] ?? index;
    return playOrder[(orderPos + dir + playOrder.length) % playOrder.length];
  }

  function next() {
    setIndex(step(1));
  }

  // called when a track ends: repeat "one" replays, "off" stops at the last track
  function onTrackEnd() {
    const audio = audioRef.current;
    if (repeat === "one" && audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
      return;
    }
    if (atOrderEnd && repeat === "off") {
      audio?.pause();
      return;
    }
    next();
  }

  function prev() {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    setIndex(step(-1));
  }
  nextRef.current = next;
  prevRef.current = prev;
  endRef.current = onTrackEnd;

  function seek(t: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : t;
    const clamped = Math.min(Math.max(t, 0), max);
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }

  // Relative seeks read the element, not React state: two arrow presses in the
  // same tick would otherwise both compute from the same stale currentTime and
  // land 5s away instead of 10.
  function seekBy(delta: number) {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + delta);
  }

  function playAt(i: number) {
    if (i >= 0 && i < queue.length) setIndex(i);
  }

  function addToQueue(track: Track) {
    setQueue((q) => {
      if (q.some((t) => t.id === track.id)) return q;
      if (!q.length) setIndex(0);
      return [...q, track];
    });
  }

  // insert right after the current track ("play next" in the queue menu)
  function playNext(track: Track) {
    setQueue((q) => {
      if (!q.length) {
        setIndex(0);
        return [track];
      }
      const without = q.filter((t) => t.id !== track.id);
      // removing an earlier track shifts the current one back by one
      const removedBefore = q.findIndex((t) => t.id === track.id);
      const at = removedBefore !== -1 && removedBefore < index ? index - 1 : index;
      if (at !== index) setIndex(at);
      return [...without.slice(0, at + 1), track, ...without.slice(at + 1)];
    });
  }

  function removeFromQueue(i: number) {
    setQueue((q) => {
      if (i < 0 || i >= q.length) return q;
      const next = q.filter((_, n) => n !== i);
      if (i < index) setIndex((cur) => cur - 1);
      else if (i === index) setIndex((cur) => (cur >= next.length ? next.length - 1 : cur));
      return next;
    });
  }

  // Reorder by dragging in the queue. The playing track keeps playing: its
  // index follows the move rather than the position staying put.
  function moveInQueue(from: number, to: number) {
    setQueue((q) => {
      if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return q;
      const next = [...q];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      setIndex((cur) => {
        if (cur === from) return to;
        if (from < cur && to >= cur) return cur - 1;
        if (from > cur && to <= cur) return cur + 1;
        return cur;
      });
      return next;
    });
  }

  function clearQueue() {
    setQueue([]);
    setIndex(-1);
    audioRef.current?.pause();
  }

  // Media Session API: system now-playing UI (Chrome flyout, lock screen,
  // notification shade) + bluetooth headset button gestures (play/pause,
  // next/prev track, seek) all route through these handlers instead of the page.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.author,
      album: "wntn.music",
      artwork: current.cover
        ? [
            { src: current.cover, sizes: "512x512", type: "image/jpeg" },
            { src: current.cover, sizes: "256x256", type: "image/jpeg" },
            { src: current.cover, sizes: "96x96", type: "image/jpeg" },
          ]
        : [],
    });
  }, [current]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const audio = audioRef.current;
    ms.setActionHandler("play", () => void audio?.play().catch(() => {}));
    ms.setActionHandler("pause", () => audio?.pause());
    ms.setActionHandler("previoustrack", () => prevRef.current());
    ms.setActionHandler("nexttrack", () => nextRef.current());
    ms.setActionHandler("seekbackward", (d) => {
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset ?? 10));
    });
    ms.setActionHandler("seekforward", (d) => {
      if (audio) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (d.seekOffset ?? 10));
    });
    ms.setActionHandler("seekto", (d) => {
      if (audio && d.seekTime != null) audio.currentTime = d.seekTime;
    });
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("seekbackward", null);
      ms.setActionHandler("seekforward", null);
      ms.setActionHandler("seekto", null);
    };
  }, []);

  // Drives the scrubber shown in the OS media UI (position, not just play/pause).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) return;
    if (!duration || !isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate: 1,
      });
    } catch {
      // setPositionState throws if called with stale/invalid state during a track switch
    }
  }, [currentTime, duration]);

  const value: PlayerState = {
    queue,
    index,
    current,
    isPlaying,
    currentTime,
    duration,
    volume,
    play,
    toggle,
    next,
    prev,
    seek,
    seekBy,
    setVolume: setVol,
    playAt,
    addToQueue,
    playNext,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    syncMode,
    setSyncMode: (m: PlaybackSync) => {
      setSyncMode(m);
      localStorage.setItem("playbackSync", m);
    },
    shuffle,
    toggleShuffle: () =>
      setShuffleOrder((o) => (o ? null : shuffledOrder(queue.length, index))),
    repeat,
    cycleRepeat: () =>
      setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): PlayerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
