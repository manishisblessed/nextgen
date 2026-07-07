/**
 * Best-effort camera/microphone permission probing for the browser.
 *
 * The web platform can only *request* camera/mic via getUserMedia (on a user
 * gesture) — there is no API to force a re-prompt once a user has blocked a
 * site. What we CAN do is READ the current state via the Permissions API and
 * tailor the UI:
 *   - "prompt"  → show a priming screen, then trigger getUserMedia on tap.
 *   - "denied"  → show the "how to re-enable" guide immediately.
 *   - "granted" → go straight to capture.
 * The Permissions API for camera/microphone isn't universal (older Safari
 * lacks it), so callers must treat "unknown" as "just try getUserMedia".
 */

export type MediaPermissionState = "granted" | "denied" | "prompt" | "unknown";

async function queryOne(name: "camera" | "microphone"): Promise<MediaPermissionState> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return "unknown";
    }
    // TS DOM lib doesn't include "camera"/"microphone" in PermissionName.
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    const s = status.state as MediaPermissionState;
    return s === "granted" || s === "denied" || s === "prompt" ? s : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Combine camera + (optionally) microphone into a single state.
 * - "denied" if either is denied.
 * - "granted" only if all queried are granted.
 * - "prompt" if any is prompt (and none denied).
 * - "unknown" when the API can't tell us.
 */
export async function getMediaPermissionState(opts?: {
  audio?: boolean;
}): Promise<MediaPermissionState> {
  const wantAudio = opts?.audio ?? false;
  const cam = await queryOne("camera");
  const mic = wantAudio ? await queryOne("microphone") : "granted";

  if (cam === "denied" || mic === "denied") return "denied";
  if (cam === "unknown" || mic === "unknown") return "unknown";
  if (cam === "granted" && mic === "granted") return "granted";
  return "prompt";
}
