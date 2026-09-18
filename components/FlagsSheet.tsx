import { useTheme } from '@/context/ThemeContext';
import { AttachmentPreview } from '@/components/AttachmentPreview';
import { useParentModeLanguage } from '@/context/ParentModeLanguageContext';
import { useStudent } from '@/context/StudentContext';
import { CardType, Flag } from '@/data/flags';
import api from '@/lib/api';
import { useDynamicTranslation } from '@/lib/dynamicTranslate';
import { n, ParentLang, t } from '@/lib/parentModeI18n';
import { BookOpen, Calendar, ChevronDown, ChevronUp, GraduationCap, Pencil, ShieldAlert, User } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Exact copy of the full "Flags & Warnings" screen from app/flags.tsx (the
// yellow/red tabs + expandable flag cards + appeal note), lifted into its own
// self-contained (optionally self-fetching) component so it can be dropped
// verbatim into other screens — e.g. embedded directly in Parent Mode instead
// of behind a "View All" navigation — not just the standalone Flags screen.
// Keep this in sync with app/flags.tsx if the sheet's visuals ever change
// there.

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

interface FlagCardProps {
    flag: Flag;
    isDark: boolean;
    classLabel?: string;
    lang: ParentLang;
    // Machine-translated (Hindi/Marathi) versions of the teacher-entered free
    // text fields, when available — icon lookup below still uses the
    // ORIGINAL (English) flag.category, since CATEGORY_ICONS is keyed off
    // the untranslated category name.
    displayCategory?: string;
    displayTitle?: string;
    displayDetail?: string;
    displayActionTaken?: string;
    // Teacher/admin-only — mirrors qubeex-web's FlagsBoard.tsx FlagCard:
    // the Edit button only shows when a handler is passed AND this specific
    // flag's `canEdit` is true (the viewer is who originally filed it).
    onEdit?: (flag: Flag) => void;
}

function FlagCard({ flag, isDark, classLabel, lang, displayCategory, displayTitle, displayDetail, displayActionTaken, onEdit }: FlagCardProps) {
    const [expanded, setExpanded] = useState(false);
    const cfg = flag.type === 'yellow' ? YELLOW : RED;
    const mode = isDark ? 'dark' : 'light';
    const showEdit = !!onEdit && !!flag.canEdit;

    return (
        <View style={[styles.flagCard, {
            backgroundColor: cfg.card[mode],
            borderColor: cfg.border[mode],
            paddingBottom: showEdit ? 34 : 12,
        }]}>
            {showEdit && (
                <TouchableOpacity
                    onPress={() => onEdit?.(flag)}
                    activeOpacity={0.7}
                    style={[styles.editBtn, { backgroundColor: cfg.badge[mode] }]}
                >
                    <Pencil size={13} color={cfg.icon[mode]} />
                </TouchableOpacity>
            )}
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
                    }} />
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13 }}>{CATEGORY_ICONS[flag.category] ?? '⚠️'}</Text>
                            <View style={[styles.categoryBadge, { backgroundColor: cfg.badge[mode] }]}>
                                <Text style={[styles.categoryText, { color: cfg.badgeText[mode] }]}>
                                    {displayCategory ?? flag.category}
                                </Text>
                            </View>
                        </View>
                        <Text style={[styles.flagTitle, { color: cfg.text[mode] }]} numberOfLines={expanded ? undefined : 2}>
                            {displayTitle ?? flag.title}
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
                        <Text style={[styles.detailLabel, { color: cfg.icon[mode] }]}>{t('incidentDetail', lang)}</Text>
                        <Text style={[styles.detailText, { color: cfg.text[mode] }]}>{displayDetail ?? flag.detail}</Text>
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
{t('actionTaken', lang)}
                            </Text>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: isDark ? '#34D399' : '#065F46', lineHeight: 18 }}>
                                {displayActionTaken ?? flag.actionTaken}
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

interface FlagsSheetProps {
    isDark: boolean;
    // Optional pre-fetched flags — same pattern as ReportCardSheet/
    // AttendanceSheet's `data` prop. Omitted: self-fetch mode (used by the
    // standalone app/flags.tsx screen). `null`: embed mode, caller's own
    // fetch hasn't resolved yet. Array: embed mode, ready to render.
    data?: Flag[] | null;
    // Whether to show the "Want to appeal a flag?" note at the bottom.
    // Defaults to true (the standalone app/flags.tsx screen keeps it);
    // Parent Mode hides it since the appeal action is student/teacher-facing.
    showAppealNote?: boolean;
    // Overrides the line under "Want to appeal a flag?" — mirrors
    // qubeex-web's FlagsBoard `appealNote` prop (default there is "Contact
    // your class teacher or Principal."; the teacher page passes its own
    // "Discuss with the student directly, or escalate to the admin."
    // instead). Falls back to the translated student-facing copy when
    // omitted.
    appealNote?: string;
    // Teacher/admin-only — mirrors qubeex-web's FlagsBoard `onEdit` prop.
    // Omitted entirely for the student view, which stays read-only.
    onEdit?: (flag: Flag) => void;
}

export function FlagsSheet({ isDark, data: providedData, showAppealNote = true, appealNote, onEdit }: FlagsSheetProps) {
    const { accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple, purpleLight: accent.purpleLight };
    const { lang } = useParentModeLanguage();
    const { profile } = useStudent();
    const [activeTab, setActiveTab] = useState<CardType>('yellow');
    const isEmbedMode = providedData !== undefined;
    const [fetchedData, setFetchedData] = useState<Flag[]>([]);
    const [selfLoading, setSelfLoading] = useState(!isEmbedMode);

    useEffect(() => {
        if (isEmbedMode) return;
        api.get('/student/remarks')
            .then(res => setFetchedData(res.data.data))
            .catch(() => setFetchedData([]))
            .finally(() => setSelfLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flags = isEmbedMode ? (providedData ?? []) : fetchedData;
    const loading = isEmbedMode ? false : selfLoading;

    const sortByDateDesc = (arr: Flag[]) =>
        [...arr].sort((a, b) => parseRemarkDate(b.date) - parseRemarkDate(a.date));

    const yellowFlags = sortByDateDesc(flags.filter(f => f.type === 'yellow'));
    const redFlags = sortByDateDesc(flags.filter(f => f.type === 'red'));
    const activeFlags = activeTab === 'yellow' ? yellowFlags : redFlags;

    // Category/title/detail/actionTaken are teacher-entered free text — not
    // covered by the static UI dictionary, so translated dynamically (see
    // lib/dynamicTranslate.ts) when the parent has selected Hindi/Marathi.
    // Flattened into one array (4 slots per flag) so all of them go out in a
    // single batched API call instead of one call per flag per field.
    const flagTextsToTranslate = useMemo(
        () => activeFlags.flatMap(f => [f.category, f.title, f.detail, f.actionTaken ?? '']),
        [activeFlags]
    );
    const translatedFlagTexts = useDynamicTranslation(flagTextsToTranslate, lang);
    const translatedFlags = useMemo(
        () => activeFlags.map((f, i) => ({
            flag: f,
            displayCategory: translatedFlagTexts[i * 4],
            displayTitle: translatedFlagTexts[i * 4 + 1],
            displayDetail: translatedFlagTexts[i * 4 + 2],
            displayActionTaken: f.actionTaken ? translatedFlagTexts[i * 4 + 3] : undefined,
        })),
        [activeFlags, translatedFlagTexts]
    );

    const floatAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -8, duration: 800, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [activeTab]);

    if (loading) {
        return (
            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.purple} />
            </View>
        );
    }

    return (
        <View style={{ gap: 16 }}>
            {/* Side by Side Tabs */}
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
                        }]}>{t('yellowCard', lang)}</Text>
                        <Text style={[styles.tabCount, {
                            color: activeTab === 'yellow'
                                ? (isDark ? '#FCD34D' : '#92400E')
                                : theme.muted,
                        }]}>{n(yellowFlags.length, lang)} {t('flagsSuffix', lang)}</Text>
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
                        }]}>{t('redCard', lang)}</Text>
                        <Text style={[styles.tabCount, {
                            color: activeTab === 'red'
                                ? (isDark ? '#F87171' : '#991B1B')
                                : theme.muted,
                        }]}>{n(redFlags.length, lang)} {t('flagsSuffix', lang)}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Flags List */}
            <View style={{ gap: 10 }}>
                {translatedFlags.map(({ flag, displayCategory, displayTitle, displayDetail, displayActionTaken }) => (
                    <FlagCard
                        key={flag.id}
                        flag={flag}
                        isDark={isDark}
                        classLabel={profile?.division || undefined}
                        lang={lang}
                        displayCategory={displayCategory}
                        displayTitle={displayTitle}
                        displayDetail={displayDetail}
                        displayActionTaken={displayActionTaken}
                        onEdit={onEdit}
                    />
                ))}
                {activeFlags.length === 0 && (
                    <View style={{ alignItems: 'center', padding: 30, gap: 8 }}>
                        <Text style={{ fontSize: 32 }}>✅</Text>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>
                            {t(activeTab === 'yellow' ? 'noYellowCards' : 'noRedCards', lang)}
                        </Text>
                    </View>
                )}
            </View>

            {/* Appeal Note */}
            {showAppealNote && (
                <View style={[styles.appealNote, { backgroundColor: theme.purpleLight, borderWidth: 0 }]}>
                    <ShieldAlert size={16} color={theme.purple} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: theme.purple, marginBottom: 2 }}>
                            {t('wantToAppeal', lang)}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.purple, lineHeight: 16 }}>
                            {appealNote ?? t('contactTeacherPrincipal', lang)}
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    tabRow: { flexDirection: 'row', gap: 10 },
    tab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: 14, borderRadius: 16, borderWidth: 1,
    },
    tabTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    tabCount: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    flagCard: { borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 8 },
    editBtn: {
        position: 'absolute', bottom: 10, right: 10, zIndex: 1,
        width: 24, height: 24, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
    },
    flagCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    flagCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
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
