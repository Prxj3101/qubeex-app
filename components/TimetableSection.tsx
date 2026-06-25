// ─────────────────────────────────────────────────────────────────────────────
// TimetableSection.tsx
// Drop-in replacement for the timetable Card inside the Batch tab in courses.tsx
// Usage: <TimetableSection theme={theme} isDark={isDark} />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// ── Types ────────────────────────────────────────────────────────────────────

interface TimeSlot {
    subject: string;   // e.g. "DC", "SMA", "Major Project 2"
    room?: string;     // e.g. "B-302"
    type?: 'lab' | 'lecture' | 'project' | 'break' | 'free'; // for color coding
}

interface TimetableRow {
    day: string;
    short: string;
    slots: (TimeSlot | null)[];  // null = empty/break cell
}

// ── Data ─────────────────────────────────────────────────────────────────────

const TIME_COLS = [
    '8:45–9:45',
    '9:45–10:45',
    '11:00–12:00',
    '12:00–1:00',
    '1:30–2:30',
    '2:30–3:30',
    '3:30–4:30',
];

const TIMETABLE: TimetableRow[] = [
    {
        day: 'Monday', short: 'MON',
        slots: [
            { subject: 'DLL 1', type: 'lab' },
            { subject: 'DCL 2 / SMAL 3', type: 'lab' },
            { subject: 'DC', room: 'B-303', type: 'lecture' },
            { subject: 'PM', room: 'B-303', type: 'lecture' },
            { subject: 'SMA', room: 'B-302', type: 'lecture' },
            { subject: 'SMA', room: 'B-302', type: 'lecture' },
            { subject: 'Improvement / Mentoring', type: 'free' },
        ],
    },
    {
        day: 'Tuesday', short: 'TUE',
        slots: [
            { subject: 'SMAL 1', type: 'lab' },
            { subject: 'SMAL 1', type: 'lab' },
            { subject: 'PM', room: 'B-303', type: 'lecture' },
            { subject: 'PM', room: 'B-303', type: 'lecture' },
            { subject: 'DLL 2', type: 'lab' },
            { subject: 'DLL 2', type: 'lab' },
            { subject: 'Improvement / Mentoring', type: 'free' },
        ],
    },
    {
        day: 'Wednesday', short: 'WED',
        slots: [
            { subject: 'DC', room: 'B-302', type: 'lecture' },
            { subject: 'SMA', room: 'B-302', type: 'lecture' },
            { subject: 'DL', room: 'B-302', type: 'lecture' },
            { subject: 'DL', room: 'B-302', type: 'lecture' },
            { subject: 'DCL 1', type: 'lab' },
            { subject: 'SMAL 2', type: 'lab' },
            { subject: 'DLL 3', type: 'lab' },
        ],
    },
    {
        day: 'Thursday', short: 'THU',
        slots: [
            { subject: 'DCL 3', type: 'lab' },
            { subject: 'DCL 3', type: 'lab' },
            { subject: 'DL', room: 'B-302', type: 'lecture' },
            { subject: 'DC', room: 'B-302', type: 'lecture' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Improvement / Mentoring', type: 'free' },
        ],
    },
    {
        day: 'Friday', short: 'FRI',
        slots: [
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
            { subject: 'Major Project 2', type: 'project' },
        ],
    },
];

// Subject full names legend
const LEGEND = [
    { short: 'SMA', full: 'Social Media Analytics', teacher: 'Dr. Ashwini Save' },
    { short: 'DL', full: 'Deep Learning', teacher: 'Prof. Sunita Naik' },
    { short: 'DC', full: 'Distributed Computing', teacher: 'Prof. Bhavika Thakur' },
    { short: 'PM', full: 'Project Management', teacher: 'Prof. Akshata Raut' },
];

// ── Color scheme per type ─────────────────────────────────────────────────────

function getSlotColors(type: TimeSlot['type'], isDark: boolean) {
    switch (type) {
        case 'lab':
            return {
                bg: isDark ? '#1A2D1A' : '#DCFCE7',
                border: isDark ? '#22543D' : '#86EFAC',
                text: isDark ? '#4ADE80' : '#166534',
                badge: isDark ? '#166534' : '#BBF7D0',
            };
        case 'project':
            return {
                bg: isDark ? '#1A1040' : '#EDE9FE',
                border: isDark ? '#4C1D95' : '#C4B5FD',
                text: isDark ? '#A78BFA' : '#5B21B6',
                badge: isDark ? '#2D1F50' : '#DDD6FE',
            };
        case 'free':
            return {
                bg: isDark ? '#1E1E1E' : '#F3F4F6',
                border: isDark ? '#374151' : '#D1D5DB',
                text: isDark ? '#6B7280' : '#9CA3AF',
                badge: isDark ? '#374151' : '#E5E7EB',
            };
        default: // lecture
            return {
                bg: isDark ? '#1E1433' : '#EFF6FF',
                border: isDark ? '#3730A3' : '#BFDBFE',
                text: isDark ? '#818CF8' : '#1D4ED8',
                badge: isDark ? '#1E3A8A' : '#DBEAFE',
            };
    }
}

// ── Today highlight ──────────────────────────────────────────────────────────

function getTodayIndex() {
    const d = new Date().getDay(); // 0=Sun,1=Mon...5=Fri,6=Sat
    if (d === 0 || d === 6) return -1;
    return d - 1; // Mon=0, Tue=1, ...
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    theme: {
        bg: string; card: string; cardBorder: string;
        text: string; subText: string; muted: string;
        purple: string; purpleLight: string;
    };
    isDark: boolean;
}

const COL_WIDTH = 96;
const DAY_COL_WIDTH = 46;
const ROW_HEIGHT = 72;
const HEADER_HEIGHT = 44;

export function TimetableSection({ theme, isDark }: Props) {
    const todayIndex = getTodayIndex();
    const [selectedDay, setSelectedDay] = useState(todayIndex >= 0 ? todayIndex : 0);

    const row = TIMETABLE[selectedDay];

    return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>

            {/* ── Header ── */}
            <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                    <Text style={{ fontSize: 16 }}>🗓️</Text>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Timetable</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.purpleLight }]}>
                    <Text style={[styles.badgeText, { color: theme.purple }]}>SEM VIII</Text>
                </View>
            </View>

            {/* ── Day Selector Pills ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dayScrollRow}
                contentContainerStyle={styles.dayScrollContent}
            >
                {TIMETABLE.map((d, i) => {
                    const isToday = i === todayIndex;
                    const isActive = i === selectedDay;
                    return (
                        <TouchableOpacity
                            key={d.short}
                            onPress={() => setSelectedDay(i)}
                            style={[
                                styles.dayPill,
                                isActive
                                    ? { backgroundColor: theme.purple }
                                    : { backgroundColor: theme.bg, borderColor: theme.cardBorder, borderWidth: 1 },
                            ]}
                            activeOpacity={0.8}
                        >
                            <Text style={[
                                styles.dayPillText,
                                { color: isActive ? 'white' : theme.subText },
                            ]}>
                                {d.short}
                            </Text>
                            {isToday && (
                                <View style={[
                                    styles.todayDot,
                                    { backgroundColor: isActive ? 'white' : theme.purple },
                                ]} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* ── Today Label ── */}
            <View style={styles.dayLabelRow}>
                <Text style={[styles.dayLabel, { color: theme.text }]}>
                    {row.day}
                </Text>
                {selectedDay === todayIndex && (
                    <View style={[styles.todayBadge, { backgroundColor: isDark ? '#1A2D3D' : '#DBEAFE' }]}>
                        <Text style={[styles.todayBadgeText, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>Today</Text>
                    </View>
                )}
            </View>

            {/* ── Table ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tableScroll}
                contentContainerStyle={{ paddingBottom: 4 }}
            >
                <View>
                    {/* Time headers */}
                    <View style={styles.headerRow}>
                        {TIME_COLS.map((t, i) => (
                            <View key={i} style={[styles.headerCell, { borderColor: theme.cardBorder }]}>
                                <Text style={[styles.headerText, { color: theme.muted }]}>{t}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Slots */}
                    <View style={styles.slotsRow}>
                        {row.slots.map((slot, i) => {
                            if (!slot) return (
                                <View key={i} style={[styles.slotCell, {
                                    backgroundColor: theme.bg,
                                    borderColor: theme.cardBorder,
                                }]}>
                                    <Text style={{ fontSize: 18 }}>☕</Text>
                                    <Text style={[styles.breakLabel, { color: theme.muted }]}>Break</Text>
                                </View>
                            );

                            const colors = getSlotColors(slot.type, isDark);
                            const typeLabel =
                                slot.type === 'lab' ? 'LAB' :
                                    slot.type === 'project' ? 'PROJ' :
                                        slot.type === 'free' ? 'OPT' : 'LEC';

                            return (
                                <View key={i} style={[styles.slotCell, {
                                    backgroundColor: colors.bg,
                                    borderColor: colors.border,
                                }]}>
                                    {/* Type badge */}
                                    <View style={[styles.typeBadge, { backgroundColor: colors.badge }]}>
                                        <Text style={[styles.typeBadgeText, { color: colors.text }]}>
                                            {typeLabel}
                                        </Text>
                                    </View>

                                    {/* Subject */}
                                    <Text
                                        style={[styles.subjectText, { color: colors.text }]}
                                        numberOfLines={2}
                                    >
                                        {slot.subject}
                                    </Text>

                                    {/* Room */}
                                    {slot.room ? (
                                        <Text style={[styles.roomText, { color: colors.text }]}>
                                            📍 {slot.room}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>

            {/* ── Color Legend ── */}
            <View style={[styles.legendRow, { borderTopColor: theme.cardBorder }]}>
                {[
                    { label: 'Lecture', type: 'lecture' as const },
                    { label: 'Lab', type: 'lab' as const },
                    { label: 'Project', type: 'project' as const },
                    { label: 'Optional', type: 'free' as const },
                ].map(({ label, type }) => {
                    const c = getSlotColors(type, isDark);
                    return (
                        <View key={label} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: c.border }]} />
                            <Text style={[styles.legendText, { color: theme.muted }]}>{label}</Text>
                        </View>
                    );
                })}
            </View>

            {/* ── Subject Full Names ── */}
            <View style={[styles.subjectLegend, { borderTopColor: theme.cardBorder }]}>
                <Text style={[styles.subjectLegendTitle, { color: theme.subText }]}>Subject Key</Text>
                {LEGEND.map((s) => (
                    <View key={s.short} style={styles.subjectLegendRow}>
                        <Text style={[styles.subjectShort, { color: theme.purple }]}>{s.short}</Text>
                        <Text style={[styles.subjectFull, { color: theme.text }]}>{s.full}</Text>
                        <Text style={[styles.subjectTeacher, { color: theme.muted }]}>{s.teacher}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 10,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 99,
    },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Day pills
    dayScrollRow: {
        paddingHorizontal: 16,
    },
    dayScrollContent: {
        gap: 8,
        paddingBottom: 4,
    },
    dayPill: {
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    dayPillText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    todayDot: {
        position: 'absolute',
        bottom: 3,
        width: 4,
        height: 4,
        borderRadius: 99,
    },

    // Day label
    dayLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    dayLabel: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    todayBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 99,
    },
    todayBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Table
    tableScroll: {
        paddingHorizontal: 16,
        marginBottom: 4,
    },
    headerRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 6,
    },
    headerCell: {
        width: COL_WIDTH,
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    headerText: {
        fontSize: 8.5,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    slotsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    slotCell: {
        width: COL_WIDTH,
        height: ROW_HEIGHT,
        borderRadius: 12,
        borderWidth: 1.5,
        padding: 7,
        justifyContent: 'space-between',
    },
    breakLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    typeBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 5,
    },
    typeBadgeText: {
        fontSize: 8,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    subjectText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        lineHeight: 14,
        flex: 1,
    },
    roomText: {
        fontSize: 9,
        fontFamily: 'Poppins_400Regular',
        opacity: 0.8,
    },

    // Legend
    legendRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginTop: 8,
        borderTopWidth: 1,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 99,
    },
    legendText: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
    },

    // Subject key
    subjectLegend: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
        borderTopWidth: 1,
        gap: 6,
    },
    subjectLegendTitle: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    subjectLegendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    subjectShort: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        width: 36,
    },
    subjectFull: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
    },
    subjectTeacher: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
    },
});