// My Payroll (Profile -> My Payroll): the teacher's own published payslips and,
// when the school tracks staff attendance, their own month of attendance (read
// only) so the LOP on a payslip can be understood day by day. Same data as the
// web's Profile -> My Payroll tab (GET /teacher/payroll/payslips, /attendance).
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, FileText, Fingerprint, Hand, Info, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';
// expo-sharing is a native module - loaded lazily so Expo Go doesn't throw at import (same as teacher_class_detail).
function loadSharing(): typeof import('expo-sharing') | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-sharing');
    } catch {
        return null;
    }
}

type Status = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'PAID_LEAVE' | 'UNPAID_LEAVE';
type DayType = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY';
interface Payslip {
    id: string; grossPay: number; netPay: number; status: 'PENDING' | 'PAID';
    lopDays: number; paidDays: number; basisDays: number;
    payrollRun: { month: string; publishedAt: string };
}
interface Summary { workingDays: number; present: number; late: number; halfDay: number; absent: number; paidLeave: number; unpaidLeave: number; unmarked: number }
interface AttDay { date: string; type: DayType; holidayName: string | null; record: { status: Status; checkIn: string | null; checkOut: string | null; source: string } | null }
type Tracked = {
    tracked: true; month: string; joinedAt: string | null; exitDate: string | null; days: AttDay[];
    summary: Summary | null; lopDays: number; payslip: { lopDays: number; lopSource: string | null } | null;
    rules: { lopEnabled: boolean; officeStart: string; graceMinutes: number; halfDayMinutes: number; lateRuleEnabled: boolean; lateRuleCount: number };
};
type Attendance = { tracked: false } | Tracked;

const STATUS: Record<Status, { code: string; label: string; color: string }> = {
    PRESENT: { code: 'P', label: 'Present', color: '#16a34a' },
    LATE: { code: 'L', label: 'Late', color: '#d97706' },
    HALF_DAY: { code: 'H', label: 'Half day', color: '#ea580c' },
    ABSENT: { code: 'A', label: 'Absent', color: '#dc2626' },
    PAID_LEAVE: { code: 'PL', label: 'Paid leave', color: '#0284c7' },
    UNPAID_LEAVE: { code: 'UL', label: 'Unpaid leave', color: '#be123c' },
};
const SHEET = { paper: '#F5F8EE', head: '#ECF3D0', line: '#BACE85', ink: '#2A3A10', off: '#FFF5F5', today: '#EEF4FF', picked: '#E0E8C8' };
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const shiftMonth = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthName = (month: string) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const monthShort = (month: string) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`; };
const dayLabel = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${WD[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`; };
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const worked = (a?: string | null, b?: string | null) => {
    if (!a || !b) return null;
    const d = mins(b) - mins(a);
    return d > 0 ? `${Math.floor(d / 60)}h ${pad(d % 60)}m` : null;
};
const daysText = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const d10 = (v?: string | null) => (v ? v.slice(0, 10) : null);
/** paise -> "₹1,05,550" / "₹14,747.10" (Indian grouping, no Intl dependency). */
function rupees(paise: number): string {
    const neg = paise < 0;
    const abs = Math.abs(paise);
    const whole = Math.floor(abs / 100);
    const frac = abs % 100;
    const s = String(whole);
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${neg ? '-' : ''}₹${rest ? `${rest},${last3}` : last3}${frac ? `.${pad(frac)}` : ''}`;
}

export default function TeacherPayrollScreen() {
    const { isDark } = useTheme();
    const c = useMemo(() => ({
        bg: isDark ? '#000000' : '#FAF8FF',
        card: isDark ? '#141414' : '#FFFFFF',
        border: isDark ? '#2A2A2A' : '#EDE9FE',
        text: isDark ? '#F1F5F9' : '#0F172A',
        sub: isDark ? '#94A3B8' : '#64748B',
        muted: isDark ? '#1F1F1F' : '#F4F2FA',
    }), [isDark]);

    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [noStaff, setNoStaff] = useState(false);
    const [month, setMonth] = useState<string | null>(null);
    const [att, setAtt] = useState<Attendance | null>(null);
    const [attLoading, setAttLoading] = useState(true);
    const [picked, setPicked] = useState<string | null>(null);
    const [pdfBusy, setPdfBusy] = useState<string | null>(null);

    // State is only set inside the promise callbacks (never synchronously in an effect).
    const loadPayslips = useCallback(() => api.get('/teacher/payroll/payslips').then(
        (res) => {
            const list: Payslip[] = res.data.data ?? [];
            setPayslips(list);
            setNoStaff(false);
            setMonth(m => m ?? list[0]?.payrollRun.month ?? thisMonth());
            setLoading(false);
        },
        (err: { response?: { status?: number } }) => {
            if (err?.response?.status === 404) setNoStaff(true);
            setMonth(m => m ?? thisMonth());
            setLoading(false);
        },
    ), []);

    const loadAttendance = useCallback((m: string) => api.get('/teacher/payroll/attendance', { params: { month: m } }).then(
        (res) => { setAtt(res.data.data); setAttLoading(false); },
        () => { setAtt({ tracked: false }); setAttLoading(false); },
    ), []);

    useEffect(() => { loadPayslips(); }, [loadPayslips]);
    useEffect(() => { if (month && !noStaff) loadAttendance(month); }, [month, noStaff, loadAttendance]);

    const goMonth = (m: string) => {
        if (m === month) return;
        setMonth(m);
        setAttLoading(true);
        setPicked(null);
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPayslips();
        if (month) await loadAttendance(month);
        setRefreshing(false);
    };

    const openPdf = async (p: Payslip) => {
        const Sharing = loadSharing();
        if (!Sharing) { Alert.alert('Needs a full app build', "Opening PDFs isn't available in Expo Go - needs a full app build."); return; }
        setPdfBusy(p.id);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const fileUri = `${FileSystem.cacheDirectory}Payslip_${p.payrollRun.month}.pdf`;
            const dl = await FileSystem.downloadAsync(`${API_BASE_URL}/teacher/payroll/payslips/${p.id}/pdf`, fileUri, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
            if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing not available', 'This device cannot open or share files.'); return; }
            await Sharing.shareAsync(dl.uri, { mimeType: 'application/pdf', dialogTitle: `Payslip ${monthName(p.payrollRun.month)}`, UTI: 'com.adobe.pdf' });
        } catch {
            Alert.alert('Could not open payslip', 'Please try again in a moment.');
        } finally {
            setPdfBusy(null);
        }
    };

    const slip = payslips.find(p => p.payrollRun.month === month) ?? null;
    const showAttendance = !att || att.tracked;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]} edges={['top']}>
            <ScreenHeader title="My Payroll" showBack />
            {loading ? (
                <View style={styles.center}><ActivityIndicator color={c.sub} /></View>
            ) : noStaff ? (
                <View style={[styles.center, { paddingHorizontal: 32 }]}>
                    <Wallet size={26} color={c.sub} />
                    <Text style={[styles.emptyTitle, { color: c.text }]}>Payroll is not set up for you yet</Text>
                    <Text style={[styles.emptySub, { color: c.sub }]}>Once the school adds you to payroll, your payslips will show up here.</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
                >
                    {/* Month chips (one per published payslip) */}
                    {payslips.length > 0 && (
                        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
                            {payslips.map(p => {
                                const on = p.payrollRun.month === month;
                                return (
                                    <TouchableOpacity key={p.id} onPress={() => goMonth(p.payrollRun.month)} activeOpacity={0.8}
                                        style={[styles.chip, { backgroundColor: on ? c.text : c.card, borderColor: on ? c.text : c.border }]}>
                                        <Text style={[styles.chipText, { color: on ? c.card : c.text }]}>{monthShort(p.payrollRun.month)}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    {/* Payslip card */}
                    {slip ? (
                        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                            <View style={styles.rowBetween}>
                                <Text style={[styles.cardLabel, { color: c.sub }]}>{monthName(slip.payrollRun.month).toUpperCase()} PAYSLIP</Text>
                                <View style={[styles.pill, { backgroundColor: slip.status === 'PAID' ? (isDark ? '#052E1B' : '#D1FAE5') : (isDark ? '#3A2A06' : '#FEF3C7') }]}>
                                    <Text style={[styles.pillText, { color: slip.status === 'PAID' ? (isDark ? '#34D399' : '#047857') : (isDark ? '#FBBF24' : '#B45309') }]}>
                                        {slip.status === 'PAID' ? 'Paid' : 'Pending'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={[styles.bigAmount, { color: c.text }]}>{rupees(slip.netPay)}</Text>
                            <Text style={[styles.smallSub, { color: c.sub }]}>take-home</Text>

                            <View style={[styles.statRow, { borderTopColor: c.border }]}>
                                <Stat label="Gross" value={rupees(slip.grossPay)} c={c} />
                                <Stat label="Paid days" value={slip.basisDays ? `${slip.paidDays}/${slip.basisDays}` : String(slip.paidDays)} c={c} />
                                <Stat label="LOP" value={slip.lopDays ? daysText(slip.lopDays) : 'None'} c={c} color={slip.lopDays ? '#dc2626' : undefined} />
                            </View>

                            <TouchableOpacity onPress={() => openPdf(slip)} disabled={pdfBusy === slip.id} activeOpacity={0.85} style={styles.pdfBtn}>
                                {pdfBusy === slip.id ? <ActivityIndicator size="small" color="#fff" /> : <FileText size={15} color="#fff" />}
                                <Text style={styles.pdfBtnText}>{pdfBusy === slip.id ? 'Opening…' : 'Open / share PDF'}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : payslips.length === 0 ? (
                        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, alignItems: 'center', paddingVertical: 26 }]}>
                            <Wallet size={22} color={c.sub} />
                            <Text style={[styles.emptyTitle, { color: c.text, marginTop: 8 }]}>No payslips yet</Text>
                            <Text style={[styles.emptySub, { color: c.sub }]}>Your payslip shows up here as soon as the school publishes payroll.</Text>
                        </View>
                    ) : null}

                    {/* My attendance */}
                    {showAttendance && month && (
                        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, paddingHorizontal: 12 }]}>
                            <View style={styles.rowBetween}>
                                <View style={styles.titleRow}>
                                    <CalendarCheck size={14} color={c.sub} />
                                    <Text style={[styles.cardLabel, { color: c.sub }]}>MY ATTENDANCE</Text>
                                </View>
                                <View style={styles.titleRow}>
                                    <TouchableOpacity onPress={() => goMonth(shiftMonth(month, -1))} style={[styles.arrow, { backgroundColor: c.muted }]} hitSlop={6}>
                                        <ChevronLeft size={16} color={c.text} />
                                    </TouchableOpacity>
                                    <Text style={[styles.monthText, { color: c.text }]}>{monthShort(month)}</Text>
                                    <TouchableOpacity onPress={() => goMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} style={[styles.arrow, { backgroundColor: c.muted, opacity: month >= thisMonth() ? 0.35 : 1 }]} hitSlop={6}>
                                        <ChevronRight size={16} color={c.text} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {attLoading || !att || !att.tracked ? (
                                <View style={{ height: 320, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.sub} /></View>
                            ) : (
                                <AttendanceBody att={att} picked={picked} onPick={setPicked} c={c} isDark={isDark} />
                            )}
                        </View>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

type Colors = { bg: string; card: string; border: string; text: string; sub: string; muted: string };

function Stat({ label, value, c, color }: { label: string; value: string; c: Colors; color?: string }) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={[styles.statValue, { color: color ?? c.text }]} numberOfLines={1}>{value}</Text>
            <Text style={[styles.statLabel, { color: c.sub }]}>{label}</Text>
        </View>
    );
}

function AttendanceBody({ att, picked, onPick, c, isDark }: { att: Tracked; picked: string | null; onPick: (d: string | null) => void; c: Colors; isDark: boolean }) {
    const { summary, rules } = att;
    const joined = d10(att.joinedAt), exit = d10(att.exitDate);
    const today = todayISO();
    const lead = useMemo(() => {
        const [y, m, d] = att.days[0].date.split('-').map(Number);
        return (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday first
    }, [att.days]);
    const cells: (AttDay | null)[] = [...Array(lead).fill(null), ...att.days];
    while (cells.length % 7) cells.push(null);
    const rows: (AttDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    const pickedDay = att.days.find(d => d.date === picked) ?? null;
    const final = !!att.payslip;
    const differs = att.payslip && Math.abs(att.payslip.lopDays - att.lopDays) > 0.001;

    const pills = summary ? [
        { label: 'Present', value: summary.present, color: STATUS.PRESENT.color },
        { label: 'Late', value: summary.late, color: STATUS.LATE.color },
        { label: 'Half day', value: summary.halfDay, color: STATUS.HALF_DAY.color },
        { label: 'Absent', value: summary.absent, color: STATUS.ABSENT.color },
        { label: 'Paid leave', value: summary.paidLeave, color: STATUS.PAID_LEAVE.color },
        { label: 'Unpaid leave', value: summary.unpaidLeave, color: STATUS.UNPAID_LEAVE.color },
        { label: 'Not marked', value: summary.unmarked, color: '#64748b' },
    ].filter(p => p.value > 0 || p.label === 'Present' || p.label === 'Absent') : [];

    const ruleBits = [
        `Office starts ${rules.officeStart}`,
        `${rules.graceMinutes} min grace`,
        `under ${Math.round(rules.halfDayMinutes / 6) / 10}h = half day`,
        ...(rules.lateRuleEnabled ? [`every ${rules.lateRuleCount} lates = ½ day LOP`] : []),
    ];

    const note = final
        ? differs
            ? { tone: 'amber' as const, text: `Your payslip used LOP ${daysText(att.payslip!.lopDays)}, set by the accounts team. Please talk to them if this looks wrong.` }
            : { tone: 'green' as const, text: `Matches your ${monthName(att.month)} payslip.` }
        : { tone: 'grey' as const, text: "This can still change until this month's payroll is published." };
    const noteColors = {
        amber: { bg: isDark ? '#2D2010' : '#FFFBEB', fg: isDark ? '#FCD34D' : '#92400E', bd: isDark ? '#44300F' : '#FDE68A' },
        green: { bg: isDark ? '#052E1B' : '#ECFDF5', fg: isDark ? '#6EE7B7' : '#065F46', bd: isDark ? '#064E3B' : '#A7F3D0' },
        grey: { bg: c.muted, fg: c.sub, bd: c.border },
    }[note.tone];

    return (
        <View style={{ gap: 12, marginTop: 12 }}>
            {/* LOP + summary */}
            <View style={styles.rowBetween}>
                <Text style={[styles.smallSub, { color: c.sub, marginTop: 0 }]}>{summary ? `${summary.workingDays} working days` : ''}</Text>
                <View style={[styles.lopBadge, { backgroundColor: att.lopDays ? (isDark ? '#3B0D0D' : '#FEF2F2') : (isDark ? '#052E1B' : '#ECFDF5') }]}>
                    <Text style={[styles.lopText, { color: att.lopDays ? '#dc2626' : '#059669' }]}>LOP {daysText(att.lopDays)}</Text>
                </View>
            </View>
            <View style={styles.pillWrap}>
                {pills.map(p => (
                    <View key={p.label} style={[styles.sumPill, { borderColor: c.border, backgroundColor: c.muted }]}>
                        <View style={[styles.dot, { backgroundColor: p.color }]} />
                        <Text style={[styles.sumPillText, { color: c.text }]}>{p.label} <Text style={{ color: p.color }}>{p.value}</Text></Text>
                    </View>
                ))}
            </View>

            <View style={[styles.note, { backgroundColor: noteColors.bg, borderColor: noteColors.bd }]}>
                {note.tone === 'green' ? <CheckCircle2 size={13} color={noteColors.fg} style={styles.noteIcon} /> : <Info size={13} color={noteColors.fg} style={styles.noteIcon} />}
                <Text style={[styles.noteText, { color: noteColors.fg }]}>{note.text}</Text>
            </View>

            {/* Register calendar - always the paper look, like the class attendance sheet */}
            <View style={[styles.sheet, { borderColor: SHEET.line }]}>
                <View style={[styles.weekRow, { backgroundColor: SHEET.head, borderBottomColor: SHEET.line }]}>
                    {WEEK.map(w => (
                        <Text key={w} style={[styles.weekText, { color: w === 'Sun' ? '#ef4444' : SHEET.ink }]}>{w}</Text>
                    ))}
                </View>
                {rows.map((row, ri) => (
                    <View key={ri} style={styles.gridRow}>
                        {row.map((d, ci) => {
                            if (!d) return <View key={`e${ri}-${ci}`} style={[styles.cell, { borderColor: SHEET.line + '80' }]} />;
                            const outside = (joined && d.date < joined) || (exit && d.date > exit);
                            const off = d.type !== 'WORKING';
                            const future = d.date > today;
                            const r = d.record;
                            const isPicked = picked === d.date;
                            const bg = isPicked ? SHEET.picked : outside ? '#E9EDDC' : off ? SHEET.off : d.date === today ? SHEET.today : SHEET.paper;
                            return (
                                <TouchableOpacity key={d.date} activeOpacity={0.7} onPress={() => onPick(isPicked ? null : d.date)}
                                    style={[styles.cell, { backgroundColor: bg, borderColor: SHEET.line + '80', opacity: outside ? 0.6 : 1 }, isPicked && { borderWidth: 1.5, borderColor: SHEET.line }]}>
                                    <Text style={[styles.dateNum, { color: off ? '#f87171' : SHEET.ink + '99' }]}>{Number(d.date.slice(8))}</Text>
                                    {r ? (
                                        <Text style={[styles.hand, { color: STATUS[r.status].color, fontSize: STATUS[r.status].code.length > 1 ? 15 : 19, lineHeight: STATUS[r.status].code.length > 1 ? 17 : 21 }]}>
                                            {STATUS[r.status].code}
                                        </Text>
                                    ) : d.type === 'HOLIDAY' ? (
                                        <Text style={[styles.offText, { color: '#f87171' }]}>Hol</Text>
                                    ) : d.type === 'WEEKLY_OFF' ? (
                                        <Text style={[styles.offText, { color: '#fca5a5' }]}>Off</Text>
                                    ) : (
                                        <Text style={[styles.offText, { color: SHEET.line }]}>{future || outside ? '' : '—'}</Text>
                                    )}
                                    {r?.checkIn ? <Text style={[styles.inTime, { color: SHEET.ink + '80' }]}>{r.checkIn}</Text> : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>

            {/* Picked day */}
            {pickedDay && (
                <View style={[styles.dayBox, { borderColor: c.border, backgroundColor: c.muted }]}>
                    <Text style={[styles.dayTitle, { color: c.text }]}>{dayLabel(pickedDay.date)}</Text>
                    {(joined && pickedDay.date < joined) ? <Text style={[styles.daySub, { color: c.sub }]}>Before you joined, not counted</Text>
                        : (exit && pickedDay.date > exit) ? <Text style={[styles.daySub, { color: c.sub }]}>After your last day, not counted</Text>
                        : pickedDay.record ? (
                            <View style={{ gap: 6 }}>
                                <Text style={[styles.dayStatus, { color: STATUS[pickedDay.record.status].color }]}>{STATUS[pickedDay.record.status].label}</Text>
                                <View style={styles.inOutRow}>
                                    <Text style={[styles.daySub, { color: c.sub }]}>In <Text style={{ color: c.text, fontFamily: 'Poppins_600SemiBold' }}>{pickedDay.record.checkIn ?? '—'}</Text></Text>
                                    <Text style={[styles.daySub, { color: c.sub }]}>Out <Text style={{ color: c.text, fontFamily: 'Poppins_600SemiBold' }}>{pickedDay.record.checkOut ?? '—'}</Text></Text>
                                    {worked(pickedDay.record.checkIn, pickedDay.record.checkOut) ? <Text style={[styles.daySub, { color: c.sub }]}>{worked(pickedDay.record.checkIn, pickedDay.record.checkOut)} worked</Text> : null}
                                </View>
                                <View style={styles.titleRow}>
                                    {pickedDay.record.source === 'MANUAL' ? <Hand size={12} color={c.sub} /> : <Fingerprint size={12} color={c.sub} />}
                                    <Text style={[styles.daySub, { color: c.sub }]}>{pickedDay.record.source === 'MANUAL' ? 'Marked by the office' : 'From the attendance machine'}</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[styles.daySub, { color: c.sub }]}>
                                {pickedDay.type === 'HOLIDAY' ? (pickedDay.holidayName ?? 'Holiday')
                                    : pickedDay.type === 'WEEKLY_OFF' ? 'Weekly off'
                                    : pickedDay.date > today ? 'Not yet'
                                    : 'Not marked, counted as present'}
                            </Text>
                        )}
                </View>
            )}

            {/* Legend + rules */}
            <View style={styles.legend}>
                {(Object.keys(STATUS) as Status[]).map(s => (
                    <View key={s} style={styles.legendItem}>
                        <Text style={[styles.legendCode, { color: STATUS[s].color }]}>{STATUS[s].code}</Text>
                        <Text style={[styles.legendText, { color: c.sub }]}>{STATUS[s].label}</Text>
                    </View>
                ))}
            </View>
            <Text style={[styles.rules, { color: c.sub }]}>
                {ruleBits.join(' · ')}. LOP = absent + unpaid leave + half days × ½. Days not marked count as present. Tap a day to see its in / out time.
            </Text>
        </View>
    );
}

const T = { includeFontPadding: false } as const; // Android: no extra glyph padding (see CLAUDE.md)

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    scroll: { paddingTop: 6, paddingHorizontal: 14, paddingBottom: 36, gap: 14 },
    emptyTitle: { ...T, fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_600SemiBold', marginTop: 6, textAlign: 'center' },
    emptySub: { ...T, fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', textAlign: 'center' },

    chip: { paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 6 : 7, borderRadius: 999, borderWidth: 1 },
    chipText: { ...T, fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },

    card: {
        borderRadius: 20, borderWidth: 1, padding: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardLabel: { ...T, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_700Bold', letterSpacing: 0.8 },
    pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    pillText: { ...T, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_600SemiBold' },
    bigAmount: { ...T, fontSize: 30, lineHeight: 36, fontFamily: 'Poppins_700Bold', marginTop: 10 },
    smallSub: { ...T, fontSize: 11.5, lineHeight: 15, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    statValue: { ...T, fontSize: 13.5, lineHeight: 18, fontFamily: 'Poppins_700Bold' },
    statLabel: { ...T, fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    pdfBtn: {
        marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#DA7756', borderRadius: 12, paddingVertical: Platform.OS === 'android' ? 10 : 11,
    },
    pdfBtnText: { ...T, color: '#fff', fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_600SemiBold' },

    arrow: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    monthText: { ...T, fontSize: 12.5, lineHeight: 16, fontFamily: 'Poppins_600SemiBold', minWidth: 54, textAlign: 'center' },
    lopBadge: { paddingHorizontal: 10, paddingVertical: Platform.OS === 'android' ? 4 : 5, borderRadius: 8 },
    lopText: { ...T, fontSize: 12.5, lineHeight: 16, fontFamily: 'Poppins_700Bold' },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    sumPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: Platform.OS === 'android' ? 3 : 4 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    sumPillText: { ...T, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_600SemiBold' },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
    noteIcon: { marginTop: Platform.OS === 'android' ? 1 : 1.5 },
    noteText: { ...T, flex: 1, fontSize: 11.5, lineHeight: 16, fontFamily: 'Poppins_400Regular' },

    sheet: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: SHEET.paper },
    weekRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 6 },
    weekText: { ...T, flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 13, fontFamily: 'Poppins_700Bold', letterSpacing: 0.4 },
    gridRow: { flexDirection: 'row' },
    cell: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
    dateNum: { ...T, position: 'absolute', top: 3, left: 4, fontSize: 9.5, lineHeight: 11, fontFamily: 'Poppins_600SemiBold' },
    hand: { ...T, fontFamily: 'PatrickHand_400Regular', textAlign: 'center', marginTop: Platform.OS === 'android' ? 4 : 2 },
    offText: { ...T, fontSize: 9.5, lineHeight: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
    inTime: { ...T, position: 'absolute', bottom: 3, fontSize: 8, lineHeight: 10, fontFamily: 'Poppins_400Regular' },

    dayBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
    dayTitle: { ...T, fontSize: 13, lineHeight: 17, fontFamily: 'Poppins_700Bold' },
    dayStatus: { ...T, fontSize: 12.5, lineHeight: 16, fontFamily: 'Poppins_600SemiBold' },
    daySub: { ...T, fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_400Regular' },
    inOutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },

    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendCode: { ...T, fontFamily: 'PatrickHand_400Regular', fontSize: 15, lineHeight: 17 },
    legendText: { ...T, fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_400Regular', marginTop: Platform.OS === 'android' ? 1 : 0 },
    rules: { ...T, fontSize: 11, lineHeight: 16, fontFamily: 'Poppins_400Regular' },
});
