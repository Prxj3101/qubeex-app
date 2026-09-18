import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, BookOpen, GraduationCap, Users } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ── Types — mirrors qubeex-web's teacher/classes/page.tsx ──────────────────
interface ClassTeacherAssignment {
    id: string;
    divisionId: string;
    divisionName: string;
    standardName: string;
    studentCount: number;
    subjects: { id: string; name: string; color: string | null; teacherName?: string | null }[];
}

interface SubjectTeacherAssignment {
    id: string;
    divisionId: string;
    divisionName: string;
    standardName: string;
    subjectId: string;
    subjectName: string;
    subjectColor: string | null;
    studentCount: number;
    createdAt: string;
}

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };

// Same 5-slot gradient sequence as the web page, minus the CSS `color-mix()`
// first entry (RN has no such thing) — that slot is filled in per-render
// using the institution's own accent color instead.
const FIXED_GRADIENTS: [string, string][] = [
    ['#DA7756', '#E8876A'],
    ['#0891B2', '#38BDF8'],
    ['#059669', '#34D399'],
    ['#D97706', '#FCD34D'],
];

function getGradient(str: string, accentPair: [string, string]): [string, string] {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const all = [accentPair, ...FIXED_GRADIENTS];
    return all[Math.abs(hash) % all.length];
}

function getDivisionInitial(name: string) {
    return name.includes('-') ? (name.split('-').pop() ?? name[0]) : name[0];
}

// Same subject color palette as qubeex-web's lib/subjectColors.ts, so a
// subject renders in the same color across web, teacher app and student app.
const SUBJECT_PALETTE = [
    '#DA7756', '#EC4899', '#0891B2', '#7C3AED', '#059669', '#2563EB', '#4F46E5',
    '#D97706', '#166534', '#E11D48', '#0284C7', '#C026D3', '#EA580C', '#0D9488',
];
function hashToIndex(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    return h;
}
function colorForSubject(sub: { id: string; color?: string | null }): string {
    return sub.color ?? SUBJECT_PALETTE[hashToIndex(sub.id) % SUBJECT_PALETTE.length];
}

// Groups subject-teacher rows by division, oldest-assignment-first — same
// ordering rule as the web page (see its comment for the full rationale).
function groupByDivisionOldToNew(items: SubjectTeacherAssignment[]) {
    const groupMap = new Map<string, { divisionId: string; divisionName: string; standardName: string; items: SubjectTeacherAssignment[] }>();
    for (const item of items) {
        const existing = groupMap.get(item.divisionId);
        if (existing) existing.items.push(item);
        else groupMap.set(item.divisionId, { divisionId: item.divisionId, divisionName: item.divisionName, standardName: item.standardName, items: [item] });
    }
    const groups = Array.from(groupMap.values());
    for (const g of groups) g.items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    groups.sort((a, b) => new Date(a.items[0].createdAt).getTime() - new Date(b.items[0].createdAt).getTime());
    return groups;
}

function ClassTeacherCard({ item, theme, isDark, accentPair }: { item: ClassTeacherAssignment; theme: typeof LIGHT; isDark: boolean; accentPair: [string, string] }) {
    const grad = getGradient(item.standardName, accentPair);
    return (
        <View style={[cardStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={cardStyles.topRow}>
                <View style={cardStyles.leftGroup}>
                    <LinearGradient colors={grad} style={cardStyles.avatar}>
                        <Text style={cardStyles.avatarText}>{getDivisionInitial(item.divisionName)}</Text>
                    </LinearGradient>
                    <View>
                        <Text style={[cardStyles.divisionName, { color: theme.text }]}>{item.divisionName}</Text>
                        <Text style={[cardStyles.standardName, { color: theme.subText }]}>{item.standardName}</Text>
                    </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[cardStyles.badge, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7' }]}>
                        <Text style={[cardStyles.badgeText, { color: isDark ? '#FCD34D' : '#B45309' }]}>Class Teacher</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Users size={11} color={theme.subText} />
                            <Text style={[cardStyles.countText, { color: theme.subText }]}>{item.studentCount}</Text>
                        </View>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => router.push({ pathname: '/teacher_class_detail', params: { divisionId: item.divisionId, role: 'class-teacher' } })}
                        >
                            <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} style={cardStyles.goBtn}>
                                <ArrowUpRight size={16} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <View style={[cardStyles.bottomInfo, { borderTopColor: theme.cardBorder }]}>
                <View style={[cardStyles.infoRow, { borderBottomColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[cardStyles.dot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={[cardStyles.infoLabel, { color: theme.subText }]}>Class Teacher</Text>
                    </View>
                    <Text style={[cardStyles.infoValue, { color: '#F59E0B' }]}>You</Text>
                </View>

                {item.subjects.length > 0 && (
                    <>
                        <Text style={[cardStyles.subjectsLabel, { color: theme.muted }]}>SUBJECTS</Text>
                        {item.subjects.map((sub) => (
                            <View key={sub.id} style={[cardStyles.infoRow, { borderTopColor: theme.cardBorder, borderBottomWidth: 0 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={[cardStyles.dot, { backgroundColor: colorForSubject(sub) }]} />
                                    <Text style={[cardStyles.infoLabel, { color: theme.subText }]}>{sub.name}</Text>
                                </View>
                                <Text style={[cardStyles.infoValueMuted, { color: theme.muted }]}>{sub.teacherName ?? 'Not assigned'}</Text>
                            </View>
                        ))}
                    </>
                )}
            </View>
        </View>
    );
}

function SubjectTeacherCard({ item, theme, accentPair }: { item: SubjectTeacherAssignment; theme: typeof LIGHT; accentPair: [string, string] }) {
    const grad = getGradient(item.standardName, accentPair);
    const subjectColor = colorForSubject({ id: item.subjectId, color: item.subjectColor });
    return (
        <View style={[cardStyles.card, cardStyles.subjectCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={cardStyles.topRow}>
                <View style={cardStyles.leftGroup}>
                    <LinearGradient colors={grad} style={cardStyles.avatar}>
                        <Text style={cardStyles.avatarText}>{getDivisionInitial(item.divisionName)}</Text>
                    </LinearGradient>
                    <View>
                        <Text style={[cardStyles.divisionName, { color: theme.text }]}>{item.divisionName}</Text>
                        <Text style={[cardStyles.standardName, { color: theme.subText }]}>{item.standardName}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Users size={11} color={theme.subText} />
                        <Text style={[cardStyles.countText, { color: theme.subText }]}>{item.studentCount}</Text>
                    </View>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => router.push({ pathname: '/teacher_class_detail', params: { divisionId: item.divisionId, role: 'subject-teacher', subjectId: item.subjectId } })}
                    >
                        <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} style={cardStyles.goBtn}>
                            <ArrowUpRight size={16} color="#fff" />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[cardStyles.subjectBadge, { backgroundColor: subjectColor + '15', borderColor: subjectColor + '40' }]}>
                <BookOpen size={12} color={subjectColor} />
                <Text style={[cardStyles.subjectBadgeText, { color: subjectColor }]}>{item.subjectName}</Text>
            </View>
        </View>
    );
}

export default function TeacherClassesScreen() {
    const { isDark, accent } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), purple: accent.purple };
    const accentPair: [string, string] = [accent.purple, accent.purpleLight];

    const [classTeacher, setClassTeacher] = useState<ClassTeacherAssignment[]>([]);
    const [subjectTeacher, setSubjectTeacher] = useState<SubjectTeacherAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const fetchedRef = useRef(false);

    const fetchClasses = useCallback(async () => {
        try {
            const res = await api.get('/teacher/classes');
            setClassTeacher(res.data.data.classTeacher ?? []);
            setSubjectTeacher(res.data.data.subjectTeacher ?? []);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (fetchedRef.current) return;
            fetchedRef.current = true;
            fetchClasses();
        }, [fetchClasses])
    );

    const groups = groupByDivisionOldToNew(subjectTeacher);

    return (
        <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: Constants.statusBarHeight }]}>
            <ScreenHeader title="Classes" />

            {loading ? (
                <View style={styles.centerFill}>
                    <ActivityIndicator color={theme.purple} />
                </View>
            ) : error ? (
                <View style={styles.centerFill}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: theme.subText }}>Failed to load classes. Please refresh.</Text>
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 36 }}>

                    {/* Class Teacher section */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <View style={[styles.sectionDot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={[styles.sectionLabel, { color: theme.subText }]}>Class Teacher</Text>
                        <View style={[styles.countPill, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}>
                            <Text style={[styles.countPillText, { color: theme.subText }]}>{classTeacher.length}</Text>
                        </View>
                    </View>

                    {classTeacher.length === 0 ? (
                        <View style={[styles.emptyBox, { borderColor: theme.cardBorder }]}>
                            <GraduationCap size={26} color={theme.muted} />
                            <Text style={[styles.emptyTitle, { color: theme.subText }]}>No class assigned</Text>
                            <Text style={[styles.emptySub, { color: theme.muted }]}>Admin will assign you a class</Text>
                        </View>
                    ) : (
                        <View style={{ gap: 12 }}>
                            {classTeacher.map((item) => (
                                <ClassTeacherCard key={item.id} item={item} theme={theme} isDark={isDark} accentPair={accentPair} />
                            ))}
                        </View>
                    )}

                    {/* Subject Teacher section */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10 }}>
                        <View style={[styles.sectionDot, { backgroundColor: '#8B5CF6' }]} />
                        <Text style={[styles.sectionLabel, { color: theme.subText }]}>Subject Teacher</Text>
                        <View style={[styles.countPill, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}>
                            <Text style={[styles.countPillText, { color: theme.subText }]}>{subjectTeacher.length}</Text>
                        </View>
                    </View>

                    {subjectTeacher.length === 0 ? (
                        <View style={[styles.emptyBox, { borderColor: theme.cardBorder }]}>
                            <BookOpen size={26} color={theme.muted} />
                            <Text style={[styles.emptyTitle, { color: theme.subText }]}>No subjects assigned</Text>
                            <Text style={[styles.emptySub, { color: theme.muted }]}>Admin will assign you subjects</Text>
                        </View>
                    ) : (
                        <View style={{ gap: 16 }}>
                            {groups.map((group) => (
                                <View key={group.divisionId}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        <Text style={[styles.groupName, { color: theme.text }]}>{group.divisionName}</Text>
                                        <Text style={[styles.groupStandard, { color: theme.subText }]}>{group.standardName}</Text>
                                        <View style={[styles.groupLine, { backgroundColor: theme.cardBorder }]} />
                                    </View>
                                    <View style={{ gap: 10 }}>
                                        {group.items.map((item) => (
                                            <SubjectTeacherCard key={item.id} item={item} theme={theme} accentPair={accentPair} />
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    pageTitle: { fontSize: 19, fontFamily: 'Poppins_700Bold' },
    pageSub: { fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginLeft: 27 },
    sectionDot: { width: 6, height: 6, borderRadius: 3 },
    sectionLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    countPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
    countPillText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, gap: 4 },
    emptyTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    emptySub: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    groupName: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
    groupStandard: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    groupLine: { flex: 1, height: 1 },
});

const cardStyles = StyleSheet.create({
    card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
    subjectCard: { padding: 14 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 14 },
    leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold', color: '#fff' },
    divisionName: { fontSize: 13.5, fontFamily: 'Poppins_700Bold' },
    standardName: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
    badgeText: { fontSize: 9, fontFamily: 'Poppins_700Bold' },
    countText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    goBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    bottomInfo: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, borderTopWidth: 1 },
    infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    infoLabel: { fontSize: 10.5, fontFamily: 'Poppins_400Regular' },
    infoValue: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold' },
    infoValueMuted: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', fontStyle: 'italic' },
    subjectsLabel: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, paddingVertical: 8 },
    subjectBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, marginTop: 12 },
    subjectBadgeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
