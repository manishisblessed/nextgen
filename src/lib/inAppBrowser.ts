/**
 * In-app browser (WebView) detection.
 *
 * Links opened from WhatsApp, Instagram, Facebook, Gmail (iOS), etc. load in
 * the app's embedded WebView instead of a real browser. Most WebViews silently
 * auto-deny getUserMedia — the camera permission popup never appears and the
 * site ends up "blocked". We detect this up front so we can tell the user to
 * open the link in Chrome/Safari BEFORE they hit the camera step.
 *
 * Detection is deliberately conservative: known app tokens plus the standard
 * platform WebView markers. False negatives are acceptable (getUserMedia error
 * handling still catches those); false positives would wrongly scare users on
 * real browsers.
 */

const APP_TOKENS: Array<{ token: RegExp; name: string }> = [
  { token: /WhatsApp/i, name: "WhatsApp" },
  { token: /Instagram/i, name: "Instagram" },
  { token: /FBAN|FBAV|FB_IAB/i, name: "Facebook" },
  { token: /Messenger/i, name: "Messenger" },
  { token: /Snapchat/i, name: "Snapchat" },
  { token: /musical_ly|Bytedance/i, name: "TikTok" },
  { token: /LinkedInApp/i, name: "LinkedIn" },
  { token: /Twitter/i, name: "Twitter / X" },
  { token: /Line\//i, name: "LINE" },
  { token: /GSA\//i, name: "the Google app" },
];

export type InAppBrowserInfo = {
  inApp: boolean;
  /** Human-readable app name when we can identify it, e.g. "WhatsApp". */
  appName: string | null;
  os: "android" | "ios" | "other";
};

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof navigator === "undefined") {
    return { inApp: false, appName: null, os: "other" };
  }
  const ua = navigator.userAgent || "";

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const os: InAppBrowserInfo["os"] = isAndroid ? "android" : isIOS ? "ios" : "other";

  for (const { token, name } of APP_TOKENS) {
    if (token.test(ua)) return { inApp: true, appName: name, os };
  }

  // Android WebView marker: "; wv)" in the UA (Chrome Custom Tabs do NOT have it).
  if (isAndroid && /;\s*wv\)/i.test(ua)) {
    return { inApp: true, appName: null, os };
  }

  // iOS WKWebView heuristic: real Safari (and CriOS/FxiOS) always include
  // "Safari" in the UA; embedded WKWebViews don't.
  if (isIOS && !/Safari/i.test(ua)) {
    return { inApp: true, appName: null, os };
  }

  return { inApp: false, appName: null, os };
}
