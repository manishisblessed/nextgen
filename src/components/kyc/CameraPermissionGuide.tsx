"use client";

/**
 * Step-by-step guide shown when the browser has BLOCKED camera/mic access.
 * The web platform cannot re-prompt a blocked site from JS, so the user must
 * re-enable it in their browser settings — these are the exact taps to do so.
 */
export function CameraPermissionGuide({ withMic = true }: { withMic?: boolean }) {
  const what = withMic ? "camera & microphone" : "camera";
  const What = withMic ? "Camera & Microphone" : "Camera";
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <p className="font-semibold">How to enable the {what}</p>
      <div className="mt-2 space-y-2">
        <div>
          <p className="font-medium">Android (Chrome):</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-xs">
            <li>Tap the <strong>lock / tune icon</strong> to the left of the address bar.</li>
            <li>Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).</li>
            <li>Set <strong>{What}</strong> to <strong>Allow</strong> (or tap <strong>Reset permissions</strong>).</li>
            <li>Reload the page and tap <strong>Try again</strong>.</li>
          </ol>
          <p className="mt-1 text-[11px] text-amber-700">
            Still blocked? Android <strong>Settings → Apps → Chrome → Permissions</strong> — allow{" "}
            {What}.
          </p>
        </div>
        <div>
          <p className="font-medium">iPhone (Safari):</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-xs">
            <li>Tap <strong>aA</strong> in the address bar → <strong>Website Settings</strong>.</li>
            <li>Set <strong>{What}</strong> to <strong>Allow</strong>.</li>
            <li>Reload the page and tap <strong>Try again</strong>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
