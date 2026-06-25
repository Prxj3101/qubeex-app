import { useTheme } from '@/context/ThemeContext';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface QuickStatsProps {
    onNavigate: (screen: any) => void;
}

export function QuickStats({ onNavigate }: QuickStatsProps) {
    const { isDark } = useTheme();

    const stats = [
        {
            emoji: '📊',
            label: 'Attendance',
            value: '79%',
            color: isDark ? '#34D399' : '#065F46',
            bg: isDark ? '#0D2B20' : '#D1FAE5',
            iconBg: isDark ? '#134E35' : '#A7F3D0',
            screen: 'attendance',
        },
        {
            emoji: '⏰',
            label: 'Exam In',
            value: '5 Days',
            color: isDark ? '#F87171' : '#991B1B',
            bg: isDark ? '#2B0D0D' : '#FEE2E2',
            iconBg: isDark ? '#3D1212' : '#FECACA',
            screen: 'calendar',
        },
        {
            emoji: '📝',
            label: 'Pending Assignment',
            value: '3',
            color: isDark ? '#A78BFA' : '#5B21B6',
            bg: isDark ? '#2D1F50' : '#EDE9FE',
            iconBg: isDark ? '#3D2B66' : '#DDD6FE',
            screen: 'assignments',
        },
        {
            emoji: '⭐',
            label: 'Overall Score',
            value: '71%',
            color: isDark ? '#FCD34D' : '#92400E',
            bg: isDark ? '#2D2010' : '#FEF3C7',
            iconBg: isDark ? '#44300F' : '#FDE68A',
            screen: 'profile',
        },
    ];

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
            {stats.map((stat) => (
                <TouchableOpacity
                    key={stat.label}
                    onPress={() => onNavigate(stat.screen)}
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
                        <Text style={[styles.label, { color: stat.color }]}>
                            {stat.label}
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    grid: {
        flexDirection: 'row',
        gap: 8,
    },
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