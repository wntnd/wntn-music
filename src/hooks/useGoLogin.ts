import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Sends the visitor to /login remembering where they were, so signing in from a
 * like button or a private page returns them there instead of dumping everyone
 * on /library.
 */
export function useGoLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (opts: { replace?: boolean } = {}) => {
      const from = location.pathname + location.search;
      navigate("/login", { state: { from }, replace: opts.replace });
    },
    [navigate, location.pathname, location.search],
  );
}
