import { describe, it, expect } from 'vitest';
import { detectBrowser, inAppWarning, permissionHelp } from './camera-help';

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iosInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; en_US)',
  iosFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0.38.109]',
  iosBareWebview:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidWebview:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
  desktopFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
};

describe('detectBrowser', () => {
  it('recognises iOS browsers', () => {
    expect(detectBrowser(UA.iosSafari)).toMatchObject({ os: 'ios', browser: 'safari', inApp: null });
    expect(detectBrowser(UA.iosChrome)).toMatchObject({ os: 'ios', browser: 'chrome', inApp: null });
    expect(detectBrowser(UA.iosFirefox)).toMatchObject({ os: 'ios', browser: 'firefox', inApp: null });
  });

  it('treats a touch-capable "Mac" as iPadOS', () => {
    expect(detectBrowser(UA.ipadOS, 5).os).toBe('ios');
    expect(detectBrowser(UA.ipadOS, 0).os).toBe('other');
  });

  it('flags in-app browsers by name', () => {
    expect(detectBrowser(UA.iosInstagram).inApp).toBe('Instagram');
    expect(detectBrowser(UA.iosFacebook).inApp).toBe('Facebook');
  });

  it('flags bare webviews, but not the installed home-screen app', () => {
    expect(detectBrowser(UA.iosBareWebview).inApp).toBe('another app');
    expect(detectBrowser(UA.iosBareWebview, 5, true).inApp).toBeNull();
    expect(detectBrowser(UA.androidWebview).inApp).toBe('another app');
  });

  it('recognises Android and desktop browsers', () => {
    expect(detectBrowser(UA.androidChrome)).toMatchObject({ os: 'android', browser: 'chrome', inApp: null });
    expect(detectBrowser(UA.androidSamsung).browser).toBe('samsung');
    expect(detectBrowser(UA.desktopFirefox)).toMatchObject({ os: 'other', browser: 'firefox' });
    expect(detectBrowser(UA.desktopEdge).browser).toBe('edge');
  });
});

describe('permissionHelp', () => {
  it('points iOS Safari users at Website Settings and Safari settings', () => {
    const steps = permissionHelp(detectBrowser(UA.iosSafari)).steps.join('\n');
    expect(steps).toContain('Website Settings');
    expect(steps).toContain('Apps → Safari → Camera');
    expect(steps).toContain('Screen Time');
  });

  it("points iOS Chrome users at the app's own camera permission", () => {
    const steps = permissionHelp(detectBrowser(UA.iosChrome)).steps.join('\n');
    expect(steps).toContain('Apps → Chrome → turn Camera on');
  });

  it('adds the re-add hint only for the installed home-screen app', () => {
    const installed = permissionHelp(detectBrowser(UA.iosBareWebview, 5, true)).steps.join('\n');
    expect(installed).toContain('Home Screen');
    expect(permissionHelp(detectBrowser(UA.iosSafari)).steps.join('\n')).not.toContain('Home Screen');
  });

  it('tells in-app users to open in a real browser', () => {
    const env = detectBrowser(UA.iosInstagram);
    expect(permissionHelp(env).steps).toEqual([inAppWarning(env)]);
    expect(inAppWarning(env)).toContain('Open in Safari');
    expect(inAppWarning(detectBrowser(UA.androidWebview))).toContain('Open in browser');
    expect(inAppWarning(detectBrowser(UA.iosSafari))).toBeNull();
  });

  it('names the Android browser app in the OS-level step', () => {
    const steps = permissionHelp(detectBrowser(UA.androidSamsung)).steps.join('\n');
    expect(steps).toContain('Apps → Samsung Internet → Permissions');
  });
});
