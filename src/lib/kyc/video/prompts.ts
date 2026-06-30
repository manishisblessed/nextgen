/**
 * Randomized liveness prompts (Phase 14).
 *
 * The server issues a random instruction the user must perform on camera during
 * the 10-second capture. A challenge that changes per attempt deters replaying a
 * pre-recorded clip or holding up a static photo (a basic anti-spoofing measure;
 * the eKYC Hub face check is the authoritative liveness/identity signal).
 */

export const LIVENESS_PROMPTS: readonly string[] = [
  "Blink twice slowly",
  "Turn your head to the left, then back to center",
  "Turn your head to the right, then back to center",
  "Smile, then return to a neutral face",
  "Nod your head up and down once",
  "Say today's date out loud",
  "Raise your eyebrows twice",
  "Look up, then back at the camera",
] as const;

/** Pick a random prompt to show for this capture attempt. */
export function randomLivenessPrompt(): string {
  const i = Math.floor(Math.random() * LIVENESS_PROMPTS.length);
  return LIVENESS_PROMPTS[i] ?? LIVENESS_PROMPTS[0];
}
