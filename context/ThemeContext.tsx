import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';

// Matches the bg color every screen's own theme object already uses
// (LIGHT.bg / DARK.bg constants duplicated per-screen file).
const NATIVE_BG = { light: '#FAF8FF', dark: '#000000' };

// Mirrors qubeex-web's globals.css presets exactly (same hex per family, same
// light/dark pairing) — see themeColor.service.ts on the backend for the
// list of valid ids and the PRO/TRIAL eligibility check. Every screen's own
// LIGHT/DARK theme const still defines its base surface colors (bg/card/
// border); only the `purple`/`purpleLight` accent keys get overridden here
// from whichever family the institution picked, so a school on "teal" sees
// teal buttons/highlights/badges everywhere `theme.purple` is used, without
// every screen needing its own copy of all seven palettes.
const ACCENTS: Record<string, { light: { purple: string; purpleLight: string }; dark: { purple: string; purpleLight: string } }> = {
    purple: { light: { purple: '#7C3AED', purpleLight: '#EDE9FE' }, dark: { purple: '#A78BFA', purpleLight: '#2D1F50' } },
    blue: { light: { purple: '#3970E0', purpleLight: '#DBEAFE' }, dark: { purple: '#6495ED', purpleLight: '#0D1F3C' } },
    teal: { light: { purple: '#009999', purpleLight: '#CCFBF1' }, dark: { purple: '#33CCCC', purpleLight: '#134E4A' } },
    amber: { light: { purple: '#ED9A1F', purpleLight: '#F5EBD8' }, dark: { purple: '#F0B01A', purpleLight: '#2D2010' } },
    rose: { light: { purple: '#DC2626', purpleLight: '#FEE2E2' }, dark: { purple: '#F87171', purpleLight: '#2B0D14' } },
    indigo: { light: { purple: '#4F46E5', purpleLight: '#E0E7FF' }, dark: { purple: '#818CF8', purpleLight: '#1E1B4B' } },
    slate: { light: { purple: '#475569', purpleLight: '#F1F5F9' }, dark: { purple: '#94A3B8', purpleLight: '#1E293B' } },
};
const DEFAULT_ACCENT_ID = 'purple';

type Accent = { purple: string; purpleLight: string };

type ThemeContextType = {
    isDark: boolean;
    toggleTheme: () => void;
    themeColor: string;
    accent: Accent;
};

const ThemeContext = createContext<ThemeContextType>({
    isDark: false,
    toggleTheme: () => { },
    themeColor: DEFAULT_ACCENT_ID,
    accent: ACCENTS[DEFAULT_ACCENT_ID].light,
});

const THEME_COLOR_CACHE_KEY = 'themeColor';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [themeColor, setThemeColor] = useState(DEFAULT_ACCENT_ID);

    useEffect(() => {
        const loadTheme = async () => {
            const [savedTheme, cachedThemeColor] = await Promise.all([
                AsyncStorage.getItem('theme'),
                AsyncStorage.getItem(THEME_COLOR_CACHE_KEY),
            ]);
            const dark = savedTheme === 'dark';
            if (savedTheme !== null) setIsDark(dark);
            if (cachedThemeColor && ACCENTS[cachedThemeColor]) setThemeColor(cachedThemeColor);
            // Set this before first paint of any screen so the native Android
            // window background already matches the theme — otherwise every
            // tab's first mount (and every screen transition, since
            // react-native-screens swaps native Fragments) briefly shows the
            // default white window background behind/above our own topbar
            // for a frame, looking like a faint flash.
            SystemUI.setBackgroundColorAsync(dark ? NATIVE_BG.dark : NATIVE_BG.light).catch(() => {});
            setIsLoaded(true);
        };
        loadTheme();

        // Best-effort — fetches the institution's chosen accent family from
        // the same shared endpoint the web app reads (/branding, already
        // re-checks PRO/TRIAL eligibility server-side on every call), then
        // caches it so the next app open applies it before first paint
        // instead of always starting purple for a frame.
        api.get('/branding')
            .then((res) => {
                const color = res.data?.data?.themeColor;
                if (typeof color === 'string' && ACCENTS[color]) {
                    setThemeColor(color);
                    AsyncStorage.setItem(THEME_COLOR_CACHE_KEY, color).catch(() => {});
                }
            })
            .catch(() => { /* not logged in yet, or offline — keep cached/default */ });
    }, []);

    const toggleTheme = async () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
        SystemUI.setBackgroundColorAsync(newTheme ? NATIVE_BG.dark : NATIVE_BG.light).catch(() => {});
    };

    if (!isLoaded) return null;

    const accentFamily = ACCENTS[themeColor] ?? ACCENTS[DEFAULT_ACCENT_ID];
    const accent = isDark ? accentFamily.dark : accentFamily.light;

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme, themeColor, accent }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
