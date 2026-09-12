import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconChevronDown,
  IconChevronUp,
  IconPlaylist,
  IconMicrophone2,
  IconArrowsShuffle,
  IconRepeat,
  IconRepeatOnce,
  IconX,
  IconTrash,
  IconGripVertical,
} from "@tabler/icons-react";
import { formatTime, slugify, trackPath } from "../lib/tracks";
import {
  capturePointer,
  project,
  rubberband,
  spring,
  VelocityTracker,
  type SpringHandle,
} from "../lib/motion";
import { lockScroll } from "../lib/scroll-lock";
import { usePlayer } from "../hooks/usePlayer";
import { useVirtualList } from "../hooks/useVirtualList";
import { trackApi } from "../lib/api";
import LikeButton from "./LikeButton";
import LyricsPanel from "./LyricsPanel";
import EqBars from "./EqBars";
import AudioVisualizer from "./AudioVisualizer";

export default function Player() {
  const { current, toggle, next, prev, seekBy, volume, setVolume } = usePlayer();
  const [expanded, setExpanded] = useState(false);

  // a collapsed player must never leave the page scroll-locked
  useEffect(() => {
    if (!expanded) return;
    return lockScroll();
  }, [expanded]);

  // Keyboard transport. Typing in a field must never skip a track, so anything
  // originating in an input, textarea or contenteditable is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // target is only an Element when something focusable has focus — it can
      // also be the Document, which has no closest()
      const el = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") {
        // A dialog owns Escape while it is open. Collapsing the player from
        // under it dismissed two things on one press.
        if (!document.querySelector("[role='dialog']")) setExpanded(false);
        return;
      }
      // Typing keeps its keys, and so do the app's own sliders: the seek bar
      // handles the arrows itself, so seeking here too moved ten seconds.
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='slider']"))
        return;
      // Space and Enter belong to whatever control has focus. Taking Space here
      // meant a focused button could not be pressed from the keyboard at all —
      // the preventDefault below swallowed its activation.
      if ((e.key === " " || e.key === "Enter") && el?.closest("button, a, summary, [role='button']"))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) next();
          else seekBy(5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) prev();
          else seekBy(-5);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.05));
          break;
        case "m":
        case "ь":
          setVolume(volume > 0 ? 0 : 1);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, toggle, next, prev, seekBy, volume, setVolume]);

  if (!current) return null;
  return expanded ? (
    <FullPlayer onClose={() => setExpanded(false)} />
  ) : (
    <MiniBar onExpand={() => setExpanded(true)} />
  );
}

/** shuffle · prev · play · next · repeat — shared by both layouts */
function TransportControls({ size = "sm" }: { size?: "sm" | "lg" }) {
  const {
    isPlaying,
    toggle,
    next,
    prev,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
  } = usePlayer();
  const big = size === "lg";
  const side = big ? "h-11 w-11" : "h-9 w-9";
  const icon = big ? 22 : 18;

  return (
    <div className={"flex items-center " + (big ? "gap-3" : "gap-1")}>
      <button
        onClick={toggleShuffle}
        data-active={shuffle}
        aria-label="перемешать"
        aria-pressed={shuffle}
        title="перемешать"
        className={`grid ${side} place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text data-[active=true]:text-accent`}
      >
        <IconArrowsShuffle size={icon} />
      </button>
      <button
        onClick={prev}
        aria-label="назад"
        className={`grid ${side} place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text`}
      >
        <IconPlayerSkipBackFilled size={icon} />
      </button>
      <button
        onClick={toggle}
        aria-label={isPlaying ? "пауза" : "играть"}
        className={
          "grid shrink-0 place-items-center rounded-full bg-accent text-white shadow-lg transition-transform hover:bg-accent-hover active:scale-95 " +
          (big ? "h-16 w-16" : "h-10 w-10")
        }
      >
        {isPlaying ? (
          <IconPlayerPauseFilled size={big ? 28 : 20} />
        ) : (
          <IconPlayerPlayFilled size={big ? 28 : 20} />
        )}
      </button>
      <button
        onClick={next}
        aria-label="вперёд"
        className={`grid ${side} place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text`}
      >
        <IconPlayerSkipForwardFilled size={icon} />
      </button>
      <button
        onClick={cycleRepeat}
        data-active={repeat !== "off"}
        aria-label="повтор"
        title={repeat === "one" ? "повтор трека" : repeat === "all" ? "повтор очереди" : "повтор выключен"}
        className={`grid ${side} place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text data-[active=true]:text-accent`}
      >
        {repeat === "one" ? <IconRepeatOnce size={icon} /> : <IconRepeat size={icon} />}
      </button>
    </div>
  );
}

function VolumeControl() {
  const { volume, setVolume } = usePlayer();
  const Icon = volume === 0 ? IconVolumeOff : volume < 0.5 ? IconVolume2 : IconVolume;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setVolume(volume > 0 ? 0 : 1)}
        aria-label={volume > 0 ? "выключить звук" : "включить звук"}
        className="text-muted transition-colors hover:text-text"
      >
        <Icon size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="громкость"
        className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
      />
    </div>
  );
}

/**
 * Seek bar you can grab. Dragging tracks the pointer 1:1 for the whole gesture
 * — the label follows the finger, not the audio element, so scrubbing never
 * fights the timeupdate stream. The mini bar used to have no seek at all.
 */
function SeekBar({ tall = false }: { tall?: boolean }) {
  const { currentTime, duration, seek, seekBy } = usePlayer();
  const railRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  const at = (clientX: number) => {
    const rail = railRef.current;
    if (!rail || !duration) return 0;
    const rect = rail.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration;
  };

  const shown = scrub ?? currentTime;
  const pct = duration ? (shown / duration) * 100 : 0;

  return (
    <div
      ref={railRef}
      onPointerDown={(e) => {
        if (!duration) return;
        e.stopPropagation();
        capturePointer(e.currentTarget, e.pointerId);
        setScrub(at(e.clientX));
      }}
      onPointerMove={(e) => scrub !== null && setScrub(at(e.clientX))}
      onPointerUp={(e) => {
        if (scrub === null) return;
        seek(at(e.clientX));
        setScrub(null);
      }}
      onPointerCancel={() => setScrub(null)}
      onKeyDown={(e) => {
        // A focused slider must not also scroll the page, and the standard
        // slider keys are cheap to honour once the arrows are here anyway.
        const step: Record<string, () => void> = {
          ArrowRight: () => seekBy(5),
          ArrowLeft: () => seekBy(-5),
          PageUp: () => seekBy(30),
          PageDown: () => seekBy(-30),
          Home: () => seek(0),
          End: () => seek(Math.max(0, duration - 1)),
        };
        const run = step[e.key];
        if (!run || !duration) return;
        e.preventDefault();
        run();
      }}
      role="slider"
      aria-label="перемотка"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} из ${formatTime(duration)}`}
      tabIndex={0}
      className={
        "group/seek relative flex w-full cursor-pointer touch-none items-center " +
        (tall ? "h-5" : "h-3")
      }
    >
      <div
        className={
          "w-full overflow-hidden rounded-full bg-surface-hover " + (tall ? "h-1.5" : "h-0.5")
        }
      >
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {/* the handle appears when it can be used — pointer nearby, or dragging */}
      <span
        data-dragging={scrub !== null}
        style={{ left: `${pct}%` }}
        className="pointer-events-none absolute -ml-1.5 h-3 w-3 rounded-full bg-accent opacity-0 transition-opacity group-hover/seek:opacity-100 data-[dragging=true]:opacity-100"
      />
    </div>
  );
}

const SWIPE_COMMIT = 70;

function MiniBar({ onExpand }: { onExpand: () => void }) {
  const { current, isPlaying, toggle, next, prev } = usePlayer();
  const rowRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; active: boolean; offset: number } | null>(
    null,
  );
  const tracker = useRef(new VelocityTracker());
  const [hint, setHint] = useState<"next" | "prev" | null>(null);

  const setX = useCallback((x: number) => {
    if (rowRef.current) rowRef.current.style.transform = `translateX(${x}px)`;
  }, []);

  useEffect(() => () => springRef.current?.stop(), []);

  // Swiping the bar changes track. Pointer Events with capture keep the gesture
  // alive past the element's edge, and the transform is written straight to the
  // node — a CSS transition here is what made the bar lag behind the finger.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return; // desktop has real buttons
    if ((e.target as HTMLElement).closest("button, a, [role='slider']")) return;
    // interrupt a running settle and carry on from wherever it is on screen
    const from = springRef.current?.value() ?? 0;
    springRef.current?.stop();
    springRef.current = null;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, offset: from };
    tracker.current.reset();
    tracker.current.add(from);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      // 10px of hysteresis, and vertical intent stays with the page scroll
      if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) return;
      d.active = true;
      capturePointer(e.currentTarget, e.pointerId);
    }
    const x = d.offset + dx;
    tracker.current.add(x);
    setX(x);
    setHint(x <= -20 ? "next" : x >= 20 ? "prev" : null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setHint(null);
    if (!d.active) return;

    const v = tracker.current.get();
    const x = d.offset + (e.clientX - d.x);
    // commit on where the flick was *going*, not where the finger stopped
    const projected = x + project(v);
    if (projected <= -SWIPE_COMMIT) next();
    else if (projected >= SWIPE_COMMIT) prev();

    springRef.current = spring({
      from: x,
      to: 0,
      velocity: v,
      damping: 0.8, // the gesture carried momentum, so a little bounce fits
      response: 0.35,
      onFrame: setX,
      onRest: () => {
        springRef.current = null;
      },
    });
  };

  if (!current) return null;

  return (
    <div className="glass fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 animate-fade-up overflow-hidden border-t border-border bg-bg/95 backdrop-blur md:bottom-0 md:pb-[env(safe-area-inset-bottom)]">
      <SeekBar />
      <div
        ref={rowRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="mx-auto flex max-w-6xl touch-pan-y items-center gap-3 px-3 py-2 sm:px-4"
      >
        <button
          onClick={onExpand}
          aria-label="открыть плеер"
          className="group flex min-w-0 flex-1 items-center gap-3 text-left md:w-64 md:flex-none"
        >
          <div className="relative shrink-0">
            <img
              src={current.cover}
              alt=""
              className="h-11 w-11 rounded-md object-cover transition-transform group-hover:scale-105"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
              }}
            />
            {isPlaying && (
              <span className="absolute inset-0 grid place-items-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <EqBars />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{current.title}</p>
            <p className="truncate text-xs text-muted">
              {hint === "next" ? "следующий →" : hint === "prev" ? "← предыдущий" : current.author}
            </p>
          </div>
        </button>

        {/* phones: play/pause only — swipe handles skipping */}
        <button
          onClick={toggle}
          aria-label={isPlaying ? "пауза" : "играть"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform active:scale-95 md:hidden"
        >
          {isPlaying ? <IconPlayerPauseFilled size={20} /> : <IconPlayerPlayFilled size={20} />}
        </button>

        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          <TransportControls />
          <div className="ml-1">
            <LikeButton trackId={current.id} size={17} />
          </div>
        </div>

        <div className="hidden items-center justify-end gap-2 md:flex md:w-64">
          <div className="hidden lg:block">
            <VolumeControl />
          </div>
          <button
            onClick={onExpand}
            aria-label="развернуть"
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <IconChevronUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Past this much of the screen — or thrown hard enough — the sheet lets go. */
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 800;

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { current, isPlaying, currentTime, duration } = usePlayer();
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const drag = useRef<{ id: number; y: number; active: boolean; offset: number } | null>(null);
  const tracker = useRef(new VelocityTracker());

  // lyrics live on the track detail, not on the queue entry
  const trackId = current?.id;
  useEffect(() => {
    if (!trackId) return;
    setLyrics(null);
    trackApi
      .get(trackId)
      .then((d) => setLyrics(d.lyrics?.content ?? null))
      .catch(() => setLyrics(null));
  }, [trackId]);

  const apply = useCallback((y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = `translateY(${y}px)`;
    // a large surface fading as it travels reads lighter than one that slides
    el.style.opacity = String(Math.max(0.4, 1 - y / (window.innerHeight * 0.9)));
  }, []);

  useEffect(() => () => springRef.current?.stop(), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("[data-noswipe], button, a, input, [role='slider']"))
      return;
    const from = springRef.current?.value() ?? 0;
    springRef.current?.stop();
    springRef.current = null;
    drag.current = { id: e.pointerId, y: e.clientY, active: false, offset: from };
    tracker.current.reset();
    tracker.current.add(from);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < 10) return;
      d.active = true;
      capturePointer(e.currentTarget, e.pointerId);
    }
    const raw = d.offset + dy;
    // down follows the finger 1:1; up resists instead of lifting off screen
    const y = raw >= 0 ? raw : -rubberband(-raw, window.innerHeight);
    tracker.current.add(y);
    apply(y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;

    const v = tracker.current.get();
    const y = Math.max(0, d.offset + (e.clientY - d.y));
    const projected = y + project(v);
    const dismiss = projected > window.innerHeight * DISMISS_FRACTION || v > DISMISS_VELOCITY;

    springRef.current = spring({
      from: y,
      to: dismiss ? window.innerHeight : 0,
      velocity: v,
      damping: dismiss ? 1 : 0.8,
      response: 0.3,
      onFrame: apply,
      onRest: () => {
        springRef.current = null;
        if (dismiss) onClose();
      },
    });
  };

  if (!current) return null;

  return (
    <div
      ref={sheetRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="fixed inset-0 z-40 flex animate-slide-up touch-pan-y flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      {/* grab handle: the phone affordance for "drag me down" */}
      <button
        onClick={onClose}
        aria-label="свернуть"
        className="mx-auto mt-2 flex h-8 w-full max-w-[120px] shrink-0 items-center justify-center lg:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-muted/40" />
      </button>
      <button
        onClick={onClose}
        aria-label="свернуть"
        className="absolute right-4 top-4 z-10 hidden h-11 w-11 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-text lg:grid"
      >
        <IconChevronDown size={20} />
      </button>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-10 px-4 pb-4 lg:px-10 lg:py-6">
        <div className="flex w-full max-w-sm flex-col items-center justify-center gap-5">
          <div className="group relative w-full">
            <img
              src={current.cover}
              alt=""
              className="aspect-square w-full rounded-card object-cover shadow-2xl"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
              }}
            />
            {/* controls float over the artwork, like the reference player */}
            <div className="absolute inset-0 grid place-items-center rounded-card bg-gradient-to-t from-black/55 via-black/10 to-black/25">
              <div className="[&_button]:text-white/80 [&_button:hover]:bg-white/15 [&_button:hover]:text-white">
                <TransportControls size="lg" />
              </div>
            </div>
            <button
              onClick={() => setShowQueue((q) => !q)}
              data-active={showQueue}
              aria-label="очередь"
              className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white/85 backdrop-blur transition-colors hover:bg-black/65 hover:text-white data-[active=true]:text-accent"
            >
              <IconPlaylist size={20} />
            </button>
            <div className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-black/45 backdrop-blur">
              <LikeButton trackId={current.id} size={18} />
            </div>
          </div>

          {/* title, seek bar and sheet toggles travel together as one block */}
          <div className="flex w-full flex-col gap-3">
            <div className="w-full text-center">
              <Link
                to={trackPath(current)}
                onClick={onClose}
                className="block truncate font-display text-xl hover:underline"
              >
                {current.title}
              </Link>
              <Link
                to={`/artist/${slugify(current.author)}`}
                onClick={onClose}
                className="block truncate text-sm text-muted hover:underline"
              >
                {current.author}
              </Link>
            </div>

            <div className="h-12 w-full">
              <AudioVisualizer playing={isPlaying} />
            </div>

            <div className="flex w-full flex-col gap-1" data-noswipe>
              <SeekBar tall />
              <div className="flex justify-between font-mono text-[11px] text-muted">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="hidden md:block">
              <VolumeControl />
            </div>

            {/* phones: reach the queue and lyrics without hunting the artwork */}
            <div className="flex w-full gap-2 lg:hidden">
              <button
                onClick={() => setShowQueue((q) => !q)}
                data-active={showQueue}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-card border border-border bg-surface py-2.5 text-sm text-muted transition-colors active:scale-[0.98] data-[active=true]:text-accent"
              >
                <IconPlaylist size={17} /> очередь
              </button>
              {lyrics && (
                <button
                  onClick={() => setShowLyrics((s) => !s)}
                  data-active={showLyrics}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-card border border-border bg-surface py-2.5 text-sm text-muted transition-colors active:scale-[0.98] data-[active=true]:text-accent"
                >
                  <IconMicrophone2 size={17} /> текст
                </button>
              )}
            </div>
          </div>
        </div>

        {/* side panel: queue if toggled, otherwise lyrics when the track has them */}
        {showQueue ? (
          <div className="hidden min-h-0 w-full max-w-md lg:flex lg:flex-col">
            <QueueList onClose={() => setShowQueue(false)} />
          </div>
        ) : (
          lyrics && (
            <div className="hidden min-h-0 w-full max-w-md flex-col gap-3 lg:flex">
              <h2 className="text-xs uppercase tracking-wide text-muted">текст</h2>
              <LyricsPanel content={lyrics} active />
            </div>
          )
        )}
      </div>

      {/* narrow screens get the queue and lyrics as sheets, one at a time */}
      {showQueue && (
        <div className="flex min-h-0 flex-1 flex-col lg:hidden" data-noswipe>
          <QueueList onClose={() => setShowQueue(false)} />
        </div>
      )}
      {!showQueue && showLyrics && lyrics && (
        <div
          className="flex max-h-[38vh] flex-col gap-2 overflow-hidden px-4 pb-4 lg:hidden"
          data-noswipe
        >
          <h2 className="text-xs uppercase tracking-wide text-muted">текст</h2>
          <LyricsPanel content={lyrics} active />
        </div>
      )}
    </div>
  );
}

const QUEUE_ROW_H = 56;

function QueueList({ onClose }: { onClose: () => void }) {
  const { queue, index, isPlaying, playAt, removeFromQueue, clearQueue, moveInQueue } = usePlayer();
  const { scrollRef, start, end, padTop, padBottom } = useVirtualList({
    count: queue.length,
    rowHeight: QUEUE_ROW_H,
  });
  // the row being dragged, and the row it is hovering over
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const endDrag = () => {
    setFrom(null);
    setOver(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">очередь · {queue.length}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={clearQueue}
            className="flex items-center gap-1 rounded-card border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-accent"
          >
            <IconTrash size={13} /> очистить
          </button>
          <button
            onClick={onClose}
            aria-label="закрыть очередь"
            className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* virtualized: the queue can hold the whole catalog */}
      <div
        ref={scrollRef}
        data-noswipe
        className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto"
      >
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          <ul className="flex flex-col">
            {queue.slice(start, end).map((t, n) => {
              const i = start + n;
              return (
                <li
                  key={`${t.id}-${i}`}
                  data-current={i === index}
                  data-over={over === i && from !== i}
                  style={{ height: QUEUE_ROW_H }}
                  draggable={from !== null}
                  onDragStart={() => setFrom(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDrop={() => {
                    if (from !== null && from !== i) moveInQueue(from, i);
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  className="group flex items-center gap-2 rounded-md px-2 transition-colors hover:bg-surface data-[current=true]:bg-surface data-[over=true]:bg-surface-hover"
                >
                  {/* grabbing the handle is what arms the drag, so a plain tap
                      on the row still just plays the track */}
                  <span
                    onPointerDown={() => setFrom(i)}
                    aria-hidden
                    title="перетащить"
                    className="hover-reveal -ml-1 cursor-grab text-muted transition-opacity active:cursor-grabbing"
                  >
                    <IconGripVertical size={14} />
                  </span>
                  <span className="flex w-5 justify-end font-mono text-xs text-muted">
                    {i === index ? <EqBars playing={isPlaying} /> : i + 1}
                  </span>
                  <img src={t.cover} alt="" className="h-10 w-10 rounded object-cover" />
                  <button onClick={() => playAt(i)} className="min-w-0 flex-1 text-left">
                    <p
                      data-current={i === index}
                      className="truncate text-sm data-[current=true]:font-medium data-[current=true]:text-accent"
                    >
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-muted">{t.author}</p>
                  </button>
                  <button
                    onClick={() => removeFromQueue(i)}
                    aria-label="убрать из очереди"
                    className="hover-reveal grid h-8 w-8 place-items-center rounded-full text-muted transition-opacity hover:text-accent"
                  >
                    <IconX size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
