import path from 'node:path';

/**
 * Linux window managers do not reliably recover the application icon from AppImage metadata
 * when the raw AppImage is launched directly. Give packaged Linux windows an explicit branded
 * PNG. Windows development runs also use the checked-in Symbiote mark, so the local window,
 * taskbar, and Alt-Tab entry are branded before a packaged executable exists.
 */
export function browserWindowIconPath(
  platform: NodeJS.Platform,
  packaged: boolean,
  resourcesPath: string,
  appPath?: string
): string | undefined {
  if (platform === 'linux' && packaged) return path.join(resourcesPath, 'runtime-icon.png');
  if (platform === 'win32' && !packaged && appPath) return path.join(appPath, 'docs', 'logo_bgremoved.png');
  return undefined;
}
