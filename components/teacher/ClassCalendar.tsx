import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 92) / 7);

type CalEventType = 'holiday' | 'event' | 'test' | 'termtest' | 'exam' | 'meeting' | 'submission';
interface CalEvent { id: string; date: number; type: CalEventType; label: string; inherited?: boolean }

const CAL_EVENT_CFG: Record<CalEventType, { dot: string; label: string; emoji: string }> = {
    holiday: { dot: '#EF4444', label: 'Holiday', emoji: '🏖️' },
    event: { dot: '#3B82F6', label: 'Event', emoji: '📅' },
    test: { dot: '#8B5CF6', label: 'Test', emoji: '📝' },
    termtest: { dot: '#10B981', label: 'Term Test', emoji: '📋' },
    exam: { dot: '#F59E0B', label: 'Semester Exam', emoji: '🎓' },
    meeting: { dot: '#F97316', label: 'Meeting', emoji: '🤝' },
    submission: { dot: '#0891B2', label: 'Submission', emoji: '📤' },
};
const KNOWN_TYPES = new Set<string>(Object.keys(CAL_EVENT_CFG));
const ALLOWED_TYPES_CLASS_TEACHER: CalEventType[] = ['holiday', 'event', 'test', 'termtest', 'exam', 'meeting', 'submission'];
const ALLOWED_TYPES_SUBJECT_TEACHER: CalEventType[] = ['test', 'submission'];

// Same academic calendar as qubeex-web's ViewTab.tsx `ClassCalendar` — a
// division-scoped calendar (backed by the same `/teacher/campus/feed/events`
// endpoint as the Campus tab's read-only AcademicCalendar) that a class or
// subject teacher can add/remove events on, directly from the class's own
// View tab.
export function ClassCalendar({ divisionId, divisionName, isClassTeacher, isSubjectTeacher }: { divisionId: string; divisionName: string; isClassTeacher: boolean; isSubjectTeacher?: boolean }) {
    const { isDark, accent } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addDate, setAddDate] = useState<number | null>(null);
    const [newLabel, setNewLabel] = useState('');
    const [newType, setNewType] = useState<CalEventType>('test');
    const [saving, setSaving] = useState(false);
    const requestIdRef = useRef(0);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const today = now.getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const canEdit = isClassTeacher || !!isSubjectTeacher;
    const allowedTypes = isClassTeacher ? ALLOWED_TYPES_CLASS_TEACHER : ALLOWED_TYPES_SUBJECT_TEACHER;
    const eventsOn = (d: number) => events.filter((e) => e.date === d);
    const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); setSelectedDate(null); };

    useEffect(() => {
        const requestId = ++requestIdRef.current;
        setLoadingEvents(true);
        api.get('/teacher/campus/feed/events', { params: { year, month, divisionId } })
            .then((res) => {
                if (requestIdRef.current !== requestId) return;
                const data: CalEvent[] = (res.data.data ?? [])
                    .filter((e: { type: string }) => KNOWN_TYPES.has(e.type))
                    .map((e: { id: string; date: number; type: string; label: string }) => ({ id: e.id, date: e.date, type: e.type as CalEventType, label: e.label }));
                setEvents(data);
            })
            .catch(() => {})
            .finally(() => { if (requestIdRef.current === requestId) setLoadingEvents(false); });
    }, [year, month, divisionId]);

    const handleAddEvent = async () => {
        if (!newLabel.trim() || !addDate) return;
        setSaving(true);
        try {
            const dateStr = new Date(Date.UTC(year, month, addDate)).toISOString().split('T')[0];
            const res = await api.post('/teacher/campus/feed/events', {
                type: newType.toUpperCase(), label: newLabel.trim(), date: dateStr, divisionId,
            });
            const e = res.data.data;
            setEvents((prev) => [...prev, { id: e.id, date: e.date, type: newType, label: e.label }]);
            setNewLabel(''); setNewType('test'); setShowAddModal(false);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Alert.alert('Error', msg ?? 'Failed to add event');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteEvent = async (eventId: string) => {
        const remaining = eventsOn(selectedDate ?? 0).filter((e) => e.id !== eventId);
        try {
            await api.delete(`/teacher/campus/feed/events/${eventId}`);
            setEvents((prev) => prev.filter((e) => e.id !== eventId));
            if (remaining.length === 0) setShowEventModal(false);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Alert.alert('Error', msg ?? 'Failed to remove event');
        }
    };

    return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <CalendarIcon size={16} color={text} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                <Text style={[styles.cardTitle, { color: text }]}>{divisionName} Academic Calendar</Text>
                {loadingEvents && <ActivityIndicator size="small" color={subText} />}
            </View>

            <View style={styles.header}>
                <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, { borderColor: cardBorder }]} activeOpacity={0.7}>
                    <ChevronLeft size={18} color={accent.purple} />
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: text }]}>{MONTHS[month]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, { borderColor: cardBorder }]} activeOpacity={0.7}>
                    <ChevronRight size={18} color={accent.purple} />
                </TouchableOpacity>
            </View>

            <View style={styles.dayHeaderRow}>
                {DAYS.map((d, i) => (
                    <Text key={i} style={[styles.dayLabel, { color: i >= 5 ? '#EF4444' : subText }]}>{d}</Text>
                ))}
            </View>

            <View style={styles.grid}>
                {cells.map((d, i) => {
                    if (!d) return <View key={i} style={styles.gridCell} />;
                    const isToday = isCurrentMonth && d === today;
                    const isSelected = d === selectedDate;
                    const evs = eventsOn(d);
                    const isWeekend = (i % 7) >= 5;
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.gridCell,
                                isSelected && { backgroundColor: accent.purpleLight, borderRadius: 99 },
                                isToday && !isSelected && { borderWidth: 1.5, borderColor: accent.purple, borderRadius: 99 },
                            ]}
                            onPress={() => {
                                setSelectedDate(d);
                                if (evs.length > 0) setShowEventModal(true);
                                else if (canEdit) { setAddDate(d); setShowAddModal(true); }
                            }}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.dateNum, {
                                color: isSelected ? accent.purple : isToday ? accent.purple : isWeekend ? '#EF4444' : text,
                                fontFamily: isToday ? 'Poppins_700Bold' : 'Poppins_400Regular',
                            }]}>{d}</Text>
                            {evs.length > 0 && (
                                <View style={styles.dotRow}>
                                    {evs.slice(0, 3).map((ev, di) => (
                                        <View key={di} style={[styles.eventDot, { backgroundColor: CAL_EVENT_CFG[ev.type].dot }]} />
                                    ))}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={[styles.legendRow, { borderTopColor: cardBorder }]}>
                {(Object.keys(CAL_EVENT_CFG) as CalEventType[]).map((type) => (
                    <View key={type} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: CAL_EVENT_CFG[type].dot }]} />
                        <Text style={[styles.legendText, { color: subText }]}>{CAL_EVENT_CFG[type].label}</Text>
                    </View>
                ))}
            </View>
            {canEdit && (
                <Text style={{ fontSize: 9.5, color: subText, opacity: 0.6, textAlign: 'center', marginTop: 8, fontFamily: 'Poppins_400Regular' }}>
                    {isClassTeacher ? 'Tap any date to add an event' : 'Tap any date to add a test'}
                </Text>
            )}

            {/* Events on selected date */}
            <Modal visible={showEventModal} transparent animationType="fade" onRequestClose={() => setShowEventModal(false)}>
                <Pressable style={styles.overlay} onPress={() => setShowEventModal(false)}>
                    <Pressable style={[styles.modalCard, { backgroundColor: cardBg }]} onPress={() => {}}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={[styles.modalTitle, { color: text }]}>📅 {selectedDate} {MONTHS_S[month]}, {year}</Text>
                            <TouchableOpacity onPress={() => setShowEventModal(false)} style={styles.modalCloseIcon}>
                                <X size={14} color={subText} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ gap: 10 }}>
                            {selectedDate != null && eventsOn(selectedDate).map((ev) => {
                                const c = CAL_EVENT_CFG[ev.type];
                                return (
                                    <View key={ev.id} style={[styles.modalEventRow, { backgroundColor: isDark ? '#1A1A1A' : '#F8FAFC', borderLeftColor: c.dot }]}>
                                        <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.modalEventType, { color: c.dot }]}>{c.label}</Text>
                                            <Text style={[styles.modalEventLabel, { color: text }]}>{ev.label}</Text>
                                        </View>
                                        {canEdit && (
                                            <TouchableOpacity onPress={() => handleDeleteEvent(ev.id)} style={styles.modalDeleteBtn}>
                                                <X size={12} color="#EF4444" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                        {canEdit && (
                            <TouchableOpacity
                                onPress={() => { setShowEventModal(false); setAddDate(selectedDate); setShowAddModal(true); }}
                                style={[styles.addAnotherBtn, { borderColor: cardBorder }]}
                            >
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: subText }}>+ Add another event</Text>
                            </TouchableOpacity>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Add event */}
            <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
                <Pressable style={styles.overlay} onPress={() => setShowAddModal(false)}>
                    <Pressable style={[styles.modalCard, { backgroundColor: cardBg }]} onPress={() => {}}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={[styles.modalTitle, { color: text }]}>Add Event — {addDate} {MONTHS_S[month]}</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalCloseIcon}>
                                <X size={14} color={subText} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} style={{ maxHeight: 160 }}>
                            {allowedTypes.map((type) => {
                                const c = CAL_EVENT_CFG[type];
                                const active = newType === type;
                                return (
                                    <TouchableOpacity
                                        key={type}
                                        onPress={() => setNewType(type)}
                                        style={[
                                            styles.typeChip,
                                            { borderColor: active ? c.dot : cardBorder, backgroundColor: active ? c.dot + '20' : 'transparent' },
                                        ]}
                                    >
                                        <Text style={{ fontSize: 13 }}>{c.emoji}</Text>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? c.dot : subText }}>{c.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <TextInput
                            value={newLabel}
                            onChangeText={setNewLabel}
                            placeholder="Event name..."
                            placeholderTextColor={subText}
                            style={[styles.addInput, { color: text, borderColor: cardBorder, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC' }]}
                        />
                        <TouchableOpacity
                            onPress={handleAddEvent}
                            disabled={!newLabel.trim() || saving}
                            style={[styles.addSubmitBtn, { opacity: !newLabel.trim() || saving ? 0.5 : 1 }]}
                        >
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Add Event</Text>}
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    cardTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    navBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
    monthLabel: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    dayHeaderRow: { flexDirection: 'row', marginBottom: 4, width: CELL_SIZE * 7, alignSelf: 'center' },
    dayLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: CELL_SIZE * 7, alignSelf: 'center' },
    gridCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    dateNum: { fontSize: 12, lineHeight: 16 },
    dotRow: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 },
    eventDot: { width: 8, height: 8, borderRadius: 99 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, marginTop: 10, borderTopWidth: 1 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 99 },
    legendText: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { width: '100%', borderRadius: 24, padding: 20, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 },
    modalTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold', flex: 1 },
    modalCloseIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
    modalEventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderLeftWidth: 4 },
    modalEventType: { fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', opacity: 0.85 },
    modalEventLabel: { fontSize: 12.5, fontFamily: 'Poppins_700Bold' },
    modalDeleteBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    addAnotherBtn: { marginTop: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
    addInput: { height: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 12.5, fontFamily: 'Poppins_400Regular', marginTop: 12 },
    addSubmitBtn: { height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DA7756', marginTop: 10 },
});
