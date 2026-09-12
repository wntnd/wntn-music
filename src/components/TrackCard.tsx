import { Link } from "react-router-dom";
import { IconPlayerPlayFilled, IconPlayerPauseFilled } from "@tabler/icons-react";
import { slugify, trackPath, type Track } from "../lib/tracks";
import { usePlayer } from "../hooks/usePlayer";
import LikeButton from "./LikeButton";

export default function TrackCard({ track, queue }: { track: Track; queue: Track[] }) {
  const { current, isPlaying, play, toggle } = usePlayer();
  const active = current?.id === track.id;

  return (
    <div className="group flex flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover">
      <div className="relative aspect-square overflow-hidden rounded-md">
        {/* like sits outside the play button — buttons can't nest */}
        <div className="absolute right-1 top-1 z-20 rounded-full bg-bg/60 backdrop-blur">
          <LikeButton trackId={track.id} size={16} />
        </div>
        {/* the whole artwork is the play target, not just the small button */}
        <button
          onClick={() => (active ? toggle() : play(track, queue))}
          data-active={active}
          aria-label={active && isPlaying ? "Пауза" : "Играть"}
          className="group/play absolute inset-0 block h-full w-full"
        >
          <img
            src={track.cover}
            alt={track.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.src.endsWith("/covers/default.jpg")) img.src = "/covers/default.jpg";
            }}
          />
          <span
            data-active={active}
            className="absolute inset-0 bg-black/25 opacity-0 transition-opacity group-hover:opacity-100 data-[active=true]:opacity-100"
          />
          {/* on touch there is no hover, so the play affordance stays put */}
          <span
            data-active={active}
            className="hover-reveal absolute bottom-2 right-2 grid h-11 w-11 place-items-center rounded-full bg-accent text-white shadow-lg transition-all group-active/play:scale-95"
          >
            {active && isPlaying ? (
              <IconPlayerPauseFilled size={20} />
            ) : (
              <IconPlayerPlayFilled size={20} />
            )}
          </span>
        </button>
      </div>
      <div className="px-1 pt-2">
        <Link
          to={trackPath(track)}
          viewTransition
          className="block truncate text-sm font-medium hover:underline"
          title={track.title}
        >
          {track.title}
        </Link>
        <p className="truncate text-xs text-muted">
          <Link to={`/artist/${slugify(track.author)}`} className="hover:underline">
            {track.author}
          </Link>
          {track.features?.length ? `, ${track.features.map((f) => f.name).join(", ")}` : ""}
        </p>
      </div>
    </div>
  );
}
