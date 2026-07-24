import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import {
    Building2, ChevronDown, CreditCard, Landmark, QrCode, Wallet,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    Animated, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
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
    bg:              '#0F0A1E',   // --background
    card:            '#1A1030',   // --card
    cardBorder:      '#2D1F5080', // --border / 50%
    mutedColor:      '#2D1F50',   // --muted
    mutedBg:         '#2D1F5033', // bg-muted/20
    studentHeaderBg: '#2D1F5033', // bg-muted/20
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

// ─── Data ─────────────────────────────────────────────────────────────────────

const STUDENT = { name: 'Prajwal Jagdish Kotian', rollNo: '09', studentDisplayId: 'STU-009', class: '10', division: 'A', paid: false };

type FeeStructureType = 'REGULAR' | 'ADDON' | 'PENALTY' | 'ONE_TIME';
interface FeeSubItem { id: string; label: string; amount: number; }
interface FeeItem { id: string; label: string; amount: number; subItems: FeeSubItem[]; }
interface FeeStructure { id: string; name: string; type: FeeStructureType; color: string; items: FeeItem[]; }
interface FeeMonth { id: string; month: string; dueDate: string; assignedStructureIds: string[]; remark: string; status: 'PAID' | 'PENDING'; paidDate?: string; }

const FEE_STRUCTURES: FeeStructure[] = [
    {
        id: 'fs1', name: 'Regular Monthly Fee', type: 'REGULAR', color: '#7C3AED', items: [
            { id: 'i1', label: 'Tuition Fee', amount: 6000, subItems: [
                { id: 's1', label: 'Term 1', amount: 2000 },
                { id: 's2', label: 'Term 2', amount: 2000 },
                { id: 's3', label: 'Term 3', amount: 2000 },
            ]},
            { id: 'i2', label: 'Library Fee', amount: 200, subItems: [] },
        ],
    },
    {
        id: 'fs2', name: 'Lab Fee', type: 'ADDON', color: '#DA7756', items: [
            { id: 'i3', label: 'Physics Lab',   amount: 200, subItems: [] },
            { id: 'i4', label: 'Chemistry Lab', amount: 300, subItems: [] },
        ],
    },
];

const FEE_MONTHS: FeeMonth[] = [
    { id: 'm1', month: 'June',      dueDate: '10 Jun 2026', assignedStructureIds: ['fs1', 'fs2'], remark: '', status: 'PAID',    paidDate: '8 Jun 2026'  },
    { id: 'm2', month: 'July',      dueDate: '10 Jul 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm3', month: 'August',    dueDate: '10 Aug 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm4', month: 'September', dueDate: '10 Sep 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm5', month: 'October',   dueDate: '10 Oct 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm6', month: 'November',  dueDate: '10 Nov 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm7', month: 'December',  dueDate: '10 Dec 2026', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm8', month: 'January',   dueDate: '10 Jan 2027', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm9', month: 'February',  dueDate: '10 Feb 2027', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm10', month: 'March',    dueDate: '10 Mar 2027', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm11', month: 'April',    dueDate: '10 Apr 2027', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
    { id: 'm12', month: 'May',      dueDate: '10 May 2027', assignedStructureIds: ['fs1'],         remark: '', status: 'PENDING' },
];

const BANK_DETAILS = [
    { label: 'Account Name', value: 'Greenwood High School' },
    { label: 'Account No.',  value: '1234 5678 9012'        },
    { label: 'IFSC',         value: 'HDFC0001234'           },
    { label: 'Bank',         value: 'HDFC Bank'             },
    { label: 'Branch',       value: 'Andheri West'          },
    { label: 'UPI ID',       value: 'greenwood@hdfcbank'    },
];

const RULES = [
    { id: 'r1', text: 'Fee counter timing: Weekdays 8:30 AM to 1:30 PM, Saturday 8:00 AM to 12:00 noon.' },
    { id: 'r2', text: 'Fees are payable from 1st to 15th of every month. Thereafter the counter will remain closed.' },
    { id: 'r3', text: 'Late fee of ₹100 will be charged after the due date.' },
];

function structureTotal(s: FeeStructure) {
    return s.items.reduce((n, item) => {
        const sub = item.subItems.reduce((m, si) => m + si.amount, 0);
        return n + (sub > 0 ? sub : item.amount);
    }, 0);
}

function monthTotal(m: FeeMonth) {
    return FEE_STRUCTURES.filter(s => m.assignedStructureIds.includes(s.id)).reduce((n, s) => n + structureTotal(s), 0);
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

function FeeFlipCard({ theme, isDark, selectedMonth, setSelectedMonth, fc }: {
    theme: typeof LIGHT;
    isDark: boolean;
    selectedMonth: string | null;
    setSelectedMonth: (id: string | null) => void;
    fc: { name: string; bg: string; border: string };
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
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: fc.border, backgroundColor: fc.bg }}>
                <View>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 13 : 12, fontFamily: 'Poppins_700Bold', color: '#000000' }}>{STUDENT.name}'s Fee Card</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>{STUDENT.class}-{STUDENT.division}</Text>
                </View>
                <TouchableOpacity onPress={() => flip(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: fc.border }}>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>↺ View Back</Text>
                </TouchableOpacity>
            </View>

            <View style={{ padding: 14, gap: 16 }}>

                {/* Student Details */}
                <View>
                    <Label10>STUDENT DETAILS</Label10>
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                        {[
                            { label: 'Name',      value: STUDENT.name             },
                            { label: 'Roll No',   value: STUDENT.rollNo           },
                            { label: 'Student ID', value: STUDENT.studentDisplayId, mono: true },
                            { label: 'Class',     value: STUDENT.class            },
                            { label: 'Division',  value: STUDENT.division         },
                        ].map((f, i, arr) => (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: fc.border }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000', width: 80 }}>{f.label}</Text>
                                <Text style={{ fontSize: 11, fontFamily: f.mono ? 'RobotoMono_600SemiBold' : 'Poppins_600SemiBold', color: f.mono ? '#DA7756' : '#000000', flex: 1, textAlign: 'right' }}>{f.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={{ height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderTopColor: fc.border }} />

                {/* Monthly Payment Schedule */}
                <View>
                    <Label10>MONTHLY PAYMENT SCHEDULE</Label10>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.6, marginBottom: 8 }}>
                        Tap a month row to view its fee breakdown
                    </Text>
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
                            <View>
                                {/* Header row */}
                                <View style={{ flexDirection: 'row', backgroundColor: fc.bg, borderBottomWidth: 1, borderBottomColor: fc.border }}>
                                    {[
                                        ['Month', 80], ['Fee Structures', 140], ['Amount (₹)', 80],
                                        ['Due Date', 100], ['Paid Date', 100], ['Status', 100], ['Remark', 90],
                                    ].map(([col, w], i, arr) => (
                                        <Text key={i} style={{ width: w as number, paddingHorizontal: 8, paddingVertical: 8, fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#000000', borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: fc.border }}>{col}</Text>
                                    ))}
                                </View>
                                {/* Body */}
                                <ScrollView style={{ height: 260 }} showsVerticalScrollIndicator nestedScrollEnabled bounces={false}>
                                    {FEE_MONTHS.map((m, i, arr) => {
                                        const total    = monthTotal(m);
                                        const assigned = FEE_STRUCTURES.filter(s => m.assignedStructureIds.includes(s.id));
                                        const isSelected = selectedMonth === m.id;
                                        return (
                                            <TouchableOpacity
                                                key={m.id}
                                                activeOpacity={0.7}
                                                onPress={() => setSelectedMonth(isSelected ? null : m.id)}
                                                style={{ flexDirection: 'row', borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: fc.border, backgroundColor: isSelected ? `${fc.border}80` : i % 2 === 1 ? fc.bg : 'transparent' }}>
                                                <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_600SemiBold', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{m.month}</Text>
                                                <View style={{ width: 140, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center', borderRightWidth: 1, borderRightColor: fc.border }}>
                                                    {assigned.length === 0
                                                        ? <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#000000', opacity: 0.4 }}>—</Text>
                                                        : assigned.map(s => (
                                                            <View key={s.id} style={{ backgroundColor: s.color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                                                                <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: s.color }}>{s.name}</Text>
                                                            </View>
                                                        ))
                                                    }
                                                </View>
                                                <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_700Bold', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{total > 0 ? `₹${total.toLocaleString()}` : '—'}</Text>
                                                <Text style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{m.dueDate}</Text>
                                                <Text style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular', color: '#000000', borderRightWidth: 1, borderRightColor: fc.border }}>{m.paidDate ?? '—'}</Text>
                                                <View style={{ width: 100, paddingHorizontal: 8, paddingVertical: 5, justifyContent: 'center', borderRightWidth: 1, borderRightColor: fc.border }}>
                                                    <View style={{ backgroundColor: m.status === 'PAID' ? STATUS_FIXED.PAID.bg : STATUS_FIXED.PENDING.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' }}>
                                                        <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_700Bold', color: m.status === 'PAID' ? STATUS_FIXED.PAID.text : STATUS_FIXED.PENDING.text }}>
                                                            {m.status === 'PAID' ? '✓ Paid' : '⏳ Pending'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={{ width: 90,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>{m.remark || '—'}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                    {/* Annual Total row */}
                                    <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: fc.border, backgroundColor: fc.bg }}>
                                        <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_700Bold', color: '#000000' }}>Annual Total</Text>
                                        <View style={{ width: 140 }} />
                                        <Text style={{ width: 80,  paddingHorizontal: 8, paddingVertical: 8, fontSize: Platform.OS === 'ios' ? 12 : 11, fontFamily: 'Poppins_800ExtraBold', color: '#000000' }}>
                                            ₹{FEE_MONTHS.reduce((n, m) => n + monthTotal(m), 0).toLocaleString()}
                                        </Text>
                                    </View>
                                </ScrollView>
                            </View>
                        </ScrollView>
                    </View>
                </View>

                <View style={{ height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderTopColor: fc.border }} />

                {/* Fee Structure Breakdown */}
                <View>
                    <Label10>
                        {selectedMonth
                            ? `FEE STRUCTURE BREAKDOWN - ${FEE_MONTHS.find(m => m.id === selectedMonth)?.month?.toUpperCase()}`
                            : 'FEE STRUCTURE BREAKDOWN'
                        }
                    </Label10>
                    {!selectedMonth ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>Tap a month row to view breakdown</Text>
                        </View>
                    ) : (() => {
                        const month    = FEE_MONTHS.find(m => m.id === selectedMonth);
                        if (!month) return null;
                        const assigned = FEE_STRUCTURES.filter(s => month.assignedStructureIds.includes(s.id));
                        if (assigned.length === 0) return (
                            <View style={{ paddingVertical: 24, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: fc.border, borderStyle: 'dashed' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000' }}>No structures assigned to {month.month}</Text>
                            </View>
                        );
                        return (
                            <View style={{ gap: 8 }}>
                                {assigned.map(fs => {
                                    const total = structureTotal(fs);
                                    return (
                                        <View key={fs.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: fc.border, overflow: 'hidden' }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: fc.bg }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: fs.color }} />
                                                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>{fs.name}</Text>
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
                                                                    <ChevronDown size={11} color="#000000" style={{ opacity: 0.5, transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: fc.border, backgroundColor: fc.bg }}>
                <View>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 13 : 12, fontFamily: 'Poppins_700Bold', color: '#000000' }}>{STUDENT.name}'s Fee Card</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000000' }}>Rules & Regulations</Text>
                </View>
                <TouchableOpacity onPress={() => flip(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: fc.border }}>
                    <Text style={{ fontSize: Platform.OS === 'ios' ? 11 : 10, fontFamily: 'Poppins_600SemiBold', color: '#000000' }}>↺ View Front</Text>
                </TouchableOpacity>
            </View>
            <View style={{ padding: 14, gap: 12 }}>
                {RULES.map((rule, i) => (
                    <View key={rule.id} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#000000', width: 18 }}>{i + 1}.</Text>
                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#000000', lineHeight: 20 }}>{rule.text}</Text>
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
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;

    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [feeCardTheme, setFeeCardTheme] = useState<FeeCardThemeKey>('yellow');
    const fc = FEE_CARD_THEMES[feeCardTheme];

    // Fee card color is admin-selected — fetch the division's chosen theme,
    // silently falling back to yellow if unavailable (mirrors web behaviour).
    useEffect(() => {
        api.get('/student/class')
            .then(r => {
                const divisionId = r.data?.data?.division?.id;
                if (!divisionId) return;
                return api.get(`/admin/campus/divisions/${divisionId}/fee-structure`).then(res => {
                    const t = res.data?.data?.feeCardTheme;
                    if (t && t in FEE_CARD_THEMES) setFeeCardTheme(t as FeeCardThemeKey);
                });
            })
            .catch(() => { /* fall back to default yellow theme */ });
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Fees Detail" showBack />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}>

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
                                {BANK_DETAILS.map(({ label, value }) => (
                                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{label}</Text>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{value || '—'}</Text>
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
                                <View style={{ width: 140, height: 140, borderRadius: 14, borderWidth: 2, borderColor: theme.cardBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <QrCode size={28} color={theme.muted} strokeWidth={1.5} />
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>No QR uploaded</Text>
                                </View>
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
                            <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.purple }}>
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: 'white' }}>
                                    {STUDENT.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }}>{STUDENT.name}</Text>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {STUDENT.rollNo} · {STUDENT.class}-{STUDENT.division}</Text>
                            </View>
                            <View style={{ backgroundColor: STUDENT.paid ? theme.greenLight : theme.redLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: STUDENT.paid ? theme.green : theme.red }}>
                                    {STUDENT.paid ? '✓ Paid' : '⏳ Pending'}
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
                        />

                    </View>
                </SectionCard>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
});
