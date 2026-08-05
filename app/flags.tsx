import { AttachmentPreview } from '@/components/AttachmentPreview';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { CardType, Flag } from '@/data/flags';
import api from '@/lib/api';
import { BookOpen, Calendar, ChevronDown, ChevronUp, GraduationCap, ShieldAlert, User } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
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

const YELLOW = {
    card: { light: '#FFFBEB', dark: '#1C1A00' },
    border: { light: '#FDE68A', dark: '#44330A' },
    text: { light: '#713F12', dark: '#FDE047' },
    badge: { light: '#FEF08A', dark: '#3D3000' },
    badgeText: { light: '#92400E', dark: '#FCD34D' },
    icon: { light: '#D97706', dark: '#FCD34D' },
    header: { light: '#FEF3C7', dark: '#2D2010' },
    tab: { light: '#EAB308', dark: '#EAB308' },
};
const RED = {
    card: { light: '#FFF5F5', dark: '#1A0A0A' },
    border: { light: '#FECACA', dark: '#3D0F0F' },
    text: { light: '#7F1D1D', dark: '#FCA5A5' },
    badge: { light: '#FEE2E2', dark: '#3D0D0D' },
    badgeText: { light: '#991B1B', dark: '#F87171' },
    icon: { light: '#DC2626', dark: '#F87171' },
    header: { light: '#FEE2E2', dark: '#2B0D0D' },
    tab: { light: '#DC2626', dark: '#DC2626' },
};

const STATUS_CFG = {
    active: { label: 'Active', emoji: '🔴', color: '#EF4444' },
    resolved: { label: 'Resolved', emoji: '✅', color: '#10B981' },
    appealed: { label: 'Appealed', emoji: '⚖️', color: '#F59E0B' },
};

const CATEGORY_ICONS: Record<string, string> = {
    'Late Submission': '⏰',
    'Classroom Misconduct': '🗣️',
    'Attendance Shortfall': '📉',
    'Dress Code Violation': '👔',
    'Lab Misconduct': '💻',
    'Tab Switch Violation': '🖥️',
    'Academic Dishonesty': '📋',
    'Impersonation Attempt': '🎭',
    'Screenshot Attempt': '📸',
};


// Backend sends dates like "5 Aug 2026, 10:15 AM" — Hermes (React Native's JS
// engine) doesn't reliably parse this free-form format the way a browser's
// V8 engine does (new Date(str) can come back Invalid Date), which silently
// broke the newest-first sort below. Parse it explicitly instead.
const REMARK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseRemarkDate(input: string): number {
    const m = input.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return 0;
    const [, dayStr, monStr, yearStr, hourStr, minStr, ampm] = m;
    const monthIdx = REMARK_MONTHS.findIndex(mo => mo.toLowerCase() === monStr.slice(0, 3).toLowerCase());
    if (monthIdx === -1) return 0;
    let hour = parseInt(hourStr, 10) % 12;
    if (ampm.toUpperCase() === 'PM') hour += 12;
    const d = new Date(parseInt(yearStr, 10), monthIdx, parseInt(dayStr, 10), hour, parseInt(minStr, 10));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function FlagCard({ flag, theme, isDark, classLabel }: { flag: Flag; theme: typeof LIGHT; isDark: boolean; classLabel?: string }) {
    const [expanded, setExpanded] = useState(false);
    const cfg = flag.type === 'yellow' ? YELLOW : RED;
    const mode = isDark ? 'dark' : 'light';
    const status = STATUS_CFG[flag.status];

    return (
        <View style={[styles.flagCard, {
            backgroundColor: cfg.card[mode],
            borderColor: cfg.border[mode],
        }]}>
            <TouchableOpacity
                style={styles.flagCardHeader}
                onPress={() => setExpanded(e => !e)}
                activeOpacity={0.8}
            >
                <View style={styles.flagCardLeft}>
                    <View style={{
                        width: 18,
                        height: 24,
                        borderRadius: 3,
                        backgroundColor: flag.type === 'yellow' ? '#fcff38ff' : '#DC2626', transform: [{ rotate: '-5deg' }],
                        shadowColor: '#000',
                        shadowOffset: { width: 2, height: 4 },
                        shadowOpacity: 0.5,
                        shadowRadius: 4,
                        elevation: 8,

                    }}>

                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13 }}>{CATEGORY_ICONS[flag.category] ?? '⚠️'}</Text>
                            <View style={[styles.categoryBadge, { backgroundColor: cfg.badge[mode] }]}>
                                <Text style={[styles.categoryText, { color: cfg.badgeText[mode] }]}>
                                    {flag.category}
                                </Text>
                            </View>
                        </View>
                        <Text style={[styles.flagTitle, { color: cfg.text[mode] }]} numberOfLines={expanded ? undefined : 2}>
                            {flag.title}
                        </Text>
                    </View>
                </View>
                {expanded
                    ? <ChevronUp size={16} color={cfg.icon[mode]} />
                    : <ChevronDown size={16} color={cfg.icon[mode]} />
                }
            </TouchableOpacity>

            <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                    <Calendar size={11} color={cfg.icon[mode]} />
                    <Text style={[styles.metaText, { color: cfg.text[mode] }]}>{flag.date}</Text>
                </View>
                {classLabel && (
                    <View style={styles.metaItem}>
                        <GraduationCap size={11} color={cfg.icon[mode]} />
                        <Text style={[styles.metaText, { color: cfg.text[mode] }]}>{classLabel}</Text>
                    </View>
                )}
                {flag.subject && (
                    <View style={styles.metaItem}>
                        <BookOpen size={11} color={cfg.icon[mode]} />
                        <Text style={[styles.metaText, { color: cfg.text[mode] }]}>{flag.subject}</Text>
                    </View>
                )}
                <View style={styles.metaItem}>
                    <User size={11} color={cfg.icon[mode]} />
                    <Text style={[styles.metaText, { color: cfg.text[mode] }]}>{flag.reportedBy}</Text>
                </View>
            </View>

            {expanded && (
                <View style={{ gap: 10, marginTop: 10 }}>
                    <View style={[styles.detailBox, { backgroundColor: cfg.badge[mode], borderColor: cfg.border[mode] }]}>
                        <Text style={[styles.detailLabel, { color: cfg.icon[mode] }]}>📝 Incident Detail</Text>
                        <Text style={[styles.detailText, { color: cfg.text[mode] }]}>{flag.detail}</Text>
                    </View>

                    {flag.attachments.length > 0 && (
                        <View style={{ gap: 8 }}>
                            {flag.attachments.map((att, i) => (
                                <AttachmentPreview key={i} url={att.url} name={att.name} type={att.type} />
                            ))}
                        </View>
                    )}

                    {flag.actionTaken && (
                        <View style={[styles.detailBox, {
                            backgroundColor: isDark ? '#0D2B20' : '#D1FAE5',
                            borderColor: isDark ? '#065F46' : '#6EE7B7',
                        }]}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: isDark ? '#34D399' : '#065F46', marginBottom: 4 }}>
                                ⚡ Action Taken
                            </Text>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: isDark ? '#34D399' : '#065F46', lineHeight: 18 }}>
                                {flag.actionTaken}
                            </Text>
                        </View>
                    )}

                </View>
            )}
        </View>
    );
}

export default function Flags() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [activeTab, setActiveTab] = useState<CardType>('yellow');
    const [flags, setFlags] = useState<Flag[]>([]);
    const { profile, fetchProfile } = useStudent();

    useEffect(() => {
        if (!profile) fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        api.get('/student/remarks')
            .then(res => setFlags(res.data.data))
            .catch(() => setFlags([]));
    }, []);

    const sortByDateDesc = (arr: Flag[]) =>
        [...arr].sort((a, b) => parseRemarkDate(b.date) - parseRemarkDate(a.date));

    const yellowFlags = sortByDateDesc(flags.filter(f => f.type === 'yellow'));
    const redFlags = sortByDateDesc(flags.filter(f => f.type === 'red'));
    const activeFlags = activeTab === 'yellow' ? yellowFlags : redFlags;
    const cfg = activeTab === 'yellow' ? YELLOW : RED;
    const mode = isDark ? 'dark' : 'light';
    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -8, duration: 800, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [activeTab]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}
            edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['top']}>
            <ScreenHeader title="Flags & Warnings" showBack />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
                <View style={styles.body}>

                    {/* ── Side by Side Tabs ── */}
                    <View style={styles.tabRow}>
                        {/* Yellow Tab */}
                        <TouchableOpacity
                            onPress={() => setActiveTab('yellow')}
                            activeOpacity={0.8}
                            style={[styles.tab, {
                                backgroundColor: activeTab === 'yellow' ? (isDark ? '#1C1A00' : '#FFFBEB') : theme.card,

                                borderColor: activeTab === 'yellow'
                                    ? (isDark ? '#854D0E' : '#FDE047')
                                    : theme.cardBorder,
                                borderBottomWidth: activeTab === 'yellow' ? 3 : 1,
                                borderBottomColor: activeTab === 'yellow' ? '#EAB308' : theme.cardBorder,
                            }]}
                        >
                            <Animated.Image
                                source={require('../assets/images/Yellowcard.png')}
                                style={{
                                    width: 50, height: 50,
                                    transform: [{ translateY: activeTab === 'yellow' ? floatAnim : 0 }]
                                }}
                                resizeMode="contain"
                            />
                            <View style={{ alignItems: 'center' }}>
                                <Text style={[styles.tabTitle, {
                                    color: activeTab === 'yellow'
                                        ? (isDark ? '#FDE047' : '#713F12')
                                        : theme.subText,
                                }]}>Yellow Card</Text>
                                <Text style={[styles.tabCount, {
                                    color: activeTab === 'yellow'
                                        ? (isDark ? '#FCD34D' : '#92400E')
                                        : theme.muted,
                                }]}>{yellowFlags.length} flags</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Red Tab */}
                        <TouchableOpacity
                            onPress={() => setActiveTab('red')}
                            activeOpacity={0.8}
                            style={[styles.tab, {
                                backgroundColor: activeTab === 'red' ? (isDark ? '#1A0A0A' : '#FFF5F5') : theme.card,
                                borderColor: activeTab === 'red'
                                    ? (isDark ? '#7F1D1D' : '#FCA5A5')
                                    : theme.cardBorder,
                                borderBottomWidth: activeTab === 'red' ? 3 : 1,
                                borderBottomColor: activeTab === 'red' ? '#DC2626' : theme.cardBorder,
                            }]}
                        >
                            <Animated.Image
                                source={require('../assets/images/Redcard.png')}
                                style={{
                                    width: 50, height: 50,
                                    transform: [{ translateY: activeTab === 'red' ? floatAnim : 0 }]
                                }}
                                resizeMode="contain"
                            />
                            <View style={{ alignItems: 'center' }}>
                                <Text style={[styles.tabTitle, {
                                    color: activeTab === 'red'
                                        ? (isDark ? '#FCA5A5' : '#7F1D1D')
                                        : theme.subText,
                                }]}>Red Card</Text>
                                <Text style={[styles.tabCount, {
                                    color: activeTab === 'red'
                                        ? (isDark ? '#F87171' : '#991B1B')
                                        : theme.muted,
                                }]}>{redFlags.length} flags</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* ── Flags List ── */}
                    <View style={{ gap: 10 }}>
                        {activeFlags.map(flag => (
                            <FlagCard key={flag.id} flag={flag} theme={theme} isDark={isDark} classLabel={profile?.division || undefined} />
                        ))}
                        {activeFlags.length === 0 && (
                            <View style={{ alignItems: 'center', padding: 30, gap: 8 }}>
                                <Text style={{ fontSize: 32 }}>✅</Text>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>
                                    No {activeTab === 'yellow' ? 'yellow' : 'red'} cards!
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* ── Appeal Note ── */}
                    <View style={[styles.appealNote, { backgroundColor: theme.purpleLight, borderColor: isDark ? '#4C1D95' : '#DDD6FE' }]}>
                        <ShieldAlert size={16} color={theme.purple} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: theme.purple, marginBottom: 2 }}>
                                Want to appeal a flag?
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.purple, lineHeight: 16 }}>
                                Contact your class teacher or Principal.
                            </Text>
                        </View>
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 16 },

    tabRow: { flexDirection: 'row', gap: 10 },
    tab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: 14, borderRadius: 16, borderWidth: 1,
    },
    tabCardIcon: {
        width: 20, height: 28, borderRadius: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3, shadowRadius: 3, elevation: 4,
    },
    tabTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    tabCount: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    flagCard: { borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 8 },
    flagCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    flagCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    footballCard: {
        width: 18, height: 24, borderRadius: 3, marginTop: 2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
    },
    categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
    categoryText: { fontSize: 10, fontFamily: 'Poppins_700Bold' },
    flagTitle: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 4, lineHeight: 18 },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingLeft: 28 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 10, fontFamily: 'Poppins_400Regular' },

    detailBox: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
    detailLabel: { fontSize: 11, fontFamily: 'Poppins_700Bold', marginBottom: 2 },
    detailText: { fontSize: 12, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    appealNote: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 14, borderRadius: 14, borderWidth: 1,
    },
});