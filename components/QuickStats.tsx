import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface QuickStatsProps {
    attendancePct: number | null;
    marksPct: number | null;
    pendingTasks: number;
    nextEvent: { label: string; daysAway: number } | null;
}

export function QuickStats({ attendancePct, marksPct, pendingTasks, nextEvent }: QuickStatsProps) {
    const { isDark } = useTheme();

    const nextExamLabel = nextEvent
        ? nextEvent.daysAway === 0
            ? 'Today'
            : nextEvent.daysAway === 1
            ? '1 Day'
            : `${nextEvent.daysAway} Days`
        : '—';

    const stats = [
        {
            emoji: '📊',
            label: 'Attendance',
            value: attendancePct !== null ? `${attendancePct}%` : '—',
            color: isDark ? '#34D399' : '#065F46',
            bg: isDark ? '#0D2B20' : '#D1FAE5',
            iconBg: isDark ? '#134E35' : '#A7F3D0',
            href: '/attendance_detail',
        },
        {
            emoji: '⏰',
            label: nextEvent ? nextEvent.label.slice(0, 14) : 'Next Event',
            value: nextExamLabel,
            color: isDark ? '#F87171' : '#991B1B',
            bg: isDark ? '#2B0D0D' : '#FEE2E2',
            iconBg: isDark ? '#3D1212' : '#FECACA',
            href: '/(tabs)/feed',
        },
        {
            emoji: '📝',
            label: 'Pending Tasks',
            value: String(pendingTasks),
            color: isDark ? '#A78BFA' : '#5B21B6',
            bg: isDark ? '#2D1F50' : '#EDE9FE',
            iconBg: isDark ? '#3D2B66' : '#DDD6FE',
            href: '/(tabs)/tasks',
        },
        {
            emoji: '⭐',
            label: 'Overall Score',
            value: marksPct !== null ? `${marksPct}%` : '—',
            color: isDark ? '#FCD34D' : '#92400E',
            bg: isDark ? '#2D2010' : '#FEF3C7',
            iconBg: isDark ? '#44300F' : '#FDE68A',
            href: '/report_card',
        },
    ];

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
            {stats.map((stat) => (
                <TouchableOpacity
                    key={stat.label}
                    onPress={() => router.push(stat.href as any)}
                    style={[styles.card, { backgroundColor: stat.bg }]}
                    activeOpacity={0.85}
                >
                    <View style={[styles.iconBox, { backgroundColor: stat.iconBg }]}>
                        <Text style={styles.emoji}>{stat.emoji}</Text>
                    </View>
                    <View>
                        <Text style={[styles.value, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                            {stat.value}
                        </Text>
                        <Text style={[styles.label, { color: stat.color }]} numberOfLines={1}>
                            {stat.label}
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    card: {
        width: 148,
        borderRadius: 14,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emoji: {
        fontSize: 15,
    },
    value: {
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 16,
    },
    label: {
        fontSize: 11,
        fontWeight: '500',
    },
});
