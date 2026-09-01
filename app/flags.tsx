import { FlagsSheet } from '@/components/FlagsSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
};
const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
};

export default function Flags() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const { profile, fetchProfile } = useStudent();

    useEffect(() => {
        if (!profile) fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}
            edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['top']}>
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