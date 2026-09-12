import { useState } from "react";
import { IconUserPlus, IconUserCheck } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { useGoLogin } from "../hooks/useGoLogin";
import { meApi } from "../lib/api";

export default function FollowButton({
  artistId,
  initialFollowing,
  initialCount,
}: {
  artistId: string;
  initialFollowing: boolean;
  initialCount: number;
}) {
  const { user } = useAuth();
  const goLogin = useGoLogin();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);

  const toggle = async () => {
    if (!user) return goLogin();
    const prev = following;
    setFollowing(!prev);
    setCount((c) => c + (prev ? -1 : 1));
    try {
      const { following: now } = await meApi.toggleFollow(artistId);
      setFollowing(now);
    } catch {
      setFollowing(prev); // revert
      setCount((c) => c + (prev ? 1 : -1));
    }
  };

  return (
    <button
      onClick={toggle}
      data-on={following}
      className="flex items-center gap-1.5 rounded-card border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover data-[on=true]:bg-text data-[on=true]:text-bg"
    >
      {following ? <IconUserCheck size={16} /> : <IconUserPlus size={16} />}
      {following ? "вы подписаны" : "подписаться"}
      <span className="text-xs opacity-70">· {count}</span>
    </button>
  );
}
