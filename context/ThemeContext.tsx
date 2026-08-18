import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useState } from 'react';

// Matches the bg color every screen's own theme object already uses
// (LIGHT.bg / DARK.bg constants duplicated per-screen file).
const NATIVE_BG = { light: '#FAF8FF', dark: '#0F0A1E' };

type ThemeContextType = {
    isDark: boolean;
    toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
    isDark: false,
    toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadTheme = async () => {
            const savedTheme = await AsyncStorage.getItem('theme');
            const dark = savedTheme === 'dark';
            if (savedTheme !== null) setIsDark(dark);
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
    }, []);

    const toggleTheme = async () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
        SystemUI.setBackgroundColorAsync(newTheme ? NATIVE_BG.dark : NATIVE_BG.light).catch(() => {});
    };

    if (!isLoaded) return null;

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}