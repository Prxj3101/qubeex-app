import { InlineWheel } from '@/components/InlineWheel';
import { ClassCalendar } from '@/components/teacher/ClassCalendar';
import { ClassFeed, ClassFeedHandle } from '@/components/teacher/ClassFeed';
import { FlagsSheet } from '@/components/FlagsSheet';
import { Flag as FlagRecord } from '@/data/flags';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName } from '@/lib/displayName';
import api from '@/lib/api';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
    ArrowLeft, BookOpen, Calendar, CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
    Download, Eye, EyeOff, ExternalLink, FileText, Flag, FolderOpen, Heart, MapPin, MessageSquare,
    Moon, Pencil, Plus, Power, PowerOff, RotateCcw, Save, Shield, Sun, Trash2, Trophy, Upload, User,
    Users, X,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

// Loaded lazily — same note as class.tsx / fees_detail.tsx. Expo Go doesn't
// have this native module and throws the instant it's statically imported.
function loadMediaLibrary(): typeof import('expo-media-library') | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-media-library');
    } catch {
        return null;
    }
}
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
    ActivityIndicator, Alert, Animated, BackHandler, Dimensions, Image, Keyboard, LayoutChangeEvent, Modal, Platform, Pressable,
    ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// ── Types — mirrors qubeex-web's DivisionClassPageClient.tsx ───────────────
interface Subject { id: string; name: string; code: string | null; color: string | null; order: number }
interface Assignment {
    id: string;
    subjectId: string | null;
    teacher: { id: string; prefix: string | null; avatarUrl?: string | null; user: { id: string; name: string | null } };
    subject: { id: string; name: string; color: string | null } | null;
}
interface Division {
    id: string; name: string; capacity: number | null;
    standard: { id: string; name: string };
    subjects: Subject[];
    assignments: Assignment[];
    timetableUrl: string | null;
}

// ── Manage tab — mirrors qubeex-web's ManageTab.tsx ─────────────────────────
interface ManageGuardian { name: string; number: string; relation: string }
interface ManageStudent {
    id: string;
    studentId: string;
    rollNo: string | null;
    avatarUrl: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    hasLoggedIn: boolean;
    user: { id: string; name: string | null; email: string; mustChangePassword: boolean };
    phone: string | null;
    dob: string | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    country: string | null;
    houseColor: string | null;
    bloodGroup: string | null;
    aadharNo: string | null;
    panNo: string | null;
    emergencyContact: string | null;
    religion: string | null;
    category: string | null;
    nationality: string | null;
    admissionYear: string | null;
    guardians: ManageGuardian[] | null;
    tempPassword: string | null;
    joinedAt: string;
}
interface ManageStudentStats {
    attendance: { present: number; total: number; pct: number | null };
    score: { pct: number | null };
    classRank: number | null;
}
// ── Manage tab — Report (Flags & Warnings), mirrors web's FlagItem/FlagsBoard/
// ReportStudentModal exactly: same categories, same YELLOW/RED card + LOW/
// MEDIUM/HIGH severity, same fields, same /remarks + /reports/:id/edit
// endpoints (GET/list returns lowercase type/severity, POST/PATCH expect
// uppercase - the backend does that translation, not us).
interface FlagAttachment { url: string; name: string; type: string }
interface FlagItem {
    id: string; studentId: string; studentName: string;
    type: 'yellow' | 'red'; severity: 'low' | 'medium' | 'high';
    category: string; title: string; detail: string; date: string;
    subject?: string; reportedBy: string; role: string;
    status: 'open' | 'under_review' | 'resolved' | 'rejected' | 'appealed';
    actionTaken?: string; attachments: FlagAttachment[];
    reviewRemark?: string; reviewedBy?: string;
    canEdit: boolean;
}
const REPORT_CATEGORIES = ['Attendance', 'Discipline', 'Poor Performance', 'Assignment Not Submitted', 'Misconduct', 'Other'];
interface ManageReportFormState {
    type: 'yellow' | 'red'; category: string; customCategory: string;
    title: string; detail: string; subject: string; actionTaken: string;
}
const MANAGE_GENDERS = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
];
const MANAGE_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MANAGE_CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'];
// Students created without a real email get an auto-generated placeholder
// purely so the account has a unique login identifier — never shown as if it
// were a real address (mirrors web's isPlaceholderEmail).
function isPlaceholderEmail(email: string): boolean { return email.endsWith('@students.qubeex.local'); }
function formatAadhar(val: string): string {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    return (digits.match(/.{1,4}/g) ?? []).join(' ');
}
function formatDob(val: string): string {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
interface LeaderboardEntry {
    id: string; rank: number; name: string; rollNo: string; avatarUrl: string | null;
    attendancePct: number | null; combinedPct: number; offlinePct: number | null; onlinePct: number | null;
}

// ── Attendance tab — mirrors qubeex-web's AttendanceTab.tsx. Web shows the
// daily-marking list and the month sheet side by side (desktop has the
// width); mobile doesn't, so they're separate segments here — Daily, Sheet,
// Overall — same three surfaces, same data, one at a time. ──────────────────
type AttendanceStatus = 'P' | 'A' | 'L' | null;
interface AttendanceStudent {
    id: string; studentId: string; name: string; rollNo: string; avatarUrl: string | null;
    overallPct: number | null;
    cumulativeByMonth?: Record<string, number | null>;
}
const ATT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function attFormatDate(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function attDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function attMakeDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const SUBJECT_PALETTE = ['#DA7756', '#EC4899', '#0891B2', '#7C3AED', '#059669', '#2563EB', '#4F46E5', '#D97706', '#166534', '#E11D48', '#0284C7', '#C026D3', '#EA580C', '#0D9488'];
function hashToIndex(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0; return h; }
function colorForSubject(sub: { id: string; color?: string | null }): string { return sub.color ?? SUBJECT_PALETTE[hashToIndex(sub.id) % SUBJECT_PALETTE.length]; }
function getInitials(name: string) { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

const AVATAR_COLORS = ['#DA7756', '#0891B2', '#059669', '#D97706', '#DC2626', '#2563EB', '#8B5CF6'];
function getAvatarColor(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]; }

// ── Materials & Results — mirrors qubeex-web's ViewTab.tsx ─────────────────
type FeedPostType = 'announcement' | 'notice' | 'material' | 'result';
interface FeedPostLite {
    id: string; type: FeedPostType; title: string;
    subject?: string | null; subjectId?: string | null; createdAt: string;
    attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null;
}
function formatShortDate(iso: string) {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function extOf(name?: string | null) {
    if (!name) return 'FILE';
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toUpperCase() : 'FILE';
}
function isImageAttachment(type?: string | null, name?: string | null) {
    return type?.startsWith('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name ?? '');
}
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const LIGHT = { bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE', text: '#0F172A', subText: '#64748B', muted: '#94A3B8' };
const DARK = { bg: '#000000', card: '#141414', cardBorder: '#2A2A2A', text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B' };
type Theme = typeof LIGHT & { purple: string };

type TabKey = 'view' | 'manage' | 'attendance' | 'marks' | 'fees';

// ── Manage tab — small reusable field components (module-level so they
// don't get recreated, and re-rendering them doesn't depend on the parent's
// own memoization) ───────────────────────────────────────────────────────
function ManageSectionHeader({ icon: Icon, label, editing, saving, onEdit, onSave, onCancel, theme, afterLabel }: {
    icon: ComponentType<{ size?: number; color?: string; style?: object }>;
    label: string; editing: boolean; saving?: boolean;
    onEdit: () => void; onSave: () => void; onCancel: () => void;
    theme: Theme; afterLabel?: ReactNode;
}) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Icon size={13} color={theme.purple} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
            {afterLabel}
            <View style={{ flex: 1 }} />
            {editing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={onCancel} style={{ height: 24, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onSave} disabled={saving} style={{ height: 24, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#DA7756', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity onPress={onEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder }}>
                    <Pencil size={10} color={theme.subText} />
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Edit</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function ManageReadField({ label, value, theme, multiline }: { label: string; value: string; theme: Theme; multiline?: boolean }) {
    return (
        <View>
            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>{label}</Text>
            <View style={{ minHeight: 32, paddingHorizontal: 10, paddingVertical: multiline ? 6 : 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}>{value || '-'}</Text>
            </View>
        </View>
    );
}

function ManageEditField({ label, value, onChange, placeholder, theme, keyboardType, onFieldFocus }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; theme: Theme;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
    // Lets the student-detail panel scroll this field above the keyboard when
    // it's focused, the same way ManageReportForm's fields do — passed the
    // TextInput's own ref (module-level component, so it can't reach the
    // panel's scroll ref/keyboard-height state directly).
    onFieldFocus?: (ref: TextInput | null) => void;
}) {
    // Purple border only while this specific field is focused - matches
    // web's `focus:border-primary/50` (idle fields just use the normal
    // card border, not every field lighting up purple the moment edit mode
    // is on).
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<TextInput>(null);
    return (
        <View>
            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>{label}</Text>
            <TextInput
                ref={inputRef}
                value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted}
                keyboardType={keyboardType}
                textAlignVertical="center"
                includeFontPadding={false}
                onFocus={() => { setFocused(true); onFieldFocus?.(inputRef.current); }}
                onBlur={() => setFocused(false)}
                style={{ height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: focused ? theme.purple : theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}
            />
        </View>
    );
}

// Phone field with a country-code picker - mirrors web's PhoneField exactly:
// same six countries, same per-country max digit length, same "+91 98765..."
// stored format, digits-only input capped at the selected country's max.
const MANAGE_COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', max: 10 },
    { code: '+1', flag: '🇺🇸', max: 10 },
    { code: '+44', flag: '🇬🇧', max: 10 },
    { code: '+61', flag: '🇦🇺', max: 9 },
    { code: '+971', flag: '🇦🇪', max: 9 },
    { code: '+65', flag: '🇸🇬', max: 8 },
];
function parseManagePhone(val: string) {
    const match = (val ?? '').match(/^(\+\d+)\s*(.*)$/);
    return match ? { code: match[1], number: match[2] } : { code: '+91', number: val ?? '' };
}
function ManagePhoneField({ label, value, onChange, theme, onFieldFocus }: {
    label: string; value: string; onChange: (v: string) => void; theme: Theme;
    onFieldFocus?: (ref: TextInput | null) => void;
}) {
    const { code, number } = parseManagePhone(value);
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const active = MANAGE_COUNTRY_CODES.find((c) => c.code === code) ?? MANAGE_COUNTRY_CODES[0];
    const inputRef = useRef<TextInput>(null);
    return (
        <View>
            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>{label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setOpen(true)}
                    style={{ height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{active.flag} {active.code}</Text>
                    <ChevronDown size={10} color={theme.muted} />
                </TouchableOpacity>
                <TextInput
                    ref={inputRef}
                    value={number}
                    onChangeText={(raw) => onChange(`${active.code} ${raw.replace(/\D/g, '').slice(0, active.max)}`)}
                    placeholder="98765 43210" placeholderTextColor={theme.muted}
                    keyboardType="phone-pad"
                    textAlignVertical="center"
                    includeFontPadding={false}
                    onFocus={() => { setFocused(true); onFieldFocus?.(inputRef.current); }}
                    onBlur={() => setFocused(false)}
                    style={{ flex: 1, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: focused ? theme.purple : theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}
                />
            </View>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setOpen(false)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 180, borderRadius: 14, backgroundColor: theme.card, paddingVertical: 6 }}>
                        {MANAGE_COUNTRY_CODES.map((c) => (
                            <TouchableOpacity key={c.code} onPress={() => { onChange(`${c.code} ${number.slice(0, c.max)}`); setOpen(false); }}
                                style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ fontSize: 14 }}>{c.flag}</Text>
                                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: code === c.code ? theme.purple : theme.text }}>{c.code}</Text>
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

function ManageChips({ label, value, options, onChange, theme, activeColor }: {
    label: string; value: string; options: { value: string; label: string }[] | string[]; onChange: (v: string) => void; theme: Theme; activeColor?: string;
}) {
    const normalized = (options as (string | { value: string; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    const color = activeColor ?? theme.purple;
    return (
        <View>
            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {normalized.map((o) => {
                    const active = value === o.value;
                    return (
                        <TouchableOpacity key={o.value} onPress={() => onChange(o.value)}
                            style={{ paddingHorizontal: 10, height: 26, borderRadius: 99, borderWidth: 1, borderColor: active ? color : theme.cardBorder, backgroundColor: active ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : theme.subText }}>{o.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// Report — Flags & Warnings board. Rendered inline (not a full-screen Modal)
// so it sits below the persistent "Students" header, absolutely positioned
// over the same content area the student detail occupies.
function ManageReportBoard({
    theme, isDark, onClose, studentName, flags, loading, onAdd, onEdit, slideX,
}: {
    theme: Theme; isDark: boolean; onClose: () => void; studentName: string;
    flags: FlagItem[]; loading: boolean;
    onAdd: () => void; onEdit: (flag: FlagItem) => void;
    slideX: Animated.Value;
}) {
    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 20, transform: [{ translateX: slideX }] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: Platform.OS === 'android' ? 6.5 : 10.5, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                <TouchableOpacity onPress={onClose} style={[styles.manageBackBtn, { borderColor: theme.cardBorder }]}>
                    <ArrowLeft size={15} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>Flags & Warnings</Text>
                    <Text style={[{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.subText }, Platform.OS === 'android' ? { marginTop: -4 } : undefined]} numberOfLines={1}>{studentName}&apos;s conduct record</Text>
                </View>
                <TouchableOpacity onPress={onAdd} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#DA7756' }}>
                    <Plus size={12} color="#fff" style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Report</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 3, paddingTop: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={{ paddingVertical: 40 }}><ActivityIndicator color={theme.purple} /></View>
                ) : (
                    <FlagsSheet
                        isDark={isDark}
                        data={flags as unknown as FlagRecord[]}
                        onEdit={(f) => onEdit(f as unknown as FlagItem)}
                        appealNote="Discuss with the student directly, or escalate to the admin."
                    />
                )}
            </ScrollView>
        </Animated.View>
    );
}

// Report — add/edit form. Opens as a centered modal dialog (dimmed backdrop +
// rounded card), matching qubeex-web's ReportStudentModal — not the board's
// inline slide-in panel above.
function ManageReportForm({
    theme, isDark, studentName, editing, form, setForm, attachments, setAttachments, uploading, onAttach, submitting, onSubmit, onCancel,
    categoryPickerOpen, setCategoryPickerOpen,
}: {
    theme: Theme; isDark: boolean; studentName: string; editing: FlagItem | null;
    form: ManageReportFormState; setForm: Dispatch<SetStateAction<ManageReportFormState>>;
    attachments: (FlagAttachment & { mimeType: string })[]; setAttachments: Dispatch<SetStateAction<(FlagAttachment & { mimeType: string })[]>>;
    uploading: boolean; onAttach: () => void; submitting: boolean; onSubmit: () => void; onCancel: () => void;
    categoryPickerOpen: boolean; setCategoryPickerOpen: (v: boolean) => void;
}) {
    // Keyboard handling, take three. Deriving the needed shift from the
    // keyboard's *height* (and guessing how much of it the OS had already
    // taken care of by resizing the Modal's own window) never held up on both
    // platforms at once: on Android the activity AND the modal's dialog
    // window both shrink together, so useWindowDimensions() and the overlay's
    // measured height move in lockstep and the "already handled" difference
    // reads as 0 — we'd then push by the full keyboard height on top of a
    // window that had already made room, leaving the gap.
    //
    // So: no height math, no platform assumptions. Measure where the overlay
    // actually ends on screen, take where the keyboard actually starts on
    // screen (endCoordinates.screenY — absolute, in the same space), and the
    // overlap between the two IS the amount hidden, whatever the OS did or
    // didn't do. Then anchor the card just above the keyboard instead of
    // centering it in what's left, so there's no leftover gap underneath it
    // either.
    const { height: windowHeight } = useWindowDimensions();
    const overlayRef = useRef<View>(null);
    const [overlayRect, setOverlayRect] = useState({ y: 0, height: windowHeight });
    const scrollRef = useRef<ScrollView>(null);
    const scrollYRef = useRef(0);
    const kbTopRef = useRef(0);
    const focusedInputRef = useRef<TextInput | null>(null);
    const [kbTop, setKbTop] = useState(0);
    const customCategoryRef = useRef<TextInput>(null);
    const titleRef = useRef<TextInput>(null);
    const detailRef = useRef<TextInput>(null);
    const subjectRef = useRef<TextInput>(null);
    const actionTakenRef = useRef<TextInput>(null);

    const measureOverlay = useCallback(() => {
        overlayRef.current?.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            setOverlayRect((prev) => (prev.y === y && prev.height === h ? prev : { y, height: h }));
        });
    }, []);

    const scrollFieldAboveKeyboard = useCallback(() => {
        const kbY = kbTopRef.current;
        const input = focusedInputRef.current;
        if (!kbY || !input) return;
        input.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            const overflow = (y + h) - (kbY - 12);
            if (overflow > 0) {
                const target = Math.max(0, scrollYRef.current + overflow + 10);
                // Keep the tracked offset honest ourselves — the handlers
                // below only fire for user gestures, not programmatic scrolls.
                scrollYRef.current = target;
                scrollRef.current?.scrollTo({ y: target, animated: true });
            }
        });
    }, []);

    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const settle = Platform.OS === 'android' ? 80 : 0;
        const show = Keyboard.addListener(showEvt, (e) => {
            kbTopRef.current = e.endCoordinates?.screenY ?? 0;
            setKbTop(kbTopRef.current);
            // The OS may resize or pan the modal's window in response, which
            // moves the overlay — re-measure once that has settled before
            // deciding how far the focused field still needs to scroll.
            setTimeout(() => { measureOverlay(); scrollFieldAboveKeyboard(); }, settle);
        });
        const hide = Keyboard.addListener(hideEvt, () => {
            kbTopRef.current = 0;
            setKbTop(0);
            setTimeout(measureOverlay, settle);
        });
        return () => { show.remove(); hide.remove(); };
    }, [measureOverlay, scrollFieldAboveKeyboard]);

    // The overlay can be clipped at BOTH ends, and the previous version only
    // subtracted the bottom one. When the OS responds to the keyboard by
    // panning the modal's window up rather than resizing it, the overlay's
    // measured y goes negative — its bottom then already lines up with the
    // keyboard, so the keyboard overlap computes as 0 and the full overlay
    // height reads as "available", even though the top of that overlay is now
    // sitting off the top of the screen. A bottom-anchored card sized to that
    // bogus height is exactly what hung off the top edge.
    const keyboardOpen = kbTop > 0;
    const offScreenTop = Math.max(0, -overlayRect.y);
    const keyboardOverlap = keyboardOpen
        ? Math.max(0, (overlayRect.y + overlayRect.height) - kbTop)
        : 0;
    const availableHeight = Math.max(0, overlayRect.height - offScreenTop - keyboardOverlap);
    const cardMaxHeight = keyboardOpen
        // 12 to clear the keyboard, 24 of breathing room at the top.
        ? Math.max(120, availableHeight - 36)
        : Math.min(availableHeight * 0.85, availableHeight - 24);

    return (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
        {/* Carries no dynamic padding of its own, so measuring it always
            reflects the OS's real current layout rather than our own applied
            compensation — that's what keeps the overlap math above honest. */}
        <View ref={overlayRef} style={styles.timetableOverlay} onLayout={measureOverlay}>
        {/* Plain absolutely-positioned Pressable behind the card, not a parent
            of it — the card is a sibling drawn on top, so RN's touch hit-test
            never routes card taps through this backdrop's responder at all. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={submitting ? undefined : onCancel} />
        {/* width:'100%' is load-bearing: the overlay above centers its
            children (alignItems:'center'), so without it this wrapper isn't
            stretched and its width becomes content-driven/indefinite — which
            leaves the card's own width:'88%' with no definite parent width to
            resolve against, and Yoga falls back to sizing it by its content.
            That's why the Edit form (pre-filled with real titles, details and
            attachment names) came out wider than the empty Report form.

            With the keyboard up the card is anchored to the bottom of the
            still-visible area (12px above the keyboard) rather than centered
            in it — centering would split the leftover space above and below
            the card, and that space below is exactly the gap between the card
            and the keyboard. */}
        <View style={{
            width: '100%', flex: 1, alignItems: 'center',
            justifyContent: keyboardOpen ? 'flex-end' : 'center',
            paddingBottom: keyboardOpen ? keyboardOverlap + 12 : 0,
        }}>
        <View style={{ width: '88%', maxWidth: 420, maxHeight: cardMaxHeight, flexShrink: 1, flexDirection: 'column', borderRadius: 18, backgroundColor: theme.bg, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{editing ? `Edit Report - ${studentName}` : `Report ${studentName}`}</Text>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.subText, marginTop: 2 }}>
                    {editing ? 'Update the details of this report card.' : `This report will be sent to ${studentName.split(' ')[0]}'s class teacher for review.`}
                </Text>
            </View>

            {/* Plain and stock, exactly like ClassFeed/CampusStaffroom/login:
                "handled" gives tap-on-empty-space its dismiss and leaves taps
                on fields alone, "none" keeps a drag from dismissing. Every
                custom touch view and focus-restore hack that used to live here
                is gone — each one caused a worse problem than it solved (the
                responder-claiming one blocked scrolling outright).

                The scroll offset is only read when a field gets focused, i.e.
                when the list is at rest, so it's recorded at the end of a
                gesture rather than via onScroll/scrollEventThrottle={16} —
                that per-frame JS callback is what made scrolling laggy on
                Android. */}
            <ScrollView ref={scrollRef}
                onScrollEndDrag={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                onMomentumScrollEnd={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Card <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['yellow', 'red'] as const).map((ct) => {
                            const active = form.type === ct;
                            const col = ct === 'yellow' ? '#F59E0B' : '#EF4444';
                            return (
                                <TouchableOpacity key={ct} onPress={() => setForm((f) => ({ ...f, type: ct }))}
                                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', gap: 2, backgroundColor: active ? (isDark ? `${col}22` : `${col}15`) : theme.card, borderColor: active ? col : theme.cardBorder }}>
                                    <Image
                                        source={ct === 'yellow' ? require('../assets/images/Yellowcard.png') : require('../assets/images/Redcard.png')}
                                        style={{ width: 36, height: 36 }}
                                        resizeMode="contain"
                                    />
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: active ? col : theme.text }}>{ct === 'yellow' ? 'Yellow Card' : 'Red Card'}</Text>
                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: active ? col : theme.muted }}>{ct === 'yellow' ? 'Minor / cautionary' : 'Serious / escalated'}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Category <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TouchableOpacity onPress={() => setCategoryPickerOpen(true)}
                        style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}>{form.category}</Text>
                        <ChevronDown size={12} color={theme.muted} />
                    </TouchableOpacity>
                    {form.category === 'Other' && (
                        <TextInput ref={customCategoryRef} onFocus={() => { focusedInputRef.current = customCategoryRef.current; scrollFieldAboveKeyboard(); }} value={form.customCategory} onChangeText={(v) => setForm((f) => ({ ...f, customCategory: v }))}
                            placeholder="Describe the category" placeholderTextColor={theme.muted}
                            textAlignVertical="center" includeFontPadding={false}
                            style={{ height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, marginTop: 8 }} />
                    )}
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Card Title <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput ref={titleRef} onFocus={() => { focusedInputRef.current = titleRef.current; scrollFieldAboveKeyboard(); }} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                        placeholder="Short title" placeholderTextColor={theme.muted}
                        textAlignVertical="center" includeFontPadding={false}
                        style={{ height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }} />
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Incident Details <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput ref={detailRef} onFocus={() => { focusedInputRef.current = detailRef.current; scrollFieldAboveKeyboard(); }} value={form.detail} onChangeText={(v) => setForm((f) => ({ ...f, detail: v }))}
                        placeholder="Describe what happened" placeholderTextColor={theme.muted} multiline numberOfLines={3}
                        style={{ minHeight: 70, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, textAlignVertical: 'top' }} />
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Attachments (optional)</Text>
                    {attachments.length > 0 && (
                        <View style={{ gap: 6, marginBottom: 8 }}>
                            {attachments.map((a, i) => (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg }}>
                                    <FileText size={12} color={theme.muted} />
                                    <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.text }} numberOfLines={1}>{a.name}</Text>
                                    <TouchableOpacity onPress={() => setAttachments((prev) => prev.filter((_, pi) => pi !== i))}>
                                        <X size={13} color={theme.muted} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                    {uploading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, alignSelf: 'flex-start' }}>
                            <ActivityIndicator size="small" color={theme.purple} />
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Uploading...</Text>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={onAttach}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, alignSelf: 'flex-start' }}>
                            <Plus size={12} color={theme.subText} />
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>{attachments.length > 0 ? 'Attach another file' : 'Attach file'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Subject (optional)</Text>
                    <TextInput ref={subjectRef} onFocus={() => { focusedInputRef.current = subjectRef.current; scrollFieldAboveKeyboard(); }} value={form.subject} onChangeText={(v) => setForm((f) => ({ ...f, subject: v }))}
                        placeholder="e.g. Mathematics" placeholderTextColor={theme.muted}
                        textAlignVertical="center" includeFontPadding={false}
                        style={{ height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }} />
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Action Taken (optional)</Text>
                    <TextInput ref={actionTakenRef} onFocus={() => { focusedInputRef.current = actionTakenRef.current; scrollFieldAboveKeyboard(); }} value={form.actionTaken} onChangeText={(v) => setForm((f) => ({ ...f, actionTaken: v }))}
                        placeholder="What action was taken" placeholderTextColor={theme.muted} multiline numberOfLines={2}
                        style={{ minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, textAlignVertical: 'top' }} />
                </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder }}>
                <TouchableOpacity onPress={onCancel} disabled={submitting}
                    style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onSubmit} disabled={submitting || uploading}
                    style={{ flex: 1, height: 38, borderRadius: 10, backgroundColor: '#DA7756', alignItems: 'center', justifyContent: 'center', opacity: submitting || uploading ? 0.6 : 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{submitting ? (editing ? 'Saving…' : 'Submitting…') : (editing ? 'Save Changes' : 'Submit Report')}</Text>
                </TouchableOpacity>
            </View>
        </View>
        </View>
        </View>

        <Modal visible={categoryPickerOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCategoryPickerOpen(false)}>
            <Pressable style={styles.timetableOverlay} onPress={() => setCategoryPickerOpen(false)}>
                <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 220, borderRadius: 14, backgroundColor: theme.card, paddingVertical: 6 }}>
                    {REPORT_CATEGORIES.map((c) => (
                        <TouchableOpacity key={c} onPress={() => { setForm((f) => ({ ...f, category: c })); setCategoryPickerOpen(false); }}
                            style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: form.category === c ? theme.purple : theme.text }}>{c}</Text>
                        </TouchableOpacity>
                    ))}
                </Pressable>
            </Pressable>
        </Modal>
        </Modal>
    );
}

// P/A/L toggle button — mirrors web's StatusBtn.
function AttStatusBtn({ label, active, onPress, disabled }: { label: 'P' | 'A' | 'L'; active: boolean; onPress: () => void; disabled?: boolean }) {
    const cfg = {
        P: { active: '#10B981', inactive: '#94A3B8' },
        A: { active: '#EF4444', inactive: '#94A3B8' },
        L: { active: '#F59E0B', inactive: '#94A3B8' },
    }[label];
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled}
            style={{ width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: active ? cfg.active : '#CBD5E1', backgroundColor: active ? cfg.active : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: active ? '#fff' : '#94A3B8' }}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function TeacherClassDetailScreen() {
    const { divisionId, role, subjectId } = useLocalSearchParams<{ divisionId: string; role?: string; subjectId?: string }>();
    const navigation = useNavigation();
    const isClassTeacher = (role ?? 'class-teacher') === 'class-teacher';
    const { isDark, accent, toggleTheme } = useTheme();
    // Memoized — as a plain object literal this was rebuilt with a new
    // reference on every render, which silently defeated viewPageContent's
    // useMemo below (theme sits in its deps array, so a "changed" theme on
    // every render meant it recomputed — and re-rendered the whole heavy View
    // tab — every time, which is exactly the extra work that was delaying the
    // tab label's color change on Android).
    const theme = useMemo(() => ({ ...(isDark ? DARK : LIGHT), purple: accent.purple }), [isDark, accent.purple]);

    const TABS: { key: TabKey; label: string }[] = isClassTeacher
        ? [{ key: 'view', label: 'View' }, { key: 'manage', label: 'Manage' }, { key: 'attendance', label: 'Attendance' }, { key: 'marks', label: 'Marksheet' }, { key: 'fees', label: 'Fees' }]
        : [{ key: 'view', label: 'View' }, { key: 'marks', label: 'Marksheet' }];

    const [activeTab, setActiveTab] = useState<TabKey>('view');

    // Passed down to ClassFeed so its composer can pin itself above the
    // keyboard by scrolling THIS screen's outer ScrollView — same WhatsApp-
    // style lift as CampusFeed.tsx, just targeting a scroll view this screen
    // owns instead of one ClassFeed owns itself (ClassFeed is only one card
    // among several inside this page's scroll, not the whole page).
    // Student-detail panel (Manage tab) — same "scroll the focused field above
    // the keyboard" idea as ManageReportForm's scrollFieldAboveKeyboard, but
    // this panel is a plain screen-level ScrollView, not one inside a Modal,
    // so it doesn't need any of that component's Modal-specific workarounds —
    // just a ref, a tracked scroll offset, and the live keyboard height.
    const manageDetailScrollRef = useRef<ScrollView>(null);
    const manageDetailScrollYRef = useRef(0);
    const manageKbHeightRef = useRef(0);
    const manageFocusedInputRef = useRef<TextInput | null>(null);
    const manageNameInputRef = useRef<TextInput>(null);
    // A field in the LAST card (Parents/Guardian) has no more content below
    // it for scrollTo to reveal — the ScrollView is already at its natural
    // end, so the scroll just clamps there and the field stays behind the
    // keyboard no matter what's computed below. Padding the content by the
    // FULL keyboard height to fix that (the first attempt) overshot: it
    // reserves that whole amount at the bottom regardless of how much was
    // actually needed, which is the gap that was showing under the last
    // card. This only pads by the shortfall — how much MORE room a field
    // needs beyond what's already scrollable — computed fresh per focus from
    // the panel's own real content/container heights (CampusFeed's composer-
    // pinning uses the same "pad only the shortfall" idea).
    const manageContentHRef = useRef(0);
    const manageContainerHRef = useRef(0);
    const [manageKbPad, setManageKbPad] = useState(0);
    // iOS fires keyboardWillShow right as the animation is about to start —
    // close enough to the TextInput's own onFocus that the keyboard height is
    // already known by the time onFocus calls scrollManageFieldAboveKeyboard
    // directly, so iOS was left exactly as it originally worked: onFocus
    // alone, no retry. Android's keyboardDidShow only fires once the
    // keyboard has FULLY appeared, well after onFocus already ran and
    // bailed out on kb being 0 — so onFocus alone never scrolled anything on
    // Android. That's the ONLY platform that needs the remembered-field
    // retry once the show event actually lands.
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvt, (e) => {
            manageKbHeightRef.current = e.endCoordinates?.height ?? 0;
            if (Platform.OS === 'android') {
                setTimeout(() => scrollManageFieldAboveKeyboard(manageFocusedInputRef.current), 80);
            }
        });
        const hide = Keyboard.addListener(hideEvt, () => {
            manageKbHeightRef.current = 0;
            setManageKbPad(0);
        });
        return () => { show.remove(); hide.remove(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const scrollManageFieldAboveKeyboard = useCallback((input: TextInput | null) => {
        if (input) manageFocusedInputRef.current = input;
        const kb = manageKbHeightRef.current;
        if (!kb || !input) return;
        input.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            // Always subtract kb on both platforms — same as CampusFeed's
            // pinComposer (SCREEN_HEIGHT - kb - h - 8, no Android branch).
            // That's working precedent already in this codebase for the exact
            // same "scroll a field/composer above the keyboard" problem, which
            // means this app's Android does NOT auto-resize the window for a
            // plain screen the way I'd assumed — my last attempt subtracting
            // 0 on Android was the actual regression, not a fix.
            const windowH = Dimensions.get('window').height;
            const visibleBottom = windowH - kb - 12;
            const overflow = (y + h) - visibleBottom;
            if (overflow <= 0) return;
            const target = manageDetailScrollYRef.current + overflow + 10;
            const roomLeft = Math.max(0, manageContentHRef.current - manageContainerHRef.current - manageDetailScrollYRef.current);
            const shortfall = Math.max(0, Math.ceil(target - manageDetailScrollYRef.current - roomLeft));
            const doScroll = () => {
                const clamped = Math.max(0, target);
                manageDetailScrollYRef.current = clamped;
                manageDetailScrollRef.current?.scrollTo({ y: clamped, animated: true });
            };
            if (shortfall > 0) {
                setManageKbPad(shortfall);
                // The extra padding needs a frame to actually land before the
                // ScrollView has that much further to scroll into.
                setTimeout(doScroll, 50);
            } else {
                doScroll();
            }
        });
    }, []);

    const mainScrollRef = useRef<ScrollView>(null);
    const mainScrollYRef = useRef(0);
    const mainContentHRef = useRef(0);
    const mainContainerHRef = useRef(0);
    const [feedKbPad, setFeedKbPad] = useState(0);
    // Lets the Materials/Results cards below the feed tell ClassFeed to
    // switch its own filter chip + scroll to top for a given post type,
    // without lifting all of ClassFeed's internal state up to this screen.
    const classFeedRef = useRef<ClassFeedHandle>(null);

    // Same sliding-pill tab bar as the Campus screen's Feed/Staffroom switch
    // (app/(teacher)/campus.tsx) — measured per-button so the highlight
    // exactly matches each label's width, animated on the native driver.
    const trackBg = isDark ? '#1A1A1A' : '#EDEFF3';
    // Width is an Animated.Value rather than React state, same fix as the
    // Campus pill: as state, setting it re-rendered this component a frame
    // after the native-driver spring below had already started animating the
    // sibling translateX transform, and that re-render's prop diff visibly
    // hitched the slide right before it settled (Android only). An
    // Animated.Value updates the native view directly, no re-render.
    const tabPillX = useRef(new Animated.Value(0)).current;
    const tabPillW = useRef(new Animated.Value(0)).current;
    const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
    // The tab row itself scrolls horizontally (5 tabs for a class teacher
    // don't all fit on narrow phones) — this brings whichever tab just
    // became active into view, centered, so switching to "Fees" (off the
    // right edge) shifts the row left to reveal it, and switching back to
    // "View" shifts it right back to the start, instead of leaving the pill
    // selected somewhere the user can't see.
    const tabBarScrollRef = useRef<ScrollView>(null);
    const animateToTab = (key: TabKey) => {
        const layout = tabLayoutsRef.current[key];
        if (!layout) return;
        tabPillW.setValue(layout.width);
        Animated.spring(tabPillX, { toValue: layout.x, useNativeDriver: true, stiffness: 300, damping: 27, mass: 1 }).start();
        tabBarScrollRef.current?.scrollTo({ x: Math.max(0, layout.x + layout.width / 2 - SCREEN_W / 2), animated: true });
    };
    const handleTabLayout = (key: TabKey, e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        tabLayoutsRef.current[key] = { x, width };
        if (key === activeTab) {
            tabPillX.setValue(x);
            tabPillW.setValue(width);
        }
    };

    // View/Manage/Attendance/Marksheet/Fees sit side by side in one flat
    // paging ScrollView — same swipeable-tabs pattern as the Campus screen's
    // Feed/Staffroom/DMs pager (app/(teacher)/campus.tsx). Swiping and tapping
    // the pill stay in sync the same way: a swipe reports its landing tab up
    // through `setActiveTab`, and a tap scrolls the pager via the effect below.
    const tabPagerRef = useRef<ScrollView>(null);
    const [tabPagerWidth, setTabPagerWidth] = useState(SCREEN_W);
    const lastTabPagerWidthRef = useRef(0);
    const currentTabIndexRef = useRef(0);
    // Which tab a drag started from, and whether a finger is still down —
    // together these keep the 30%-of-the-way commit below from firing back
    // and forth if the user pauses mid-swipe (measuring from the tab already
    // committed to, instead of the one the drag started from, put that commit
    // point inside the threshold for going back the other way).
    const dragFromTabIndexRef = useRef(0);
    const draggingTabsRef = useRef(false);

    useEffect(() => {
        const idx = TABS.findIndex((t) => t.key === activeTab);
        if (idx < 0 || currentTabIndexRef.current === idx) return;
        currentTabIndexRef.current = idx;
        tabPagerRef.current?.scrollTo({ x: idx * tabPagerWidth, animated: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, tabPagerWidth]);
    const [division, setDivision] = useState<Division | null>(null);
    const [loading, setLoading] = useState(true);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [leaderTab, setLeaderTab] = useState<'offline' | 'online' | 'combined'>('combined');
    const fetchedRef = useRef(false);

    const [timetableImage, setTimetableImage] = useState<string | null>(null);
    const [uploadingTimetable, setUploadingTimetable] = useState(false);
    const [showTimetable, setShowTimetable] = useState(false);

    // Independent, lightweight fetch of the same feed posts ClassFeed shows —
    // ClassFeed owns its own copy internally and doesn't expose it upward, so
    // the Materials/Results cards below it fetch their own slice to filter.
    const [announcements, setAnnouncements] = useState<FeedPostLite[]>([]);
    const [uploadingResult, setUploadingResult] = useState(false);
    // In-app preview for a Materials/Results "View" tap — opens the file inside
    // the app (image viewer or a WebView-based document viewer) instead of
    // throwing the user out to their phone's browser.
    const [previewItem, setPreviewItem] = useState<FeedPostLite | null>(null);

    // Manage tab — students list + Subjects & Teachers (mirrors web's
    // ManageTab.tsx; the per-student edit view comes in a later pass).
    const [manageStudents, setManageStudents] = useState<ManageStudent[]>([]);
    const [loadingManageStudents, setLoadingManageStudents] = useState(true);

    const fetchDivision = useCallback(async () => {
        try {
            const res = await api.get(`/teacher/classes/${divisionId}`);
            const raw = res.data.data;
            const selectedIds = new Set((raw.divisionSubjects ?? []).map((ds: { subjectId: string }) => ds.subjectId));
            const subjects = (raw.standard?.subjects ?? []).filter((s: { id: string }) => selectedIds.has(s.id));
            setDivision({ ...raw, subjects });
            setTimetableImage(raw.timetableUrl ?? null);
        } catch {
            setDivision(null);
        } finally {
            setLoading(false);
        }
    }, [divisionId]);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await api.get(`/teacher/classes/${divisionId}/leaderboard`);
            setLeaderboard(res.data.data ?? []);
        } catch {
            setLeaderboard([]);
        }
    }, [divisionId]);

    const fetchAnnouncements = useCallback(async () => {
        try {
            const res = await api.get('/teacher/campus/feed/posts', { params: { divisionId } });
            setAnnouncements(res.data.data ?? []);
        } catch {
            setAnnouncements([]);
        }
    }, [divisionId]);

    const fetchManageStudents = useCallback(async () => {
        setLoadingManageStudents(true);
        try {
            const res = await api.get(`/teacher/classes/${divisionId}/students`);
            setManageStudents(res.data.data ?? []);
        } catch {
            setManageStudents([]);
        } finally {
            setLoadingManageStudents(false);
        }
    }, [divisionId]);

    useFocusEffect(
        useCallback(() => {
            if (fetchedRef.current) return;
            fetchedRef.current = true;
            fetchDivision();
            fetchLeaderboard();
            fetchAnnouncements();
            fetchManageStudents();
        }, [fetchDivision, fetchLeaderboard, fetchAnnouncements, fetchManageStudents])
    );

    // Same sort as web's ManageTab — by roll number, unassigned rolls last.
    const sortedManageStudents = useMemo(() => [...manageStudents].sort((a, b) => {
        const ra = parseInt(a.rollNo ?? '9999', 10);
        const rb = parseInt(b.rollNo ?? '9999', 10);
        return ra - rb;
    }), [manageStudents]);

    // Manage tab — selected student's detail view (mirrors web's Student Info
    // panel). Mobile has no side-by-side layout, so selecting a student swaps
    // the list out for this detail view; "Back" swaps it back in.
    const [manageSelectedStudent, setManageSelectedStudent] = useState<ManageStudent | null>(null);
    const [manageEditingSections, setManageEditingSections] = useState({ studentInfo: false, academic: false, medical: false, address: false, guardians: false });
    const [manageSavingSections, setManageSavingSections] = useState({ studentInfo: false, academic: false, medical: false, address: false, guardians: false });
    const [manageEditDraft, setManageEditDraft] = useState<Partial<ManageStudent & { name: string; email: string }>>({});
    const [manageShowPassword, setManageShowPassword] = useState(false);
    const [manageResettingPassword, setManageResettingPassword] = useState(false);
    const [manageResetPwConfirmOpen, setManageResetPwConfirmOpen] = useState(false);
    const [manageResetPwResult, setManageResetPwResult] = useState<string | null>(null);
    const [manageResetPwError, setManageResetPwError] = useState<string | null>(null);
    const [manageTogglingStatus, setManageTogglingStatus] = useState(false);
    const [manageUploadingPhoto, setManageUploadingPhoto] = useState(false);
    const [manageExpandedPhoto, setManageExpandedPhoto] = useState<{ url: string; name: string } | null>(null);
    const [manageStats, setManageStats] = useState<ManageStudentStats | null>(null);
    const [manageLoadingStats, setManageLoadingStats] = useState(false);

    // Report (Flags & Warnings) — board + form, mirrors web's FlagsBoard +
    // ReportStudentModal exactly.
    const [manageReportBoardOpen, setManageReportBoardOpen] = useState(false);
    const [manageReportFlags, setManageReportFlags] = useState<FlagItem[]>([]);
    const [manageReportLoadingList, setManageReportLoadingList] = useState(false);
    const [manageReportModalOpen, setManageReportModalOpen] = useState(false);
    const [manageReportEditing, setManageReportEditing] = useState<FlagItem | null>(null);
    const [manageReportSubmitting, setManageReportSubmitting] = useState(false);
    const [manageReportForm, setManageReportForm] = useState({
        type: 'yellow' as 'yellow' | 'red', category: 'Discipline', customCategory: '',
        title: '', detail: '', subject: '', actionTaken: '',
    });
    const [manageReportAttachments, setManageReportAttachments] = useState<(FlagAttachment & { mimeType: string })[]>([]);
    const [manageReportUploading, setManageReportUploading] = useState(false);
    const [manageReportCategoryPickerOpen, setManageReportCategoryPickerOpen] = useState(false);

    // Same slide-in-from-the-right / slide-out-before-unmount treatment as
    // the student detail panel (manageDetailSlideX above) — open animates in
    // via the effect, close animates out first and only then clears the
    // "open" state, so both panels feel consistent with the rest of Manage.
    const manageReportBoardSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (manageReportBoardOpen) Animated.timing(manageReportBoardSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [manageReportBoardOpen, manageReportBoardSlideX]);
    const closeManageReportBoard = useCallback(() => {
        Animated.timing(manageReportBoardSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setManageReportBoardOpen(false);
            manageReportBoardSlideX.setValue(SCREEN_W);
        });
    }, [manageReportBoardSlideX]);

    // The form itself now opens as a centered modal dialog (matching web's
    // ReportStudentModal) instead of the board's inline slide-in panel, so it
    // just needs to close instantly — no slide-out animation to wait on.
    const closeManageReportForm = useCallback(() => {
        setManageReportModalOpen(false);
        resetManageReportForm();
    }, []);

    const fetchManageReportFlags = useCallback(async () => {
        if (!manageSelectedStudent) return;
        setManageReportLoadingList(true);
        try {
            const res = await api.get(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/remarks`);
            setManageReportFlags(res.data.data ?? []);
        } catch {
            setManageReportFlags([]);
        } finally {
            setManageReportLoadingList(false);
        }
    }, [manageSelectedStudent, divisionId]);

    const openManageReportBoard = useCallback(() => {
        setManageReportBoardOpen(true);
        fetchManageReportFlags();
    }, [fetchManageReportFlags]);

    const resetManageReportForm = useCallback(() => {
        setManageReportForm({ type: 'yellow', category: 'Discipline', customCategory: '', title: '', detail: '', subject: '', actionTaken: '' });
        setManageReportAttachments([]);
        setManageReportEditing(null);
    }, []);

    const openManageReportForm = useCallback((flag?: FlagItem) => {
        if (flag) {
            const knownCategory = REPORT_CATEGORIES.includes(flag.category);
            setManageReportForm({
                type: flag.type, category: knownCategory ? flag.category : 'Other', customCategory: knownCategory ? '' : flag.category,
                title: flag.title, detail: flag.detail, subject: flag.subject ?? '', actionTaken: flag.actionTaken ?? '',
            });
            setManageReportAttachments(flag.attachments.map((a) => ({ ...a, mimeType: a.type })));
            setManageReportEditing(flag);
        } else {
            resetManageReportForm();
        }
        setManageReportModalOpen(true);
    }, [resetManageReportForm]);

    const handleManageReportAttach = useCallback(async () => {
        const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
        if (picked.canceled || !picked.assets?.length) return;
        setManageReportUploading(true);
        try {
            for (const asset of picked.assets) {
                if (asset.size && asset.size > 15 * 1024 * 1024) { Alert.alert('Too large', `${asset.name} is over 15 MB`); continue; }
                try {
                    const form = new FormData();
                    form.append('file', { uri: asset.uri, name: asset.name ?? 'file', type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
                    const res = await api.post('/teacher/campus/feed/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                    const { url, name, type } = res.data.data;
                    setManageReportAttachments((prev) => [...prev, { url, name, type, mimeType: type }]);
                } catch {
                    Alert.alert('Error', `Failed to upload ${asset.name}`);
                }
            }
        } finally {
            setManageReportUploading(false);
        }
    }, []);

    const handleManageReportSubmit = useCallback(async () => {
        if (!manageSelectedStudent) return;
        const resolvedCategory = manageReportForm.category === 'Other' ? manageReportForm.customCategory.trim() : manageReportForm.category;
        if (!resolvedCategory || !manageReportForm.title.trim() || !manageReportForm.detail.trim()) return;
        setManageReportSubmitting(true);
        try {
            const payload = {
                type: manageReportForm.type.toUpperCase(),
                category: resolvedCategory,
                title: manageReportForm.title.trim(),
                detail: manageReportForm.detail.trim(),
                subject: manageReportForm.subject.trim() || undefined,
                actionTaken: manageReportForm.actionTaken.trim() || undefined,
                attachments: manageReportAttachments.length > 0 ? manageReportAttachments.map((a) => ({ url: a.url, name: a.name, type: a.mimeType })) : undefined,
            };
            if (manageReportEditing) {
                await api.patch(`/teacher/reports/${manageReportEditing.id}/edit`, payload);
            } else {
                await api.post(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/remarks`, { ...payload, severity: 'MEDIUM' });
            }
            closeManageReportForm();
            fetchManageReportFlags();
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            Alert.alert('Error', e?.response?.data?.error ?? (manageReportEditing ? 'Failed to update report' : 'Failed to submit report'));
        } finally {
            setManageReportSubmitting(false);
        }
    }, [manageSelectedStudent, divisionId, manageReportForm, manageReportAttachments, manageReportEditing, closeManageReportForm, fetchManageReportFlags]);

    // Slide the detail in from the right the moment a student is selected,
    // and slide it back out before actually clearing the selection — same
    // WhatsApp-style treatment as DmChat, and for the same reason: closing
    // should mirror opening instead of just vanishing.
    const manageDetailSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (manageSelectedStudent) Animated.timing(manageDetailSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [manageSelectedStudent, manageDetailSlideX]);
    const closeManageDetail = useCallback(() => {
        Animated.timing(manageDetailSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setManageSelectedStudent(null);
            manageDetailSlideX.setValue(SCREEN_W);
        });
    }, [manageDetailSlideX]);

    // Back (header button, Android hardware back) closes the student detail
    // first rather than leaving the whole class screen.
    usePreventRemove(!!manageSelectedStudent, () => closeManageDetail());

    // iOS's edge-swipe can't be redirected from JS — native-stack pops the
    // screen natively before JS sees it, so letting it run and reverting it
    // via usePreventRemove flashes out to the class list and back. It's
    // switched off entirely while a student is open (the swipe simply does
    // nothing there; the back button closes the detail), and back on once
    // the detail is closed, where it leaves the class as usual.
    useEffect(() => {
        navigation.setOptions({ gestureEnabled: !manageSelectedStudent });
    }, [navigation, manageSelectedStudent]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (manageSelectedStudent) { closeManageDetail(); return true; }
            return false;
        });
        return () => sub.remove();
    }, [manageSelectedStudent, closeManageDetail]);

    useEffect(() => {
        setManageEditDraft({});
        setManageEditingSections({ studentInfo: false, academic: false, medical: false, address: false, guardians: false });
        setManageShowPassword(false);
        setManageStats(null);
    }, [manageSelectedStudent?.id]);

    useEffect(() => {
        if (!manageSelectedStudent) return;
        setManageLoadingStats(true);
        api.get(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/stats`)
            .then((r) => setManageStats(r.data.data))
            .catch(() => setManageStats(null))
            .finally(() => setManageLoadingStats(false));
    }, [manageSelectedStudent?.id, divisionId]);

    // `d`/`set` mirror web's draft-aware field readers — read the in-progress
    // edit if there is one, otherwise fall back to the saved student value.
    const manageD = useCallback((key: keyof ManageStudent, fallback = '') => {
        if (!manageSelectedStudent) return fallback;
        const draftVal = (manageEditDraft as Record<string, unknown>)[key];
        if (draftVal !== undefined) return draftVal as string;
        const val = manageSelectedStudent[key];
        return val != null ? String(val) : fallback;
    }, [manageSelectedStudent, manageEditDraft]);
    const manageDName = useCallback(() => (manageEditDraft.name !== undefined ? manageEditDraft.name : manageSelectedStudent?.user.name ?? ''), [manageEditDraft.name, manageSelectedStudent]);
    const manageDEmail = useCallback(() => {
        if (manageEditDraft.email !== undefined) return manageEditDraft.email;
        const email = manageSelectedStudent?.user.email ?? '';
        return isPlaceholderEmail(email) ? '' : email;
    }, [manageEditDraft.email, manageSelectedStudent]);
    const manageSet = useCallback((key: string) => (v: string) => setManageEditDraft((p) => ({ ...p, [key]: v })), []);

    const handleManageSaveSection = useCallback(async (section: keyof typeof manageEditingSections) => {
        if (!manageSelectedStudent) return;
        setManageSavingSections((p) => ({ ...p, [section]: true }));
        try {
            const payload: Record<string, unknown> = {};
            if (section === 'studentInfo') {
                if (manageEditDraft.name !== undefined) payload.name = manageEditDraft.name;
                if (manageEditDraft.email !== undefined) {
                    const trimmed = manageEditDraft.email.trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                        Alert.alert('Error', 'Enter a valid email address');
                        setManageSavingSections((p) => ({ ...p, [section]: false }));
                        return;
                    }
                    payload.email = trimmed;
                }
                if (manageEditDraft.dob !== undefined) payload.dob = manageEditDraft.dob;
                if (manageEditDraft.gender !== undefined) payload.gender = manageEditDraft.gender;
                if (manageEditDraft.religion !== undefined) payload.religion = manageEditDraft.religion;
                if (manageEditDraft.category !== undefined) payload.category = manageEditDraft.category;
                if (manageEditDraft.nationality !== undefined) payload.nationality = manageEditDraft.nationality;
                if (manageEditDraft.admissionYear !== undefined) payload.admissionYear = manageEditDraft.admissionYear;
                if (manageEditDraft.phone !== undefined) payload.phone = manageEditDraft.phone;
            } else if (section === 'academic') {
                if (manageEditDraft.rollNo !== undefined) payload.rollNo = String(manageEditDraft.rollNo).trim().padStart(2, '0');
                if (manageEditDraft.houseColor !== undefined) payload.houseColor = manageEditDraft.houseColor;
            } else if (section === 'medical') {
                if (manageEditDraft.bloodGroup !== undefined) payload.bloodGroup = manageEditDraft.bloodGroup;
                if (manageEditDraft.aadharNo !== undefined) payload.aadharNo = manageEditDraft.aadharNo;
                if (manageEditDraft.panNo !== undefined) payload.panNo = manageEditDraft.panNo;
                if (manageEditDraft.emergencyContact !== undefined) payload.emergencyContact = manageEditDraft.emergencyContact;
            } else if (section === 'address') {
                if (manageEditDraft.address !== undefined) payload.address = manageEditDraft.address;
                if (manageEditDraft.city !== undefined) payload.city = manageEditDraft.city;
                if (manageEditDraft.state !== undefined) payload.state = manageEditDraft.state;
                if (manageEditDraft.pincode !== undefined) payload.pincode = manageEditDraft.pincode;
                if (manageEditDraft.country !== undefined) payload.country = manageEditDraft.country;
            } else if (section === 'guardians') {
                if (manageEditDraft.guardians !== undefined) payload.guardians = manageEditDraft.guardians;
            }
            const res = await api.patch(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}`, payload);
            const updated: ManageStudent = res.data.data;
            setManageStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setManageSelectedStudent(updated);
            setManageEditDraft({});
            setManageEditingSections((p) => ({ ...p, [section]: false }));
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            Alert.alert('Error', e?.response?.data?.error ?? 'Failed to save');
        } finally {
            setManageSavingSections((p) => ({ ...p, [section]: false }));
        }
    }, [manageSelectedStudent, manageEditDraft, divisionId]);

    const handleManageToggleStatus = useCallback(() => {
        if (!manageSelectedStudent) return;
        const newStatus = manageSelectedStudent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        Alert.alert(
            newStatus === 'INACTIVE' ? 'Deactivate student?' : 'Activate student?',
            newStatus === 'INACTIVE'
                ? `${manageSelectedStudent.user.name ?? 'This student'} will lose access immediately.`
                : `${manageSelectedStudent.user.name ?? 'This student'} will regain access.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: newStatus === 'INACTIVE' ? 'Yes, Deactivate' : 'Yes, Activate',
                    style: newStatus === 'INACTIVE' ? 'destructive' : 'default',
                    onPress: async () => {
                        setManageTogglingStatus(true);
                        try {
                            await api.patch(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/status`, { status: newStatus });
                            setManageStudents((prev) => prev.map((s) => (s.id === manageSelectedStudent.id ? { ...s, status: newStatus } : s)));
                            setManageSelectedStudent((prev) => (prev ? { ...prev, status: newStatus } : null));
                        } catch (err: unknown) {
                            const e = err as { response?: { data?: { error?: string } } };
                            Alert.alert('Error', e?.response?.data?.error ?? 'Failed to update status');
                        } finally {
                            setManageTogglingStatus(false);
                        }
                    },
                },
            ]
        );
    }, [manageSelectedStudent, divisionId]);

    // Themed in-app confirm/result popups instead of the OS Alert - matches
    // the rest of the app's own modal styling rather than the system dialog.
    const handleManageResetPassword = useCallback(() => {
        if (!manageSelectedStudent) return;
        setManageResetPwConfirmOpen(true);
    }, [manageSelectedStudent]);

    const confirmManageResetPassword = useCallback(async () => {
        if (!manageSelectedStudent) return;
        setManageResetPwConfirmOpen(false);
        setManageResettingPassword(true);
        try {
            const res = await api.post(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/reset-password`);
            const newPass: string = res.data.data.newTempPassword;
            setManageStudents((prev) => prev.map((s) => (s.id === manageSelectedStudent.id ? { ...s, tempPassword: newPass, user: { ...s.user, mustChangePassword: true } } : s)));
            setManageSelectedStudent((prev) => (prev ? { ...prev, tempPassword: newPass, user: { ...prev.user, mustChangePassword: true } } : prev));
            setManageShowPassword(true);
            setManageResetPwResult(newPass);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            setManageResetPwError(e?.response?.data?.error ?? 'Failed to reset password');
        } finally {
            setManageResettingPassword(false);
        }
    }, [manageSelectedStudent, divisionId]);

    const handleManagePhotoChange = useCallback(async () => {
        if (!manageSelectedStudent) return;
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setManageUploadingPhoto(true);
        try {
            const form = new FormData();
            form.append('photo', { uri: asset.uri, name: 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
            const res = await api.post(`/teacher/classes/${divisionId}/students/${manageSelectedStudent.id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const avatarUrl: string = res.data.data.avatarUrl;
            setManageStudents((prev) => prev.map((s) => (s.id === manageSelectedStudent.id ? { ...s, avatarUrl } : s)));
            setManageSelectedStudent((prev) => (prev ? { ...prev, avatarUrl } : prev));
        } catch {
            Alert.alert('Error', 'Failed to upload photo');
        } finally {
            setManageUploadingPhoto(false);
        }
    }, [manageSelectedStudent, divisionId]);

    // ── Attendance tab — Daily marking (Phase 1; Sheet/Overall come later) ──
    const attBase = `/teacher/attendance/${divisionId}`;
    const [attSubTab, setAttSubTab] = useState<'daily' | 'sheet' | 'overall'>('daily');
    const [attStudents, setAttStudents] = useState<AttendanceStudent[]>([]);
    const [attHolidays, setAttHolidays] = useState<Record<string, string>>({});
    const [attSelectedDate, setAttSelectedDate] = useState(() => new Date());
    const [attShowDatePicker, setAttShowDatePicker] = useState(false);
    const [attCalYear, setAttCalYear] = useState(() => new Date().getFullYear());
    const [attCalMonth, setAttCalMonth] = useState(() => new Date().getMonth());
    const [attRefreshKey, setAttRefreshKey] = useState(0);
    const [attExpandedPhoto, setAttExpandedPhoto] = useState<{ url: string; name: string } | null>(null);
    const [attAttendance, setAttAttendance] = useState<Record<string, { status: AttendanceStatus; remark: string }>>({});
    const [attRemarkOpenId, setAttRemarkOpenId] = useState<string | null>(null);
    const [attGlobalRemark, setAttGlobalRemark] = useState('');
    const [attDateRemarks, setAttDateRemarks] = useState<Record<string, string>>({});
    const [attSaveStatus, setAttSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [attLoadingDate, setAttLoadingDate] = useState(false);
    const [attMonthMarkedCounts, setAttMonthMarkedCounts] = useState<Record<string, number>>({});
    const attAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const attFetchedRef = useRef(false);

    interface AttMonthlyStat { monthKey: string; p: number; a: number; l: number; pct: number | null; cumulativePct: number | null }
    interface AttSummaryStudent { studentId: string; name: string; rollNo: string; avatarUrl?: string | null; overallPct: number | null; currentMonthPct: number | null; monthlyStats: AttMonthlyStat[] }
    interface AttClassStats { overallPct: number | null; currentMonthPct: number | null; monthlyStats: { monthKey: string; avg: number | null; cumulativeAvg: number | null }[] }

    // Overall tab (Phase 3) — same /summary response as Sheet's cumulative %,
    // just kept in full here (per-month P/A/L, class averages) instead of
    // reduced down to cumulativeByMonth.
    const [attOverallStudents, setAttOverallStudents] = useState<AttSummaryStudent[]>([]);
    const [attClassStats, setAttClassStats] = useState<AttClassStats | null>(null);

    // Re-fetches the summary (overall%/cumulative% per student + class stats)
    // — called on mount and again after every attendance save, since saving
    // changes the cumulative % for the current and all later months (mirrors
    // web's refreshSummary).
    const refreshAttSummary = useCallback(() => {
        return api.get(`${attBase}/summary`).then((summaryRes) => {
            const students = (summaryRes.data.data.students as AttSummaryStudent[]) ?? [];
            const classStats = (summaryRes.data.data.classStats as AttClassStats) ?? null;
            setAttOverallStudents(students);
            setAttClassStats(classStats);
            const summaryByStudentId = new Map<string, AttSummaryStudent>(students.map((ss) => [ss.studentId, ss]));
            setAttStudents((prev) => prev.map((s) => {
                const summary = summaryByStudentId.get(s.id);
                const cumulativeByMonth: Record<string, number | null> = {};
                (summary?.monthlyStats ?? []).forEach((m) => { cumulativeByMonth[m.monthKey] = m.cumulativePct; });
                return { ...s, overallPct: summary?.overallPct ?? null, cumulativeByMonth };
            }));
        }).catch(() => {});
    }, [attBase]);

    // Roster + holidays + summary, once — mirrors web's base-data effect.
    useEffect(() => {
        if (attFetchedRef.current) return;
        attFetchedRef.current = true;
        Promise.all([
            api.get(`/teacher/classes/${divisionId}/students`),
            api.get(`${attBase}/holidays`),
            api.get(`${attBase}/summary`),
        ]).then(([studRes, holRes, summaryRes]) => {
            const summaryStudents = (summaryRes.data.data.students as AttSummaryStudent[]) ?? [];
            const classStats = (summaryRes.data.data.classStats as AttClassStats) ?? null;
            setAttOverallStudents(summaryStudents);
            setAttClassStats(classStats);
            const summaryByStudentId = new Map<string, AttSummaryStudent>(summaryStudents.map((ss) => [ss.studentId, ss]));
            const s: AttendanceStudent[] = (studRes.data.data ?? []).map((st: { id: string; studentId: string; user: { name: string | null }; rollNo: string | null; avatarUrl?: string | null }) => {
                const summary = summaryByStudentId.get(st.id);
                const cumulativeByMonth: Record<string, number | null> = {};
                (summary?.monthlyStats ?? []).forEach((m) => { cumulativeByMonth[m.monthKey] = m.cumulativePct; });
                return {
                    id: st.id, studentId: st.studentId, name: st.user.name ?? st.studentId, rollNo: st.rollNo ?? '', avatarUrl: st.avatarUrl ?? null,
                    overallPct: summary?.overallPct ?? null, cumulativeByMonth,
                };
            });
            setAttStudents(s);
            const h: Record<string, string> = {};
            (holRes.data.data ?? []).forEach((hol: { date: string; name: string }) => { h[hol.date] = hol.name; });
            setAttHolidays(h);
        }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [divisionId]);

    const attStudentIdsKey = attStudents.map((s) => s.id).join(',');
    useEffect(() => {
        if (attStudents.length === 0) return;
        setAttAttendance(Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attStudentIdsKey]);

    const attCurrentDk = attDateKey(attSelectedDate);
    useEffect(() => {
        if (attStudents.length === 0) return;
        setAttLoadingDate(true);
        setAttAttendance(Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }])));
        setAttGlobalRemark('');
        api.get(`${attBase}/daily?date=${attCurrentDk}`)
            .then((res) => {
                const { records, dateNote } = res.data.data;
                const newAtt = Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }]));
                (records ?? []).forEach((r: { studentId: string; status: string; remark?: string }) => {
                    if (newAtt[r.studentId] !== undefined) newAtt[r.studentId] = { status: r.status as AttendanceStatus, remark: r.remark ?? '' };
                });
                setAttAttendance(newAtt);
                setAttGlobalRemark(dateNote ?? '');
                if (dateNote) setAttDateRemarks((prev) => ({ ...prev, [attCurrentDk]: dateNote }));
            })
            .catch(() => {
                setAttAttendance(Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }])));
                setAttGlobalRemark('');
            })
            .finally(() => setAttLoadingDate(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attCurrentDk, divisionId, attStudents.length]);

    const attIsHoliday = !!attHolidays[attCurrentDk];
    const attIsSunday = attSelectedDate.getDay() === 0;

    // Fully-marked dots for whichever month the calendar popup is on.
    useEffect(() => {
        const monthStr = `${attCalYear}-${String(attCalMonth + 1).padStart(2, '0')}`;
        api.get(`${attBase}/monthly?month=${monthStr}`)
            .then((res) => {
                const perDate: Record<string, Set<string>> = {};
                (res.data.data.records ?? []).forEach((r: { studentId: string; date: string; status: string | null }) => {
                    if (!r.status) return;
                    (perDate[r.date] ??= new Set()).add(r.studentId);
                });
                setAttMonthMarkedCounts(Object.fromEntries(Object.entries(perDate).map(([dk, set]) => [dk, set.size])));
            })
            .catch(() => setAttMonthMarkedCounts({}));
    }, [attCalYear, attCalMonth, divisionId, attBase, attRefreshKey]);

    const handleAttHolidayChange = useCallback(async (dk: string, name: string | null) => {
        setAttHolidays((prev) => {
            const next = { ...prev };
            if (name === null) delete next[dk]; else next[dk] = name;
            return next;
        });
        try {
            await api.post(`${attBase}/holidays`, { date: dk, name });
        } catch {
            // Save failed — re-fetch the real holiday list rather than guessing
            // what to roll the optimistic update back to.
            api.get(`${attBase}/holidays`).then((res) => {
                const h: Record<string, string> = {};
                (res.data.data ?? []).forEach((hol: { date: string; name: string }) => { h[hol.date] = hol.name; });
                setAttHolidays(h);
            }).catch(() => {});
        }
    }, [attBase]);

    const attSetStatus = useCallback((id: string, status: AttendanceStatus) => {
        setAttAttendance((prev) => ({ ...prev, [id]: { ...prev[id], status: prev[id]?.status === status ? null : status } }));
    }, []);
    const attSetRemark = useCallback((id: string, remark: string) => {
        setAttAttendance((prev) => ({ ...prev, [id]: { ...prev[id], remark } }));
    }, []);

    const handleAttSave = useCallback(async () => {
        setAttSaveStatus('saving');
        try {
            const records = attStudents
                .filter((s) => attAttendance[s.id]?.status !== null && attAttendance[s.id]?.status !== undefined)
                .map((s) => ({ studentId: s.id, status: attAttendance[s.id].status as 'P' | 'A' | 'L', remark: attAttendance[s.id].remark ?? '' }));
            await api.post(`${attBase}/daily`, { date: attCurrentDk, records, dateNote: attGlobalRemark || undefined });
            setAttSaveStatus('saved');
            setAttRefreshKey((k) => k + 1);
            refreshAttSummary();
            setTimeout(() => setAttSaveStatus('idle'), 2000);
        } catch {
            setAttSaveStatus('idle');
        }
    }, [attStudents, attAttendance, attBase, attCurrentDk, attGlobalRemark, refreshAttSummary]);

    const attMarkAllPresent = useCallback(() => {
        const allPresent = attStudents.every((s) => attAttendance[s.id]?.status === 'P');
        setAttAttendance((prev) => {
            const next: Record<string, { status: AttendanceStatus; remark: string }> = {};
            for (const id of Object.keys(prev)) next[id] = { ...prev[id], status: allPresent ? null : 'P' };
            return next;
        });
    }, [attAttendance, attStudents]);

    // Auto-save — 2s after the last change, same as web.
    useEffect(() => {
        if (attStudents.length === 0) return;
        if (!attStudents.some((s) => attAttendance[s.id]?.status)) return;
        if (attAutoSaveTimer.current) clearTimeout(attAutoSaveTimer.current);
        attAutoSaveTimer.current = setTimeout(() => { handleAttSave(); }, 2000);
        return () => { if (attAutoSaveTimer.current) clearTimeout(attAutoSaveTimer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attAttendance, attGlobalRemark]);

    const attPresent = attStudents.filter((s) => attAttendance[s.id]?.status === 'P').length;
    const attAbsent = attStudents.filter((s) => attAttendance[s.id]?.status === 'A').length;
    const attLate = attStudents.filter((s) => attAttendance[s.id]?.status === 'L').length;
    const attUnmarked = attStudents.filter((s) => !attAttendance[s.id]?.status).length;
    const attHasAnyMarked = attStudents.some((s) => attAttendance[s.id]?.status);

    // ── Attendance tab — Sheet (Phase 2): the whole month as one grid, same
    // data/columns as web's AttendanceSheet, adapted to a single horizontal
    // scroll region (header + rows scroll together) since mobile has no room
    // for sticky left AND right columns at once like the desktop table does.
    const [attSheetMonth, setAttSheetMonth] = useState(() => new Date().getMonth());
    const [attMonthlyRecords, setAttMonthlyRecords] = useState<Record<string, AttendanceStatus>>({});
    const [attHeaderPopupDate, setAttHeaderPopupDate] = useState<number | null>(null);
    const [attHolidayModalDk, setAttHolidayModalDk] = useState<string | null>(null);
    const [attHolidayInput, setAttHolidayInput] = useState('');
    const [attRemarkModalDk, setAttRemarkModalDk] = useState<string | null>(null);
    const [attRemarkModalInput, setAttRemarkModalInput] = useState('');

    // Keep the sheet's month in step with whatever date Daily has selected.
    useEffect(() => {
        setAttSheetMonth((prev) => (prev === attSelectedDate.getMonth() ? prev : attSelectedDate.getMonth()));
    }, [attSelectedDate]);

    const attTodayForYear = new Date();
    const attStartYear = attTodayForYear.getMonth() >= 5 ? attTodayForYear.getFullYear() : attTodayForYear.getFullYear() - 1;
    const attSheetYear = attSheetMonth >= 5 ? attStartYear : attStartYear + 1;
    const attSheetMonthKey = `${attSheetYear}-${String(attSheetMonth + 1).padStart(2, '0')}`;

    useEffect(() => {
        api.get(`${attBase}/monthly?month=${attSheetMonthKey}`)
            .then((res) => {
                const recs: Record<string, AttendanceStatus> = {};
                (res.data.data.records ?? []).forEach((r: { studentId: string; date: string; status: string }) => { recs[`${r.studentId}::${r.date}`] = r.status as AttendanceStatus; });
                setAttMonthlyRecords(recs);
            })
            .catch(() => setAttMonthlyRecords({}));
    }, [attSheetMonthKey, attBase, attRefreshKey]);

    const attGetLiveStatus = useCallback((studentId: string, dk: string): AttendanceStatus => {
        if (dk === attCurrentDk) return attAttendance[studentId]?.status ?? null;
        return attMonthlyRecords[`${studentId}::${dk}`] ?? null;
    }, [attCurrentDk, attAttendance, attMonthlyRecords]);

    // Non-current dates save their note straight away (there's no local draft
    // for a day that isn't on screen in Daily); the current date's note stays
    // routed through attGlobalRemark so Daily and Sheet never disagree.
    const handleAttRemarkChange = useCallback((dk: string, remark: string) => {
        setAttDateRemarks((prev) => ({ ...prev, [dk]: remark }));
        if (dk === attCurrentDk) {
            setAttGlobalRemark(remark);
        } else {
            api.post(`${attBase}/daily`, { date: dk, records: [], dateNote: remark }).catch(() => {});
        }
    }, [attCurrentDk, attBase]);

    const attCumulativePctFor = useCallback((student: AttendanceStudent) => student.cumulativeByMonth?.[attSheetMonthKey] ?? null, [attSheetMonthKey]);
    // Sorted independently of Manage's own roster fetch/sort — the two tabs
    // load on their own schedules, so relying on Manage's list here would
    // leave the Sheet showing zero rows if Attendance's fetch finished first.
    const sortedAttStudents = useMemo(() => [...attStudents].sort((a, b) => {
        const ra = parseInt(a.rollNo || '9999', 10);
        const rb = parseInt(b.rollNo || '9999', 10);
        return ra - rb;
    }), [attStudents]);
    const attPctColor = useCallback((p: number | null) => (p === null ? '#94A3B8' : p >= 75 ? '#10B981' : p >= 65 ? '#F59E0B' : '#EF4444'), []);

    // ── Attendance tab — Overall (Phase 3): class + per-student summary. ────
    const [attOverallSelectedId, setAttOverallSelectedId] = useState<string | null>(null);
    const [attOverallRightTab, setAttOverallRightTab] = useState<'class' | 'student'>('class');
    const [attShortTab, setAttShortTab] = useState<'month' | 'overall'>('month');
    const [attStudentRecords, setAttStudentRecords] = useState<Record<string, AttendanceStatus>>({});
    const [attLoadingStudentRec, setAttLoadingStudentRec] = useState(false);

    // Selecting the first student once the summary loads, same as web.
    useEffect(() => {
        if (attOverallSelectedId === null && attOverallStudents.length > 0) setAttOverallSelectedId(attOverallStudents[0].studentId);
    }, [attOverallStudents, attOverallSelectedId]);

    const attSelectedOverallStudent = attOverallStudents.find((s) => s.studentId === attOverallSelectedId) ?? null;

    useEffect(() => {
        if (!attSelectedOverallStudent) return;
        setAttLoadingStudentRec(true);
        api.get(`${attBase}/student-records/${attSelectedOverallStudent.studentId}?startDate=${attStartYear}-06-01&endDate=${attStartYear + 1}-05-31`)
            .then((res) => {
                const recs: Record<string, AttendanceStatus> = {};
                (res.data.data.records ?? []).forEach((r: { date: string; status: string }) => { recs[r.date] = r.status as AttendanceStatus; });
                setAttStudentRecords(recs);
            })
            .catch(() => setAttStudentRecords({}))
            .finally(() => setAttLoadingStudentRec(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attSelectedOverallStudent?.studentId, attBase]);

    const ATT_SHEET_MONTHS_ORDER = useMemo(() => [
        { month: 'June', short: 'Jun', key: 5 }, { month: 'July', short: 'Jul', key: 6 }, { month: 'August', short: 'Aug', key: 7 },
        { month: 'September', short: 'Sep', key: 8 }, { month: 'October', short: 'Oct', key: 9 }, { month: 'November', short: 'Nov', key: 10 },
        { month: 'December', short: 'Dec', key: 11 }, { month: 'January', short: 'Jan', key: 0 }, { month: 'February', short: 'Feb', key: 1 },
        { month: 'March', short: 'Mar', key: 2 }, { month: 'April', short: 'Apr', key: 3 }, { month: 'May', short: 'May', key: 4 },
    ], []);

    // "Get List" — same content as web's plain-text export, shared via the
    // system share sheet (save/print/send) instead of a browser download.
    const handleAttGetList = useCallback((type: 'all' | 'current') => {
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentMonthShort = ATT_MONTHS[now.getMonth()].slice(0, 3);
        const lines: string[] = [];
        if (type === 'all') {
            const allMonths = new Set<string>();
            attOverallStudents.forEach((s) => s.monthlyStats.forEach((m) => allMonths.add(m.monthKey)));
            const monthKeys = Array.from(allMonths).sort();
            lines.push('Attendance Report — All Months\n');
            attOverallStudents.forEach((s) => {
                const monthCols = monthKeys.map((mk) => {
                    const m = s.monthlyStats.find((ms) => ms.monthKey === mk);
                    return `${m?.pct ?? '—'}%`;
                }).join('  ');
                lines.push(`${s.rollNo}  ${s.name}  ${monthCols}  Overall: ${s.overallPct ?? '—'}%`);
            });
        } else {
            lines.push(`Attendance Report — ${currentMonthShort} (Current Month)\n`);
            attOverallStudents.forEach((s) => {
                const m = s.monthlyStats.find((ms) => ms.monthKey === currentMonthKey);
                lines.push(`${s.rollNo}  ${s.name}  ${m?.pct ?? '—'}%  Overall: ${s.overallPct ?? '—'}%`);
            });
        }
        Share.share({ message: lines.join('\n'), title: `Attendance ${type}` }).catch(() => {});
    }, [attOverallStudents]);

    const classTeacherAssignment = division?.assignments.find((a) => a.subjectId === null);
    const restrictSubjectName = !isClassTeacher && subjectId ? division?.subjects.find((s) => s.id === subjectId)?.name ?? null : null;

    // Same filtering rules as web's ViewTab.tsx: a subject teacher only sees
    // materials tagged for their own subject; results are never restricted.
    const materials = useMemo(() => announcements.filter((a) => {
        if (a.type !== 'material') return false;
        if (isClassTeacher || !subjectId) return true;
        if (a.subjectId) return a.subjectId === subjectId;
        return !!restrictSubjectName && (a.subject ?? '').trim().toLowerCase() === restrictSubjectName.trim().toLowerCase();
    }), [announcements, isClassTeacher, subjectId, restrictSubjectName]);
    const results = useMemo(() => announcements.filter((a) => a.type === 'result'), [announcements]);

    const jumpToFeed = useCallback((type: FeedPostType) => {
        classFeedRef.current?.jumpToType(type);
        mainScrollRef.current?.scrollTo({ y: 0, animated: true });
    }, []);

    const handleUploadResult = useCallback(async () => {
        const picked = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
            copyToCacheDirectory: true,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        const asset = picked.assets[0];
        setUploadingResult(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: asset.name ?? 'result', type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
            const uploadRes = await api.post('/teacher/campus/feed/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const { url, name, type } = uploadRes.data.data;
            const res = await api.post('/teacher/campus/feed/posts', {
                type: 'RESULT',
                title: (asset.name ?? 'Result').replace(/\.[^.]+$/, ''),
                body: '',
                divisionId,
                attachmentUrl: url,
                attachmentType: type,
                attachmentName: name,
            });
            setAnnouncements((prev) => [res.data.data, ...prev]);
        } catch {
            Alert.alert('Error', 'Failed to upload result');
        } finally {
            setUploadingResult(false);
        }
    }, [divisionId]);

    const pctFor = useCallback((e: LeaderboardEntry) => (leaderTab === 'offline' ? e.offlinePct : leaderTab === 'online' ? e.onlinePct : e.combinedPct), [leaderTab]);
    const sortedLeaderboard = useMemo(() => {
        return [...leaderboard].filter((e) => pctFor(e) !== null).sort((a, b) => (pctFor(b) ?? 0) - (pctFor(a) ?? 0));
    }, [leaderboard, pctFor]);
    // Memoized — `.slice()`/array-literal both return a new array reference
    // every render even when sortedLeaderboard hasn't changed, which (like
    // the `theme` object above) sat in viewPageContent's deps array and
    // defeated its memoization on every render.
    const top5 = useMemo(() => sortedLeaderboard.slice(0, 5), [sortedLeaderboard]);
    const podium = useMemo(() => [top5[1], top5[0], top5[2]], [top5]);

    const pickTimetable = useCallback(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setUploadingTimetable(true);
        try {
            const form = new FormData();
            form.append('timetable', { uri: asset.uri, name: 'timetable.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
            const res = await api.post(`/teacher/classes/${divisionId}/timetable`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setTimetableImage(res.data.data.timetableUrl);
        } catch {
            // keep old timetable on failure
        } finally {
            setUploadingTimetable(false);
        }
    }, [divisionId]);

    const [downloadMsg, setDownloadMsg] = useState('');
    const handleDownloadTimetable = async () => {
        if (!timetableImage) return;
        const MediaLibrary = loadMediaLibrary();
        if (!MediaLibrary) { setDownloadMsg('Needs a full app build'); setTimeout(() => setDownloadMsg(''), 2500); return; }
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') { setDownloadMsg('Permission denied'); setTimeout(() => setDownloadMsg(''), 2500); return; }
            const fileUri = FileSystem.documentDirectory + 'timetable.jpg';
            await FileSystem.downloadAsync(timetableImage, fileUri);
            await MediaLibrary.saveToLibraryAsync(fileUri);
            setDownloadMsg('Saved to gallery! ✅');
            setTimeout(() => setDownloadMsg(''), 2500);
        } catch {
            setDownloadMsg('Download failed ❌');
            setTimeout(() => setDownloadMsg(''), 2500);
        }
    };

    // Shared row renderer for both the Materials and Results lists — mirrors
    // web's row layout (ext badge, title, subject tag, date, View + jump-to-
    // feed actions) so the two cards stay visually identical to each other.
    const renderFeedItemRow = useCallback((item: FeedPostLite) => (
        <View key={item.id} style={[styles.materialRow, { borderBottomColor: theme.cardBorder }]}>
            <View style={[styles.extBadge, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}>
                {item.attachmentType?.startsWith('image') ? (
                    <FolderOpen size={13} color={theme.subText} />
                ) : (
                    <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_800ExtraBold', color: theme.subText }}>{extOf(item.attachmentName)}</Text>
                )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{item.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!!item.subject && (
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.purple }} numberOfLines={1}>{item.subject}</Text>
                    )}
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{formatShortDate(item.createdAt)}</Text>
                </View>
            </View>
            <TouchableOpacity
                onPress={() => item.attachmentUrl && setPreviewItem(item)}
                disabled={!item.attachmentUrl}
                style={[styles.viewBtn, { borderColor: theme.cardBorder }]}
            >
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => jumpToFeed(item.type)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <ExternalLink size={15} color={theme.subText} />
            </TouchableOpacity>
        </View>
    ), [theme, isDark, jumpToFeed]);

    // Manage tab content — same memoization reasoning as viewPageContent
    // below (kept off the tab-switch render path so the pill/label stay
    // snappy). Phase one: students list + read-only Subjects & Teachers;
    // per-student editing comes later.
    const managePageContent = useMemo(() => {
        if (!division) return null;
        return (
            <>
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 12 }}>
                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: -12 }]}>
                    <Users size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                    <Text style={[styles.cardHeaderText, { color: theme.text }]}>Students ({sortedManageStudents.length})</Text>
                </View>
                <View style={{ flex: 1 }}>
                {manageSelectedStudent ? (
                    <Animated.View style={{ flex: 1, transform: [{ translateX: manageDetailSlideX }] }}>
                    <ScrollView ref={manageDetailScrollRef}
                        onScrollEndDrag={(e) => { manageDetailScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                        onMomentumScrollEnd={(e) => { manageDetailScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                        onLayout={(e) => { manageContainerHRef.current = e.nativeEvent.layout.height; }}
                        onContentSizeChange={(_w, h) => { manageContentHRef.current = h; }}
                        style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 24 + manageKbPad }}>
                        {/* Header — back + name + activate/deactivate + (disabled for now) Report/Profile */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={closeManageDetail} style={[styles.manageBackBtn, { borderColor: theme.cardBorder }, Platform.OS === 'android' ? { marginTop: -2 } : undefined]}>
                                <ArrowLeft size={15} color={theme.text} />
                            </TouchableOpacity>
                            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>
                                {manageSelectedStudent.user.name ?? manageSelectedStudent.studentId}
                            </Text>
                            {isClassTeacher && (
                                <TouchableOpacity onPress={handleManageToggleStatus} disabled={manageTogglingStatus}
                                    style={[styles.manageStatusBtn, { backgroundColor: manageSelectedStudent.status === 'ACTIVE' ? (isDark ? '#450A0A' : '#FEE2E2') : (isDark ? '#052E16' : '#D1FAE5') }]}>
                                    {manageSelectedStudent.status === 'ACTIVE'
                                        ? <PowerOff size={11} color={isDark ? '#FCA5A5' : '#B91C1C'} />
                                        : <Power size={11} color={isDark ? '#6EE7B7' : '#047857'} />}
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: manageSelectedStudent.status === 'ACTIVE' ? (isDark ? '#FCA5A5' : '#B91C1C') : (isDark ? '#6EE7B7' : '#047857') }}>
                                        {manageSelectedStudent.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {isClassTeacher && (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={openManageReportBoard} style={[styles.manageDisabledBtn, { borderColor: theme.cardBorder }]}>
                                    <Flag size={11} color="#EF4444" />
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' }}>Report</Text>
                                </TouchableOpacity>
                                <View style={[styles.manageDisabledBtn, { borderColor: theme.cardBorder }]}>
                                    <ExternalLink size={10} color={theme.muted} />
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>Profile - coming soon</Text>
                                </View>
                            </View>
                        )}

                        {/* Stats strip */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {[
                                { label: 'Class Rank', value: manageLoadingStats ? '…' : (manageStats?.classRank != null ? `#${manageStats.classRank}` : '-'), color: manageStats?.classRank == null ? theme.purple : manageStats.classRank === 1 ? '#F59E0B' : manageStats.classRank <= 3 ? theme.purple : '#64748B' },
                                { label: 'Score %', value: manageLoadingStats ? '…' : (manageStats?.score.pct != null ? `${manageStats.score.pct}%` : '-'), color: manageStats?.score.pct == null ? theme.purple : manageStats.score.pct >= 75 ? '#059669' : manageStats.score.pct >= 35 ? '#F59E0B' : '#DC2626' },
                                { label: 'Attendance', value: manageLoadingStats ? '…' : (manageStats?.attendance.pct != null ? `${manageStats.attendance.pct}%` : '-'), color: manageStats?.attendance.pct == null ? theme.purple : manageStats.attendance.pct >= 75 ? '#10B981' : manageStats.attendance.pct >= 65 ? '#F59E0B' : '#EF4444' },
                            ].map((stat) => (
                                <View key={stat.label} style={[styles.manageStatBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_800ExtraBold', color: stat.color }}>{stat.value}</Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{stat.label}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Account status banner */}
                        <View style={[styles.manageStatusBanner, { backgroundColor: manageSelectedStudent.hasLoggedIn ? (isDark ? '#052E16' : '#F0FDF4') : (isDark ? '#451A03' : '#FFFBEB'), borderColor: manageSelectedStudent.hasLoggedIn ? (isDark ? '#065F46' : '#BBF7D0') : (isDark ? '#78350F' : '#FDE68A') }]}>
                            <View style={[styles.dot, { width: 6, height: 6, backgroundColor: manageSelectedStudent.hasLoggedIn ? '#22C55E' : '#F59E0B' }]} />
                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: manageSelectedStudent.hasLoggedIn ? (isDark ? '#86EFAC' : '#15803D') : (isDark ? '#FCD34D' : '#B45309') }}>
                                {manageSelectedStudent.hasLoggedIn ? 'Active - student has logged in' : "Awaiting first login - student hasn't logged in yet"}
                            </Text>
                        </View>

                        {/* Student Info */}
                        <View style={styles.cardShadowWrap}>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 8 }]}>
                                <ManageSectionHeader icon={User} label="Student Info" theme={theme}
                                    editing={manageEditingSections.studentInfo} saving={manageSavingSections.studentInfo}
                                    onEdit={() => setManageEditingSections((p) => ({ ...p, studentInfo: true }))}
                                    onSave={() => handleManageSaveSection('studentInfo')}
                                    onCancel={() => { setManageEditingSections((p) => ({ ...p, studentInfo: false })); setManageEditDraft({}); }}
                                />
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <View style={{ position: 'relative' }}>
                                        <TouchableOpacity
                                            onPress={() => manageSelectedStudent.avatarUrl && setManageExpandedPhoto({ url: manageSelectedStudent.avatarUrl, name: manageSelectedStudent.user.name ?? manageSelectedStudent.studentId })}
                                            activeOpacity={manageSelectedStudent.avatarUrl ? 0.7 : 1}
                                            style={[styles.avatarSm, { width: 58, height: 58, borderRadius: 20, backgroundColor: manageSelectedStudent.avatarUrl ? 'transparent' : getAvatarColor(manageSelectedStudent.user.name ?? manageSelectedStudent.studentId) }]}>
                                            {manageSelectedStudent.avatarUrl
                                                ? <Image source={{ uri: manageSelectedStudent.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                : <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(manageSelectedStudent.user.name ?? manageSelectedStudent.studentId)}</Text>}
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={handleManagePhotoChange} disabled={manageUploadingPhoto}
                                            style={[styles.managePhotoBtn, { backgroundColor: '#DA7756', borderColor: isDark ? '#000000' : '#fff' }]}>
                                            {manageUploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={11} color="#fff" />}
                                        </TouchableOpacity>
                                    </View>
                                    {manageEditingSections.studentInfo ? (
                                        <TextInput ref={manageNameInputRef} value={manageDName()} onChangeText={(v) => setManageEditDraft((p) => ({ ...p, name: v }))}
                                            onFocus={() => scrollManageFieldAboveKeyboard(manageNameInputRef.current)}
                                            textAlignVertical="center"
                                            includeFontPadding={false}
                                            style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.purple, paddingVertical: 2 }} />
                                    ) : (
                                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }}>{manageSelectedStudent.user.name ?? '-'}</Text>
                                    )}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {manageEditingSections.studentInfo ? (
                                        <>
                                            <View style={{ flex: 1 }}><ManageEditField label="Date of Birth" value={manageD('dob')} onChange={(v) => manageSet('dob')(formatDob(v))} placeholder="YYYY-MM-DD" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="numeric" /></View>
                                            <View style={{ flex: 1 }}><ManageChips label="Gender" value={manageD('gender')} options={MANAGE_GENDERS} onChange={manageSet('gender')} theme={theme} activeColor="#DA7756" /></View>
                                        </>
                                    ) : (
                                        <>
                                            <View style={{ flex: 1 }}><ManageReadField label="Date of Birth" value={manageD('dob')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="Gender" value={manageD('gender') ? MANAGE_GENDERS.find((g) => g.value === manageD('gender'))?.label ?? manageD('gender') : ''} theme={theme} /></View>
                                        </>
                                    )}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {manageEditingSections.studentInfo ? (
                                        <>
                                            <View style={{ flex: 1 }}><ManageEditField label="Religion" value={manageD('religion')} onChange={manageSet('religion')} placeholder="e.g. Hindu" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                            <View style={{ flex: 1 }}><ManageChips label="Category" value={manageD('category')} options={MANAGE_CATEGORIES} onChange={manageSet('category')} theme={theme} activeColor="#DA7756" /></View>
                                        </>
                                    ) : (
                                        <>
                                            <View style={{ flex: 1 }}><ManageReadField label="Religion" value={manageD('religion')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="Category" value={manageD('category')} theme={theme} /></View>
                                        </>
                                    )}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {manageEditingSections.studentInfo ? (
                                        <>
                                            <View style={{ flex: 1 }}><ManageEditField label="Nationality" value={manageD('nationality')} onChange={manageSet('nationality')} placeholder="e.g. Indian" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                            <View style={{ flex: 1 }}><ManageEditField label="Admission Year" value={manageD('admissionYear')} onChange={(v) => { if (v.replace(/\D/g, '').length <= 4) manageSet('admissionYear')(v.replace(/\D/g, '')); }} placeholder="e.g. 2022" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="numeric" /></View>
                                        </>
                                    ) : (
                                        <>
                                            <View style={{ flex: 1 }}><ManageReadField label="Nationality" value={manageD('nationality')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="Admission Year" value={manageD('admissionYear')} theme={theme} /></View>
                                        </>
                                    )}
                                </View>
                                {manageEditingSections.studentInfo ? (
                                    <>
                                        <ManageEditField label="Email" value={manageDEmail()} onChange={manageSet('email')} placeholder="student@example.com" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="email-address" />
                                        <ManagePhoneField label="Contact No" value={manageD('phone')} onChange={manageSet('phone')} theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} />
                                    </>
                                ) : (
                                    <>
                                        <ManageReadField label="Email" value={isPlaceholderEmail(manageSelectedStudent.user.email) ? '' : manageSelectedStudent.user.email} theme={theme} />
                                        <ManageReadField label="Contact No" value={manageD('phone')} theme={theme} />
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Academic Details */}
                        <View style={styles.cardShadowWrap}>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 8 }]}>
                                <ManageSectionHeader icon={BookOpen} label="Academic Details" theme={theme}
                                    editing={manageEditingSections.academic} saving={manageSavingSections.academic}
                                    onEdit={() => setManageEditingSections((p) => ({ ...p, academic: true }))}
                                    onSave={() => handleManageSaveSection('academic')}
                                    onCancel={() => { setManageEditingSections((p) => ({ ...p, academic: false })); setManageEditDraft({}); }}
                                />
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <View style={{ flex: 1 }}><ManageReadField label="Class" value={division.standard.name.replace(/^Class\s*/i, '')} theme={theme} /></View>
                                    <View style={{ flex: 1 }}><ManageReadField label="Division" value={division.name.split('-').pop() ?? division.name} theme={theme} /></View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {manageEditingSections.academic ? (
                                        <>
                                            <View style={{ flex: 1 }}><ManageEditField label="Roll No" value={manageD('rollNo')} onChange={manageSet('rollNo')} placeholder="e.g. 01" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="numeric" /></View>
                                            <View style={{ flex: 1 }}><ManageEditField label="House Color" value={manageD('houseColor')} onChange={manageSet('houseColor')} placeholder="e.g. Red" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                        </>
                                    ) : (
                                        <>
                                            <View style={{ flex: 1 }}><ManageReadField label="Roll No" value={manageD('rollNo')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="House Color" value={manageD('houseColor')} theme={theme} /></View>
                                        </>
                                    )}
                                </View>
                                {/* Student ID - always readonly, mirrors web's monospace/terracotta treatment */}
                                <View>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>Student ID</Text>
                                    <View style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 13, fontFamily: 'RobotoMono_600SemiBold', color: '#DA7756' }}>{manageSelectedStudent.studentId}</Text>
                                        <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Read only</Text>
                                    </View>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>
                                        {manageSelectedStudent.user.mustChangePassword ? 'Initial Password' : 'Current Password'}
                                    </Text>
                                    <View style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: manageSelectedStudent.user.mustChangePassword ? theme.purple : theme.subText }}>
                                            {manageSelectedStudent.user.mustChangePassword
                                                ? (manageShowPassword ? (manageSelectedStudent.tempPassword ?? '-') : '••••••••••')
                                                : '(changed by student)'}
                                        </Text>
                                        {manageSelectedStudent.user.mustChangePassword && (
                                            <TouchableOpacity onPress={() => setManageShowPassword((v) => !v)}>
                                                {manageShowPassword ? <EyeOff size={14} color={theme.subText} /> : <Eye size={14} color={theme.subText} />}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    {isClassTeacher && (
                                        <TouchableOpacity onPress={handleManageResetPassword} disabled={manageResettingPassword} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                                            <RotateCcw size={12} color="#F59E0B" />
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B' }}>{manageResettingPassword ? 'Resetting…' : 'Reset Password'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Medical & Identity */}
                        <View style={styles.cardShadowWrap}>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 8 }]}>
                                <ManageSectionHeader icon={Shield} label="Medical & Identity" theme={theme}
                                    editing={manageEditingSections.medical} saving={manageSavingSections.medical}
                                    onEdit={() => setManageEditingSections((p) => ({ ...p, medical: true }))}
                                    onSave={() => handleManageSaveSection('medical')}
                                    onCancel={() => { setManageEditingSections((p) => ({ ...p, medical: false })); setManageEditDraft({}); }}
                                />
                                {manageEditingSections.medical ? (
                                    <>
                                        <ManageChips label="Blood Group" value={manageD('bloodGroup')} options={MANAGE_BLOOD_GROUPS} onChange={manageSet('bloodGroup')} theme={theme} activeColor="#DA7756" />
                                        <ManageEditField label="Aadhar No" value={manageD('aadharNo')} onChange={(v) => manageSet('aadharNo')(formatAadhar(v))} placeholder="XXXX XXXX XXXX" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="numeric" />
                                        <ManageEditField label="PAN No" value={manageD('panNo')} onChange={(v) => { if (v.replace(/\s/g, '').length <= 10) manageSet('panNo')(v.toUpperCase()); }} placeholder="ABCDE1234F" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} />
                                        <ManagePhoneField label="Emergency Contact" value={manageD('emergencyContact')} onChange={manageSet('emergencyContact')} theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} />
                                    </>
                                ) : (
                                    <>
                                        <View style={[styles.manageBloodBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: isDark ? '#7F1D1D' : '#FECACA' }]}>
                                            <Heart size={16} color="#EF4444" />
                                            <View>
                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' }}>Blood Group</Text>
                                                <Text style={{ fontSize: 15, fontFamily: 'Poppins_800ExtraBold', color: '#EF4444' }}>{manageD('bloodGroup') || '-'}</Text>
                                            </View>
                                        </View>
                                        <ManageReadField label="Aadhar No" value={manageD('aadharNo')} theme={theme} />
                                        <ManageReadField label="PAN No" value={manageD('panNo')} theme={theme} />
                                        <ManageReadField label="Emergency Contact" value={manageD('emergencyContact')} theme={theme} />
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Address */}
                        <View style={styles.cardShadowWrap}>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 8 }]}>
                                <ManageSectionHeader icon={MapPin} label="Address" theme={theme}
                                    editing={manageEditingSections.address} saving={manageSavingSections.address}
                                    onEdit={() => setManageEditingSections((p) => ({ ...p, address: true }))}
                                    onSave={() => handleManageSaveSection('address')}
                                    onCancel={() => { setManageEditingSections((p) => ({ ...p, address: false })); setManageEditDraft({}); }}
                                />
                                {manageEditingSections.address ? (
                                    <>
                                        <ManageEditField label="Address" value={manageD('address')} onChange={manageSet('address')} placeholder="Street / Area" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} />
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <View style={{ flex: 1 }}><ManageEditField label="City" value={manageD('city')} onChange={manageSet('city')} placeholder="Mumbai" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                            <View style={{ flex: 1 }}><ManageEditField label="State" value={manageD('state')} onChange={manageSet('state')} placeholder="Maharashtra" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <View style={{ flex: 1 }}><ManageEditField label="Pincode" value={manageD('pincode')} onChange={manageSet('pincode')} placeholder="400001" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} keyboardType="numeric" /></View>
                                            <View style={{ flex: 1 }}><ManageEditField label="Country" value={manageD('country')} onChange={manageSet('country')} placeholder="India" theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} /></View>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <ManageReadField label="Address" value={manageD('address')} theme={theme} multiline />
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <View style={{ flex: 1 }}><ManageReadField label="City" value={manageD('city')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="State" value={manageD('state')} theme={theme} /></View>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <View style={{ flex: 1 }}><ManageReadField label="Pincode" value={manageD('pincode')} theme={theme} /></View>
                                            <View style={{ flex: 1 }}><ManageReadField label="Country" value={manageD('country')} theme={theme} /></View>
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Parents / Guardian */}
                        <View style={styles.cardShadowWrap}>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 8 }]}>
                                <ManageSectionHeader icon={Users} label="Parents / Guardian" theme={theme}
                                    editing={manageEditingSections.guardians} saving={manageSavingSections.guardians}
                                    onEdit={() => {
                                        setManageEditDraft((p) => ({ ...p, guardians: (manageSelectedStudent.guardians ?? []).map((g) => ({ ...g })) }));
                                        setManageEditingSections((p) => ({ ...p, guardians: true }));
                                    }}
                                    onSave={() => handleManageSaveSection('guardians')}
                                    onCancel={() => { setManageEditingSections((p) => ({ ...p, guardians: false })); setManageEditDraft((p) => ({ ...p, guardians: undefined })); }}
                                />
                                {manageEditingSections.guardians && (
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: -4, marginBottom: 2 }}>
                                        <TouchableOpacity onPress={() => setManageEditDraft((p) => ({ ...p, guardians: [...(p.guardians ?? []), { name: '', number: '', relation: 'Father' }] }))}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Plus size={9} color={theme.purple} /><Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Parent</Text></View>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setManageEditDraft((p) => ({ ...p, guardians: [...(p.guardians ?? []), { name: '', number: '', relation: 'Guardian' }] }))}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Plus size={9} color={theme.purple} /><Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Guardian</Text></View>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {(manageSelectedStudent.guardians ?? []).length === 0 && !manageEditingSections.guardians && (
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6 }}>No parents or guardians added yet</Text>
                                )}
                                {(manageEditingSections.guardians ? (manageEditDraft.guardians ?? []) : (manageSelectedStudent.guardians ?? [])).map((g, i) => (
                                    <View key={i} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, gap: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>{g.relation || `Entry ${i + 1}`}</Text>
                                            {manageEditingSections.guardians && (
                                                <TouchableOpacity
                                                    onPress={() => Alert.alert(
                                                        `Remove ${g.relation?.toLowerCase() === 'guardian' ? 'guardian' : 'parent'}?`,
                                                        `${g.name || `Entry ${i + 1}`} will be removed once you save.`,
                                                        [
                                                            { text: 'Cancel', style: 'cancel' },
                                                            { text: 'Remove', style: 'destructive', onPress: () => setManageEditDraft((p) => ({ ...p, guardians: (p.guardians ?? []).filter((_, gi) => gi !== i) })) },
                                                        ]
                                                    )}
                                                    style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.cardBorder }}>
                                                    <Trash2 size={11} color="#EF4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        {manageEditingSections.guardians ? (
                                            <>
                                                <ManageEditField label="Name" value={g.name} theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} placeholder="e.g. Rajesh Mehta"
                                                    onChange={(v) => { const updated = [...(manageEditDraft.guardians ?? [])]; updated[i] = { ...updated[i], name: v }; setManageEditDraft((p) => ({ ...p, guardians: updated })); }} />
                                                <ManagePhoneField label="Number" value={g.number} theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard}
                                                    onChange={(v) => { const updated = [...(manageEditDraft.guardians ?? [])]; updated[i] = { ...updated[i], number: v }; setManageEditDraft((p) => ({ ...p, guardians: updated })); }} />
                                                <ManageEditField label="Relation" value={g.relation} theme={theme} onFieldFocus={scrollManageFieldAboveKeyboard} placeholder="e.g. Father"
                                                    onChange={(v) => { const updated = [...(manageEditDraft.guardians ?? [])]; updated[i] = { ...updated[i], relation: v }; setManageEditDraft((p) => ({ ...p, guardians: updated })); }} />
                                            </>
                                        ) : (
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                <View style={{ flex: 1 }}><ManageReadField label="Name" value={g.name} theme={theme} /></View>
                                                <View style={{ flex: 1 }}><ManageReadField label="Number" value={g.number} theme={theme} /></View>
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>
                    </ScrollView>
                    </Animated.View>
                ) : (
                    <View style={{ flex: 1 }}>
                        {loadingManageStudents ? (
                            <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                        ) : sortedManageStudents.length === 0 ? (
                            <View style={styles.centerFill}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students yet</Text>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {sortedManageStudents.map((student) => {
                                        const lb = leaderboard.find((e) => e.id === student.id);
                                        return (
                                            <TouchableOpacity key={student.id} onPress={() => setManageSelectedStudent(student)} activeOpacity={0.7} style={[styles.manageStudentRow, { paddingHorizontal: 0, borderBottomColor: theme.cardBorder }]}>
                                                <TouchableOpacity
                                                    onPress={(e) => { if (student.avatarUrl) { e.stopPropagation(); setManageExpandedPhoto({ url: student.avatarUrl, name: student.user.name ?? student.studentId }); } }}
                                                    activeOpacity={student.avatarUrl ? 0.7 : 1}
                                                    style={[styles.avatarSm, { width: 42, height: 42, borderRadius: 14, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.user.name ?? student.studentId) }]}>
                                                    {student.avatarUrl
                                                        ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                        : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.user.name ?? student.studentId)}</Text>}
                                                </TouchableOpacity>
                                                <View style={{ flex: 1, gap: 2 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{student.user.name ?? '-'}</Text>
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                                                        {student.studentId}{student.rollNo ? ` · Roll ${student.rollNo}` : ''}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                                                    {!student.hasLoggedIn && (
                                                        <View style={[styles.manageBadge, { backgroundColor: isDark ? '#451A03' : '#FEF3C7' }]}>
                                                            <Text style={[styles.manageBadgeText, { color: isDark ? '#FCD34D' : '#B45309' }]}>First login</Text>
                                                        </View>
                                                    )}
                                                    {student.status === 'INACTIVE' && (
                                                        <View style={[styles.manageBadge, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2' }]}>
                                                            <Text style={[styles.manageBadgeText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>Inactive</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <View style={{ alignItems: 'center', minWidth: 34 }}>
                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: theme.purple }}>{lb ? `#${lb.rank}` : '-'}</Text>
                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>rank</Text>
                                                </View>
                                                <View style={{ alignItems: 'center', minWidth: 40 }}>
                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: lb?.attendancePct == null ? theme.muted : lb.attendancePct >= 75 ? '#059669' : lb.attendancePct >= 65 ? '#F59E0B' : '#DC2626' }}>
                                                        {lb?.attendancePct != null ? `${lb.attendancePct}%` : '-'}
                                                    </Text>
                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>attend.</Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                        )}
                    </View>
                )}

                {manageReportBoardOpen && (
                    <ManageReportBoard
                        theme={theme} isDark={isDark} onClose={closeManageReportBoard} slideX={manageReportBoardSlideX}
                        studentName={manageSelectedStudent?.user.name ?? 'Student'}
                        flags={manageReportFlags} loading={manageReportLoadingList}
                        onAdd={() => openManageReportForm()} onEdit={openManageReportForm}
                    />
                )}

                {manageReportModalOpen && (
                    <ManageReportForm
                        theme={theme} isDark={isDark}
                        studentName={manageSelectedStudent?.user.name ?? 'Student'}
                        editing={manageReportEditing} form={manageReportForm} setForm={setManageReportForm}
                        attachments={manageReportAttachments} setAttachments={setManageReportAttachments}
                        uploading={manageReportUploading} onAttach={handleManageReportAttach}
                        submitting={manageReportSubmitting} onSubmit={handleManageReportSubmit}
                        onCancel={closeManageReportForm}
                        categoryPickerOpen={manageReportCategoryPickerOpen} setCategoryPickerOpen={setManageReportCategoryPickerOpen}
                    />
                )}
                </View>
            </View>

            {/* Expanded student photo — tap avatar in list or detail header */}
            <Modal visible={!!manageExpandedPhoto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setManageExpandedPhoto(null)}>
                <Pressable style={[styles.timetableOverlay, { backgroundColor: 'rgba(0,0,0,0.75)' }]} onPress={() => setManageExpandedPhoto(null)}>
                    {manageExpandedPhoto && (
                        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 260, height: 260, borderRadius: 18, overflow: 'hidden' }}>
                            <Image source={{ uri: manageExpandedPhoto.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            <TouchableOpacity onPress={() => setManageExpandedPhoto(null)} style={[styles.previewCloseBtn, { position: 'absolute', top: 8, right: 8 }]}>
                                <X size={14} color="#fff" />
                            </TouchableOpacity>
                        </Pressable>
                    )}
                </Pressable>
            </Modal>

            {/* Reset password - confirm / result / error. Themed to match the
                rest of the app instead of the OS Alert. */}
            <Modal visible={manageResetPwConfirmOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setManageResetPwConfirmOpen(false)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setManageResetPwConfirmOpen(false)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 280, borderRadius: 18, padding: 18, backgroundColor: theme.card, alignItems: 'center' }}>
                        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <RotateCcw size={20} color="#F59E0B" />
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center' }}>Reset password?</Text>
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.subText, textAlign: 'center', marginTop: 6, lineHeight: 16 }}>
                            {`This generates a new temporary password for ${manageSelectedStudent?.user.name ?? 'this student'}. They'll need it to log in and set a new one.`}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' }}>
                            <TouchableOpacity onPress={() => setManageResetPwConfirmOpen(false)} style={{ flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={confirmManageResetPassword} style={{ flex: 1, height: 36, borderRadius: 10, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Yes, Reset</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={!!manageResetPwResult} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setManageResetPwResult(null)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setManageResetPwResult(null)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 280, borderRadius: 18, padding: 18, backgroundColor: theme.card, alignItems: 'center' }}>
                        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#052E16' : '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <CheckCircle2 size={20} color={isDark ? '#6EE7B7' : '#047857'} />
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center' }}>Password reset</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText, textAlign: 'center', marginTop: 4 }}>New temporary password - share it with the student.</Text>
                        <View style={{ marginTop: 12, width: '100%', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, alignItems: 'center' }}>
                            <Text style={{ fontSize: 15, fontFamily: 'Poppins_800ExtraBold', color: theme.purple, letterSpacing: 1 }}>{manageResetPwResult}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' }}>
                            <TouchableOpacity onPress={() => manageResetPwResult && Clipboard.setStringAsync(manageResetPwResult)} style={{ flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Copy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setManageResetPwResult(null)} style={{ flex: 1, height: 36, borderRadius: 10, backgroundColor: theme.purple, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={!!manageResetPwError} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setManageResetPwError(null)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setManageResetPwError(null)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 280, borderRadius: 18, padding: 18, backgroundColor: theme.card, alignItems: 'center' }}>
                        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#450A0A' : '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <X size={20} color={isDark ? '#FCA5A5' : '#B91C1C'} />
                        </View>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center' }}>Error</Text>
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.subText, textAlign: 'center', marginTop: 6, lineHeight: 16 }}>{manageResetPwError}</Text>
                        <TouchableOpacity onPress={() => setManageResetPwError(null)} style={{ height: 36, borderRadius: 10, backgroundColor: theme.purple, alignItems: 'center', justifyContent: 'center', marginTop: 16, width: '100%' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>OK</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            </>
        );
    }, [
        division, trackBg, isDark, theme, sortedManageStudents, loadingManageStudents, leaderboard,
        manageSelectedStudent, isClassTeacher, manageTogglingStatus, handleManageToggleStatus, manageStats, manageLoadingStats,
        manageEditingSections, manageSavingSections, handleManageSaveSection, manageDName, manageDEmail, manageD, manageSet,
        manageUploadingPhoto, handleManagePhotoChange, manageShowPassword, manageResettingPassword, handleManageResetPassword,
        manageEditDraft, manageExpandedPhoto, manageDetailSlideX, closeManageDetail, scrollManageFieldAboveKeyboard, manageKbPad,
        manageResetPwConfirmOpen, confirmManageResetPassword, manageResetPwResult, manageResetPwError,
        manageReportBoardOpen, openManageReportBoard, manageReportFlags, manageReportLoadingList,
        openManageReportForm, manageReportModalOpen, manageReportEditing, manageReportForm,
        manageReportAttachments, manageReportUploading, manageReportSubmitting, handleManageReportAttach, handleManageReportSubmit,
        resetManageReportForm, manageReportCategoryPickerOpen,
        manageReportBoardSlideX, closeManageReportBoard, closeManageReportForm,
    ]);

    const attendancePageContent = useMemo(() => {
        const today = new Date();
        const startOffset = (new Date(attCalYear, attCalMonth, 1).getDay() + 6) % 7;
        const daysInCalMonth = new Date(attCalYear, attCalMonth + 1, 0).getDate();
        const attCalendarCells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInCalMonth }, (_, i) => i + 1)];
        while (attCalendarCells.length % 7 !== 0) attCalendarCells.push(null);

        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
                <View style={[styles.manageSegTrack, { backgroundColor: trackBg }]}>
                    {(['daily', 'sheet', 'overall'] as const).map((key) => {
                        const active = attSubTab === key;
                        return (
                            <TouchableOpacity key={key} onPress={() => setAttSubTab(key)}
                                style={[styles.manageSegBtn, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>
                                    {key === 'daily' ? 'Daily' : key === 'sheet' ? 'Sheet' : 'Overall'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {attSubTab === 'overall' ? (
                    <View style={{ flex: 1, gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.manageSegTrack, { backgroundColor: trackBg, flex: 1 }]}>
                                {(['class', 'student'] as const).map((key) => {
                                    const active = attOverallRightTab === key;
                                    return (
                                        <TouchableOpacity key={key} onPress={() => setAttOverallRightTab(key)}
                                            style={[styles.manageSegBtn, { flex: 1, alignItems: 'center' }, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>
                                                {key === 'class' ? 'Class Overview' : 'Student Details'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <TouchableOpacity
                                onPress={() => Alert.alert('Get List', 'Export attendance report', [
                                    { text: 'All Months', onPress: () => handleAttGetList('all') },
                                    { text: 'Current Month', onPress: () => handleAttGetList('current') },
                                    { text: 'Cancel', style: 'cancel' },
                                ])}
                                style={[styles.attGetListBtn, { backgroundColor: theme.purple }]}>
                                <Download size={12} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {attOverallRightTab === 'student' && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                {sortedAttStudents.map((s) => {
                                    const active = attOverallSelectedId === s.studentId;
                                    return (
                                        <TouchableOpacity key={s.studentId} onPress={() => setAttOverallSelectedId(s.studentId)}
                                            style={[styles.attStudentChip, { backgroundColor: active ? theme.purple : trackBg }]}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : theme.subText }} numberOfLines={1}>{s.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}

                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
                            {attOverallRightTab === 'class' ? (
                                <>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.manageStatBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attClassStats?.overallPct ?? null) }}>{attClassStats?.overallPct != null ? `${attClassStats.overallPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Class Overall</Text>
                                        </View>
                                        <View style={[styles.manageStatBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attClassStats?.currentMonthPct ?? null) }}>{attClassStats?.currentMonthPct != null ? `${attClassStats.currentMonthPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>This Month Avg</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardShadowWrap}>
                                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                            <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Month-wise Class Average</Text>
                                                <TouchableOpacity onPress={() => setAttSubTab('daily')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <CalendarDays size={11} color={theme.purple} />
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>View Daily</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
                                                {ATT_SHEET_MONTHS_ORDER.map((m) => {
                                                    const yr = m.key >= 5 ? attStartYear : attStartYear + 1;
                                                    const mk = `${yr}-${String(m.key + 1).padStart(2, '0')}`;
                                                    const avg = attClassStats?.monthlyStats.find((s) => s.monthKey === mk)?.avg ?? null;
                                                    return (
                                                        <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            <Text style={{ width: 66, fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{m.month}</Text>
                                                            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: trackBg, overflow: 'hidden' }}>
                                                                {avg !== null && <View style={{ width: `${avg}%`, height: '100%', borderRadius: 3, backgroundColor: attPctColor(avg) }} />}
                                                            </View>
                                                            <Text style={{ width: 34, textAlign: 'right', fontSize: 10.5, fontFamily: 'Poppins_800ExtraBold', color: avg !== null ? attPctColor(avg) : theme.muted }}>{avg !== null ? `${avg}%` : '—'}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.cardShadowWrap}>
                                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                            <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Short Attendance</Text>
                                                <View style={[styles.manageSegTrack, { backgroundColor: trackBg, padding: 2 }]}>
                                                    {(['month', 'overall'] as const).map((key) => {
                                                        const active = attShortTab === key;
                                                        return (
                                                            <TouchableOpacity key={key} onPress={() => setAttShortTab(key)}
                                                                style={[styles.manageSegBtn, { paddingHorizontal: 8, paddingVertical: 4 }, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
                                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>{key === 'month' ? 'This Month' : 'Overall'}</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                            {(() => {
                                                const filtered = attOverallStudents.filter((s) => (attShortTab === 'month' ? (s.currentMonthPct ?? 100) : (s.overallPct ?? 100)) < 75);
                                                if (filtered.length === 0) {
                                                    return <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#10B981', textAlign: 'center', paddingVertical: 14 }}>✓ All students above 75%</Text>;
                                                }
                                                return filtered.map((s) => {
                                                    const pct = attShortTab === 'month' ? s.currentMonthPct : s.overallPct;
                                                    return (
                                                        <View key={s.studentId} style={[styles.manageStudentRow, { borderBottomColor: theme.cardBorder }]}>
                                                            <View style={[styles.avatarSm, { width: 24, height: 24, borderRadius: 8, backgroundColor: s.avatarUrl ? 'transparent' : getAvatarColor(s.name) }]}>
                                                                {s.avatarUrl
                                                                    ? <Image source={{ uri: s.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                    : <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(s.name)}</Text>}
                                                            </View>
                                                            <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{s.name}</Text>
                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {s.rollNo}</Text>
                                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(pct) }}>{pct != null ? `${pct}%` : '—'}</Text>
                                                        </View>
                                                    );
                                                });
                                            })()}
                                        </View>
                                    </View>
                                </>
                            ) : !attSelectedOverallStudent ? (
                                <View style={styles.centerFill}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>Select a student</Text>
                                </View>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.manageStatBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attSelectedOverallStudent.overallPct) }}>{attSelectedOverallStudent.overallPct != null ? `${attSelectedOverallStudent.overallPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Overall</Text>
                                        </View>
                                        <View style={[styles.manageStatBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attSelectedOverallStudent.currentMonthPct) }}>{attSelectedOverallStudent.currentMonthPct != null ? `${attSelectedOverallStudent.currentMonthPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>This Month</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardShadowWrap}>
                                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                            <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder }]}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Month-wise Attendance</Text>
                                            </View>
                                            <View style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}>
                                                {ATT_SHEET_MONTHS_ORDER.map((m) => {
                                                    const yr = m.key >= 5 ? attStartYear : attStartYear + 1;
                                                    const mk = `${yr}-${String(m.key + 1).padStart(2, '0')}`;
                                                    const pct = attSelectedOverallStudent.monthlyStats.find((s) => s.monthKey === mk)?.pct ?? null;
                                                    return (
                                                        <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={{ width: 40, fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{m.short}</Text>
                                                            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: trackBg, overflow: 'hidden' }}>
                                                                {pct !== null && <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: attPctColor(pct) }} />}
                                                            </View>
                                                            <Text style={{ width: 30, textAlign: 'right', fontSize: 9.5, fontFamily: 'Poppins_800ExtraBold', color: pct !== null ? attPctColor(pct) : theme.muted }}>{pct !== null ? `${pct}%` : '—'}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.cardShadowWrap}>
                                        <View style={[styles.card, { backgroundColor: '#F5F8EE', borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                                            <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Attendance Sheet — {attSelectedOverallStudent.name}</Text>
                                            </View>
                                            {attLoadingStudentRec ? (
                                                <View style={{ paddingVertical: 24 }}><ActivityIndicator color={theme.purple} /></View>
                                            ) : (
                                                <ScrollView horizontal showsHorizontalScrollIndicator>
                                                    <View>
                                                        <View style={{ flexDirection: 'row' }}>
                                                            <Text style={[styles.attGridHeadCell, { width: 40 }]}>Mo</Text>
                                                            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                                                <Text key={d} style={[styles.attGridHeadCell, { width: 22 }]}>{d}</Text>
                                                            ))}
                                                        </View>
                                                        {ATT_SHEET_MONTHS_ORDER.map((m) => {
                                                            const mYear = m.key >= 5 ? attStartYear : attStartYear + 1;
                                                            const daysInM = new Date(mYear, m.key + 1, 0).getDate();
                                                            return (
                                                                <View key={m.key} style={{ flexDirection: 'row' }}>
                                                                    <Text style={[styles.attGridCell, { width: 40 }]}>{m.short}</Text>
                                                                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                                                                        const isOut = d > daysInM;
                                                                        const isSun = !isOut && new Date(mYear, m.key, d).getDay() === 0;
                                                                        const dk = attMakeDateKey(mYear, m.key, d);
                                                                        const isHol = !isOut && !isSun && !!attHolidays[dk];
                                                                        const status: AttendanceStatus = !isOut && !isSun && !isHol ? (attStudentRecords[dk] ?? null) : null;
                                                                        return (
                                                                            <View key={d} style={[styles.attGridDayCell, { width: 22, backgroundColor: isOut ? '#ECF3D0' : isSun || isHol ? '#FFF0F0' : 'transparent' }]}>
                                                                                {isOut ? <Text style={{ fontSize: 9, color: '#BACE85' }}>·</Text>
                                                                                    : isHol ? <Text style={{ fontSize: 10, color: '#FCA5A5' }}>×</Text>
                                                                                        : status ? <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_800ExtraBold', color: status === 'P' ? '#16A34A' : status === 'A' ? '#DC2626' : '#D97706' }}>{status}</Text>
                                                                                            : <Text style={{ fontSize: 9, color: '#BACE85' }}>—</Text>}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                </ScrollView>
                                            )}
                                        </View>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                ) : attSubTab === 'sheet' ? (
                    <View style={{ flex: 1, gap: 8 }}>
                        {/* Month chips — same order as web's academic year (Jun→May) */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {[5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4].map((mIdx) => {
                                const active = attSheetMonth === mIdx;
                                const hasSelectedDate = attSelectedDate.getMonth() === mIdx;
                                return (
                                    <TouchableOpacity key={mIdx} onPress={() => setAttSheetMonth(mIdx)}
                                        style={[styles.attMonthChip, { backgroundColor: active ? theme.purple : trackBg }]}>
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : theme.subText }}>{ATT_MONTHS[mIdx].slice(0, 3)}</Text>
                                        {hasSelectedDate && !active && <View style={[styles.attMonthChipDot, { backgroundColor: theme.purple }]} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Grid — horizontal scroll carries the header along with the
                            rows so columns stay aligned; only the row area scrolls
                            vertically, so the header stays put at the top. Web pins
                            Roll/Name/ID on the left too — true sticky-left needs more
                            machinery than a plain ScrollView gives on mobile, so here
                            they scroll with everything else. */}
                        <View style={[styles.cardShadowWrap, { flex: 1 }]}>
                            <View style={[styles.card, { flex: 1, backgroundColor: '#F5F8EE', borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                                <ScrollView horizontal showsHorizontalScrollIndicator>
                                    <View>
                                        <View style={{ flexDirection: 'row' }}>
                                            <Text style={[styles.attGridHeadCell, { width: 46 }]}>Roll</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 96, textAlign: 'left' }]}>Name</Text>
                                            {Array.from({ length: new Date(attSheetYear, attSheetMonth + 1, 0).getDate() }, (_, i) => i + 1).map((d) => {
                                                const dk = attMakeDateKey(attSheetYear, attSheetMonth, d);
                                                const isSel = d === attSelectedDate.getDate() && attSheetMonth === attSelectedDate.getMonth() && attSheetYear === attSelectedDate.getFullYear();
                                                const weekend = new Date(attSheetYear, attSheetMonth, d).getDay() === 0;
                                                const isHol = !!attHolidays[dk];
                                                return (
                                                    <TouchableOpacity key={d} onPress={() => setAttHeaderPopupDate(d)}
                                                        style={[styles.attGridDateHead, { backgroundColor: isHol || weekend ? '#FFE4E4' : isSel ? '#DCEAFE' : '#ECF3D0' }]}>
                                                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: isHol || weekend ? '#EF4444' : '#2A3A10' }}>{d}</Text>
                                                        {!!attDateRemarks[dk] && !isHol && <View style={styles.attGridRemarkDot} />}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                            <Text style={[styles.attGridHeadCell, { width: 30 }]}>P</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 30 }]}>A</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 30 }]}>L</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 34 }]}>T</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 42 }]}>%</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 42 }]}>Σ%</Text>
                                        </View>
                                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                            {sortedAttStudents.map((student) => {
                                                const daysInSheetMonth = new Date(attSheetYear, attSheetMonth + 1, 0).getDate();
                                                let p = 0, a = 0, l = 0;
                                                const dayCells = Array.from({ length: daysInSheetMonth }, (_, i) => i + 1).map((d) => {
                                                    const dk = attMakeDateKey(attSheetYear, attSheetMonth, d);
                                                    if (attHolidays[dk]) return { d, dk, status: null as AttendanceStatus, isHol: true, weekend: false };
                                                    const status = attGetLiveStatus(student.id, dk);
                                                    if (status === 'P') p++; else if (status === 'A') a++; else if (status === 'L') l++;
                                                    return { d, dk, status, isHol: false, weekend: new Date(attSheetYear, attSheetMonth, d).getDay() === 0 };
                                                });
                                                const total = p + a + l;
                                                const pct = total > 0 ? Math.round(((p + l) / total) * 100) : null;
                                                const cum = attCumulativePctFor(student);
                                                return (
                                                    <View key={student.id} style={{ flexDirection: 'row' }}>
                                                        <Text style={[styles.attGridCell, { width: 46, fontFamily: 'Poppins_700Bold' }]}>{student.rollNo || '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 96, textAlign: 'left' }]} numberOfLines={1}>{student.name}</Text>
                                                        {dayCells.map(({ d, dk, status, isHol, weekend }) => (
                                                            <View key={d} style={[styles.attGridDayCell, { backgroundColor: isHol ? '#FEF2F2' : weekend ? '#FFF5F5' : dk === attCurrentDk ? '#EEF4FF' : 'transparent' }]}>
                                                                {isHol ? (
                                                                    <Text style={{ fontSize: 10, color: '#FCA5A5' }}>×</Text>
                                                                ) : status ? (
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_800ExtraBold', color: status === 'P' ? '#16A34A' : status === 'A' ? '#DC2626' : '#D97706' }}>{status}</Text>
                                                                ) : (
                                                                    <Text style={{ fontSize: 10, color: '#BACE85' }}>—</Text>
                                                                )}
                                                            </View>
                                                        ))}
                                                        <Text style={[styles.attGridCell, { width: 30, color: '#059669', fontFamily: 'Poppins_700Bold' }]}>{p || '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 30, color: '#EF4444', fontFamily: 'Poppins_700Bold' }]}>{a || '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 30, color: '#D97706', fontFamily: 'Poppins_700Bold' }]}>{l || '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 34, fontFamily: 'Poppins_700Bold' }]}>{total || '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 42, fontFamily: 'Poppins_800ExtraBold', color: pct !== null ? attPctColor(pct) : '#BACE85' }]}>{pct !== null ? `${pct}%` : '—'}</Text>
                                                        <Text style={[styles.attGridCell, { width: 42, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(cum) }]}>{cum !== null ? `${cum}%` : '—'}</Text>
                                                    </View>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                </ScrollView>
                            </View>
                        </View>

                        {/* Legend */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {[{ l: 'P', c: '#16A34A', t: 'Present' }, { l: 'A', c: '#DC2626', t: 'Absent' }, { l: 'L', c: '#D97706', t: 'Late' }].map((it) => (
                                <View key={it.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_800ExtraBold', color: it.c }}>{it.l}</Text>
                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{it.t}</Text>
                                </View>
                            ))}
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', marginLeft: 'auto' }}>Tap a date for options</Text>
                        </View>
                    </View>
                ) : (
                    <>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={() => setAttShowDatePicker(true)}
                                style={[styles.attDateBtn, { borderColor: attIsHoliday || attIsSunday ? '#FCA5A5' : theme.cardBorder, backgroundColor: attIsHoliday || attIsSunday ? (isDark ? '#450A0A' : '#FEF2F2') : theme.card }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <CalendarDays size={13} color={attIsHoliday || attIsSunday ? '#EF4444' : theme.subText} />
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: attIsHoliday || attIsSunday ? '#EF4444' : theme.text }}>{attFormatDate(attSelectedDate)}</Text>
                                </View>
                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: attIsHoliday || attIsSunday ? '#EF4444' : theme.muted, marginLeft: 19 }}>
                                    {attIsHoliday ? `🏖️ ${attHolidays[attCurrentDk]}` : attIsSunday ? '🔴 Sunday' : attSelectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={attMarkAllPresent} disabled={attIsHoliday || attIsSunday || attStudents.length === 0}
                                style={[styles.attAllPBtn, { backgroundColor: isDark ? '#052E16' : '#D1FAE5', opacity: (attIsHoliday || attIsSunday || attStudents.length === 0) ? 0.4 : 1 }]}>
                                <CheckCircle2 size={12} color={isDark ? '#6EE7B7' : '#047857'} />
                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#6EE7B7' : '#047857' }}>All P</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.attRemarkBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                            <MessageSquare size={12} color={theme.muted} />
                            <TextInput
                                value={attGlobalRemark}
                                onChangeText={(v) => { setAttGlobalRemark(v); setAttDateRemarks((p) => ({ ...p, [attCurrentDk]: v })); }}
                                placeholder="Remark for this day..." placeholderTextColor={theme.muted}
                                style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}
                            />
                        </View>

                        <View style={[styles.cardShadowWrap, { flex: 1 }]}>
                            <View style={[styles.card, { flex: 1, backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                {attLoadingDate && (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', zIndex: 5 }]}>
                                        <ActivityIndicator color={theme.purple} />
                                    </View>
                                )}
                                {attStudents.length === 0 ? (
                                    <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                                ) : (
                                    <ScrollView showsVerticalScrollIndicator={false}>
                                        {attStudents.map((student) => {
                                            const rec = attAttendance[student.id] ?? { status: null, remark: '' };
                                            return (
                                                <View key={student.id} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
                                                        <TouchableOpacity onPress={() => student.avatarUrl && setAttExpandedPhoto({ url: student.avatarUrl, name: student.name })}>
                                                            <View style={[styles.avatarSm, { width: 28, height: 28, borderRadius: 9, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name) }]}>
                                                                {student.avatarUrl
                                                                    ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                    : <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name)}</Text>}
                                                            </View>
                                                        </TouchableOpacity>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{student.name}</Text>
                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {student.rollNo || '—'}</Text>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', gap: 5 }}>
                                                            <AttStatusBtn label="P" active={rec.status === 'P'} onPress={() => attSetStatus(student.id, 'P')} disabled={attIsHoliday || attIsSunday} />
                                                            <AttStatusBtn label="A" active={rec.status === 'A'} onPress={() => attSetStatus(student.id, 'A')} disabled={attIsHoliday || attIsSunday} />
                                                            <AttStatusBtn label="L" active={rec.status === 'L'} onPress={() => attSetStatus(student.id, 'L')} disabled={attIsHoliday || attIsSunday} />
                                                        </View>
                                                        <TouchableOpacity onPress={() => setAttRemarkOpenId((p) => (p === student.id ? null : student.id))}
                                                            style={[styles.attRemarkToggle, rec.remark ? { backgroundColor: isDark ? '#3B1F0F' : '#FDF0E8' } : { borderWidth: 1, borderColor: theme.cardBorder }]}>
                                                            <MessageSquare size={11} color={rec.remark ? theme.purple : theme.muted} />
                                                        </TouchableOpacity>
                                                    </View>
                                                    {attRemarkOpenId === student.id && (
                                                        <View style={{ paddingHorizontal: 12, paddingBottom: 9 }}>
                                                            <TextInput value={rec.remark} onChangeText={(v) => attSetRemark(student.id, v)}
                                                                placeholder={`Remark for ${student.name}...`} placeholderTextColor={theme.muted}
                                                                style={{ height: 28, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.text }}
                                                            />
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                )}
                            </View>
                        </View>

                        <View style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Total: {attStudents.length}</Text>
                                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                                    {[
                                        { label: 'P', count: attPresent, bg: isDark ? '#052E16' : '#D1FAE5', fg: isDark ? '#6EE7B7' : '#047857' },
                                        { label: 'A', count: attAbsent, bg: isDark ? '#450A0A' : '#FEE2E2', fg: isDark ? '#FCA5A5' : '#B91C1C' },
                                        { label: 'L', count: attLate, bg: isDark ? '#451A03' : '#FEF3C7', fg: isDark ? '#FCD34D' : '#B45309' },
                                        { label: '—', count: attUnmarked, bg: isDark ? '#1A1A1A' : '#F1F5F9', fg: theme.muted },
                                    ].map((s) => (
                                        <View key={s.label} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: s.bg }}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: s.fg }}>{s.label}: {s.count}</Text>
                                        </View>
                                    ))}
                                </View>
                                <TouchableOpacity onPress={handleAttSave} disabled={attSaveStatus === 'saving' || attStudents.length === 0 || !attHasAnyMarked}
                                    style={[styles.attSaveBtn, { backgroundColor: attSaveStatus === 'saved' ? '#10B981' : theme.purple, opacity: (attSaveStatus === 'saving' || attStudents.length === 0 || !attHasAnyMarked) ? 0.4 : 1 }]}>
                                    {attSaveStatus === 'saving' ? <ActivityIndicator size="small" color="#fff" /> : attSaveStatus === 'saved' ? <CheckCircle2 size={12} color="#fff" /> : <Save size={12} color="#fff" />}
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{attSaveStatus === 'saving' ? 'Saving…' : attSaveStatus === 'saved' ? 'Saved' : 'Save'}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: attIsHoliday || attIsSunday ? '#EF4444' : attUnmarked > 0 ? '#F59E0B' : '#10B981' }}>
                                {attIsHoliday ? '🏖️ Holiday — no attendance' : attIsSunday ? '🔴 Sunday — no attendance' : attUnmarked > 0 ? `${attUnmarked} student${attUnmarked > 1 ? 's' : ''} unmarked` : 'All students marked ✓'}
                            </Text>
                        </View>
                    </>
                )}

                {/* Date picker — calendar month grid, same rules as web's popup:
                    Sunday/holiday tinted red, today ringed, future disabled,
                    a dot on any date every roster student already has a status
                    for. */}
                <Modal visible={attShowDatePicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttShowDatePicker(false)}>
                    <Pressable style={styles.timetableOverlay} onPress={() => setAttShowDatePicker(false)}>
                        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.attCalCard, { backgroundColor: theme.card }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <TouchableOpacity onPress={() => { if (attCalMonth === 0) { setAttCalMonth(11); setAttCalYear((y) => y - 1); } else setAttCalMonth((m) => m - 1); }} style={styles.attCalNavBtn}>
                                    <ChevronLeft size={14} color={theme.text} />
                                </TouchableOpacity>
                                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: theme.text }}>{ATT_MONTHS[attCalMonth]} {attCalYear}</Text>
                                <TouchableOpacity onPress={() => {
                                    const n = new Date(attCalYear, attCalMonth + 1, 1);
                                    if (n > today) return;
                                    if (attCalMonth === 11) { setAttCalMonth(0); setAttCalYear((y) => y + 1); } else setAttCalMonth((m) => m + 1);
                                }} style={styles.attCalNavBtn}>
                                    <ChevronRight size={14} color={theme.text} />
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                    <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: i === 6 ? '#EF4444' : theme.muted }}>{d}</Text>
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {attCalendarCells.map((d, i) => {
                                    if (!d) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                                    const weekend = (i % 7) === 6;
                                    const isFuture = new Date(attCalYear, attCalMonth, d) > today;
                                    const dk = attMakeDateKey(attCalYear, attCalMonth, d);
                                    const isHol = !!attHolidays[dk];
                                    const isToday = d === today.getDate() && attCalMonth === today.getMonth() && attCalYear === today.getFullYear();
                                    const isSelected = d === attSelectedDate.getDate() && attCalMonth === attSelectedDate.getMonth() && attCalYear === attSelectedDate.getFullYear();
                                    const isFullyMarked = attStudents.length > 0 && (attMonthMarkedCounts[dk] ?? 0) >= attStudents.length;
                                    return (
                                        <TouchableOpacity key={i} disabled={isFuture}
                                            onPress={() => {
                                                setAttAttendance(Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }])));
                                                setAttGlobalRemark('');
                                                setAttSelectedDate(new Date(attCalYear, attCalMonth, d));
                                                setAttShowDatePicker(false);
                                            }}
                                            style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', opacity: isFuture ? 0.25 : 1 }}>
                                            <View style={{
                                                width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: isHol ? (isDark ? '#450A0A' : '#FEE2E2') : isSelected ? theme.purple : 'transparent',
                                                borderWidth: isToday && !isSelected && !isHol ? 1.5 : 0, borderColor: '#F59E0B',
                                            }}>
                                                <Text style={{
                                                    fontSize: 10.5, fontFamily: isSelected || isToday ? 'Poppins_700Bold' : 'Poppins_400Regular',
                                                    color: isHol ? '#EF4444' : isSelected ? '#fff' : isToday ? '#F59E0B' : weekend ? '#EF4444' : theme.text,
                                                }}>{d}</Text>
                                            </View>
                                            {isFullyMarked && !isHol && (
                                                <View style={{ position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? '#fff' : '#10B981' }} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>

                {/* Expanded student photo */}
                <Modal visible={!!attExpandedPhoto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttExpandedPhoto(null)}>
                    <Pressable style={[styles.timetableOverlay, { backgroundColor: 'rgba(0,0,0,0.75)' }]} onPress={() => setAttExpandedPhoto(null)}>
                        {attExpandedPhoto && (
                            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 260, height: 260, borderRadius: 18, overflow: 'hidden' }}>
                                <Image source={{ uri: attExpandedPhoto.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                <TouchableOpacity onPress={() => setAttExpandedPhoto(null)} style={[styles.previewCloseBtn, { position: 'absolute', top: 8, right: 8 }]}>
                                    <X size={14} color="#fff" />
                                </TouchableOpacity>
                            </Pressable>
                        )}
                    </Pressable>
                </Modal>

                {/* Sheet — date header tap: mark/remove holiday, or view/edit that
                    date's remark. */}
                <Modal visible={attHeaderPopupDate !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttHeaderPopupDate(null)}>
                    <Pressable style={styles.timetableOverlay} onPress={() => setAttHeaderPopupDate(null)}>
                        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.attPopupCard, { backgroundColor: theme.card }]}>
                            {attHeaderPopupDate !== null && (
                                <>
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 6 }}>
                                        {attHeaderPopupDate} {ATT_MONTHS[attSheetMonth].slice(0, 3)}, {attSheetYear}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const dk = attMakeDateKey(attSheetYear, attSheetMonth, attHeaderPopupDate);
                                            if (attHolidays[dk]) { handleAttHolidayChange(dk, null); }
                                            else { setAttHolidayInput(''); setAttHolidayModalDk(dk); }
                                            setAttHeaderPopupDate(null);
                                        }}
                                        style={styles.attPopupRow}>
                                        <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                            {attHolidays[attMakeDateKey(attSheetYear, attSheetMonth, attHeaderPopupDate)] ? '🏖️ Remove Holiday' : '🏖️ Mark as Holiday'}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const dk = attMakeDateKey(attSheetYear, attSheetMonth, attHeaderPopupDate);
                                            setAttRemarkModalInput(attDateRemarks[dk] ?? '');
                                            setAttRemarkModalDk(dk);
                                            setAttHeaderPopupDate(null);
                                        }}
                                        style={styles.attPopupRow}>
                                        <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>💬 View / Edit Remark</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </Pressable>
                    </Pressable>
                </Modal>

                {/* Holiday name entry */}
                <Modal visible={!!attHolidayModalDk} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttHolidayModalDk(null)}>
                    <Pressable style={styles.timetableOverlay} onPress={() => setAttHolidayModalDk(null)}>
                        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.attPopupCard, { backgroundColor: theme.card, width: 280 }]}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 }}>🏖️ Mark as Holiday</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 8 }}>Enter holiday name (e.g. Maharashtra Day)</Text>
                            <TextInput autoFocus value={attHolidayInput} onChangeText={setAttHolidayInput} placeholder="e.g. Diwali" placeholderTextColor={theme.muted}
                                style={{ height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, marginBottom: 10 }} />
                            <TouchableOpacity
                                onPress={() => { if (attHolidayModalDk) handleAttHolidayChange(attHolidayModalDk, attHolidayInput.trim() || 'Holiday'); setAttHolidayModalDk(null); }}
                                style={{ height: 38, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Mark as Holiday</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>

                {/* Date remark view/edit */}
                <Modal visible={!!attRemarkModalDk} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttRemarkModalDk(null)}>
                    <Pressable style={styles.timetableOverlay} onPress={() => setAttRemarkModalDk(null)}>
                        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.attPopupCard, { backgroundColor: theme.card, width: 280 }]}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 }}>💬 Date Note</Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 8 }}>Note for this date (saved instantly).</Text>
                            <TextInput autoFocus value={attRemarkModalInput} onChangeText={setAttRemarkModalInput} placeholder="Write remark..." placeholderTextColor={theme.muted} multiline numberOfLines={3}
                                style={{ minHeight: 64, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, marginBottom: 10, textAlignVertical: 'top' }} />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={() => setAttRemarkModalDk(null)} style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => { if (attRemarkModalDk) handleAttRemarkChange(attRemarkModalDk, attRemarkModalInput); setAttRemarkModalDk(null); }}
                                    style={{ flex: 1, height: 38, borderRadius: 10, backgroundColor: theme.purple, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Save Note</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            </View>
        );
    }, [
        trackBg, attSubTab, isDark, theme, attIsHoliday, attIsSunday, attSelectedDate, attHolidays, attCurrentDk, attMarkAllPresent,
        attStudents, attGlobalRemark, attLoadingDate, attAttendance, attRemarkOpenId, attSetStatus, attSetRemark, attPresent, attAbsent,
        attLate, attUnmarked, attHasAnyMarked, handleAttSave, attSaveStatus, attShowDatePicker, attCalYear, attCalMonth, attMonthMarkedCounts, attExpandedPhoto,
        attSheetMonth, attSheetYear, attSheetMonthKey, sortedAttStudents, attStudents, attGetLiveStatus, attCumulativePctFor, attPctColor, attMonthlyRecords,
        attHeaderPopupDate, attHolidayModalDk, attHolidayInput, attRemarkModalDk, attRemarkModalInput, handleAttHolidayChange, handleAttRemarkChange, attDateRemarks,
        attOverallStudents, attClassStats, attOverallSelectedId, attOverallRightTab, attShortTab, attStudentRecords, attLoadingStudentRec,
        attSelectedOverallStudent, ATT_SHEET_MONTHS_ORDER, handleAttGetList, attStartYear,
    ]);

    // The View tab's whole card stack (feed, subject teachers, leaderboard,
    // timetable, calendar, materials, results) — memoized so switching tabs
    // (which updates activeTab, unrelated to any of this) doesn't force React
    // to re-render this heavy subtree. On Android that re-render was expensive
    // enough to block the JS thread for a moment, which visibly delayed the
    // tab label's grey-to-white color change well after the pill had already
    // finished sliding (the pill itself runs on the native driver, so it never
    // waited on this). Same fix pattern as CampusFeed's memoization in
    // app/(teacher)/campus.tsx.
    const viewPageContent = useMemo(() => {
        // Runs before the loading/!division guards below (hooks can't be
        // called conditionally), but its result is only ever read once both
        // have passed and `division` is real — so just render nothing until
        // then, same shape as the guards' own SafeAreaViews.
        if (!division) return null;
        return (
                <ScrollView
                    ref={mainScrollRef}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 14, paddingTop: 4, gap: 14, paddingBottom: 36 + feedKbPad }}
                    onScroll={(e) => { mainScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                    onLayout={(e) => { mainContainerHRef.current = e.nativeEvent.layout.height; }}
                    onContentSizeChange={(_w, h) => { mainContentHRef.current = h; }}
                >

                    {/* Class Teacher info strip */}
                    <View style={[styles.infoStrip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.avatarSm, { backgroundColor: classTeacherAssignment?.teacher.avatarUrl ? 'transparent' : '#F59E0B' }]}>
                            {classTeacherAssignment?.teacher.avatarUrl
                                ? <Image source={{ uri: classTeacherAssignment.teacher.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                : <Text style={styles.avatarSmText}>{classTeacherAssignment ? getInitials(classTeacherAssignment.teacher.user.name ?? 'CT') : '?'}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#F59E0B', ...(Platform.OS === 'android' ? { marginBottom: -4 } : null) }}>Class Teacher</Text>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>
                                {classTeacherAssignment?.teacher.user.name ? formatDisplayName(classTeacherAssignment.teacher.user.name, classTeacherAssignment.teacher.prefix) : 'Not assigned'}
                                {isClassTeacher && classTeacherAssignment ? <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText }}> (You)</Text> : null}
                            </Text>
                        </View>
                    </View>

                    {/* Class Feed */}
                    <ClassFeed
                        ref={classFeedRef}
                        divisionId={divisionId}
                        divisionName={division.name}
                        subjects={division.subjects.map((s) => ({ id: s.id, name: s.name }))}
                        mainScrollRef={mainScrollRef}
                        mainScrollYRef={mainScrollYRef}
                        mainContentHRef={mainContentHRef}
                        mainContainerHRef={mainContainerHRef}
                        setKbPad={setFeedKbPad}
                    />

                    {/* Subject Teachers */}
                    <View style={styles.cardShadowWrap}>
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder }]}>
                            <BookOpen size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -1 } : undefined} />
                            <Text style={[styles.cardHeaderText, { color: theme.text }]}>Subject Teachers</Text>
                        </View>
                        <View style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                            {division.subjects.length === 0 ? (
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>No subjects yet</Text>
                            ) : (
                                division.subjects.map((sub) => {
                                    const assignment = division.assignments.find((a) => a.subjectId === sub.id);
                                    const teacherName = assignment?.teacher.user.name ? formatDisplayName(assignment.teacher.user.name, assignment.teacher.prefix) : null;
                                    return (
                                        <View key={sub.id} style={[styles.subjectRow, { borderBottomColor: theme.cardBorder }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <View style={[styles.dot, { backgroundColor: colorForSubject(sub) }]} />
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{sub.name}</Text>
                                            </View>
                                            {teacherName ? (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={[styles.avatarXs, { backgroundColor: assignment?.teacher.avatarUrl ? 'transparent' : getAvatarColor(teacherName) }]}>
                                                        {assignment?.teacher.avatarUrl
                                                            ? <Image source={{ uri: assignment.teacher.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                            : <Text style={styles.avatarXsText}>{getInitials(teacherName)}</Text>}
                                                    </View>
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.subText }} numberOfLines={1}>{teacherName}</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>Not assigned</Text>
                                            )}
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    </View>
                    </View>

                    {/* Leaderboard */}
                    <View style={styles.cardShadowWrap}>
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Trophy size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -1 } : undefined} />
                                <Text style={[styles.cardHeaderText, { color: theme.text }]}>Leaderboard — Top 5</Text>
                            </View>
                            <InlineWheel
                                options={['offline', 'online', 'combined']}
                                value={leaderTab}
                                onChange={(v) => setLeaderTab(v as 'offline' | 'online' | 'combined')}
                                isDark={isDark}
                                theme={{ purple: accent.purple, purpleLight: accent.purpleLight }}
                            />
                        </View>

                        {top5.length === 0 ? (
                            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 }}>No published marksheet yet</Text>
                        ) : (
                            <>
                                <View style={styles.podiumRow}>
                                    {podium.map((student, i) => {
                                        if (!student) return <View key={i} style={{ width: 64 }} />;
                                        const cfg = [{ h: 46, color: '#C0C0C0', label: '2nd' }, { h: 68, color: '#F59E0B', label: '1st' }, { h: 34, color: '#CD7F32', label: '3rd' }][i];
                                        return (
                                            <View key={student.id} style={{ alignItems: 'center', gap: 4, width: 64 }}>
                                                <View style={[styles.avatarSm, { width: 34, height: 34, borderRadius: 17, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name) }]}>
                                                    {student.avatarUrl
                                                        ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                        : <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name)}</Text>}
                                                </View>
                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.text, textAlign: 'center' }} numberOfLines={1}>{student.name}</Text>
                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.subText }}>{pctFor(student)}%</Text>
                                                <View style={{ height: cfg.h, width: 52, borderTopLeftRadius: 10, borderTopRightRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: cfg.color }}>
                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: '#fff' }}>{cfg.label}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                                <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 6 }}>
                                    {top5.slice(3, 5).map((student, i) => (
                                        <View key={student.id} style={[styles.rankRow, { backgroundColor: isDark ? '#1A1A1A' : '#F8FAFC', borderColor: theme.cardBorder }]}>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_800ExtraBold', color: theme.subText, width: 16, textAlign: 'center' }}>{i + 4}</Text>
                                            <View style={[styles.avatarXs, { backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name) }]}>
                                                {student.avatarUrl
                                                    ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                    : <Text style={styles.avatarXsText}>{getInitials(student.name)}</Text>}
                                            </View>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1 }} numberOfLines={1}>{student.name}</Text>
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: theme.subText }}>{pctFor(student)}%</Text>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}
                    </View>
                    </View>

                    {/* Timetable */}
                    <View style={styles.cardShadowWrap}>
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Calendar size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={[styles.cardHeaderText, { color: theme.text }]}>Timetable</Text>
                            </View>
                            {isClassTeacher && (
                                <TouchableOpacity onPress={pickTimetable} disabled={uploadingTimetable} style={styles.uploadBtn}>
                                    {uploadingTimetable ? <ActivityIndicator size="small" color="#fff" /> : (
                                        <>
                                            <Upload size={11} color="#fff" />
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{timetableImage ? 'Replace' : 'Upload'}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                        {timetableImage ? (
                            <TouchableOpacity onPress={() => setShowTimetable(true)} activeOpacity={0.9} style={{ marginHorizontal: 14, marginVertical: 14 }}>
                                <Image source={{ uri: timetableImage }} style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 14 }} resizeMode="contain" />
                            </TouchableOpacity>
                        ) : (
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 6 }}>
                                <Calendar size={22} color={theme.muted} />
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.subText }}>No timetable uploaded yet</Text>
                            </View>
                        )}
                    </View>
                    </View>

                    {/* Academic Calendar */}
                    <ClassCalendar divisionId={divisionId} divisionName={division.name} isClassTeacher={isClassTeacher} />

                    {/* Materials — fixed-height card (matches web's 240px), only the
                        list body scrolls internally so the card itself never grows
                        with the number of items. */}
                    <View style={styles.cardShadowWrap}>
                    <View style={[styles.card, styles.fixedListCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder }]}>
                            <FolderOpen size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                            <Text style={[styles.cardHeaderText, { color: theme.text }]}>Materials</Text>
                        </View>
                        {materials.length === 0 ? (
                            <View style={styles.fixedListEmpty}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center' }}>No materials shared yet</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {materials.map(renderFeedItemRow)}
                            </ScrollView>
                        )}
                    </View>
                    </View>

                    {/* Results */}
                    <View style={styles.cardShadowWrap}>
                    <View style={[styles.card, styles.fixedListCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                        <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <FileText size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={[styles.cardHeaderText, { color: theme.text }]}>Results</Text>
                            </View>
                            {isClassTeacher && (
                                <TouchableOpacity onPress={handleUploadResult} disabled={uploadingResult} style={styles.uploadBtn}>
                                    {uploadingResult ? <ActivityIndicator size="small" color="#fff" /> : (
                                        <>
                                            <Upload size={11} color="#fff" />
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Upload</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                        {results.length === 0 ? (
                            <View style={styles.fixedListEmpty}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center' }}>No results uploaded yet</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {results.map(renderFeedItemRow)}
                            </ScrollView>
                        )}
                    </View>
                    </View>
                </ScrollView>
        );
    }, [feedKbPad, theme, classTeacherAssignment, isClassTeacher, divisionId, division, leaderTab, isDark, accent, top5, podium, pctFor, uploadingTimetable, pickTimetable, timetableImage, uploadingResult, handleUploadResult, materials, results, renderFeedItemRow]);


    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
                <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
            </SafeAreaView>
        );
    }

    if (!division) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
                <View style={styles.centerFill}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Division not found</Text>
                    <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Go back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
            {/* Header — same rounded topbar container as the rest of the app
                (Settings, etc.), but with the class breadcrumb + role badge
                inside it instead of the bell/theme-toggle actions, since this
                screen isn't the kind of place either of those belongs. */}
            <View style={[styles.topbar, { backgroundColor: isDark ? '#141414' : 'white' }]}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.topbarBackBtn, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}
                >
                    <ArrowLeft size={18} color={isDark ? accent.purple : '#374151'} strokeWidth={1.5} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Users size={18} color={theme.text} />
                        <Text style={[styles.topbarTitle, { color: theme.text }]} numberOfLines={1}>{division.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Platform.OS === 'ios' ? -2 : -7 }}>
                        <Text style={[styles.headerSub, { color: theme.subText }]}>{division.standard.name}</Text>
                        <ChevronRight size={9} color={theme.subText} />
                        <Text style={[styles.headerSub, { color: theme.subText }]}>{division.name}</Text>
                        {isClassTeacher ? (
                            <View style={[styles.roleBadge, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7' }]}>
                                <Text style={[styles.roleBadgeText, { color: isDark ? '#FCD34D' : '#B45309' }]}>Class Teacher</Text>
                            </View>
                        ) : (
                            <View style={[styles.roleBadge, { backgroundColor: accent.purpleLight }]}>
                                <Text style={[styles.roleBadgeText, { color: accent.purple }]}>Subject Teacher{restrictSubjectName ? ` · ${restrictSubjectName}` : ''}</Text>
                            </View>
                        )}
                    </View>
                </View>
                <TouchableOpacity
                    onPress={toggleTheme}
                    style={[styles.topbarBackBtn, { backgroundColor: isDark ? '#2A2A2A' : '#F8F8F8' }]}
                >
                    {isDark
                        ? <Moon size={18} color={accent.purple} strokeWidth={1.5} />
                        : <Sun size={18} color="#374151" strokeWidth={1.5} />
                    }
                </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6 }}>
                {/* Tab pills — same sliding-pill track as Campus's Feed/Staffroom switch */}
                <ScrollView ref={tabBarScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 0 }}>
                    <View style={[styles.tabTrack, { backgroundColor: trackBg }]}>
                        <Animated.View
                            pointerEvents="none"
                            style={[styles.tabPill2, { transform: [{ translateX: tabPillX }] }]}
                        >
                            <Animated.View style={{ height: '100%', width: tabPillW, backgroundColor: theme.purple, borderRadius: 99 }} />
                        </Animated.View>
                        {TABS.map((tab) => {
                            const active = activeTab === tab.key;
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    onPress={() => {
                                        if (tab.key === activeTab) return;
                                        animateToTab(tab.key);
                                        setActiveTab(tab.key);
                                    }}
                                    onLayout={(e) => handleTabLayout(tab.key, e)}
                                    style={styles.tabBtn2}
                                >
                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : theme.subText }}>{tab.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>

            <ScrollView
                ref={tabPagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                // flexGrow makes the content row fill the pager's height, which
                // is what each page's `height: '100%'` resolves against.
                contentContainerStyle={{ flexGrow: 1 }}
                onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    // Only re-snap on a genuine width change (first measure,
                    // rotation) — re-snapping on every layout pass (which
                    // toggling native props can trigger) fires a scroll back
                    // to whatever tab this closure was built with.
                    if (w === lastTabPagerWidthRef.current) return;
                    lastTabPagerWidthRef.current = w;
                    setTabPagerWidth(w);
                    const idx = Math.max(0, TABS.findIndex((t) => t.key === activeTab));
                    currentTabIndexRef.current = idx;
                    requestAnimationFrame(() => {
                        tabPagerRef.current?.scrollTo({ x: idx * w, animated: false });
                    });
                }}
                onScrollBeginDrag={() => {
                    dragFromTabIndexRef.current = currentTabIndexRef.current;
                    draggingTabsRef.current = true;
                }}
                onScrollEndDrag={() => { draggingTabsRef.current = false; }}
                // Reports the landing tab once the drag is ~30% of the way
                // there, rather than waiting for the paging deceleration to
                // finish, so the pill follows the finger. Measured from where
                // the drag *started* (not from whatever's already committed) —
                // measuring from the committed tab would put the commit point
                // inside the threshold for going back the other way, so
                // holding a finger at 30% would flip the tab forward, then
                // back, forever.
                onScroll={(e) => {
                    if (!draggingTabsRef.current || !tabPagerWidth) return;
                    const from = dragFromTabIndexRef.current;
                    const delta = e.nativeEvent.contentOffset.x / tabPagerWidth - from;
                    let idx = from;
                    if (delta >= 0.3) idx = Math.min(from + 1, TABS.length - 1);
                    else if (delta <= -0.3) idx = Math.max(from - 1, 0);
                    if (idx !== currentTabIndexRef.current) {
                        currentTabIndexRef.current = idx;
                        const next = TABS[idx]?.key;
                        if (next) { animateToTab(next); setActiveTab(next); }
                    }
                }}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                    const idx = tabPagerWidth ? Math.round(e.nativeEvent.contentOffset.x / tabPagerWidth) : 0;
                    if (idx !== currentTabIndexRef.current) {
                        currentTabIndexRef.current = idx;
                        const next = TABS[idx]?.key;
                        if (next) { animateToTab(next); setActiveTab(next); }
                    }
                }}
            >
                {TABS.map((tabDef) => (
                    <View key={tabDef.key} style={{ width: tabPagerWidth, height: '100%' }}>
                        {tabDef.key === 'view' ? viewPageContent
                            : tabDef.key === 'manage' ? managePageContent
                            : tabDef.key === 'attendance' ? attendancePageContent
                            : (
                                <View style={styles.centerFill}>
                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Coming soon</Text>
                                </View>
                            )}
                    </View>
                ))}
            </ScrollView>

            {/* Timetable fullscreen modal — same layout as web's Timetable Modal:
                dark overlay, a header row (title + Download + Close) above the
                image, image capped to the remaining height and contained. */}
            <Modal visible={showTimetable} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowTimetable(false)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setShowTimetable(false)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '90%', paddingHorizontal: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#fff' }} numberOfLines={1}>
                                Timetable — {division.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity onPress={handleDownloadTimetable} activeOpacity={0.85}>
                                    <LinearGradient
                                        colors={['#E8876A', '#DA7756', '#C06040']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.timetableDownloadBtn}
                                    >
                                        <Download size={13} color="#fff" />
                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Download</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowTimetable(false)} style={styles.timetableCloseBtn}>
                                    <X size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {!!downloadMsg && (
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#fff', textAlign: 'right', marginBottom: 6 }}>{downloadMsg}</Text>
                        )}
                        {timetableImage && (
                            <Image
                                source={{ uri: timetableImage }}
                                style={{ width: '100%', height: undefined, aspectRatio: 1, borderRadius: 16 }}
                                resizeMode="contain"
                            />
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Materials/Results "View" preview — opens the attachment inside the
                app instead of throwing the user out to their phone's browser.
                Images render directly; everything else (pdf/docx/xlsx/etc) goes
                through Google Docs' viewer inside a WebView, same as
                AttachmentPreview.tsx does for feed attachments. */}
            <Modal visible={!!previewItem} animationType="slide" statusBarTranslucent onRequestClose={() => setPreviewItem(null)}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <View style={styles.previewToolbar}>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#fff', marginRight: 12 }} numberOfLines={1}>
                            {previewItem?.title}
                        </Text>
                        <TouchableOpacity onPress={() => setPreviewItem(null)} style={styles.previewCloseBtn}>
                            <X size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    {previewItem && (
                        isImageAttachment(previewItem.attachmentType, previewItem.attachmentName) ? (
                            <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <Image source={{ uri: previewItem.attachmentUrl! }} style={{ width: SCREEN_W, height: SCREEN_H - 80 }} resizeMode="contain" />
                            </ScrollView>
                        ) : (
                            <WebView
                                source={{ uri: `https://docs.google.com/viewer?url=${encodeURIComponent(previewItem.attachmentUrl!)}&embedded=true` }}
                                style={{ flex: 1 }}
                                javaScriptEnabled
                                domStorageEnabled
                                allowsInlineMediaPlayback
                                mediaPlaybackRequiresUserAction={false}
                            />
                        )
                    )}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Same rounded-card topbar visual as ScreenHeader.tsx (height/margins/
    // shadow), rebuilt locally since this screen needs the breadcrumb + role
    // badge inside it instead of ScreenHeader's bell/theme-toggle actions.
    topbar: {
        height: 58,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 25,
        marginHorizontal: 4,
        marginTop: 4,
        marginBottom: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    topbarBackBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    topbarTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', paddingTop: Platform.OS === 'android' ? 4 : 0 },
    headerSub: { fontSize: 10.5, fontFamily: 'Poppins_400Regular' },
    roleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, marginLeft: 4 },
    roleBadgeText: { fontSize: 9, fontFamily: 'Poppins_700Bold' },
    tabTrack: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 99, padding: 3, gap: 3 },
    tabPill2: { position: 'absolute', top: 3, bottom: 3, borderRadius: 99 },
    tabBtn2: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
    infoStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    avatarSm: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarSmText: { fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#fff' },
    avatarXs: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarXsText: { fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#fff' },
    card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
    // Matches web's fixed 240px Materials/Results card — content scrolls
    // inside instead of the card growing with the item count.
    fixedListCard: { height: 260 },
    fixedListEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    previewToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 52, backgroundColor: 'rgba(0,0,0,0.7)' },
    previewCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    // Shadow lives on this outer wrapper, not on `card` itself, because
    // `card` needs overflow:'hidden' to clip its header's rounded top
    // corners — and overflow:'hidden' clips the shadow right along with it.
    cardShadowWrap: { borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 10 },
    materialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    extBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    viewBtn: { paddingHorizontal: 10, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
    cardHeaderText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    subjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    leaderTabsTrack: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 2 },
    leaderTabBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14, paddingTop: 16, paddingBottom: 8 },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#DA7756' },
    timetableOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
    timetableCloseBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    timetableDownloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 10 },
    // Manage tab — Students / Subjects & Teachers segmented switch + list row.
    manageSegTrack: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3, alignSelf: 'flex-start' },
    manageSegBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
    manageSegBtnActiveShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
    manageStudentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    manageBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
    manageBadgeText: { fontSize: 8.5, fontFamily: 'Poppins_700Bold' },
    // Manage tab — student detail view (header, stats strip, status banner, photo edit).
    manageBackBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    manageStatusBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 9 },
    manageDisabledBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, borderRadius: 9, borderWidth: 1 },
    manageStatBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 2 },
    manageStatusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
    managePhotoBtn: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    manageBloodBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
    // Attendance tab — Daily marking (date button, All P, remark box, save,
    // calendar popup).
    attDateBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
    attAllPBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 12 },
    attRemarkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
    attRemarkToggle: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    attSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 12, borderRadius: 9 },
    attCalCard: { width: 300, borderRadius: 18, padding: 14 },
    attCalNavBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    // Attendance — Sheet (month grid) + popups.
    attMonthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 8 },
    attMonthChipDot: { width: 4, height: 4, borderRadius: 2 },
    attGridHeadCell: { paddingVertical: 6, paddingHorizontal: 4, textAlign: 'center', fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#2A3A10', backgroundColor: '#ECF3D0', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridDateHead: { width: 26, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridRemarkDot: { position: 'absolute', top: 2, right: 2, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#DA7756' },
    attGridCell: { paddingVertical: 8, textAlign: 'center', fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#2A3A10', backgroundColor: '#F5F8EE', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridDayCell: { width: 26, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attPopupCard: { width: 220, borderRadius: 16, padding: 12 },
    // Attendance — Overall (class + student summary).
    attGetListBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    attStudentChip: { paddingHorizontal: 10, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    attPopupRow: { paddingVertical: 9 },
});
