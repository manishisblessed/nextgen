/**
 * True when an error is a webpack chunk-load failure — i.e. the browser is
 * running an older build whose lazy JS/CSS chunks no longer exist on the server
 * (typically right after a redeploy, or behind mismatched instances / a stale
 * CDN). The cure is a hard reload, which pulls fresh HTML with the current chunk
 * hashes. Keep this dependency-free so it is safe to import from `global-error`.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  return (
    name === "ChunkLoadError" ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w-]+ failed/i.test(message)
  );
}

/**
 * Hard-reload the page at most once within `windowMs` to recover from a stale
 * chunk, using sessionStorage as a guard so a genuinely broken deploy can't send
 * the tab into an infinite reload loop. Returns true if a reload was triggered.
 */
export function reloadOnceForChunkError(windowMs = 20_000): boolean {
  if (typeof window === "undefined") return false;
  const KEY = "nxt:chunk-reload-at";
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > windowMs) {
      window.sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage blocked (private mode / SSR) — fall back to a single reload
    // guarded by a module-level flag is not possible here, so do nothing to stay
    // safe against loops.
  }
  return false;
}
