// ─────────────────────────────────────────────────────────────────────────────
// LiveTimetable.tsx
// The published, structured timetable (built in Timetable Studio on the web), for the
// student Class tab and the teacher's class detail screen. Read-only.
//
//   <LiveTimetableCard role="student" ... fallback={<OldImageCard />} />   → a whole card
//   <LiveTimetable role="teacher" divisionId=... fallback={<ImageBlock />} /> → just the body
//
// When the class has no published timetable the `fallback` (the old uploaded image / empty
// state) is rendered instead, so nothing regresses for classes that haven't moved over yet.
// ─────────────────────────────────────────────────────────────────────────────

import api from '@/lib/api';
import { Calendar, ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ── Types (mirror GET /student/timetable/me and /teacher/timetable/division/:id) ─

type SessionStatus = 'NORMAL' | 'CANCELLED' | 'CHANGED' | 'SUBSTITUTED' | 'COVERING' | 'REASSIGNED';

interface Slot { id: string; name: string; order: number; startMinute: number; endMinute: number; kind: string }
interface Session {
    date: string; dayOfWeek: number; slotId: string; slotName: string; startMinute: number; endMinute: number;
    divisionId: string; divisionName: string; sessionTypeName: string; sessionKind: string; color: string | null;
    subjectName: string | null; title: string | null; teacherName: string | null; roomName: string | null; roomIsLab?: boolean;
    status: SessionStatus; note: string | null; originalTeacherName: string | null; originalSubjectName: string | null;
}
interface WeekData {
    published: boolean;
    weekStart: string;
    today: string;
    slots: Slot[];
    days: { date: string; dayOfWeek: number; isWorkingDay: boolean; sessions: Session[] }[];
    current: Session | null;
    next: Session | null;
    academicYear: { label: string; isCurrent: boolean };
}

export interface LiveTimetableTheme {
    card: string; cardBorder: string; text: string; subText: string; muted: string; purple: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtTime(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
const titleOf = (s: Session) => s.subjectName ?? s.title ?? s.sessionTypeName;

function badgeOf(s: Session, isDark: boolean): { text: string; fg: string; bg: string } | null {
    const t = (fg: string, bgL: string, bgD: string) => ({ fg, bg: isDark ? bgD : bgL });
    switch (s.status) {
        case 'CANCELLED': return { text: 'Cancelled', ...t('#DC2626', '#FEE2E2', '#2B0D0D') };
        case 'CHANGED': return { text: 'Changed', ...t('#D97706', '#FEF3C7', '#2D2010') };
        case 'SUBSTITUTED': return { text: s.teacherName ? `Substitute: ${s.teacherName}` : 'Substitute', ...t('#0284C7', '#E0F2FE', '#0B2233') };
        case 'COVERING': return { text: 'Substitute duty', ...t('#7C3AED', '#EDE9FE', '#2D1F50') };
        case 'REASSIGNED': return { text: 'Reassigned', ...t('#71717A', '#F4F4F5', '#1F1F22') };
        default: return null;
    }
}

// Android renders extra font padding above/below glyphs; tight stacks need it off (see CLAUDE.md).
const noPad = { includeFontPadding: false } as const;

// ── Session card (day list) ──────────────────────────────────────────────────

function SessionCard({ s, theme, isDark, now, next }: { s: Session; theme: LiveTimetableTheme; isDark: boolean; now: boolean; next: boolean }) {
    const badge = badgeOf(s, isDark);
    const dim = s.status === 'CANCELLED' || s.status === 'REASSIGNED';
    const accent = s.color ?? theme.purple;
    const sub = [s.status === 'SUBSTITUTED' ? null : s.teacherName, s.roomName].filter(Boolean).join(' · ');
    return (
        <View style={[styles.sessionCard, {
            backgroundColor: now ? `${accent}18` : theme.card,
            borderColor: now ? accent : theme.cardBorder,
            borderLeftColor: accent,
            opacity: dim ? 0.6 : 1,
        }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
                <Text numberOfLines={2} style={[noPad, styles.sessionTitle, { color: theme.text, textDecorationLine: s.status === 'CANCELLED' ? 'line-through' : 'none' }]}>
                    {titleOf(s)}
                </Text>
                {sub ? <Text numberOfLines={1} style={[noPad, styles.sessionSub, { color: theme.subText }]}>{sub}</Text> : null}
                {s.status === 'CHANGED' && s.originalSubjectName ? <Text style={[noPad, styles.sessionNote, { color: theme.muted }]}>was {s.originalSubjectName}</Text> : null}
                {s.status === 'SUBSTITUTED' && s.originalTeacherName ? <Text style={[noPad, styles.sessionNote, { color: theme.muted }]}>instead of {s.originalTeacherName}</Text> : null}
                {s.note ? <Text style={[noPad, styles.sessionNote, { color: theme.muted, fontStyle: 'italic' }]}>{s.note}</Text> : null}
                {badge ? (
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                        <Text style={[noPad, styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
                    </View>
                ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[noPad, styles.slotName, { color: theme.text }]}>{s.slotName}</Text>
                <Text style={[noPad, styles.slotTime, { color: theme.muted }]}>{fmtTime(s.startMinute)}</Text>
                <Text style={[noPad, styles.slotTime, { color: theme.muted }]}>{fmtTime(s.endMinute)}</Text>
                {now ? <Text style={[noPad, styles.nowTag, { color: accent }]}>NOW</Text> : next ? <Text style={[noPad, styles.nowTag, { color: theme.subText }]}>NEXT</Text> : null}
                {s.roomIsLab ? <FlaskConical size={14} color={accent} style={{ marginTop: 6 }} /> : null}
            </View>
        </View>
    );
}

// ── Body ─────────────────────────────────────────────────────────────────────

interface Props {
    role: 'student' | 'teacher';
    divisionId?: string;               // required for role="teacher"
    academicYearId?: string | null;    // a past year picked on the screen; omit/null = the current year
    theme: LiveTimetableTheme;
    isDark: boolean;
    fallback: React.ReactNode;         // shown when there is no published timetable (or it can't be loaded)
    cardChrome?: boolean;              // wrap the live view in its own "Timetable" card (student Class tab)
}

export function LiveTimetable({ role, divisionId, academicYearId, theme, isDark, fallback, cardChrome }: Props) {
    const [data, setData] = useState<WeekData | null>(null);
    const [loading, setLoading] = useState(true);
    const [anchor, setAnchor] = useState<string | undefined>(undefined);   // undefined = this week
    const [mode, setMode] = useState<'day' | 'week'>('day');
    const [dayPick, setDayPick] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [reloadTick, setReloadTick] = useState(0);
    const missingDivision = role === 'teacher' && !divisionId;

    useEffect(() => {
        if (missingDivision) return;
        let cancelled = false;
        const url = role === 'student' ? '/student/timetable/me' : `/teacher/timetable/division/${divisionId}`;
        api.get(url, { params: { ...(anchor ? { date: anchor } : {}), ...(academicYearId ? { academicYearId } : {}) } })
            .then(res => { if (!cancelled) { setData(res.data?.data ?? null); setError(null); } })
            .catch((e: { response?: { data?: { error?: string; message?: string } }; message?: string }) => {
                // Fall back to the image / empty state, but remember why so the screen can say it.
                if (cancelled) return;
                setData(null);
                setError(e.response?.data?.error ?? e.response?.data?.message ?? (e.message === 'Network Error' ? 'The server could not be reached' : e.message) ?? 'Something went wrong');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [role, divisionId, anchor, academicYearId, reloadTick, missingDivision]);

    // Same cadence as the web: pick up published changes and move "now/next" along.
    useEffect(() => {
        const t = setInterval(() => setReloadTick(n => n + 1), 60_000);
        return () => clearInterval(t);
    }, []);

    const dates = useMemo(() => data?.days.map(d => d.date) ?? [], [data]);
    const selected = dayPick && dates.includes(dayPick) ? dayPick : data && dates.includes(data.today) ? data.today : dates[0] ?? null;
    const day = data?.days.find(d => d.date === selected);

    const chrome = (body: React.ReactNode) => (cardChrome ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.cardHeader}>
                <Calendar size={16} color={theme.purple} />
                <Text style={[noPad, { fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }]}>Timetable</Text>
            </View>
            {body}
        </View>
    ) : <>{body}</>);

    if (missingDivision) return <>{fallback}</>;
    if (loading && !data) {
        return chrome(<View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator size="small" color={theme.purple} /></View>);
    }
    // Nothing published for this class (and we're on the current week) → the old image / empty state.
    const hasAny = !!data && data.published;
    if (!hasAny) {
        return (
            <>
                {error ? (
                    <View style={[styles.errorBox, { backgroundColor: isDark ? '#2D2010' : '#FEF3C7', borderColor: isDark ? '#5C4310' : '#FCD34D' }]}>
                        <Text style={[noPad, styles.errorText, { color: isDark ? '#FCD34D' : '#92400E' }]}>Couldn&apos;t load the live timetable: {error}</Text>
                        <TouchableOpacity onPress={() => setReloadTick(n => n + 1)} hitSlop={8}>
                            <Text style={[noPad, styles.errorRetry, { color: isDark ? '#FCD34D' : '#92400E' }]}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
                {fallback}
            </>
        );
    }

    const weekEnd = addDays(data.weekStart, 6);
    const weekLabel = `${dayNum(data.weekStart)} ${monthShort(data.weekStart)} – ${dayNum(weekEnd)} ${monthShort(weekEnd)}`;
    const isToday = (d: string) => d === data.today;
    const curKey = data.current ? `${data.current.date}|${data.current.slotId}` : null;
    const nextKey = data.next ? `${data.next.date}|${data.next.slotId}` : null;

    return chrome(
        <View style={{ paddingBottom: 12 }}>
            {/* Week navigation + Day/Week toggle */}
            <View style={styles.navRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TouchableOpacity onPress={() => setAnchor(addDays(data.weekStart, -7))} style={[styles.navBtn, { borderColor: theme.cardBorder }]} hitSlop={8} accessibilityLabel="Previous week">
                        <ChevronLeft size={16} color={theme.subText} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAnchor(undefined)} hitSlop={6}>
                        <Text style={[noPad, styles.weekLabel, { color: theme.text }]}>{weekLabel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAnchor(addDays(data.weekStart, 7))} style={[styles.navBtn, { borderColor: theme.cardBorder }]} hitSlop={8} accessibilityLabel="Next week">
                        <ChevronRight size={16} color={theme.subText} />
                    </TouchableOpacity>
                </View>
                <View style={[styles.toggle, { backgroundColor: isDark ? '#1F1F1F' : '#F1F0F8' }]}>
                    {(['day', 'week'] as const).map(m => (
                        <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.8}
                            style={[styles.toggleBtn, mode === m && { backgroundColor: theme.card }]}>
                            <Text style={[noPad, styles.toggleText, { color: mode === m ? theme.text : theme.muted }]}>{m === 'day' ? 'Day' : 'Week'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {!data.academicYear.isCurrent && (
                <Text style={[noPad, { marginHorizontal: 14, marginBottom: 6, fontSize: 11, color: '#D97706', fontFamily: 'Poppins_500Medium' }]}>
                    Showing {data.academicYear.label} (past year)
                </Text>
            )}

            {mode === 'day' ? (
                <>
                    {/* Day chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        {data.days.map(d => {
                            const active = d.date === selected;
                            return (
                                <TouchableOpacity key={d.date} onPress={() => setDayPick(d.date)} activeOpacity={0.8}
                                    style={[styles.chip, { borderColor: active ? theme.purple : theme.cardBorder, backgroundColor: active ? `${theme.purple}1F` : 'transparent' }]}>
                                    <Text style={[noPad, styles.chipDay, { color: active ? theme.purple : theme.subText }]}>{DAY_SHORT[d.dayOfWeek]}</Text>
                                    <Text style={[noPad, styles.chipDate, { color: active ? theme.purple : theme.muted }]}>{dayNum(d.date)}</Text>
                                    {isToday(d.date) && <View style={[styles.todayDot, { backgroundColor: theme.purple }]} />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Periods of the selected day */}
                    <View style={{ paddingHorizontal: 14, gap: 8 }}>
                        {data.slots.map(slot => {
                            const list = (day?.sessions ?? []).filter(s => s.slotId === slot.id);
                            if (!list.length) {
                                if (slot.kind !== 'PERIOD') {
                                    return (
                                        <View key={slot.id} style={styles.breakRow}>
                                            <View style={[styles.breakLine, { borderColor: theme.cardBorder }]} />
                                            <Text style={[noPad, { fontSize: 11, color: theme.muted, fontFamily: 'Poppins_500Medium' }]}>
                                                {slot.name} · {fmtTime(slot.startMinute)} – {fmtTime(slot.endMinute)}
                                            </Text>
                                            <View style={[styles.breakLine, { borderColor: theme.cardBorder }]} />
                                        </View>
                                    );
                                }
                                return role === 'student' ? (
                                    <View key={slot.id} style={[styles.freeRow, { borderColor: theme.cardBorder }]}>
                                        <Text style={[noPad, { fontSize: 12, color: theme.muted, fontFamily: 'Poppins_400Regular' }]}>{slot.name} · Free</Text>
                                        <Text style={[noPad, { fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }]}>{fmtTime(slot.startMinute)}</Text>
                                    </View>
                                ) : null;
                            }
                            return list.map(s => (
                                <SessionCard key={`${s.date}-${s.slotId}-${s.divisionId}`} s={s} theme={theme} isDark={isDark}
                                    now={curKey === `${s.date}|${s.slotId}`} next={nextKey === `${s.date}|${s.slotId}`} />
                            ));
                        })}
                    </View>
                </>
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 14 }}>
                    <View>
                        <View style={{ flexDirection: 'row' }}>
                            <View style={styles.gridHeadCell} />
                            {data.days.map(d => (
                                <View key={d.date} style={[styles.gridHeadCell, styles.gridDayCell, isToday(d.date) && { backgroundColor: `${theme.purple}1F` }]}>
                                    <Text style={[noPad, styles.chipDay, { color: isToday(d.date) ? theme.purple : theme.text }]}>{DAY_SHORT[d.dayOfWeek]}</Text>
                                    <Text style={[noPad, styles.chipDate, { color: theme.muted }]}>{dayNum(d.date)}</Text>
                                </View>
                            ))}
                        </View>
                        {data.slots.map(slot => (
                            <View key={slot.id} style={{ flexDirection: 'row' }}>
                                <View style={[styles.gridSlotCell, { borderColor: theme.cardBorder }]}>
                                    <Text style={[noPad, { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.text }]} numberOfLines={1}>{slot.name}</Text>
                                    <Text style={[noPad, { fontSize: 9, color: theme.muted, fontFamily: 'Poppins_400Regular', marginTop: 2 }]}>{fmtTime(slot.startMinute)}</Text>
                                </View>
                                {data.days.map(d => {
                                    const s = d.sessions.find(x => x.slotId === slot.id);
                                    const accent = s?.color ?? theme.purple;
                                    return (
                                        <View key={d.date} style={[styles.gridCell, { borderColor: theme.cardBorder, backgroundColor: slot.kind !== 'PERIOD' ? (isDark ? '#1A1A1A' : '#F6F5FA') : isToday(d.date) ? `${theme.purple}0D` : 'transparent' }]}>
                                            {s ? (
                                                <View style={[styles.gridChip, { backgroundColor: `${accent}22`, borderLeftColor: accent, opacity: s.status === 'CANCELLED' || s.status === 'REASSIGNED' ? 0.55 : 1 }]}>
                                                    <Text numberOfLines={2} style={[noPad, { fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text, textDecorationLine: s.status === 'CANCELLED' ? 'line-through' : 'none' }]}>{titleOf(s)}</Text>
                                                    {s.status === 'SUBSTITUTED' || s.status === 'CHANGED' ? <Text style={[noPad, { fontSize: 8.5, lineHeight: 11, fontFamily: 'Poppins_600SemiBold', color: '#D97706' }]}>{s.status === 'CHANGED' ? 'Changed' : 'Substitute'}</Text> : null}
                                                    {s.roomIsLab ? <FlaskConical size={10} color={accent} style={{ position: 'absolute', right: 3, bottom: 3 }} /> : null}
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

// ── Card wrapper (student Class tab) ─────────────────────────────────────────

/** A full "Timetable" card around the live view. With nothing published it renders `fallback` instead
 *  (an already-complete card), so the old image card is never wrapped in a second card. */
export function LiveTimetableCard(props: Omit<Props, 'cardChrome'>) {
    return <LiveTimetable {...props} cardChrome />;
}

const styles = StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: 8 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
    navBtn: { borderWidth: 1, borderRadius: 10, padding: 5 },
    weekLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', paddingHorizontal: 6 },
    toggle: { flexDirection: 'row', borderRadius: 10, padding: 2 },
    toggleBtn: { paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 4 : 5, borderRadius: 8 },
    toggleText: { fontSize: 11.5, fontFamily: 'Poppins_600SemiBold' },
    chipRow: { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
    chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'android' ? 6 : 7, alignItems: 'center', minWidth: 52 },
    chipDay: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },
    chipDate: { fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins_400Regular' },
    todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
    sessionCard: { flexDirection: 'row', borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 12 },
    sessionTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold' },
    sessionSub: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    sessionNote: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    badge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
    badgeText: { fontSize: 10, lineHeight: 13, fontFamily: 'Poppins_600SemiBold' },
    slotName: { fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },
    slotTime: { fontSize: 10, lineHeight: 14, fontFamily: 'Poppins_400Regular' },
    nowTag: { fontSize: 10, lineHeight: 14, fontFamily: 'Poppins_700Bold', marginTop: 4 },
    breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    breakLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed' },
    freeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    errorBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 14, marginTop: 10, marginBottom: 6 },
    errorText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_400Regular' },
    errorRetry: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', textDecorationLine: 'underline' },
    gridHeadCell: { width: 64, paddingVertical: 6 },
    gridDayCell: { width: 92, alignItems: 'center', borderRadius: 8 },
    gridSlotCell: { width: 64, justifyContent: 'center', paddingRight: 4, borderTopWidth: 1, height: 54 },
    gridCell: { width: 92, height: 54, borderTopWidth: 1, borderLeftWidth: 1, padding: 3 },
    gridChip: { flex: 1, borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3, justifyContent: 'center' },
});
