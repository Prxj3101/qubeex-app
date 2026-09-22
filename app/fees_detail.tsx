import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import * as FileSystem from 'expo-file-system/legacy';
// expo-media-library's newer native module isn't present in the Expo Go
// client (throws "Cannot find native module 'ExpoMediaLibraryNext'" the
// instant it's imported), which would crash this whole screen on load in
// Expo Go. Loaded lazily inside downloadQrCode() instead, where it's the
// only thing that uses it — real builds (dev client / EAS) have the module
// and work exactly as before.
function loadMediaLibrary(): typeof import('expo-media-library') | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-media-library');
    } catch {
        return null;
    }
}
import {
    Building2, ChevronDown, CreditCard, Download, ImagePlus, Landmark, QrCode, Wallet, X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Fee Card color theme (admin-selectable — mirrors web) ────────────────────
// Same exact hex as web on every platform — no per-platform overrides.
const FEE_CARD_THEMES = {
    yellow: { name: 'Yellow', bg: '#FFF9E0', border: '#EEDD9B' },
    green:  { name: 'Pista',  bg: '#F1F6E1', border: '#CBDCA0' },
    blue:   { name: 'Blue',   bg: '#EEF6FB', border: '#CBE2EF' },
    pink:   { name: 'Pink',   bg: '#FCF1F4', border: '#EDCED8' },
} as const;
type FeeCardThemeKey = keyof typeof FEE_CARD_THEMES;

// Fixed status colors used only inside the fee card — always green/red
// regardless of the app's yellow/green/blue/pink theme or dark mode.
const STATUS_FIXED = {
    PAID:    { bg: '#D1FAE5', text: '#047857' },
    PENDING: { bg: '#FEE2E2', text: '#B91C1C' },
};

// ─── Theme (exact match to web globals.css) ───────────────────────────────────

// Per-theme light-mode page background — mirrors app/(tabs)/feed.tsx's LIGHT_BG.
const LIGHT_BG: Record<string, string> = {
    purple: '#FBFBFF', blue: '#F7FBFE', teal: '#F0F7F3', amber: '#FEFBF7',
    rose: '#FBF7F7', indigo: '#F3F7FE', slate: '#FBFEFE',
};

const LIGHT = {
    bg:              '#F3F0FA',   // --background
    card:            '#FFFFFF',   // --card
    cardBorder:      '#C4B5FD80', // --border / 50%
    mutedColor:      '#EDE9FE',   // --muted
    mutedBg:         '#EDE9FE33', // bg-muted/20
    studentHeaderBg: '#FFFFFF',   // bg-white
    text:            '#0F172A',   // --foreground
    muted:           '#64748B',   // --muted-foreground
    purple:          '#7C3AED',   // --purple
    purpleLight:     '#EDE9FE',   // --purple-light
    amber:           '#F59E0B',
    amberLight:      '#FEF3C7',
    green:           '#10B981',
    greenLight:      '#D1FAE5',
    red:             '#EF4444',
    redLight:        '#FEE2E2',
};
const DARK = {
    bg:              '#000000',   // --background
    card:            '#141414',   // --card
    cardBorder:      '#2A2A2A80', // --border / 50%
    mutedColor:      '#2A2A2A',   // --muted
    mutedBg:         '#2A2A2A33', // bg-muted/20
    studentHeaderBg: '#2A2A2A33', // bg-muted/20
    text:            '#F1F5F9',
    muted:           '#94A3B8',   // --muted-foreground
    purple:          '#A78BFA',
    purpleLight:     '#2D1F50',
    amber:           '#FCD34D',
    amberLight:      '#2D2010',
    green:           '#34D399',
    greenLight:      '#0D2B20',
    red:             '#F87171',
    redLight:        '#2B0D0D',
};

// ─── Date helpers (mirrors web exactly) ────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseFlexDate(input: string | null | undefined): Date | null {
    if (!input) return null;
    const str = input.trim();
    if (!str) return null;
    const monthIdx = MONTHS.findIndex(m => new RegExp(`\\b${m.slice(0, 3)}`, 'i').test(str));
    if (monthIdx === -1) return null;
    const nums = str.match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    const day = parseInt(nums[0], 10);
    if (Number.isNaN(day) || day < 1 || day > 31) return null;
    let year = new Date().getFullYear();
    if (nums.length > 1) {
        const y = parseInt(nums[1], 10);
        if (!Number.isNaN(y)) year = y < 100 ? 2000 + y : y;
    }
    const d = new Date(year, monthIdx, day);
    return Number.isNaN(d.getTime()) ? null : d;
}

function isPaidLate(dueDate: string | null | undefined, paidDate: string | null | undefined): boolean {
    const due = parseFlexDate(dueDate);
    const paid = parseFlexDate(paidDate);
    if (!due || !paid) return false;
    return paid.getTime() > due.getTime();
}

// The Late Fee Fine applies once today is strictly after the due date, AND
// either no paid date has been entered yet, or the paid date entered is
// itself after the due date (i.e. actually paid late). Once it has applied
// it stays applied — status/paid-date edits don't clear it unless the paid
// date entered is on or before the due date.
function isLateFeeApplicable(dueDate: string | null | undefined, paidDate: string | null | undefined): boolean {
    const due = parseFlexDate(dueDate);
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (today.getTime() <= due.getTime()) return false;
    if (!paidDate || !paidDate.trim()) return true;
    const paid = parseFlexDate(paidDate);
    if (!paid) return true;
    paid.setHours(0, 0, 0, 0);
    return paid.getTime() > due.getTime();
}

// ─── Data types (mirrors web exactly) ──────────────────────────────────────────

type FeeStructureType = 'REGULAR' | 'ADDON' | 'PENALTY' | 'ONE_TIME' | 'BUS' | 'LATE_FEE';
interface FeeSubItem { id: string; label: string; amount: number; }
interface FeeItem { id: string; label: string; amount: number; subItems: FeeSubItem[]; }
interface FeeStructure { id: string; name: string; type: FeeStructureType; color: string; items: FeeItem[]; }
// Base month definition — no per-student status baked in, that comes from `payments`.
interface FeeMonth { id: string; month: string; dueDate: string; assignedStructureIds: string[]; remark: string; }
interface FeePayment { feeMonthId: string; status: 'PAID' | 'PENDING'; paidDate: string | null; remark: string | null; extraFields: Record<string, string> | null; extraStructureIds: string[] | null; }
type StudentDetailField = {
    id: string;
    kind: 'default' | 'custom';
    defaultKey?: 'name' | 'rollNo' | 'studentId' | 'class' | 'division' | 'bus';
    label: string;
    value?: string;
};
const DEFAULT_STUDENT_FIELDS: StudentDetailField[] = [
    { id: 'f-name', kind: 'default', defaultKey: 'name', label: 'Name' },
    { id: 'f-rollno', kind: 'default', defaultKey: 'rollNo', label: 'Roll No' },
    { id: 'f-studentid', kind: 'default', defaultKey: 'studentId', label: 'Student ID' },
    { id: 'f-class', kind: 'default', defaultKey: 'class', label: 'Class' },
    { id: 'f-division', kind: 'default', defaultKey: 'division', label: 'Division' },
    { id: 'f-bus', kind: 'default', defaultKey: 'bus', label: 'Bus' },
];

interface BankDetails { accountName?: string; accountNumber?: string; ifsc?: string; bankName?: string; branch?: string; upiId?: string; }
const BANK_LABELS: { key: keyof BankDetails; label: string }[] = [
    { key: 'accountName',   label: 'Account Name' },
    { key: 'accountNumber', label: 'Account No.' },
    { key: 'ifsc',          label: 'IFSC' },
    { key: 'bankName',      label: 'Bank' },
    { key: 'branch',        label: 'Branch' },
    { key: 'upiId',         label: 'UPI ID' },
];

function structureTotal(s: FeeStructure) {
    return s.items.reduce((n, item) => {
        const sub = item.subItems.reduce((m, si) => m + si.amount, 0);
        return n + (sub > 0 ? sub : item.amount);
    }, 0);
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function SectionCard({ icon, title, theme, isDark, children }: {
    icon: React.ReactNode;
    title: string;
    theme: typeof LIGHT;
    isDark: boolean;
    children: React.ReactNode;
}) {
    return (
        <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden' }}>
            {/* header — inherits card bg, no tint (same as web) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                {icon}
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{title}</Text>
            </View>
            {/* body — bg-background (same as web) */}
            <View style={{ padding: 14, backgroundColor: theme.bg }}>
                {children}
            </View>
        </View>
    );
}

// ─── Fee Flip Card ────────────────────────────────────────────────────────────

export function FeeFlipCard({
    theme, isDark, selectedMonth, setSelectedMonth, fc, schoolLogoUrl, schoolName, studentName,
    feeStructures, feeMonths, feePayments, studentFields, extraDetailFields, rulesAndRegs,
}: {
    theme: typeof LIGHT;
    isDark: boolean;
    selectedMonth: string | null;
    setSelectedMonth: (id: string | null) => void;
    fc: { name: string; bg: string; border: string };
    schoolLogoUrl: string | null;
    schoolName: string;
    studentName: string;
    feeStructures: FeeStructure[];
    feeMonths: FeeMonth[];
    feePayments: FeePayment[];
    studentFields: StudentDetailField[];
    extraDetailFields: Record<string, string> | null;
    rulesAndRegs: { id: string; text: string }[];
}) {
    const [flipped, setFlipped] = useState(false);
    // Only true for the ~500ms of the actual flip animation. At rest, neither
    // face carries a rotateY transform at all — iOS composites 3D-transformed
    // (rotateY) layers through a different pipeline than plain 2D views, which
    // was subtly shifting the fee card's flat color vs. Android even though
    // the resting rotation was a "no-op" 0deg/180deg. Keeping the transform
    // scoped to only the transition avoids that entirely.
    const [isFlipping, setIsFlipping] = useState(false);
    const anim = useRef(new Animated.Value(0)).current;
    const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

    const toggleItem = (id: string) => {
        setExpandedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const flip = (toBack: boolean) => {
        setIsFlipping(true);
        Animated.timing(anim, { toValue: toBack ? 180 : 0, duration: 500, useNativeDriver: true })
            .start(() => { setFlipped(toBack); setIsFlipping(false); });
    };

    const frontRotate = anim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
    const backRotate  = anim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

    // ── Real-data helpers (mirrors web/app/student/fees/page.tsx) ──────────────
    const getPayment = (feeMonthId: string): FeePayment =>
        feePayments.find(p => p.feeMonthId === feeMonthId) ?? { feeMonthId, status: 'PENDING', paidDate: null, remark: null, extraFields: null, extraStructureIds: null };

    const getStudentDetailValue = (fieldId: string): string => extraDetailFields?.[fieldId] ?? '';

    const monthTotal = (m: FeeMonth) =>
        feeStructures.filter(s => m.assignedStructureIds.includes(s.id)).reduce((n, s) => n + structureTotal(s), 0);

    // If the payment for month `m` is overdue (past due date, no paid date,
    // still Pending, or paid after the due date), the Late Fee Fine structure
    // auto-applies — derived live, not stored.
    const getAutoLateFee = (m: FeeMonth): FeeStructure | null => {
        const payment = getPayment(m.id);
        if (!isLateFeeApplicable(m.dueDate, payment.paidDate)) return null;
        const lateFee = feeStructures.find(s => s.type === 'LATE_FEE');
        if (!lateFee) return null;
        if (m.assignedStructureIds.includes(lateFee.id)) return null;
        if ((payment.extraStructureIds ?? []).includes(lateFee.id)) return null;
        return lateFee;
    };

    // Bus Fee auto-applies only to the months the admin explicitly picked for
    // this student (stored as a JSON array of feeMonth ids), using this
    // student's own Bus Fee amount — bus fee varies per student by pickup
    // location, so it's never the shared structure's own items total.
    const getAutoBusFee = (m: FeeMonth): { structure: FeeStructure; amount: number } | null => {
        const busField = studentFields.find(f => f.kind === 'default' && f.defaultKey === 'bus');
        if (!busField) return null;
        if (getStudentDetailValue(`${busField.id}-enabled`) !== 'true') return null;
        const rawMonths = getStudentDetailValue(`${busField.id}-months`);
        let monthIds: string[] = [];
        if (rawMonths) {
            try {
                const parsed = JSON.parse(rawMonths);
                if (Array.isArray(parsed)) monthIds = parsed.filter((x): x is string => typeof x === 'string');
            } catch { /* ignore malformed value */ }
        }
        if (!monthIds.includes(m.id)) return null;
        const busStructure = feeStructures.find(s => s.type === 'BUS');
        if (!busStructure) return null;
        if (m.assignedStructureIds.includes(busStructure.id)) return null;
        const amount = Number(getStudentDetailValue(`${busField.id}-fee`)) || 0;
        return { structure: busStructure, amount };
    };

    const studentMonthTotal = (m: FeeMonth) => {
        const extraIds = (getPayment(m.id).extraStructureIds ?? []).filter(id => !m.assignedStructureIds.includes(id));
        const extra = feeStructures.filter(s => extraIds.includes(s.id)).reduce((n, s) => n + structureTotal(s), 0);
        const autoLateFee = getAutoLateFee(m);
        const autoBusFee = getAutoBusFee(m);
        return monthTotal(m) + extra + (autoLateFee ? structureTotal(autoLateFee) : 0) + (autoBusFee ? autoBusFee.amount : 0);
    };

    // Fee card itself always uses the admin-selected fee card theme (fc), not
    // the app's light/dark theme — matches web's fee card treatment exactly.
    const cardBase = {
        backgroundColor: fc.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: fc.border,
        overflow: 'hidden' as const,
        // Kept permanently (not toggled per-render) — Android's native view
        // manager can throw "Error while updating property 'backfaceVisibility'"
        // if this key is added/removed across renders instead of staying stable.
        backfaceVisibility: 'hidden' as const,
    };

    const Label10 = ({ children }: { children: string }) => (
        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#000000', letterSpacing: 1, marginBottom: 8 }}>
            {children}
        </Text>
    );

    // ── FRONT ──────────────────────────────────────────────────────────────────
    const Front = (
        <Animated.View
            pointerEvents={!isFlipping && flipped ? 'none' : 'auto'}
            style={[
                cardBase,
                // Front always stays in normal document flow (like web's
                // front face, which keeps its layout box via visibility:hidden
                // rather than display:none) — it's what defines the card's
                // height at all times, front or back, so Back never shrinks
                // the card to its own (shorter) content height.
                isFlipping
                    ? { transform: [{ rotateY: frontRotate }] }
                    : { opacity: flipped ? 0 : 1 },
            ]}>
            {/* Header — school branding, same as web. Logo centered on the
                card; View Back floats top-right, out of flow, so it doesn't
                skew the centering; name sits on its own row below. */}
            <View style={{ gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: fc.border, backgroundColor: fc.bg }}>
                <View style={{ alignItems: 'center' }}>
                    {schoolLogoUrl
                        ? <Image source={{ uri: schoolLogoUrl }} resizeMode="contain" style={{ width: 75, height: 75, borderRadius: 12, backgroundColor: fc.bg }} />
                        : <View style={{ width: 75, height: 75, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                            <ImagePlus size={26} color="#000000" style={{ opacity: 0.3 }} />
                          </View>}
                </View>
                <TouchableOpacity onPress={() => flip(true)}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: fc.border, backgroundColor: fc.bg }}>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>↺ View Back</Text>
                </TouchableOpacity>
                {schoolName
                    ? <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#000000', textAlign: 'center' }}>{schoolName}</Text>
                    : <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: '#000000', opacity: 0.4, textAlign: 'center' }}>School name not added yet</Text>}
            </View>

            {/* Strip — student name's fee card */}
            <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: fc.border }}>
                <Text style={{ fontSize: Platform.OS === 'ios' ? 13 : 12, fontFamily: 'Poppins_700Bold', color: '#000000' }}>{studentName}&apos;s Fee Card</Text>
            </View>

            <View style={{ padding: 14, gap: 16 }}>

                {/* Student Details */}
                <View>
                    <Label10>STUDENT DETAILS</Label10>
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                        {studentFields.map((f, i, arr) => {
                            const isBus = f.kind === 'default' && f.defaultKey === 'bus';
                            const rowStyle = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: fc.border };
                            if (isBus) {
                                const busEnabled = getStudentDetailValue(`${f.id}-enabled`) === 'true';
                                const busNumber = getStudentDetailValue(`${f.id}-number`) || '—';
                                const busFee = getStudentDetailValue(`${f.id}-fee`) || '0';
                                return (
                                    <View key={f.id} style={rowStyle}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>{f.label}</Text>
                                            <View style={{ backgroundColor: busEnabled ? '#D1FAE5' : 'rgba(0,0,0,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: busEnabled ? '#047857' : '#00000099' }}>{busEnabled ? 'On' : 'Off'}</Text>
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: busEnabled ? 0.6 : 0.3 }}>Bus No.</Text>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#000000', opacity: busEnabled ? 1 : 0.3 }}>{busEnabled ? busNumber : '—'}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: busEnabled ? 0.6 : 0.3 }}>Bus Fee ₹</Text>
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#000000', opacity: busEnabled ? 1 : 0.3 }}>{busEnabled ? busFee : '—'}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            }
                            const value = f.kind === 'default'
                                ? f.defaultKey === 'name' ? studentName
                                    : f.defaultKey === 'rollNo' ? (getStudentDetailValue('rollNo') || '—')
                                        : f.defaultKey === 'studentId' ? (getStudentDetailValue('studentId') || '—')
                                            : f.defaultKey === 'class' ? (getStudentDetailValue('class') || '—')
                                                : (getStudentDetailValue('division') || '—')
                                : (getStudentDetailValue(f.id) || '—');
                            const isStudentId = f.kind === 'default' && f.defaultKey === 'studentId';
                            return (
                                <View key={f.id} style={rowStyle}>
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000', width: 80 }}>{f.label}</Text>
                                    <Text style={{ fontSize: 11, fontFamily: isStudentId ? 'RobotoMono_600SemiBold' : 'Poppins_600SemiBold', color: isStudentId ? '#DA7756' : '#000000', flex: 1, textAlign: 'right' }}>{value}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View style={{ height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderTopColor: fc.border }} />

                {/* Monthly Payment Schedule */}
                <View>
                    <Label10>MONTHLY PAYMENT SCHEDULE</Label10>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.6, marginBottom: 8 }}>
                        Tap a month row to view its fee breakdown
                    </Text>
                    {feeMonths.length === 0 ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>No fee months set up yet</Text>
                        </View>
                    ) : (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                        {/* Nested inside a vertical ScrollView (this screen's own,
                            and now the teacher app's detail scroll too, since it
                            reuses this component) — needs nestedScrollEnabled on
                            Android or the outer scroll swallows the horizontal
                            drag instead of scrolling this table. */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} nestedScrollEnabled>
                            <View>
                                {/* Header row */}
                                <View style={{ flexDirection: 'row', backgroundColor: fc.bg, borderBottomWidth: 1, borderBottomColor: fc.border }}>
                                    {[
                                        ['Month', 96], ['Fee Structures', 185], ['Amount (₹)', 80],
                                        ['Due Date', 100], ['Paid Date', 100], ['Status', 100], ['Remark', 90],
                                    ].map(([col, w], i, arr) => (
                                        <Text key={i} style={{ width: w as number, paddingHorizontal: 8, paddingVertical: 8, fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#000000', borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: fc.border }}>{col}</Text>
                                    ))}
                                </View>
                                {/* Body */}
                                <ScrollView style={{ height: 260 }} showsVerticalScrollIndicator nestedScrollEnabled bounces={false}>
                                    {feeMonths.map((m, i, arr) => {
                                        const total    = studentMonthTotal(m);
                                        const assigned = feeStructures.filter(s => m.assignedStructureIds.includes(s.id));
                                        const payment  = getPayment(m.id);
                                        const extraIds = (payment.extraStructureIds ?? []).filter(id => !m.assignedStructureIds.includes(id));
                                        const extraStructures = extraIds.map(id => feeStructures.find(s => s.id === id)).filter((s): s is FeeStructure => !!s);
                                        const autoLateFee = getAutoLateFee(m);
                                        const autoBusFee  = getAutoBusFee(m);
                                        const isSelected = selectedMonth === m.id;
                                        const late = isPaidLate(m.dueDate, payment.paidDate);
                                        return (
                                            <TouchableOpacity
                                                key={m.id}
                                                activeOpacity={0.7}
                                                onPress={() => setSelectedMonth(isSelected ? null : m.id)}
                                                style={{ flexDirection: 'row', borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: fc.border, backgroundColor: isSelected ? `${fc.border}80` : i % 2 === 1 ? fc.bg : 'transparent' }}>
                                                <Text style={{ width: 96,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_600SemiBold', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{m.month}</Text>
                                                <View style={{ width: 185, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center', borderRightWidth: 1, borderRightColor: fc.border }}>
                                                    {assigned.length === 0 && extraStructures.length === 0 && !autoLateFee && !autoBusFee
                                                        ? <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.4 }}>—</Text>
                                                        : null
                                                    }
                                                    {assigned.map(s => (
                                                        <View key={s.id} style={{ backgroundColor: s.color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: s.color }}>{s.name}</Text>
                                                        </View>
                                                    ))}
                                                    {extraStructures.map(s => (
                                                        <View key={s.id} style={{ backgroundColor: s.color + '15', borderWidth: 1, borderColor: s.color + '60', borderStyle: 'dashed', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: s.color }}>{s.name}</Text>
                                                        </View>
                                                    ))}
                                                    {autoLateFee && (
                                                        <View style={{ backgroundColor: autoLateFee.color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: autoLateFee.color }}>{autoLateFee.name}</Text>
                                                        </View>
                                                    )}
                                                    {autoBusFee && (
                                                        <View style={{ backgroundColor: autoBusFee.structure.color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: autoBusFee.structure.color }}>{autoBusFee.structure.name}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_700Bold', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{total > 0 ? `₹${total.toLocaleString()}` : '—'}</Text>
                                                <Text style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{m.dueDate}</Text>
                                                <Text style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: late ? 'Poppins_600SemiBold' : 'Poppins_400Regular', color: late ? '#DC2626' : '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{payment.paidDate || '—'}</Text>
                                                <View style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'flex-start', borderRightWidth: 1, borderRightColor: fc.border }}>
                                                    <View style={{ backgroundColor: payment.status === 'PAID' ? STATUS_FIXED.PAID.bg : STATUS_FIXED.PENDING.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' }}>
                                                        <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_700Bold', color: payment.status === 'PAID' ? STATUS_FIXED.PAID.text : STATUS_FIXED.PENDING.text }}>
                                                            {payment.status === 'PAID' ? '✓ Paid' : '⏳ Pending'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={{ width: 90,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>{payment.remark || '—'}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                    {/* Annual Total row */}
                                    <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: fc.border, backgroundColor: fc.bg }}>
                                        <Text style={{ width: 96,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_700Bold', color: '#000000' }}>Annual Total</Text>
                                        <View style={{ width: 185 }} />
                                        <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_800ExtraBold', color: '#000000' }}>
                                            ₹{feeMonths.reduce((n, m) => n + studentMonthTotal(m), 0).toLocaleString()}
                                        </Text>
                                    </View>
                                </ScrollView>
                            </View>
                        </ScrollView>
                    </View>
                    )}
                </View>

                <View style={{ height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderTopColor: fc.border }} />

                {/* Fee Structure Breakdown */}
                <View>
                    <Label10>
                        {selectedMonth
                            ? `FEE STRUCTURE BREAKDOWN - ${feeMonths.find(m => m.id === selectedMonth)?.month?.toUpperCase()}`
                            : 'FEE STRUCTURE BREAKDOWN'
                        }
                    </Label10>
                    {!selectedMonth ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>Tap a month row to view breakdown</Text>
                        </View>
                    ) : (() => {
                        const month = feeMonths.find(m => m.id === selectedMonth);
                        if (!month) return null;
                        const sharedIds = new Set(month.assignedStructureIds);
                        const extraIds = (getPayment(month.id).extraStructureIds ?? []).filter(id => !sharedIds.has(id));
                        const autoLateFee = getAutoLateFee(month);
                        const autoBusFee  = getAutoBusFee(month);
                        const assigned = feeStructures.filter(s => sharedIds.has(s.id) || extraIds.includes(s.id) || s.id === autoLateFee?.id || s.id === autoBusFee?.structure.id);
                        if (assigned.length === 0) return (
                            <View style={{ paddingVertical: 24, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>No structures assigned to {month.month}</Text>
                            </View>
                        );
                        return (
                            <View style={{ gap: 8 }}>
                                {assigned.map(fs => {
                                    const isAutoBusFee = fs.id === autoBusFee?.structure.id;
                                    const total = isAutoBusFee && autoBusFee ? autoBusFee.amount : structureTotal(fs);
                                    const isExtra = extraIds.includes(fs.id);
                                    const isAutoLateFee = fs.id === autoLateFee?.id;
                                    const tag = isExtra ? 'For you' : (isAutoLateFee || isAutoBusFee) ? 'Auto-applied' : null;
                                    return (
                                        <View key={fs.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: fc.bg }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: fs.color }} />
                                                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>{fs.name}</Text>
                                                {tag && (
                                                    <View style={{ backgroundColor: fs.color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                        <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: fs.color }}>{tag}</Text>
                                                    </View>
                                                )}
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#000000' }}>₹{total.toLocaleString()}</Text>
                                            </View>
                                            {fs.items.map((item) => {
                                                const subTotal = item.subItems.reduce((n, s) => n + s.amount, 0);
                                                const hasSub = item.subItems.length > 0;
                                                const isOpen = expandedItemIds.has(item.id);
                                                return (
                                                    <View key={item.id}>
                                                        <TouchableOpacity
                                                            activeOpacity={hasSub ? 0.6 : 1}
                                                            disabled={!hasSub}
                                                            onPress={() => toggleItem(item.id)}
                                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: fc.border, backgroundColor: fc.bg }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>{item.label}</Text>
                                                                {hasSub && (
                                                                    <ChevronDown size={13} color="#000000" strokeWidth={2.5} style={{ opacity: 0.85, transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                                                                )}
                                                            </View>
                                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>₹{(subTotal || item.amount).toLocaleString()}</Text>
                                                        </TouchableOpacity>
                                                        {hasSub && isOpen && item.subItems.map(si => (
                                                            <View key={si.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 6, borderTopWidth: 1, borderTopColor: fc.border, backgroundColor: 'rgba(255,255,255,0.35)' }}>
                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.65 }}>{si.label}</Text>
                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.65 }}>₹{si.amount.toLocaleString()}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })()}
                </View>

            </View>
        </Animated.View>
    );

    // ── BACK ───────────────────────────────────────────────────────────────────
    const Back = (
        <Animated.View
            pointerEvents={!isFlipping && !flipped ? 'none' : 'auto'}
            style={[
                cardBase,
                // Always absolutely stretched to Front's exact box (top/left/
                // right/bottom: 0), so it never shows at its own shorter
                // content height — matches web's back face treatment.
                { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
                isFlipping
                    ? { transform: [{ rotateY: backRotate }] }
                    : { opacity: flipped ? 1 : 0 },
            ]}>
            <View style={{ gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: fc.border, backgroundColor: fc.bg }}>
                <View style={{ alignItems: 'center' }}>
                    {schoolLogoUrl
                        ? <Image source={{ uri: schoolLogoUrl }} resizeMode="contain" style={{ width: 75, height: 75, borderRadius: 12, backgroundColor: fc.bg }} />
                        : <View style={{ width: 75, height: 75, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                            <ImagePlus size={26} color="#000000" style={{ opacity: 0.3 }} />
                          </View>}
                </View>
                <TouchableOpacity onPress={() => flip(false)}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: fc.border, backgroundColor: fc.bg }}>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>↺ View Front</Text>
                </TouchableOpacity>
                {schoolName
                    ? <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#000000', textAlign: 'center' }}>{schoolName}</Text>
                    : <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: '#000000', opacity: 0.4, textAlign: 'center' }}>School name not added yet</Text>}
            </View>

            {/* Strip — student name's fee card / rules & regulations */}
            <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: fc.border }}>
                <Text style={{ fontSize: Platform.OS === 'ios' ? 13 : 12, fontFamily: 'Poppins_700Bold', color: '#000000' }}>{studentName}&apos;s Fee Card</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.7 }}>Rules & Regulations</Text>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
                {rulesAndRegs.length === 0 ? (
                    <View style={{ paddingVertical: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: fc.border }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>No rules defined</Text>
                    </View>
                ) : rulesAndRegs.map((rule, i) => (
                    <View key={rule.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: fc.border, backgroundColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 12, paddingVertical: 10 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: fc.border }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#000000' }}>{i + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#000000', lineHeight: 19, paddingTop: 2 }}>{rule.text}</Text>
                    </View>
                ))}
            </View>
        </Animated.View>
    );

    return (
        <View style={{ minHeight: 100, transform: [{ perspective: 1000 }] }}>
            {Front}
            {Back}
        </View>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FeesDetail() {
    const { isDark, accent, themeColor } = useTheme();
    const theme = { ...(isDark ? DARK : LIGHT), bg: isDark ? DARK.bg : (LIGHT_BG[themeColor] ?? LIGHT_BG.purple), purple: accent.purple, purpleLight: accent.purpleLight };

    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [feeCardTheme, setFeeCardTheme] = useState<FeeCardThemeKey>('yellow');
    const fc = FEE_CARD_THEMES[feeCardTheme];
    const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
    const [schoolName, setSchoolName] = useState('');

    const [student, setStudent] = useState<{ name: string; rollNo: string; studentId: string; divisionName: string; avatarUrl: string | null } | null>(null);
    const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
    const [feeMonths, setFeeMonths] = useState<FeeMonth[]>([]);
    const [feePayments, setFeePayments] = useState<FeePayment[]>([]);
    const [rulesAndRegs, setRulesAndRegs] = useState<{ id: string; text: string }[]>([]);
    const [studentFields, setStudentFields] = useState<StudentDetailField[]>(DEFAULT_STUDENT_FIELDS);
    const [extraDetailFields, setExtraDetailFields] = useState<Record<string, string> | null>(null);
    const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
    const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
    const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
    const [qrDownloading, setQrDownloading] = useState(false);

    // Real fee data — same two endpoints the web student portal uses:
    // /student/me for identity, /student/fees for the division's fee
    // structure + this student's own payments.
    useEffect(() => {
        Promise.all([
            api.get('/student/me').catch(() => ({ data: { data: null } })),
            api.get('/student/fees').catch(() => ({ data: { data: { structure: null, payments: [] } } })),
        ]).then(([meRes, feesRes]) => {
            const me = meRes.data?.data;
            if (me) {
                setStudent({
                    name: me.user?.name ?? '',
                    rollNo: me.rollNo ?? '—',
                    studentId: me.studentId ?? '—',
                    divisionName: me.division?.name ?? '',
                    avatarUrl: me.avatarUrl ?? null,
                });
            }

            const structure = feesRes.data?.data?.structure;
            setFeeStructures(structure?.feeStructures ?? []);
            setFeeMonths(structure?.feeMonths ?? []);
            setRulesAndRegs(structure?.rulesAndRegs ?? []);
            const t = structure?.feeCardTheme;
            setFeeCardTheme(t && t in FEE_CARD_THEMES ? t as FeeCardThemeKey : 'yellow');
            setSchoolLogoUrl(structure?.schoolLogoUrl ?? null);
            setSchoolName(structure?.schoolName ?? '');
            if (structure?.studentFields && structure.studentFields.length > 0) {
                const hasBus = structure.studentFields.some((f: StudentDetailField) => f.kind === 'default' && f.defaultKey === 'bus');
                setStudentFields(hasBus ? structure.studentFields : [...structure.studentFields, { id: 'f-bus', kind: 'default' as const, defaultKey: 'bus' as const, label: 'Bus' }]);
            } else {
                setStudentFields(DEFAULT_STUDENT_FIELDS);
            }
            setExtraDetailFields(feesRes.data?.data?.extraDetailFields ?? null);
            setFeePayments(feesRes.data?.data?.payments ?? []);
            setBankDetails(structure?.bankDetails ?? null);
            setQrImageUrl(structure?.qrImageUrl ?? null);
        }).finally(() => setLoading(false));
    }, []);

    const downloadQrCode = async () => {
        if (!qrImageUrl) return;
        const MediaLibrary = loadMediaLibrary();
        if (!MediaLibrary) {
            Alert.alert('Not available here', 'Saving to photos needs a full app build — this preview (Expo Go) doesn’t support it.');
            return;
        }
        setQrDownloading(true);
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Allow photo library access to save the QR code.');
                return;
            }
            const dest = (FileSystem.cacheDirectory ?? '') + 'payment-qr.png';
            await FileSystem.downloadAsync(qrImageUrl, dest);
            await MediaLibrary.saveToLibraryAsync(dest);
            Alert.alert('Saved', 'QR code saved to your photos.');
        } catch {
            Alert.alert('Download failed', 'Could not save the QR code. Please try again.');
        } finally {
            setQrDownloading(false);
        }
    };

    const getPayment = (feeMonthId: string): FeePayment =>
        feePayments.find(p => p.feeMonthId === feeMonthId) ?? { feeMonthId, status: 'PENDING', paidDate: null, remark: null, extraFields: null, extraStructureIds: null };

    // Overall paid/pending status tracks only the CURRENT calendar month's fee
    // status (the most recently applicable configured month, at or before
    // "now") — not every month ever added.
    const isPaid = (() => {
        if (feeMonths.length === 0) return false;
        const currentMonthIndex = new Date().getMonth();
        const withIdx = feeMonths
            .map(m => ({ m, idx: MONTHS.indexOf(m.month) }))
            .filter(x => x.idx !== -1);
        if (withIdx.length === 0) return false;
        const pastOrCurrent = withIdx.filter(x => x.idx <= currentMonthIndex).sort((a, b) => b.idx - a.idx)[0];
        const target = pastOrCurrent ?? [...withIdx].sort((a, b) => a.idx - b.idx)[0];
        return getPayment(target.m.id).status === 'PAID';
    })();

    // Division field (see web fees page) is stored combined as e.g. "10-A" —
    // split into Class / Division for the fee card's Student Details rows,
    // and use the raw value as-is for the header line under the name.
    const divisionName = student?.divisionName ?? '';
    const classValue = divisionName.split('-')[0] ?? divisionName;
    const divisionValue = divisionName.split('-')[1] ?? '';

    // The fee card renders Student Details from `studentFields` via a generic
    // `getStudentDetailValue(id)` lookup, so feed the built-in defaults
    // (rollNo/studentId/class/division) through the same `extraDetailFields`
    // map the card already reads, keyed by their well-known ids.
    const mergedDetailFields: Record<string, string> = {
        ...(extraDetailFields ?? {}),
        rollNo: student?.rollNo ?? '—',
        studentId: student?.studentId ?? '—',
        class: classValue || '—',
        division: divisionValue || '—',
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
                <ScreenHeader title="Fee Details" showBack />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
            <ScreenHeader title="Fee Details" showBack />

            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}>

                {/* ── Pay Fees ── */}
                <SectionCard icon={<Landmark size={14} color={theme.muted} />} title="Pay Fees" theme={theme} isDark={isDark}>
                    <View style={{ gap: 16 }}>

                        {/* Bank Details */}
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Building2 size={13} color={theme.muted} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Bank Details</Text>
                            </View>
                            <View style={{ gap: 6 }}>
                                {BANK_LABELS.map(({ key, label }) => (
                                    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{label}</Text>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{bankDetails?.[key] || '—'}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.cardBorder }} />

                        {/* QR Code */}
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <QrCode size={13} color={theme.muted} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>QR Code</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                {qrImageUrl ? (
                                    <TouchableOpacity onPress={() => setQrPreviewOpen(true)} activeOpacity={0.85}
                                        style={{ width: 140, height: 140, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.cardBorder }}>
                                        <Image source={{ uri: qrImageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ width: 140, height: 140, borderRadius: 14, borderWidth: 2, borderColor: theme.cardBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <QrCode size={28} color={theme.muted} strokeWidth={1.5} />
                                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>No QR uploaded</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={{ height: 1, backgroundColor: theme.cardBorder }} />

                        {/* Payment Gateway */}
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <CreditCard size={13} color={theme.muted} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Payment Gateway</Text>
                            </View>
                            <View style={{ paddingVertical: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.cardBorder, borderStyle: 'dashed', alignItems: 'center', gap: 8 }}>
                                <CreditCard size={20} color={theme.muted} strokeWidth={1.5} />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Coming Soon</Text>
                            </View>
                        </View>

                    </View>
                </SectionCard>

                {/* ── Fee Details ── */}
                <SectionCard icon={<Wallet size={14} color={theme.muted} />} title="Fee Details" theme={theme} isDark={isDark}>
                    <View style={{ gap: 12 }}>

                        {/* Student header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: theme.studentHeaderBg, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder }}>
                            <View style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.purple }}>
                                {student?.avatarUrl
                                    ? <Image source={{ uri: student.avatarUrl }} resizeMode="cover" style={{ width: 42, height: 42 }} />
                                    : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: 'white' }}>
                                        {(student?.name ?? '').split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                                    </Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{student?.name ?? '—'}</Text>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {student?.rollNo ?? '—'} · {divisionName || '—'}</Text>
                            </View>
                            <View style={{ backgroundColor: isPaid ? theme.greenLight : theme.redLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: isPaid ? theme.green : theme.red }}>
                                    {isPaid ? '✓ Paid' : '⏳ Pending'}
                                </Text>
                            </View>
                        </View>

                        {/* Flip card */}
                        <FeeFlipCard
                            theme={theme}
                            isDark={isDark}
                            selectedMonth={selectedMonth}
                            setSelectedMonth={setSelectedMonth}
                            fc={fc}
                            schoolLogoUrl={schoolLogoUrl}
                            schoolName={schoolName}
                            studentName={student?.name ?? '—'}
                            feeStructures={feeStructures}
                            feeMonths={feeMonths}
                            feePayments={feePayments}
                            studentFields={studentFields}
                            extraDetailFields={mergedDetailFields}
                            rulesAndRegs={rulesAndRegs}
                        />

                    </View>
                </SectionCard>

            </ScrollView>

            {/* QR Code enlarge + download */}
            <Modal visible={qrPreviewOpen} transparent animationType="fade" onRequestClose={() => setQrPreviewOpen(false)}>
                <TouchableOpacity activeOpacity={1} onPress={() => setQrPreviewOpen(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}}
                        style={{ width: '100%', maxWidth: 340, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.cardBorder, padding: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <QrCode size={14} color={theme.text} />
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>Payment QR Code</Text>
                            </View>
                            <TouchableOpacity onPress={() => setQrPreviewOpen(false)}
                                style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.mutedBg }}>
                                <X size={15} color={theme.muted} />
                            </TouchableOpacity>
                        </View>
                        {qrImageUrl && (
                            <Image source={{ uri: qrImageUrl }} resizeMode="contain"
                                style={{ width: '100%', aspectRatio: 1, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: '#FFFFFF' }} />
                        )}
                        <TouchableOpacity onPress={downloadQrCode} disabled={qrDownloading} activeOpacity={0.85}
                            style={{ marginTop: 16, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: qrDownloading ? 0.6 : 1, backgroundColor: '#DA7756' }}>
                            {qrDownloading
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Download size={15} color="#FFFFFF" />}
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' }}>
                                {qrDownloading ? 'Downloading…' : 'Download QR Code'}
                            </Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
});
