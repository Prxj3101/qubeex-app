// Thin wrapper around @g9k/expo-dynamic-app-icon that never throws at import
// time. The library resolves its native module (ExpoDynamicAppIcon) as soon
// as it's required, which crashes instantly in Expo Go (no custom native
// modules there) and in any dev client built before this feature was added.
// Loading it lazily inside a try/catch means the rest of the app — and this
// screen — still works everywhere; only the icon-switcher itself becomes a
// no-op until the app is running from a build that actually has the module
// compiled in (a fresh dev client or an EAS build).
type IconName = 'black' | 'white' | 'transparent';

let mod: typeof import('@g9k/expo-dynamic-app-icon') | null | undefined;

function load() {
    if (mod !== undefined) return mod;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('@g9k/expo-dynamic-app-icon');
    } catch {
        mod = null;
    }
    return mod;
}

export function getAppIconSafe(): IconName | 'DEFAULT' | null {
    const m = load();
    if (!m) return null;
    try {
        return m.getAppIcon() as IconName | 'DEFAULT';
    } catch {
        return null;
    }
}

export function setAppIconSafe(name: IconName | null): IconName | 'DEFAULT' | false {
    const m = load();
    if (!m) return false;
    try {
        return m.setAppIcon(name) as IconName | 'DEFAULT' | false;
    } catch {
        return false;
    }
}
