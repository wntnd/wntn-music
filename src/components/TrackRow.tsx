import { IconHeadphones } from "@tabler/icons-react";
import { usePlayer } from "../hooks/usePlayer";
import { formatTime, type Track } from "../lib/tracks";
import EqBars from "./EqBars";

/**
 * One track in a list. The entire row is the play target — a full-size button
 * sits underneath the content, and the controls on the right float above it so
 * they stay clickable (buttons can't legally nest).
 */
export default function TrackRow({
  track,
  index,
  queue,
  number,
  subtitle,
  showPlays = true,
  right,
}: {
  track: Track;
  index: number;
  queue: Track[];
  /** overrides the position label (album track numbers, for instance) */
  number?: number | null;
  subtitle?: React.ReactNode;
  showPlays?: boolean;
  right?: React.ReactNode;
}) {
  const { play, current, isPlaying, toggle } = usePlayer();
  const active = current?.id === track.id;

  return (
    <li className="group relative flex items-center gap-3 rounded-md px-2 transition-colors hover:bg-surface">
      <button
        onClick={() => (active ? toggle() : play(track, queue))}
        aria-label={active && isPlaying ? `пауза ${track.title}` : `играть ${track.title}`}
        className="absolute inset-0 rounded-md"
      />

      {/* content is inert so clicks fall through to the button behind it */}
      <span className="pointer-events-none relative flex w-5 shrink-0 justify-end font-mono text-xs text-muted">
        {active ? <EqBars playing={isPlaying} /> : (number ?? index + 1)}
      </span>
      <img
        src={track.cover}
        alt=""
        loading="lazy"
        className="pointer-events-none relative h-10 w-10 shrink-0 rounded object-cover"
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
        }}
      />
      <span className="pointer-events-none relative min-w-0 flex-1 py-2">
        <span
          data-current={active}
          className="block truncate text-sm data-[current=true]:font-medium data-[current=true]:text-accent"
        >
          {track.title}
        </span>
        <span className="block truncate text-xs text-muted">
          {subtitle ?? track.author}
          {track.features?.length ? `, ${track.features.map((f) => f.name).join(", ")}` : ""}
        </span>
      </span>

      {showPlays && (
        <span className="pointer-events-none relative hidden items-center gap-1 font-mono text-xs text-muted sm:flex">
          <IconHeadphones size={13} /> {track.plays ?? 0}
        </span>
      )}

      {track.duration ? (
        <span className="pointer-events-none relative hidden font-mono text-xs text-muted sm:block">
          {formatTime(track.duration)}
        </span>
      ) : null}

      {right && <span className="relative flex shrink-0 items-center gap-1">{right}</span>}
    </li>
  );
}
