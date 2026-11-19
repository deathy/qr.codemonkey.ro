// Camera-permission guidance. When a browser has a stored "deny" (site setting,
// the browser app's own OS-level camera permission, an in-app webview, Screen
// Time…) getUserMedia fails with NotAllowedError *without* showing a prompt, and
// no web code can force the prompt back. All we can do is detect the likely
// cause and tell the user exactly where to flip the switch.
// Pure functions (UA string in, text out) so they're unit-testable.

export type BrowserName = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';

export interface BrowserEnv {
  os: 'ios' | 'android' | 'other';
  browser: BrowserName;
  /** Name of the host app when the page is inside an in-app browser/webview. */
  inApp: string | null;
  /** Launched from the home screen (installed PWA). */
  standalone: boolean;
}

// Tokens that in-app browsers add to the user-agent. Order matters only for
// the display name; the first match wins.
const IN_APP: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/\bMessenger\b|MessengerForiOS/i, 'Messenger'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Snapchat/i, 'Snapchat'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Twitter/i, 'X / Twitter'],
  [/\bLine\//i, 'LINE'],
  [/Telegram/i, 'Telegram'],
  [/\bGSA\//i, 'the Google app']
];

export function detectBrowser(
  ua: string,
  maxTouchPoints = 0,
  standalone = false
): BrowserEnv {
  // iPadOS 13+ reports a desktop Mac UA; touch points give it away.
  const ios =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  const android = !ios && /Android/i.test(ua);
  const os = ios ? 'ios' : android ? 'android' : 'other';

  let inApp: string | null = null;
  for (const [re, name] of IN_APP) {
    if (re.test(ua)) {
      inApp = name;
      break;
    }
  }

  let browser: BrowserName = 'other';
  if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'firefox';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';

  // On iOS every real browser (Safari, Chrome, Firefox, Edge…) includes the
  // "Safari/" token. A WebKit UA without it is a bare WKWebView inside some app.
  if (ios && !inApp && !standalone && !/Safari\//.test(ua)) inApp = 'another app';
  // Android System WebView marks itself with "; wv)".
  if (android && !inApp && /;\s*wv\)/.test(ua)) inApp = 'another app';

  return { os, browser, inApp, standalone };
}

/** Read the live environment. */
export function currentBrowserEnv(): BrowserEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return detectBrowser(nav.userAgent, nav.maxTouchPoints ?? 0, Boolean(standalone));
}

const APP_LABEL: Record<BrowserName, string> = {
  safari: 'Safari',
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  other: 'your browser'
};

/** Warning shown before even trying the camera, when we're in a webview. */
export function inAppWarning(env: BrowserEnv): string | null {
  if (!env.inApp) return null;
  const target = env.os === 'ios' ? 'Safari' : 'your browser';
  const how =
    env.os === 'ios'
      ? 'use the ⋯ or Share menu → "Open in Safari"'
      : 'use the ⋮ menu → "Open in browser"';
  return `This page is open inside ${env.inApp}, which usually can't use the camera. To scan, ${how}, or open the link in ${target}.`;
}

export interface PermissionHelp {
  title: string;
  steps: string[];
}

/** What to tell the user when the camera is blocked (NotAllowedError / denied). */
export function permissionHelp(env: BrowserEnv): PermissionHelp {
  const title = 'Camera access is blocked for this site.';

  if (env.inApp) {
    const warning = inAppWarning(env) as string;
    return { title, steps: [warning] };
  }

  if (env.os === 'ios') {
    const steps: string[] = [];
    if (env.browser === 'safari') {
      steps.push(
        'In Safari, tap the "aA" (or page) icon in the address bar → Website Settings → Camera → Allow, then tap Retry.',
        'If it was already allowed: iPhone Settings → Apps → Safari → Camera → set to Ask or Allow.'
      );
    } else {
      const app = APP_LABEL[env.browser];
      steps.push(
        `iPhone Settings → Apps → ${app} → turn Camera on, then come back and tap Retry.`,
        'Or open this page in Safari instead.'
      );
    }
    steps.push(
      'Still blocked? Check Settings → Screen Time → Content & Privacy Restrictions — the camera may be disabled there.'
    );
    if (env.standalone) {
      steps.push(
        'Installed on the Home Screen: if Retry still shows no prompt, remove the app from the Home Screen and add it again.'
      );
    }
    return { title, steps };
  }

  if (env.os === 'android') {
    const app = APP_LABEL[env.browser];
    return {
      title,
      steps: [
        'Tap the icon left of the address bar → Permissions (or Site settings) → Camera → Allow, then tap Retry.',
        `If that's already allowed: Android Settings → Apps → ${app} → Permissions → Camera → Allow.`
      ]
    };
  }

  return {
    title,
    steps: [
      'Click the icon left of the address bar and allow the camera for this site, then click Retry.',
      'Also check that your operating system allows this browser to use the camera.'
    ]
  };
}
