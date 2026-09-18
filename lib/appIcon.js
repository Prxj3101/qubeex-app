let mod;
function load() {
    if (mod !== undefined)
        return mod;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('@g9k/expo-dynamic-app-icon');
    }
    catch {
        mod = null;
    }
    return mod;
}
export function getAppIconSafe() {
    const m = load();
    if (!m)
        return null;
    try {
        return m.getAppIcon();
    }
    catch {
        return null;
    }
}
export function setAppIconSafe(name) {
    const m = load();
    if (!m)
        return false;
    try {
        return m.setAppIcon(name);
    }
    catch {
        return false;
    }
}
