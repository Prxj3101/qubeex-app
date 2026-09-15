import { FlagsSheet } from '@/components/FlagsSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Per-theme light-mode page background — mirrors app/(tabs)/feed.tsx's LIGHT_BG.
const LIGHT_BG: Record<string, string> = {
    purple: '#FBFBFF', blue: '#F7FBFE', teal: '#F0F7F3', amber: '#FEFBF7',
    rose: '#FBF7F7', indigo: '#F3F7FE', slate: '#FBFEFE',
};

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
};
const DARK = {
    bg: '#000000', card: '#141414', cardBorder: '#2A2A2A',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
};

export default function Flags() {
    const { isDark, accent, themeColor } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), bg: isDark ? DARK.bg : (LIGHT_BG[themeColor] ?? LIGHT_BG.purple), purple: accent.purple, purpleLight: accent.purpleLight };
    const { profile, fetchProfile } = useStudent();

    useEffect(() => {
        if (!profile) fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}
            edges={['top', 'bottom']}>
            <ScreenHeader title="Flags & Warnings" showBack />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
                <View style={styles.body}>
                    <FlagsSheet isDark={isDark} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14 },
});