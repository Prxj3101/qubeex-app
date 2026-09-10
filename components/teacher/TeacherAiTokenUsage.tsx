import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { Sparkles } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

interface AiUsage {
    totalTokens: number;
    institutionPoolLimit: number;
    institutionPoolUsed: number;
    poolSharePct: number;
}

// Same abbreviation rules as qubeex-web's lib/utils.ts formatTokens()
function formatTokens(n: number, decimals: number = 1): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('en-IN');
}

export function TeacherAiTokenUsage() {
    const { isDark, accent } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const trackBg = isDark ? '#1E1E1E' : '#F1F5F9';
    const boxBg = isDark ? '#1A1A1A' : '#F8FAFC';
    const poolBoxBg = isDark ? '#1E1E1E' : '#F8FAFC';

    const [usage, setUsage] = useState<AiUsage | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUsage = useCallback(async () => {
        try {
            const res = await api.get('/teacher/ai-usage');
            setUsage(res.data.data);
        } catch {
            setUsage(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchUsage();
        }, [fetchUsage])
    );

    const totalTokens = usage?.totalTokens ?? 0;
    const institutionPoolLimit = usage?.institutionPoolLimit ?? 0;
    const institutionPoolUsed = usage?.institutionPoolUsed ?? 0;
    const poolSharePct = usage?.poolSharePct ?? 0;
    const remaining = Math.max(0, institutionPoolLimit - institutionPoolUsed);
    const institutionPct = institutionPoolLimit
        ? Math.min(100, Math.round((institutionPoolUsed / institutionPoolLimit) * 100))
        : 0;

    return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.headerRow}>
                <Sparkles size={15} color={subText} />
                <Text style={[styles.headerTitle, { color: text }]}>AI Token Usage</Text>
                <Text style={[styles.periodTag, { color: subText }]}>THIS MONTH</Text>
            </View>

            <View style={{ gap: 14 }}>
                {/* Your usage this month */}
                <View>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.rowLabel, { color: text }]}>Your usage · this month</Text>
                        <Text style={[styles.rowValue, { color: text }]}>
                            {loading ? '…' : formatTokens(totalTokens)}
                            <Text style={[styles.rowValueMuted, { color: subText }]}> / {loading ? '…' : formatTokens(institutionPoolLimit)} pool</Text>
                        </Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: trackBg }]}>
                        <View style={[styles.barFill, { width: `${Math.min(poolSharePct, 100)}%`, backgroundColor: accent.purple }]} />
                    </View>
                    <Text style={[styles.subHint, { color: subText }]}>{loading ? '…' : poolSharePct}% of institution pool</Text>
                </View>

                {/* Stat boxes */}
                <View style={styles.statRow}>
                    <View style={[styles.statBox, { backgroundColor: boxBg }]}>
                        <Text style={[styles.statValue, { color: text }]}>{loading ? '…' : formatTokens(totalTokens)}</Text>
                        <Text style={[styles.statLabel, { color: subText }]}>Used</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: boxBg }]}>
                        <Text style={[styles.statValue, { color: text }]}>{loading ? '…' : formatTokens(remaining, 2)}</Text>
                        <Text style={[styles.statLabel, { color: subText }]}>Remaining</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: accent.purpleLight }]}>
                        <Text style={[styles.statValue, { color: accent.purple }]}>{loading ? '…' : `${poolSharePct}%`}</Text>
                        <Text style={[styles.statLabel, { color: subText }]}>Pool share</Text>
                    </View>
                </View>

                {/* Institution pool */}
                <View style={[styles.poolBox, { backgroundColor: poolBoxBg, borderColor: cardBorder }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.poolLabel, { color: subText }]}>Institution pool</Text>
                        <Text style={[styles.poolValue, { color: text }]}>
                            {loading ? '…' : formatTokens(institutionPoolUsed)}
                            <Text style={[styles.rowValueMuted, { color: subText }]}> / {loading ? '…' : formatTokens(institutionPoolLimit)} used</Text>
                        </Text>
                    </View>
                    <View style={[styles.barTrackSm, { backgroundColor: trackBg }]}>
                        <View style={[styles.barFill, { width: `${institutionPct}%`, backgroundColor: '#DA7756' }]} />
                    </View>
                    <Text style={[styles.subHint, { color: subText }]}>Shared across all teachers</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 14,
    },
    headerTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    periodTag: {
        marginLeft: 'auto',
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
        opacity: 0.5,
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    rowLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    rowValue: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    rowValueMuted: {
        fontFamily: 'Poppins_400Regular',
    },
    barTrack: {
        height: 8,
        borderRadius: 99,
        overflow: 'hidden',
    },
    barTrackSm: {
        height: 6,
        borderRadius: 99,
        overflow: 'hidden',
        marginTop: 2,
    },
    barFill: {
        height: '100%',
        borderRadius: 99,
    },
    subHint: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },
    statRow: {
        flexDirection: 'row',
        gap: 8,
    },
    statBox: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    statLabel: {
        fontSize: 9.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    poolBox: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 10,
    },
    poolLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    poolValue: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
});
