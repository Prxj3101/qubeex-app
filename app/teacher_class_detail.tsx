import { InlineWheel } from '@/components/InlineWheel';
import { AcademicYearPicker } from '@/components/AcademicYearPicker';
import { HistoricalYearBanner } from '@/components/HistoricalYearBanner';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { LiveTimetable } from '@/components/LiveTimetable';
import { ClassCalendar } from '@/components/teacher/ClassCalendar';
import { ClassFeed, ClassFeedHandle } from '@/components/teacher/ClassFeed';
import { FlagsSheet } from '@/components/FlagsSheet';
import { VoiceAttendanceSheet } from '@/components/teacher/VoiceAttendanceSheet';
import { Flag as FlagRecord } from '@/data/flags';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName } from '@/lib/displayName';
import api from '@/lib/api';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router';
import {
    ArrowLeft, BarChart2, BookOpen, Calendar, CalendarCheck, CalendarDays, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
    Clock, Copy, Download, Eye, EyeOff, ExternalLink, FileText, Flag, FolderOpen, Heart, ImagePlus, MapPin, MessageSquare, Mic,
    Moon, Pencil, Play, Plus, Power, PowerOff, RotateCcw, Save, Shield, ShieldAlert, Square, Sun, Trash2, TrendingDown, Trophy, Upload, User,
    Users, X,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as XLSX from 'xlsx';
import { LineChart } from 'react-native-chart-kit';
// The exact same Fee Card component the student app renders in its own
// Fees screen (front/back 3D flip, month table, structure breakdown) — the
// teacher Fees tab reuses it as-is instead of a hand-built lookalike, per
// direct request ("vohi same exact as it is idr chaiye pura same").
import { FeeFlipCard } from './fees_detail';

// Same constant test-webview.tsx already uses to build student-facing quiz
// URLs — the teacher's "copy link" needs the same public /quiz/:testLink
// route (mirrors web's getQuizUrl, which uses window.location.origin).
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.qubeex.in';
// Same base URL api.ts builds its axios instance from — needed here too since
// CSV/PDF downloads use FileSystem.downloadAsync directly (RN has no
// browser-style automatic download the way web's fetch+blob approach does).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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
// Same story as expo-media-library above — expo-sharing is a native module
// too, and a static `import * as Sharing from 'expo-sharing'` was throwing
// at module-load time in Expo Go, which on iOS specifically left the Export
// button's spinner stuck forever (the throw happened before any of
// attShareWorkbook's own try/catch could run).
function loadSharing(): typeof import('expo-sharing') | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-sharing');
    } catch {
        return null;
    }
}
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
    ActivityIndicator, Alert, Animated, BackHandler, Dimensions, Image, Keyboard, LayoutChangeEvent, Linking, Modal, Platform, Pressable, RefreshControl,
    ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import type { ScrollViewInstance, TextInputInstance, ViewInstance } from 'react-native';
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

// ── Marksheet types — mirrors qubeex-web's MarksTab.tsx / useMarksheet.ts ──
// The class teacher's view only: read-only exam marks (subject teachers own
// those), editable Graded Subjects (term1/term2), no exam/column management
// (add/edit/reorder exams and graded subjects stays web-only — see the
// Offline tab's own header comment for why).
interface MarksExamColumn { id: string; subjectId: string; name: string; maxMarks: number; order: number; examDate?: string | null }
interface MarksScoreEntry { score: number | null; isAbsent: boolean }
interface MarksGradedSubject { id: string; name: string; order: number }
interface MarksGradedScoreEntry { term1Grade: string | null; term2Grade: string | null }
interface MarksGradeScaleEntry { grade: string; minPct: number }
interface MarksStudent { id: string; name: string | null; rollNo: string; avatarUrl: string | null }

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
// ── Tasks tab — Tests, mirrors web's TasksTab.tsx Tests sub-tab (list +
// activate/stop/delete/copy-link/results) exactly. The question bank, Paper
// Builder (drag-drop test/assignment creation with AI-generated questions),
// and Modules stay web-only — same judgment call already made for Attendance
// Sheet setup and Marksheet column management: a once-in-a-while authoring
// job best done at a desk, not something to shrink onto a phone.
type TaskTestStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';
interface TaskTest {
    id: string; title: string; description: string | null; testLink: string;
    status: TaskTestStatus; durationMinutes: number; totalMarks: number;
    numberOfQuestions: number; maxAttempts: number;
    startDate: string | null; validUntil: string | null; createdAt?: string;
    _count: { attempts: number; submitted?: number };
}
// ── Tasks tab — Test Results panel, mirrors web's TestResultsPanel exactly
// (same grouping-by-student-with-all-attempts logic, same stats, same
// highest/lowest scorer cards) — web's wide table becomes a per-student card
// list here, same adaptation already made for Attendance/Marksheet Overall
// and Manage's student rows.
interface TaskTestAttemptResult {
    id: string; studentName: string; rollNo: string; attemptNumber: number;
    totalScore: number; maxScore: number; tabChangeCount: number; malpracticeFlag: boolean;
    startTime: string | null; endTime: string | null; student: { id: string } | null;
}
interface TaskTestResultData {
    test: { title: string; subject: { name: string }; division: { name: string }; totalMarks: number; status: string; validUntil: string | null; maxAttempts: number };
    attempts: TaskTestAttemptResult[];
    roster: { id: string; name: string; rollNo: string }[];
}
function fmtTaskDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// ── Tasks tab — Assignments, mirrors web's AssignmentCard + Submissions
// table exactly (same fields, same activate/stop/delete/review/offline
// flows). Same web-only exclusions as Tests: no create/edit (Paper Builder).
type TaskAssignmentStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';
interface TaskAssignment {
    id: string; title: string; description: string | null; status: TaskAssignmentStatus;
    totalMarks: number; numberOfQuestions: number; dueDate: string | null; completedAt?: string | null;
    submissionType: 'OFFLINE' | 'ONLINE'; createdAt?: string;
    _count: { submissions: number; totalStudents?: number };
}
interface TaskAssignmentSubmissionAttempt {
    id: string; attemptNumber: number; fileUrl: string | null; submittedAt: string;
    reviewStatus: string | null; reviewNote: string | null; reviewedAt: string | null;
}
interface TaskAssignmentSubmission {
    student: { id: string; name: string | null; rollNo: string | null };
    submission: {
        id: string; fileUrl: string | null; submittedAt: string | null; resubmitCount: number;
        reviewStatus: string | null; reviewNote: string | null; reviewedAt: string | null;
        offlineSubmittedAt: string | null; offlineMarkedLate: boolean;
    } | null;
    attempts: TaskAssignmentSubmissionAttempt[];
}
interface TaskAssignmentSubmissionsData {
    assignment: { id: string; title: string; submissionType: 'OFFLINE' | 'ONLINE'; dueDate: string | null; totalMarks: number; status: TaskAssignmentStatus; completedAt: string | null };
    students: TaskAssignmentSubmission[];
}
// Same 11 columns web's results table has, in the same order — the table is
// wider than the screen so it scrolls horizontally instead of being
// reshaped into cards, per explicit request to keep it identical to web.
const TASK_RESULTS_COLS: { key: string; label: string; width: number }[] = [
    { key: 'roll', label: 'Roll No', width: 55 },
    { key: 'name', label: 'Name', width: 120 },
    { key: 'status', label: 'Status', width: 95 },
    { key: 'attempt', label: 'Attempt', width: 60 },
    { key: 'given', label: 'Given At', width: 135 },
    { key: 'submitted', label: 'Submitted At', width: 135 },
    { key: 'score', label: 'Score', width: 60 },
    { key: 'pct', label: '%', width: 45 },
    { key: 'tabChanges', label: 'Tab Changes', width: 90 },
    { key: 'malpractice', label: 'Malpractice', width: 85 },
    { key: 'result', label: 'Result', width: 55 },
];
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

// ── Fees — mirrors qubeex-web's teacher FeesTab.tsx (read-only for teachers;
// only admins edit fee structure/payments) ─────────────────────────────────
const FEE_CARD_THEMES = {
    yellow: { name: 'Yellow', bg: '#FFF9E0', border: '#EEDD9B' },
    green: { name: 'Pista', bg: '#F1F6E1', border: '#CBDCA0' },
    blue: { name: 'Blue', bg: '#EEF6FB', border: '#CBE2EF' },
    pink: { name: 'Pink', bg: '#FCF1F4', border: '#EDCED8' },
} as const;
type FeeCardThemeKey = keyof typeof FEE_CARD_THEMES;
const FEE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Parses flexible free-text dates like "10 Aug 26", "Aug 10 2026", "10 August"
// (year defaults to current year if omitted) into a comparable Date — same
// parsing rule as web's parseFlexDate, since due/paid dates are stored as
// free text, not real date columns.
function feeParseFlexDate(input: string | null | undefined): Date | null {
    if (!input) return null;
    const str = input.trim();
    if (!str) return null;
    const monthIdx = FEE_MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}`, 'i').test(str));
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
function feeIsPaidLate(dueDate: string | null | undefined, paidDate: string | null | undefined): boolean {
    const due = feeParseFlexDate(dueDate);
    const paid = feeParseFlexDate(paidDate);
    if (!due || !paid) return false;
    return paid.getTime() > due.getTime();
}
function feeIsLateFeeApplicable(dueDate: string | null | undefined, paidDate: string | null | undefined): boolean {
    const due = feeParseFlexDate(dueDate);
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    if (today.getTime() <= due.getTime()) return false;
    if (!paidDate || !paidDate.trim()) return true;
    const paid = feeParseFlexDate(paidDate);
    if (!paid) return true;
    paid.setHours(0, 0, 0, 0);
    return paid.getTime() > due.getTime();
}

type FeeStructureType = 'REGULAR' | 'ADDON' | 'PENALTY' | 'ONE_TIME' | 'BUS' | 'LATE_FEE';
interface FeeSubItem { id: string; label: string; amount: number }
interface FeeItem { id: string; label: string; amount: number; subItems: FeeSubItem[] }
interface FeeStructure { id: string; name: string; type: FeeStructureType; color: string; items: FeeItem[] }
interface FeeMonth { id: string; month: string; dueDate: string; assignedStructureIds: string[]; remark: string }
interface FeePayment { studentId: string; feeMonthId: string; status: 'PAID' | 'PENDING'; paidDate: string | null; remark: string | null; extraFields: Record<string, string> | null; extraStructureIds: string[] | null }
interface FeesRosterStudent { id: string; studentId: string; name: string; rollNo: string; extraDetailFields: Record<string, string> | null; avatarUrl: string | null }
type FeeStudentDetailField = { id: string; kind: 'default' | 'custom'; defaultKey?: 'name' | 'rollNo' | 'studentId' | 'class' | 'division' | 'bus'; label: string; value?: string };
const DEFAULT_FEE_STUDENT_FIELDS: FeeStudentDetailField[] = [
    { id: 'f-name', kind: 'default', defaultKey: 'name', label: 'Name' },
    { id: 'f-rollno', kind: 'default', defaultKey: 'rollNo', label: 'Roll No' },
    { id: 'f-studentid', kind: 'default', defaultKey: 'studentId', label: 'Student ID' },
    { id: 'f-class', kind: 'default', defaultKey: 'class', label: 'Class' },
    { id: 'f-division', kind: 'default', defaultKey: 'division', label: 'Division' },
    { id: 'f-bus', kind: 'default', defaultKey: 'bus', label: 'Bus' },
];
const FEE_TYPE_CFG: Record<FeeStructureType, { label: string; color: string; emoji: string }> = {
    REGULAR: { label: 'Regular Monthly', color: '#7C3AED', emoji: '📅' },
    ADDON: { label: 'Add-on', color: '#DA7756', emoji: '➕' },
    PENALTY: { label: 'Penalty / Fine', color: '#DC2626', emoji: '⚠️' },
    ONE_TIME: { label: 'One-time', color: '#059669', emoji: '⭐' },
    BUS: { label: 'Bus Fee', color: '#0891B2', emoji: '🚌' },
    LATE_FEE: { label: 'Late Fee Fine', color: '#DC2626', emoji: '⚠️' },
};
function feeStructureTotal(s: FeeStructure) {
    return s.items.reduce((n, item) => {
        const sub = item.subItems.reduce((m, si) => m + si.amount, 0);
        return n + (sub > 0 ? sub : item.amount);
    }, 0);
}
// Bus Fee / Late Fee Fine are fixed system types with a fixed color — older
// saved structures may still carry a stale hex, so normalize against the
// current config on load rather than showing a stale color.
function feeNormalizeStructureColors(structures: FeeStructure[]): FeeStructure[] {
    return structures.map((s) => ((s.type === 'BUS' || s.type === 'LATE_FEE') && s.color !== FEE_TYPE_CFG[s.type].color
        ? { ...s, color: FEE_TYPE_CFG[s.type].color }
        : s));
}

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

type TabKey = 'view' | 'manage' | 'attendance' | 'marks' | 'fees' | 'students' | 'tasks';

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
    onFieldFocus?: (ref: TextInputInstance | null) => void;
}) {
    // Purple border only while this specific field is focused - matches
    // web's `focus:border-primary/50` (idle fields just use the normal
    // card border, not every field lighting up purple the moment edit mode
    // is on).
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<TextInputInstance | null>(null);
    return (
        <View>
            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 3 }}>{label}</Text>
            <TextInput
                ref={inputRef}
                value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted}
                keyboardType={keyboardType}
                textAlignVertical="center"
                onFocus={() => { setFocused(true); onFieldFocus?.(inputRef.current); }}
                onBlur={() => setFocused(false)}
                style={{ includeFontPadding: false, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: focused ? theme.purple : theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}
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
    onFieldFocus?: (ref: TextInputInstance | null) => void;
}) {
    const { code, number } = parseManagePhone(value);
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const active = MANAGE_COUNTRY_CODES.find((c) => c.code === code) ?? MANAGE_COUNTRY_CODES[0];
    const inputRef = useRef<TextInputInstance | null>(null);
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
                    onFocus={() => { setFocused(true); onFieldFocus?.(inputRef.current); }}
                    onBlur={() => setFocused(false)}
                    style={{ includeFontPadding: false, flex: 1, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: focused ? theme.purple : theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }}
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
    const overlayRef = useRef<ViewInstance | null>(null);
    const [overlayRect, setOverlayRect] = useState({ y: 0, height: windowHeight });
    const scrollRef = useRef<ScrollViewInstance | null>(null);
    const scrollYRef = useRef(0);
    const kbTopRef = useRef(0);
    const focusedInputRef = useRef<TextInputInstance | null>(null);
    const [kbTop, setKbTop] = useState(0);
    const customCategoryRef = useRef<TextInputInstance | null>(null);
    const titleRef = useRef<TextInputInstance | null>(null);
    const detailRef = useRef<TextInputInstance | null>(null);
    const subjectRef = useRef<TextInputInstance | null>(null);
    const actionTakenRef = useRef<TextInputInstance | null>(null);

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
        <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onCancel} />
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
                            textAlignVertical="center"
                            style={{ includeFontPadding: false, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, marginTop: 8 }} />
                    )}
                </View>

                <View>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginBottom: 5 }}>Card Title <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput ref={titleRef} onFocus={() => { focusedInputRef.current = titleRef.current; scrollFieldAboveKeyboard(); }} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                        placeholder="Short title" placeholderTextColor={theme.muted}
                        textAlignVertical="center"
                        style={{ includeFontPadding: false, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }} />
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
                        textAlignVertical="center"
                        style={{ includeFontPadding: false, height: 32, paddingHorizontal: 10, paddingVertical: 0, borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg, fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text }} />
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

// Tasks tab — Test card, mirrors web's TestCard: same derived UPCOMING
// status, same meta/actions, same disabled-activate reasons. Web's hover
// popovers for Activate's two-choice menu and the Stop/Delete confirms
// become native Alerts here — same copy, same steps, just a different
// widget since there's no hover state on mobile.
function TaskTestCard({
    theme, isDark, test, onActivate, onStopNow, onDelete, onCopyLink, onResults, copied,
}: {
    theme: Theme; isDark: boolean; test: TaskTest;
    onActivate: () => void; onStopNow: () => void; onDelete: () => void; onCopyLink: () => void; onResults: () => void;
    copied: boolean;
}) {
    const effectiveStatus: TaskTestStatus = (test.validUntil && new Date(test.validUntil) < new Date()) ? 'COMPLETED' : test.status;
    const isUpcoming = effectiveStatus === 'ACTIVE' && !!test.startDate && new Date(test.startDate) > new Date();
    const displayStatus = isUpcoming ? 'UPCOMING' : effectiveStatus;
    const statusCfg = {
        DRAFT: { bg: isDark ? 'rgba(148,163,184,0.15)' : '#F1F5F9', fg: theme.muted },
        UPCOMING: { bg: isDark ? '#451A03' : '#FEF3C7', fg: isDark ? '#FCD34D' : '#B45309' },
        ACTIVE: { bg: isDark ? '#052E16' : '#D1FAE5', fg: isDark ? '#6EE7B7' : '#047857' },
        COMPLETED: { bg: isDark ? '#1E3A8A' : '#DBEAFE', fg: isDark ? '#93C5FD' : '#1D4ED8' },
    }[displayStatus];
    const fmt = (iso: string | null) => iso
        ? `${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        : '—';

    return (
        <View style={styles.cardShadowWrap}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 10 }]}>
            <View style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <View style={{ paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 7, backgroundColor: statusCfg.bg }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: statusCfg.fg }}>{displayStatus}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }} numberOfLines={1}>
                            <Text style={{ color: theme.subText }}>Created at:</Text> {fmt(test.createdAt ?? null)}
                        </Text>
                        {effectiveStatus === 'ACTIVE' && (
                            <TouchableOpacity onPress={onCopyLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined}>
                                {copied ? <CheckCircle2 size={15} color="#10B981" /> : <Copy size={15} color={theme.muted} />}
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: -3 }}>
                            <Trash2 size={15} color={theme.muted} />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <BookOpen size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{test.numberOfQuestions} questions</Text>
                    </View>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.4 }}>·</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Users size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{test._count.attempts} attempts</Text>
                    </View>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.4 }}>·</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{test._count.submitted ?? 0} submitted</Text>
                    </View>
                </View>
                <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{test.title}</Text>
                {!!test.description && (
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText }}>{test.description}</Text>
                )}
            </View>

            <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <Clock size={11} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -4 } : undefined} />
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{test.durationMinutes} min · {test.totalMarks} marks</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                        <Text style={{ color: theme.subText }}>{(displayStatus === 'DRAFT' || displayStatus === 'UPCOMING') ? 'Starts:' : 'Started:'}</Text> {fmt(test.startDate)}
                    </Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                        <Text style={{ color: theme.subText }}>{effectiveStatus === 'COMPLETED' ? 'Ended:' : 'Ends:'}</Text> {fmt(test.validUntil)}
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                {effectiveStatus === 'DRAFT' && (
                    <TouchableOpacity onPress={onActivate} disabled={test.numberOfQuestions === 0 || !test.validUntil}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5', opacity: (test.numberOfQuestions === 0 || !test.validUntil) ? 0.4 : 1 }}>
                        <Play size={11} color="#10B981" />
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#10B981' }}>Activate</Text>
                    </TouchableOpacity>
                )}
                {displayStatus === 'ACTIVE' && (
                    <TouchableOpacity onPress={onStopNow}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }}>
                        <Square size={10} color="#EF4444" />
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' }}>Stop Now</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onResults}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, borderWidth: 1, borderColor: theme.cardBorder }}>
                    <BarChart2 size={11} color={theme.subText} />
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Results</Text>
                </TouchableOpacity>
            </View>
        </View>
        </View>
    );
}

// Tasks tab — Test Results panel. Full-screen slide-in overlay, same
// treatment as ManageReportBoard (absolute, zIndex 20, translateX-driven).
function TaskResultsPanel({
    theme, isDark, testId, onClose, slideX,
}: { theme: Theme; isDark: boolean; testId: string; onClose: () => void; slideX: Animated.Value }) {
    const [data, setData] = useState<TaskTestResultData | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloadingCsv, setDownloadingCsv] = useState(false);
    const [downloadingAttemptId, setDownloadingAttemptId] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        api.get(`/teacher/tasks/tests/${testId}/results`)
            .then((res) => setData(res.data.data as TaskTestResultData))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [testId]);

    type ResultRow = { student: { id: string; name: string; rollNo: string }; attempt: TaskTestAttemptResult | null; isFirstOfGroup: boolean; isLastOfGroup: boolean };

    const studentGroups = useMemo(() => {
        if (!data) return [];
        const rosterIds = new Set(data.roster.map((s) => s.id));
        const groups = data.roster.map((s) => ({
            student: s,
            attempts: data.attempts.filter((a) => a.student?.id === s.id).sort((a, b) => a.attemptNumber - b.attemptNumber),
        }));
        const extraByKey = new Map<string, TaskTestAttemptResult[]>();
        data.attempts.filter((a) => !rosterIds.has(a.student?.id ?? '')).forEach((a) => {
            const key = a.student?.id || a.studentName;
            if (!extraByKey.has(key)) extraByKey.set(key, []);
            extraByKey.get(key)!.push(a);
        });
        extraByKey.forEach((list) => {
            const sorted = list.slice().sort((a, b) => a.attemptNumber - b.attemptNumber);
            groups.push({ student: { id: sorted[0].student?.id ?? sorted[0].studentName, name: sorted[0].studentName, rollNo: sorted[0].rollNo }, attempts: sorted });
        });
        return groups;
    }, [data]);

    const rows: ResultRow[] = useMemo(() => studentGroups.flatMap((g): ResultRow[] =>
        g.attempts.length > 0
            ? g.attempts.map((a, i) => ({ student: g.student, attempt: a, isFirstOfGroup: i === 0, isLastOfGroup: i === g.attempts.length - 1 }))
            : [{ student: g.student, attempt: null, isFirstOfGroup: true, isLastOfGroup: true }]
    ), [studentGroups]);

    const bestRows: ResultRow[] = useMemo(() => studentGroups.map((g) => ({
        student: g.student,
        attempt: g.attempts.length > 0 ? g.attempts.reduce((best, a) => (a.totalScore > best.totalScore ? a : best)) : null,
        isFirstOfGroup: true, isLastOfGroup: true,
    })), [studentGroups]);

    const notSubmittedCount = bestRows.filter((r) => !r.attempt).length;
    const isTestCompleted = !!data && (data.test.status === 'COMPLETED' || (!!data.test.validUntil && new Date(data.test.validUntil) < new Date()));
    const scoredRows = bestRows.filter((r): r is ResultRow & { attempt: TaskTestAttemptResult } => !!r.attempt);
    const pct = (a: TaskTestAttemptResult) => (a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0);
    const highestRow = scoredRows.length > 0 ? scoredRows.reduce((best, r) => (pct(r.attempt) > pct(best.attempt) ? r : best)) : null;
    const lowestRow = scoredRows.length > 0 ? scoredRows.reduce((worst, r) => (pct(r.attempt) < pct(worst.attempt) ? r : worst)) : null;

    const handleDownloadCsv = useCallback(async () => {
        setDownloadingCsv(true);
        try {
            const Sharing = loadSharing();
            if (!Sharing) { Alert.alert('Needs a full app build', "Downloading isn't available in Expo Go — needs a full app build."); return; }
            const token = await AsyncStorage.getItem('userToken');
            const fileUri = `${FileSystem.cacheDirectory}results_${testId}.csv`;
            const dl = await FileSystem.downloadAsync(`${API_BASE_URL}/teacher/tasks/tests/${testId}/results/download`, fileUri, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing not available', 'This device cannot share files.'); return; }
            await Sharing.shareAsync(dl.uri, { mimeType: 'text/csv', dialogTitle: 'Test Results', UTI: 'public.comma-separated-values-text' });
        } catch {
            Alert.alert('Download failed', 'Could not download results.');
        } finally {
            setDownloadingCsv(false);
        }
    }, [testId]);

    const handleDownloadAttemptPdf = useCallback(async (attemptId: string, studentName: string) => {
        setDownloadingAttemptId(attemptId);
        try {
            const Sharing = loadSharing();
            if (!Sharing) { Alert.alert('Needs a full app build', "Downloading isn't available in Expo Go — needs a full app build."); return; }
            const token = await AsyncStorage.getItem('userToken');
            const fileUri = `${FileSystem.cacheDirectory}Result_${studentName.replace(/\s+/g, '_')}.pdf`;
            const dl = await FileSystem.downloadAsync(`${API_BASE_URL}/teacher/tasks/attempts/${attemptId}/pdf`, fileUri, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing not available', 'This device cannot share files.'); return; }
            await Sharing.shareAsync(dl.uri, { mimeType: 'application/pdf', dialogTitle: `Result_${studentName}`, UTI: 'com.adobe.pdf' });
        } catch {
            Alert.alert('Download failed', 'Could not download the PDF.');
        } finally {
            setDownloadingAttemptId(null);
        }
    }, []);

    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 20, transform: [{ translateX: slideX }] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: Platform.OS === 'android' ? 6.5 : 10.5, paddingBottom: 10, paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                <TouchableOpacity onPress={onClose} style={[styles.manageBackBtn, { borderColor: theme.cardBorder }]}>
                    <ArrowLeft size={15} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{data?.test.title ?? 'Results'}</Text>
                    {!!data && (
                        <Text style={[{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.subText }, Platform.OS === 'android' ? { marginTop: -4 } : undefined]} numberOfLines={1}>{data.test.subject.name} · {data.test.division.name}</Text>
                    )}
                </View>
                {!!data && data.attempts.length > 0 && (
                    <TouchableOpacity onPress={handleDownloadCsv} disabled={downloadingCsv}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#DA7756', opacity: downloadingCsv ? 0.6 : 1 }}>
                        {downloadingCsv ? <ActivityIndicator size="small" color="#fff" /> : <Download size={12} color="#fff" />}
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>CSV</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
            ) : !data || rows.length === 0 ? (
                <View style={styles.centerFill}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students in this class yet.</Text>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: 24, gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[
                            { label: 'Submitted', value: String(data.attempts.length), color: theme.text },
                            { label: 'Not Submitted', value: String(notSubmittedCount), color: isTestCompleted ? '#EF4444' : '#F59E0B' },
                            { label: 'Avg Score', value: `${data.attempts.length > 0 ? Math.round(data.attempts.reduce((s, a) => s + (a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0), 0) / data.attempts.length) : 0}%`, color: theme.text },
                            { label: 'Malpractice', value: String(data.attempts.filter((a) => a.malpracticeFlag).length), color: '#EF4444' },
                        ].map((stat) => (
                            <View key={stat.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_800ExtraBold', color: stat.color }} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                                <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }} numberOfLines={1} adjustsFontSizeToFit>{stat.label}</Text>
                            </View>
                        ))}
                    </View>

                    {!!highestRow && !!lowestRow && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View style={{ flex: 1, gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(16,185,129,0.3)' : '#A7F3D0', backgroundColor: isDark ? 'rgba(16,185,129,0.08)' : '#ECFDF5' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Trophy size={13} color="#10B981" />
                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#10B981', textTransform: 'uppercase' }}>Highest</Text>
                                </View>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{highestRow.student.name}</Text>
                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {highestRow.student.rollNo}</Text>
                                <Text style={{ fontSize: 16, fontFamily: 'Poppins_800ExtraBold', color: '#10B981' }}>{Math.round(pct(highestRow.attempt))}% <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>({highestRow.attempt.totalScore}/{highestRow.attempt.maxScore})</Text></Text>
                            </View>
                            <View style={{ flex: 1, gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#FECACA', backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <TrendingDown size={13} color="#EF4444" />
                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#EF4444', textTransform: 'uppercase' }}>Lowest</Text>
                                </View>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{lowestRow.student.name}</Text>
                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {lowestRow.student.rollNo}</Text>
                                <Text style={{ fontSize: 16, fontFamily: 'Poppins_800ExtraBold', color: '#EF4444' }}>{Math.round(pct(lowestRow.attempt))}% <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>({lowestRow.attempt.totalScore}/{lowestRow.attempt.maxScore})</Text></Text>
                            </View>
                        </View>
                    )}

                    {/* Same table web shows — Roll/Name/Status/Attempt/Given At/Submitted
                        At/Score/%/Tab Changes/Malpractice/Result, one row per attempt (a
                        student's own attempts share Roll/Name, borderless between them,
                        exactly like web's rowspan-style grouping). Wide, so it scrolls
                        horizontally rather than being reshaped into cards. */}
                    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder }}>
                        <View style={{ backgroundColor: theme.card }}>
                            <View style={{ flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                {TASK_RESULTS_COLS.map((c) => (
                                    <View key={c.key} style={{ width: c.width, paddingHorizontal: 8, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }} numberOfLines={1}>{c.label}</Text>
                                    </View>
                                ))}
                            </View>
                            {rows.map((r, i) => {
                                const a = r.attempt;
                                const p = a && a.maxScore > 0 ? Math.round((a.totalScore / a.maxScore) * 100) : 0;
                                const rowBorder = r.isLastOfGroup ? { borderBottomWidth: 1, borderBottomColor: theme.cardBorder } : undefined;
                                const cellText = (v: string, color: string, bold = false) => (
                                    <Text style={{ fontSize: 10.5, fontFamily: bold ? 'Poppins_700Bold' : 'Poppins_400Regular', color }} numberOfLines={1}>{v}</Text>
                                );
                                return (
                                    <View key={i} style={{ flexDirection: 'row' }}>
                                        <View style={[{ width: TASK_RESULTS_COLS[0].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {cellText(r.isFirstOfGroup ? r.student.rollNo : '', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[1].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {cellText(r.student.name, a ? theme.text : theme.muted, true)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[2].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: a ? (isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5') : isTestCompleted ? (isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2') : (isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7') }}>
                                                <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: a ? '#10B981' : isTestCompleted ? '#EF4444' : '#F59E0B' }} numberOfLines={1}>{a ? 'Submitted' : 'Not Submitted'}</Text>
                                            </View>
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[3].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {cellText(a ? `${a.attemptNumber}/${data.test.maxAttempts}` : '—', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[4].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{a ? fmtTaskDateTime(a.startTime) : '—'}</Text>
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[5].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{a ? fmtTaskDateTime(a.endTime) : '—'}</Text>
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[6].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {a ? cellText(`${a.totalScore}/${a.maxScore}`, theme.text) : isTestCompleted ? cellText(`0/${data.test.totalMarks}`, '#EF4444') : cellText('—', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[7].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {a ? cellText(`${p}%`, p >= 60 ? '#10B981' : '#EF4444', true) : isTestCompleted ? cellText('0%', '#EF4444', true) : cellText('—', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[8].width, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {cellText(a ? String(a.tabChangeCount) : '—', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[9].width, paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }, rowBorder]}>
                                            {a?.malpracticeFlag ? (
                                                <>
                                                    <ShieldAlert size={10} color="#EF4444" />
                                                    {cellText('Yes', '#EF4444', true)}
                                                </>
                                            ) : cellText('—', theme.muted)}
                                        </View>
                                        <View style={[{ width: TASK_RESULTS_COLS[10].width, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center' }, rowBorder]}>
                                            {a ? (
                                                <TouchableOpacity onPress={() => handleDownloadAttemptPdf(a.id, r.student.name)} disabled={downloadingAttemptId === a.id}>
                                                    {downloadingAttemptId === a.id ? <ActivityIndicator size="small" color={theme.muted} /> : <Download size={13} color={theme.muted} />}
                                                </TouchableOpacity>
                                            ) : cellText('—', theme.muted)}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                </ScrollView>
            )}
        </Animated.View>
    );
}

// Tasks tab — Assignment card, mirrors web's AssignmentCard exactly (status
// badge, Overdue tag, Online/Offline badge, activate/stop/delete confirms as
// native Alerts same as TaskTestCard).
function TaskAssignmentCard({
    theme, isDark, assignment, onActivate, onStopNow, onDelete, onSubmissions,
}: {
    theme: Theme; isDark: boolean; assignment: TaskAssignment;
    onActivate: () => void; onStopNow: () => void; onDelete: () => void; onSubmissions: () => void;
}) {
    const isOverdue = assignment.status === 'ACTIVE' && !!assignment.dueDate && new Date(assignment.dueDate) < new Date();
    const statusCfg = {
        DRAFT: { bg: isDark ? 'rgba(148,163,184,0.15)' : '#F1F5F9', fg: theme.muted },
        ACTIVE: { bg: isDark ? '#052E16' : '#D1FAE5', fg: isDark ? '#6EE7B7' : '#047857' },
        COMPLETED: { bg: isDark ? '#1E3A8A' : '#DBEAFE', fg: isDark ? '#93C5FD' : '#1D4ED8' },
    }[assignment.status];
    const fmt = (iso: string | null | undefined) => iso
        ? `${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        : '—';

    return (
        <View style={styles.cardShadowWrap}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14, gap: 10 }]}>
            <View style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <View style={{ paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 7, backgroundColor: statusCfg.bg }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: statusCfg.fg }}>{assignment.status}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }} numberOfLines={1}>
                            <Text style={{ color: theme.subText }}>Created at:</Text> {fmt(assignment.createdAt)}
                        </Text>
                        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: -3 }}>
                            <Trash2 size={15} color={theme.muted} />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {isOverdue && (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 7, backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }}>
                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#EF4444' }}>⚠️ Overdue</Text>
                        </View>
                    )}
                    <View style={{ paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 7, backgroundColor: assignment.submissionType === 'ONLINE' ? (isDark ? 'rgba(59,130,246,0.15)' : '#DBEAFE') : (isDark ? 'rgba(148,163,184,0.15)' : '#F1F5F9') }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: assignment.submissionType === 'ONLINE' ? (isDark ? '#93C5FD' : '#1D4ED8') : theme.muted }}>{assignment.submissionType === 'ONLINE' ? '📤 Online' : '📝 Offline'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <FileText size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{assignment.totalMarks} marks</Text>
                    </View>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.4 }}>·</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <BookOpen size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{assignment.numberOfQuestions} questions</Text>
                    </View>
                    {assignment._count.totalStudents != null && (
                        <>
                            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, opacity: 0.4 }}>·</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Users size={12.5} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{assignment._count.totalStudents} students</Text>
                            </View>
                        </>
                    )}
                </View>
                <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{assignment.title}</Text>
                {!!assignment.description && (
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText }}>{assignment.description}</Text>
                )}
            </View>

            <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                    <Text style={{ color: theme.subText }}>Started at:</Text> {fmt(assignment.createdAt)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                        <Text style={{ color: theme.subText }}>Due:</Text> {fmt(assignment.dueDate)}
                    </Text>
                    {assignment.status === 'COMPLETED' && assignment.completedAt && (
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                            <Text style={{ color: theme.subText }}>Ended at:</Text> {fmt(assignment.completedAt)}
                        </Text>
                    )}
                </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                {assignment.status === 'DRAFT' && (
                    <TouchableOpacity onPress={onActivate} disabled={assignment.numberOfQuestions === 0 || !assignment.dueDate}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5', opacity: (assignment.numberOfQuestions === 0 || !assignment.dueDate) ? 0.4 : 1 }}>
                        <Play size={11} color="#10B981" />
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#10B981' }}>Activate</Text>
                    </TouchableOpacity>
                )}
                {assignment.status === 'ACTIVE' && (
                    <TouchableOpacity onPress={onStopNow}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }}>
                        <Square size={10} color="#EF4444" />
                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' }}>Stop Now</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onSubmissions}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 9, borderWidth: 1, borderColor: theme.cardBorder }}>
                    <BarChart2 size={11} color={theme.subText} />
                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Submissions</Text>
                </TouchableOpacity>
            </View>
        </View>
        </View>
    );
}

// Tests/Assignments list — "Live"/"History" section header, mirrors web's
// exactly: an icon + label + count, then a horizontal rule filling the rest
// of the row. Live's dot pulses the same way web's animate-pulse does.
function TasksLiveDot() {
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const anim = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]));
        anim.start();
        return () => anim.stop();
    }, [pulse]);
    return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', opacity: pulse }} />;
}
function TasksSectionHeader({ theme, icon, label, count }: { theme: Theme; icon: ReactNode; label: string; count: number }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {icon}
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: theme.subText, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{count}</Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.cardBorder }} />
        </View>
    );
}

// Small pill used in the Assignment Submissions table's Status column.
function StatusChip({ label, color, isDark }: { label: string; color: string; isDark: boolean }) {
    return (
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: isDark ? `${color}26` : `${color}1A` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color }} numberOfLines={1}>{label}</Text>
        </View>
    );
}

// Tasks tab — Assignment Submissions panel, mirrors web's
// AssignmentSubmissionsPanel exactly (same review/offline/late flows, same
// resubmission history) — a table like the Results panel, since the user
// asked for these to match web's table structure rather than being reshaped
// into cards.
function TaskAssignmentSubmissionsPanel({
    theme, isDark, assignmentId, onClose, slideX,
}: { theme: Theme; isDark: boolean; assignmentId: string; onClose: () => void; slideX: Animated.Value }) {
    const [data, setData] = useState<TaskAssignmentSubmissionsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [reviewing, setReviewing] = useState<string | null>(null);
    const [reviewNote, setReviewNote] = useState('');
    const [toggling, setToggling] = useState<string | null>(null);
    const [confirmReview, setConfirmReview] = useState<{ studentId: string; status: 'CORRECT' | 'WRITE_AGAIN' } | null>(null);
    const [historyOpenFor, setHistoryOpenFor] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        try {
            const res = await api.get(`/teacher/tasks/assignments/${assignmentId}/submissions`);
            setData(res.data.data as TaskAssignmentSubmissionsData);
        } catch {
            setData(null);
        }
    }, [assignmentId]);

    useEffect(() => {
        setLoading(true);
        fetchData().finally(() => setLoading(false));
    }, [fetchData]);

    const handleReview = useCallback(async (studentId: string, reviewStatus: 'CORRECT' | 'WRITE_AGAIN') => {
        setConfirmReview(null);
        setReviewing(studentId + reviewStatus);
        try {
            await api.patch(`/teacher/tasks/assignments/${assignmentId}/submissions/${studentId}/review`, { reviewStatus, reviewNote: reviewNote || null });
            await fetchData();
            setReviewNote('');
        } catch {
            Alert.alert('Error', 'Failed to update review');
        } finally {
            setReviewing(null);
        }
    }, [assignmentId, reviewNote, fetchData]);

    const handleToggleOffline = useCallback(async (studentId: string, currentlySubmitted: boolean) => {
        setToggling(studentId);
        try {
            await api.patch(`/teacher/tasks/assignments/${assignmentId}/submissions/${studentId}/offline`, { submitted: !currentlySubmitted });
            await fetchData();
        } catch {
            Alert.alert('Error', 'Failed to update offline status');
        } finally {
            setToggling(null);
        }
    }, [assignmentId, fetchData]);

    const handleToggleLate = useCallback(async (studentId: string, currentlyLate: boolean) => {
        setToggling(studentId);
        try {
            await api.patch(`/teacher/tasks/assignments/${assignmentId}/submissions/${studentId}/offline-late`, { late: !currentlyLate });
            await fetchData();
        } catch {
            Alert.alert('Error', 'Failed to update late status');
        } finally {
            setToggling(null);
        }
    }, [assignmentId, fetchData]);

    const isOnline = data?.assignment.submissionType === 'ONLINE';
    const submittedOnline = data?.students.filter((s) => s.submission?.submittedAt).length ?? 0;
    const submittedOffline = data?.students.filter((s) => s.submission?.offlineSubmittedAt).length ?? 0;
    const total = data?.students.length ?? 0;
    const submittedCount = isOnline ? submittedOnline : submittedOffline;
    const pendingCount = total - submittedCount;
    const correctCount = data?.students.filter((s) => s.submission?.reviewStatus === 'CORRECT').length ?? 0;
    const isAssignmentOverdue = !!data && !!data.assignment.dueDate && new Date(data.assignment.dueDate) < new Date();

    return (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 20, transform: [{ translateX: slideX }] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: Platform.OS === 'android' ? 6.5 : 10.5, paddingBottom: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                <TouchableOpacity onPress={onClose} style={[styles.manageBackBtn, { borderColor: theme.cardBorder }]}>
                    <ArrowLeft size={15} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{data?.assignment.title ?? 'Submissions'}</Text>
                    {!!data && (
                        <Text style={[{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.subText }, Platform.OS === 'android' ? { marginTop: -4 } : undefined]} numberOfLines={1}>
                            {data.assignment.submissionType === 'ONLINE' ? '📤 Online' : '📝 Offline'} · {data.assignment.totalMarks} marks
                        </Text>
                    )}
                </View>
            </View>

            {loading ? (
                <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
            ) : !data || data.students.length === 0 ? (
                <View style={styles.centerFill}>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students in this class yet.</Text>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: 24, gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[
                            { label: 'Submitted', value: String(submittedCount), color: theme.text },
                            { label: 'Pending', value: String(pendingCount), color: isAssignmentOverdue && isOnline ? '#EF4444' : '#F59E0B' },
                            ...(isOnline ? [{ label: 'Reviewed', value: String(correctCount), color: '#10B981' }] : []),
                            { label: 'Total', value: String(total), color: theme.text },
                        ].map((stat) => (
                            <View key={stat.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_800ExtraBold', color: stat.color }} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                                <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }} numberOfLines={1} adjustsFontSizeToFit>{stat.label}</Text>
                            </View>
                        ))}
                    </View>

                    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder }}>
                        <View style={{ backgroundColor: theme.card }}>
                            <View style={{ flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                                <View style={{ width: 55, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Roll No</Text></View>
                                <View style={{ width: 110, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Name</Text></View>
                                <View style={{ width: 100, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Status</Text></View>
                                {isOnline && (
                                    <View style={{ width: 260, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Online Submission</Text></View>
                                )}
                                <View style={{ width: 200, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Offline Copy</Text></View>
                                {!isOnline && (
                                    <View style={{ width: 90, paddingHorizontal: 8, paddingVertical: 8 }}><Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.subText }}>Late</Text></View>
                                )}
                            </View>

                            {data.students.map(({ student, submission, attempts }) => {
                                const isOnlineAssignment = data.assignment.submissionType === 'ONLINE';
                                const hasOnline = !!submission?.submittedAt;
                                const hasOffline = !!submission?.offlineSubmittedAt;
                                const reviewStatus = submission?.reviewStatus;
                                const lateSubmission = isOnlineAssignment && !!(attempts[0]?.submittedAt ?? submission?.submittedAt) && !!data.assignment.dueDate &&
                                    new Date(attempts[0]?.submittedAt ?? submission!.submittedAt!) > new Date(data.assignment.dueDate);
                                const rowBorder = { borderBottomWidth: 1, borderBottomColor: theme.cardBorder };

                                return (
                                    <View key={student.id} style={{ flexDirection: 'row' }}>
                                        <View style={[{ width: 55, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{student.rollNo ?? '—'}</Text>
                                        </View>
                                        <View style={[{ width: 110, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={2}>{student.name ?? '—'}</Text>
                                        </View>
                                        <View style={[{ width: 100, paddingHorizontal: 8, paddingVertical: 8 }, rowBorder]}>
                                            {reviewStatus === 'CORRECT' && lateSubmission ? (
                                                <StatusChip label="⚠️ Late" color="#EF4444" isDark={isDark} />
                                            ) : reviewStatus === 'CORRECT' || (!isOnlineAssignment && hasOffline) ? (
                                                <View style={{ gap: 3 }}>
                                                    <StatusChip label="✅ Submitted" color="#10B981" isDark={isDark} />
                                                    {!isOnlineAssignment && submission?.offlineMarkedLate && <StatusChip label="⚠️ Late" color="#EF4444" isDark={isDark} />}
                                                </View>
                                            ) : reviewStatus === 'WRITE_AGAIN' ? (
                                                <StatusChip label="✍️ Write Again" color="#EF4444" isDark={isDark} />
                                            ) : hasOnline ? (
                                                <StatusChip label="👀 In Review" color="#F59E0B" isDark={isDark} />
                                            ) : isOnlineAssignment && data.assignment.status !== 'ACTIVE' ? (
                                                <StatusChip label="❌ Missed" color="#EF4444" isDark={isDark} />
                                            ) : (
                                                <StatusChip label="⏳ Pending" color="#F59E0B" isDark={isDark} />
                                            )}
                                        </View>
                                        {isOnline && (
                                            <View style={[{ width: 260, paddingHorizontal: 8, paddingVertical: 8, gap: 6 }, rowBorder]}>
                                                {isOnlineAssignment && hasOnline ? (
                                                    <>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                            <Text style={{ flex: 1, fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }} numberOfLines={1}>
                                                                {(attempts[0]?.attemptNumber ?? 1) > 1 ? `Submission #${attempts[0]?.attemptNumber} · ` : 'Submission · '}
                                                                {fmtTaskDateTime(submission!.submittedAt)}
                                                            </Text>
                                                            {!!submission?.fileUrl && (
                                                                <TouchableOpacity onPress={() => Linking.openURL(submission.fileUrl!)}
                                                                    style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE' }}>
                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: theme.purple }}>View PDF</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>

                                                        {(attempts[0]?.reviewStatus === 'CORRECT' || attempts[0]?.reviewStatus === 'WRITE_AGAIN') && (
                                                            <View>
                                                                <View style={{ alignSelf: 'flex-start', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 5, backgroundColor: attempts[0].reviewStatus === 'CORRECT' ? (isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5') : (isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2') }}>
                                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: attempts[0].reviewStatus === 'CORRECT' ? '#10B981' : '#EF4444' }}>{attempts[0].reviewStatus === 'CORRECT' ? 'Approved' : 'Write Again'}</Text>
                                                                </View>
                                                                {!!attempts[0].reviewNote && (
                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: theme.subText, marginTop: 3 }}>{attempts[0].reviewNote}</Text>
                                                                )}
                                                            </View>
                                                        )}

                                                        {!reviewStatus && (
                                                            confirmReview?.studentId === student.id ? (
                                                                <View style={{ gap: 5, padding: 6, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC' }}>
                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                                                                        {confirmReview.status === 'CORRECT' ? 'Approve this submission?' : 'Ask the student to write again?'}
                                                                    </Text>
                                                                    <View style={{ flexDirection: 'row', gap: 5 }}>
                                                                        <TouchableOpacity onPress={() => setConfirmReview(null)} style={{ flex: 1, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center' }}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity onPress={() => handleReview(student.id, confirmReview.status)} disabled={!!reviewing}
                                                                            style={{ flex: 1, paddingVertical: 5, borderRadius: 7, alignItems: 'center', backgroundColor: confirmReview.status === 'CORRECT' ? '#10B981' : '#EF4444' }}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{reviewing === student.id + confirmReview.status ? '…' : 'Confirm'}</Text>
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                </View>
                                                            ) : (
                                                                <View style={{ gap: 5, padding: 6, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC' }}>
                                                                    <TextInput value={reviewNote} onChangeText={setReviewNote} placeholder="Optional feedback note…" placeholderTextColor={theme.muted}
                                                                        style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.text, height: 28, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg }} />
                                                                    <View style={{ flexDirection: 'row', gap: 5 }}>
                                                                        <TouchableOpacity onPress={() => setConfirmReview({ studentId: student.id, status: 'CORRECT' })} disabled={!!reviewing}
                                                                            style={{ flex: 1, paddingVertical: 5, borderRadius: 7, alignItems: 'center', backgroundColor: '#10B981' }}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>✓ Approve</Text>
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity onPress={() => setConfirmReview({ studentId: student.id, status: 'WRITE_AGAIN' })} disabled={!!reviewing}
                                                                            style={{ flex: 1, paddingVertical: 5, borderRadius: 7, alignItems: 'center', borderWidth: 1, borderColor: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' }}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#EF4444' }}>↩ Write Again</Text>
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                </View>
                                                            )
                                                        )}

                                                        {attempts.length > 1 && (
                                                            <View>
                                                                <TouchableOpacity onPress={() => setHistoryOpenFor((prev) => {
                                                                        const next = new Set(prev);
                                                                        if (next.has(student.id)) next.delete(student.id); else next.add(student.id);
                                                                        return next;
                                                                    })}
                                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                    {historyOpenFor.has(student.id) ? <ChevronUp size={11} color={theme.muted} /> : <ChevronDown size={11} color={theme.muted} />}
                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: theme.muted }}>{attempts.length - 1} earlier submission{attempts.length - 1 > 1 ? 's' : ''}</Text>
                                                                </TouchableOpacity>
                                                                {historyOpenFor.has(student.id) && (
                                                                    <View style={{ gap: 5, marginTop: 5 }}>
                                                                        {attempts.slice(1).map((at) => (
                                                                            <View key={at.id} style={{ padding: 6, borderRadius: 7, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }}>
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                                                    <Text style={{ flex: 1, fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }} numberOfLines={1}>#{at.attemptNumber} · {fmtTaskDateTime(at.submittedAt)}</Text>
                                                                                    {!!at.fileUrl && (
                                                                                        <TouchableOpacity onPress={() => Linking.openURL(at.fileUrl!)} style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE' }}>
                                                                                            <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: theme.purple }}>View PDF</Text>
                                                                                        </TouchableOpacity>
                                                                                    )}
                                                                                </View>
                                                                                {at.reviewStatus === 'CORRECT' && <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: '#10B981', marginTop: 2 }}>Approved</Text>}
                                                                                {at.reviewStatus === 'WRITE_AGAIN' && <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: '#EF4444', marginTop: 2 }}>Write Again</Text>}
                                                                                {!!at.reviewNote && <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: theme.subText, marginTop: 2 }}>{at.reviewNote}</Text>}
                                                                            </View>
                                                                        ))}
                                                                    </View>
                                                                )}
                                                            </View>
                                                        )}
                                                    </>
                                                ) : (
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>—</Text>
                                                )}
                                            </View>
                                        )}
                                        <View style={[{ width: 200, paddingHorizontal: 8, paddingVertical: 8, gap: 6, justifyContent: 'center' }, rowBorder]}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }} numberOfLines={1}>
                                                {hasOffline ? `Received ${fmtTaskDateTime(submission!.offlineSubmittedAt)}` : 'Not received'}
                                            </Text>
                                            <TouchableOpacity onPress={() => handleToggleOffline(student.id, hasOffline)} disabled={toggling === student.id}
                                                style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: hasOffline ? '#10B981' : theme.purple, backgroundColor: hasOffline ? (isDark ? 'rgba(16,185,129,0.1)' : '#ECFDF5') : (isDark ? 'rgba(124,58,237,0.1)' : '#EDE9FE') }}>
                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: hasOffline ? '#10B981' : theme.purple }}>{toggling === student.id ? '…' : hasOffline ? '✓ Received' : 'Mark Received'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {!isOnline && (
                                            <View style={[{ width: 90, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }, rowBorder]}>
                                                <TouchableOpacity onPress={() => handleToggleLate(student.id, !!submission?.offlineMarkedLate)} disabled={toggling === student.id}
                                                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: submission?.offlineMarkedLate ? '#EF4444' : theme.cardBorder, backgroundColor: submission?.offlineMarkedLate ? (isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2') : 'transparent' }}>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: submission?.offlineMarkedLate ? '#EF4444' : theme.muted }}>{toggling === student.id ? '…' : submission?.offlineMarkedLate ? '⚠️ Late' : 'Mark Late'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                </ScrollView>
            )}
        </Animated.View>
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
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: active ? '#fff' : '#94A3B8', marginTop: Platform.OS === 'android' ? 2 : 0 }}>{label}</Text>
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
        : [{ key: 'view', label: 'View' }, { key: 'students', label: 'Students' }, { key: 'tasks', label: 'Tasks' }, { key: 'marks', label: 'Marksheet' }];

    const [activeTab, setActiveTab] = useState<TabKey>('view');
    // Scoped to this screen's own Attendance/Marksheet/Fees tabs only — not a
    // global control, matching the web admin/teacher pattern.
    const academicYearState = useAcademicYears();
    const { years: ayYears, selectedYearId: aySelectedYearId, setSelectedYearId: setAySelectedYearId, selectedYear: aySelectedYear, isCurrentYearSelected: ayIsCurrent, loading: ayLoading } = academicYearState;
    const isHistoricalYear = !ayIsCurrent;

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
    const manageDetailScrollRef = useRef<ScrollViewInstance | null>(null);
    const manageDetailScrollYRef = useRef(0);
    const manageKbHeightRef = useRef(0);
    const manageFocusedInputRef = useRef<TextInputInstance | null>(null);
    const manageNameInputRef = useRef<TextInputInstance | null>(null);
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
    const scrollManageFieldAboveKeyboard = useCallback((input: TextInputInstance | null) => {
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

    // Marksheet Overall → Student Details' Conduct/Remarks fields — same
    // "scroll the focused field above the keyboard, padding the scroll
    // content by the shortfall if there's no more room to scroll into"
    // pattern as Manage's scrollManageFieldAboveKeyboard above.
    const marksOverallScrollRef = useRef<ScrollViewInstance | null>(null);
    const marksOverallScrollYRef = useRef(0);
    const marksKbHeightRef = useRef(0);
    const marksFocusedInputRef = useRef<TextInputInstance | null>(null);
    const marksConductInputRef = useRef<TextInputInstance | null>(null);
    const marksRemarksInputRef = useRef<TextInputInstance | null>(null);
    const marksOverallContentHRef = useRef(0);
    const marksOverallContainerHRef = useRef(0);
    const [marksKbPad, setMarksKbPad] = useState(0);
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvt, (e) => {
            marksKbHeightRef.current = e.endCoordinates?.height ?? 0;
            if (Platform.OS === 'android') {
                setTimeout(() => scrollMarksFieldAboveKeyboard(marksFocusedInputRef.current), 80);
            }
        });
        const hide = Keyboard.addListener(hideEvt, () => {
            marksKbHeightRef.current = 0;
            setMarksKbPad(0);
        });
        return () => { show.remove(); hide.remove(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const scrollMarksFieldAboveKeyboard = useCallback((input: TextInputInstance | null) => {
        if (input) marksFocusedInputRef.current = input;
        const kb = marksKbHeightRef.current;
        if (!kb || !input) return;
        input.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            const windowH = Dimensions.get('window').height;
            const visibleBottom = windowH - kb - 12;
            const overflow = (y + h) - visibleBottom;
            if (overflow <= 0) return;
            const target = marksOverallScrollYRef.current + overflow + 10;
            const roomLeft = Math.max(0, marksOverallContentHRef.current - marksOverallContainerHRef.current - marksOverallScrollYRef.current);
            const shortfall = Math.max(0, Math.ceil(target - marksOverallScrollYRef.current - roomLeft));
            const doScroll = () => {
                const clamped = Math.max(0, target);
                marksOverallScrollYRef.current = clamped;
                marksOverallScrollRef.current?.scrollTo({ y: clamped, animated: true });
            };
            if (shortfall > 0) {
                setMarksKbPad(shortfall);
                setTimeout(doScroll, 50);
            } else {
                doScroll();
            }
        });
    }, []);

    const mainScrollRef = useRef<ScrollViewInstance | null>(null);
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
    const tabBarScrollRef = useRef<ScrollViewInstance | null>(null);
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
    const tabPagerRef = useRef<ScrollViewInstance | null>(null);
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

    // Students tab (subject-teacher only) — mirrors web's StudentsTab.tsx: the
    // same class roster + leaderboard already fetched above (manageStudents/
    // leaderboard, both fetched unconditionally regardless of role), but a
    // RESTRICTED per-student summary instead of Manage's full editable detail
    // — just rank/score/attendance stats plus a Report button, reusing the
    // exact same Flags & Warnings board/form as Manage (manageReportBoardOpen
    // etc. below) since a given screen instance is only ever class-teacher
    // (Manage tab) or subject-teacher (Students tab), never both at once.
    const [studentsSelectedId, setStudentsSelectedId] = useState<string | null>(null);
    const studentsSelectedStudent = sortedManageStudents.find((s) => s.id === studentsSelectedId) ?? null;
    const [studentsStats, setStudentsStats] = useState<ManageStudentStats | null>(null);
    const [studentsLoadingStats, setStudentsLoadingStats] = useState(false);
    const studentsDetailSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (studentsSelectedId) Animated.timing(studentsDetailSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [studentsSelectedId, studentsDetailSlideX]);
    const closeStudentsDetail = useCallback(() => {
        Animated.timing(studentsDetailSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setStudentsSelectedId(null);
            studentsDetailSlideX.setValue(SCREEN_W);
        });
    }, [studentsDetailSlideX]);
    useEffect(() => {
        if (!studentsSelectedId) { setStudentsStats(null); return; }
        setStudentsLoadingStats(true);
        api.get(`/teacher/classes/${divisionId}/students/${studentsSelectedId}/stats`)
            .then((r) => setStudentsStats(r.data.data))
            .catch(() => setStudentsStats(null))
            .finally(() => setStudentsLoadingStats(false));
    }, [studentsSelectedId, divisionId]);
    // Whichever of Manage's or Students' selected student is currently open —
    // the shared Report board/form below reads/submits against this rather
    // than manageSelectedStudent alone, so the exact same report flow already
    // built for class-teacher works unmodified for subject-teacher too.
    const reportStudent = manageSelectedStudent ?? studentsSelectedStudent;

    // Tasks tab (subject-teacher) — Tests sub-tab. Assignments sub-tab lands
    // in a later pass; Questions/Modules/the Paper Builder stay web-only.
    const [tasksSubTab, setTasksSubTab] = useState<'tests' | 'assignments'>('tests');
    const [tasksTests, setTasksTests] = useState<TaskTest[]>([]);
    const [loadingTasksTests, setLoadingTasksTests] = useState(true);
    const [copiedTestLink, setCopiedTestLink] = useState<string | null>(null);

    const fetchTasksTests = useCallback(async (silent = false) => {
        if (isClassTeacher) return;
        if (!silent) setLoadingTasksTests(true);
        try {
            const res = await api.get(`/teacher/tasks/tests?divisionId=${divisionId}${subjectId ? `&subjectId=${subjectId}` : ''}`);
            setTasksTests(res.data.data ?? []);
        } catch {
            setTasksTests([]);
        } finally {
            if (!silent) setLoadingTasksTests(false);
        }
    }, [isClassTeacher, divisionId, subjectId]);

    // Same "refetch on every return to the screen" reasoning as web's
    // pageshow listener — a test's status can change from actions taken on
    // web while the teacher was away from this screen.
    useFocusEffect(useCallback(() => { fetchTasksTests(); }, [fetchTasksTests]));

    const taskApiErrorMsg = (err: unknown, fallback: string) => {
        const e = err as { response?: { data?: { message?: string; error?: string } } };
        return e?.response?.data?.message ?? e?.response?.data?.error ?? fallback;
    };

    const submitActivateTest = useCallback(async (test: TaskTest, startNow: boolean) => {
        try {
            const body: Record<string, unknown> = { status: 'ACTIVE' };
            if (startNow) body.startDate = new Date().toISOString();
            const res = await api.patch(`/teacher/tasks/tests/${test.id}`, body);
            setTasksTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, ...res.data.data } : t)));
        } catch (err: unknown) {
            Alert.alert('Error', taskApiErrorMsg(err, 'Failed to activate test'));
        }
    }, []);

    const handleActivateTest = useCallback((test: TaskTest) => {
        if (test.numberOfQuestions === 0 || !test.validUntil) {
            Alert.alert('Cannot activate', test.numberOfQuestions === 0 ? 'This test has no questions yet — add some on web first.' : 'Set a Valid Until date on web before activating.');
            return;
        }
        const confirmActivate = (startNow: boolean) => {
            Alert.alert(
                'Activate this test?',
                startNow
                    ? "The link goes live immediately and the Start Date locks to right now. This can't be undone."
                    : 'Students will see it as "Upcoming" until the set Start Date — it\'ll go live on its own then, no need to activate it again.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Activate', onPress: () => submitActivateTest(test, startNow) },
                ]
            );
        };
        if (test.startDate) {
            Alert.alert('Activate test', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start at set time', onPress: () => confirmActivate(false) },
                { text: 'Start now', onPress: () => confirmActivate(true) },
            ]);
        } else {
            confirmActivate(true);
        }
    }, [submitActivateTest]);

    const handleStopTest = useCallback((test: TaskTest) => {
        Alert.alert('Stop this test now?', "The test will end immediately. This can't be undone.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Stop Now', style: 'destructive', onPress: async () => {
                try {
                    const res = await api.patch(`/teacher/tasks/tests/${test.id}`, { status: 'COMPLETED', validUntil: new Date().toISOString() });
                    setTasksTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, ...res.data.data } : t)));
                } catch (err: unknown) {
                    Alert.alert('Error', taskApiErrorMsg(err, 'Failed to stop test'));
                }
            } },
        ]);
    }, []);

    const handleDeleteTest = useCallback((test: TaskTest) => {
        Alert.alert('Delete this test?', `"${test.title}" will be permanently deleted.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/teacher/tasks/tests/${test.id}`);
                    setTasksTests((prev) => prev.filter((t) => t.id !== test.id));
                } catch (err: unknown) {
                    Alert.alert('Error', taskApiErrorMsg(err, 'Failed to delete test'));
                }
            } },
        ]);
    }, []);

    const handleCopyTestLink = useCallback(async (test: TaskTest) => {
        await Clipboard.setStringAsync(`${WEB_URL}/quiz/${test.testLink}`);
        setCopiedTestLink(test.testLink);
        setTimeout(() => setCopiedTestLink(null), 1500);
    }, []);

    // Test Results panel — same slide-in-from-right treatment as Attendance/
    // Marksheet Overall's student detail and Manage's Report board.
    const [tasksResultsOpen, setTasksResultsOpen] = useState(false);
    const [tasksResultsTestId, setTasksResultsTestId] = useState<string | null>(null);
    const tasksResultsSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (tasksResultsOpen) Animated.timing(tasksResultsSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [tasksResultsOpen, tasksResultsSlideX]);
    const closeTasksResults = useCallback(() => {
        Animated.timing(tasksResultsSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setTasksResultsOpen(false);
            setTasksResultsTestId(null);
            tasksResultsSlideX.setValue(SCREEN_W);
        });
    }, [tasksResultsSlideX]);
    const openTasksResults = useCallback((id: string) => {
        setTasksResultsTestId(id);
        setTasksResultsOpen(true);
    }, []);

    // Tasks tab — Assignments sub-tab, mirrors web's AssignmentCard list +
    // activate/stop/delete/submissions exactly (same fetch/action shape as
    // Tests above).
    const [tasksAssignments, setTasksAssignments] = useState<TaskAssignment[]>([]);
    const [loadingTasksAssignments, setLoadingTasksAssignments] = useState(true);

    const fetchTasksAssignments = useCallback(async (silent = false) => {
        if (isClassTeacher) return;
        if (!silent) setLoadingTasksAssignments(true);
        try {
            const res = await api.get(`/teacher/tasks/assignments?divisionId=${divisionId}${subjectId ? `&subjectId=${subjectId}` : ''}`);
            setTasksAssignments(res.data.data ?? []);
        } catch {
            setTasksAssignments([]);
        } finally {
            if (!silent) setLoadingTasksAssignments(false);
        }
    }, [isClassTeacher, divisionId, subjectId]);

    useFocusEffect(useCallback(() => { fetchTasksAssignments(); }, [fetchTasksAssignments]));

    const submitActivateAssignment = useCallback(async (assignment: TaskAssignment) => {
        try {
            const res = await api.patch(`/teacher/tasks/assignments/${assignment.id}`, { status: 'ACTIVE' });
            setTasksAssignments((prev) => prev.map((a) => (a.id === assignment.id ? { ...a, ...res.data.data } : a)));
        } catch (err: unknown) {
            Alert.alert('Error', taskApiErrorMsg(err, 'Failed to activate assignment'));
        }
    }, []);

    const handleActivateAssignment = useCallback((assignment: TaskAssignment) => {
        if (assignment.numberOfQuestions === 0 || !assignment.dueDate) {
            Alert.alert('Cannot activate', assignment.numberOfQuestions === 0 ? 'This assignment has no questions yet — add some on web first.' : 'Set a Due Date on web before activating.');
            return;
        }
        Alert.alert('Activate this assignment?', 'Students will be able to see and submit it immediately.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Activate', onPress: () => submitActivateAssignment(assignment) },
        ]);
    }, [submitActivateAssignment]);

    const handleStopAssignment = useCallback((assignment: TaskAssignment) => {
        Alert.alert('Stop this assignment now?', "The assignment will end immediately. This can't be undone.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Stop Now', style: 'destructive', onPress: async () => {
                try {
                    const res = await api.patch(`/teacher/tasks/assignments/${assignment.id}`, { status: 'COMPLETED' });
                    setTasksAssignments((prev) => prev.map((a) => (a.id === assignment.id ? { ...a, ...res.data.data } : a)));
                } catch (err: unknown) {
                    Alert.alert('Error', taskApiErrorMsg(err, 'Failed to stop assignment'));
                }
            } },
        ]);
    }, []);

    const handleDeleteAssignment = useCallback((assignment: TaskAssignment) => {
        Alert.alert('Delete this assignment?', `"${assignment.title}" will be permanently deleted.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/teacher/tasks/assignments/${assignment.id}`);
                    setTasksAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
                } catch (err: unknown) {
                    Alert.alert('Error', taskApiErrorMsg(err, 'Failed to delete assignment'));
                }
            } },
        ]);
    }, []);

    // Submissions panel — same slide-in treatment as Test Results.
    const [tasksSubmissionsOpen, setTasksSubmissionsOpen] = useState(false);
    const [tasksSubmissionsAssignmentId, setTasksSubmissionsAssignmentId] = useState<string | null>(null);
    const tasksSubmissionsSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (tasksSubmissionsOpen) Animated.timing(tasksSubmissionsSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [tasksSubmissionsOpen, tasksSubmissionsSlideX]);
    const closeTasksSubmissions = useCallback(() => {
        Animated.timing(tasksSubmissionsSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setTasksSubmissionsOpen(false);
            setTasksSubmissionsAssignmentId(null);
            tasksSubmissionsSlideX.setValue(SCREEN_W);
        });
    }, [tasksSubmissionsSlideX]);
    const openTasksSubmissions = useCallback((id: string) => {
        setTasksSubmissionsAssignmentId(id);
        setTasksSubmissionsOpen(true);
    }, []);

    // Pull-to-refresh — same on both Tests and Assignments sub-tabs.
    const [tasksRefreshing, setTasksRefreshing] = useState(false);
    const handleTasksRefresh = useCallback(async () => {
        setTasksRefreshing(true);
        try {
            await Promise.all([fetchTasksTests(true), fetchTasksAssignments(true)]);
        } finally {
            setTasksRefreshing(false);
        }
    }, [fetchTasksTests, fetchTasksAssignments]);

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
        if (!reportStudent) return;
        setManageReportLoadingList(true);
        try {
            const res = await api.get(`/teacher/classes/${divisionId}/students/${reportStudent.id}/remarks`);
            setManageReportFlags(res.data.data ?? []);
        } catch {
            setManageReportFlags([]);
        } finally {
            setManageReportLoadingList(false);
        }
    }, [reportStudent, divisionId]);

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
        if (!reportStudent) return;
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
                await api.post(`/teacher/classes/${divisionId}/students/${reportStudent.id}/remarks`, { ...payload, severity: 'MEDIUM' });
            }
            closeManageReportForm();
            fetchManageReportFlags();
        } catch (err: unknown) {
            const e = err as { response?: { data?: { error?: string } } };
            Alert.alert('Error', e?.response?.data?.error ?? (manageReportEditing ? 'Failed to update report' : 'Failed to submit report'));
        } finally {
            setManageReportSubmitting(false);
        }
    }, [reportStudent, divisionId, manageReportForm, manageReportAttachments, manageReportEditing, closeManageReportForm, fetchManageReportFlags]);

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

    // Android hardware back closes the student detail first rather than
    // leaving the whole class screen. The topbar's own back button is the
    // one exception — it's meant to leave the class screen outright even
    // with a student open, so it flips this flag true for its one dispatch
    // to slip past the guard below, then this resets it once the detail
    // itself actually closes (or immediately if it never was open).
    const [manageBackGuardSuppressed, setManageBackGuardSuppressed] = useState(false);
    useEffect(() => {
        if (!manageSelectedStudent) setManageBackGuardSuppressed(false);
    }, [manageSelectedStudent]);
    usePreventRemove(!!manageSelectedStudent && !manageBackGuardSuppressed, () => closeManageDetail());

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
    const attYq = !ayIsCurrent && aySelectedYearId ? `academicYearId=${aySelectedYearId}` : '';
    const attQS = (hasExisting: boolean) => attYq ? `${hasExisting ? '&' : '?'}${attYq}` : '';
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
    const attFetchedRef = useRef<string | null>(null);

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
        return api.get(`${attBase}/summary${attQS(false)}`).then((summaryRes) => {
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

    // Roster + holidays + summary — mirrors web's base-data effect. Re-fetches
    // when the selected academic year changes (not just once on mount), since
    // the roster/summary are year-scoped.
    useEffect(() => {
        const key = `${divisionId}:${aySelectedYearId ?? 'current'}`;
        if (attFetchedRef.current === key) return;
        attFetchedRef.current = key;
        Promise.all([
            api.get(`/teacher/classes/${divisionId}/students${attQS(false)}`),
            api.get(`${attBase}/holidays`),
            api.get(`${attBase}/summary${attQS(false)}`),
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
    }, [divisionId, aySelectedYearId]);

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
        api.get(`${attBase}/daily?date=${attCurrentDk}${attQS(true)}`)
            .then((res) => {
                const { records, dateNote } = res.data.data;
                const newAtt = Object.fromEntries(attStudents.map((s) => [s.id, { status: null as AttendanceStatus, remark: '' }]));
                (records ?? []).forEach((r: { studentId: string; status: string; remark?: string }) => {
                    if (newAtt[r.studentId] !== undefined) newAtt[r.studentId] = { status: r.status as AttendanceStatus, remark: r.remark ?? '' };
                });
                setAttAttendance(newAtt);
                setAttGlobalRemark(dateNote ?? '');
                // Always sync (not just when truthy) — otherwise a cleared
                // note leaves the stale old text sitting in attDateRemarks,
                // which feeds the Sheet view's remark dot and the remark
                // modal's prefill.
                setAttDateRemarks((prev) => ({ ...prev, [attCurrentDk]: dateNote ?? '' }));
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
        api.get(`${attBase}/monthly?month=${monthStr}${attQS(true)}`)
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
        if (isHistoricalYear) return;
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
        if (isHistoricalYear) return;
        setAttAttendance((prev) => ({ ...prev, [id]: { ...prev[id], status: prev[id]?.status === status ? null : status } }));
    }, [isHistoricalYear]);
    const attSetRemark = useCallback((id: string, remark: string) => {
        if (isHistoricalYear) return;
        setAttAttendance((prev) => ({ ...prev, [id]: { ...prev[id], remark } }));
    }, [isHistoricalYear]);

    const handleAttSave = useCallback(async () => {
        if (isHistoricalYear) return;
        setAttSaveStatus('saving');
        try {
            const records = attStudents
                .filter((s) => attAttendance[s.id]?.status !== null && attAttendance[s.id]?.status !== undefined)
                .map((s) => ({ studentId: s.id, status: attAttendance[s.id].status as 'P' | 'A' | 'L', remark: attAttendance[s.id].remark ?? '' }));
            // Always send dateNote as the real string (even ''), never
            // `|| undefined` — the backend only touches the day note when the
            // key is present at all (`if (dateNote !== undefined)`), and an
            // empty string is what tells it to actually delete the note.
            // Sending `undefined` for a cleared remark drops the key from the
            // JSON body entirely, so the backend leaves the old note as-is —
            // that's why a cleared-then-saved remark kept reappearing.
            await api.post(`${attBase}/daily`, { date: attCurrentDk, records, dateNote: attGlobalRemark });
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

    // Voice attendance: the teacher names the absent / late roll numbers and everyone else is Present.
    // Remarks already typed for a student are kept; the Daily list's normal 2s auto-save then stores it.
    const [attVoiceOpen, setAttVoiceOpen] = useState(false);
    const attApplyVoice = useCallback(({ absentIds, lateIds }: { absentIds: string[]; lateIds: string[] }) => {
        if (isHistoricalYear) return;
        const absent = new Set(absentIds);
        const late = new Set(lateIds);
        setAttAttendance((prev) => {
            const next: Record<string, { status: AttendanceStatus; remark: string }> = {};
            for (const id of Object.keys(prev)) next[id] = { ...prev[id], status: absent.has(id) ? 'A' : late.has(id) ? 'L' : 'P' };
            return next;
        });
    }, [isHistoricalYear]);

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
    const [attShowExportMenu, setAttShowExportMenu] = useState(false);
    const [attShowMonthSelector, setAttShowMonthSelector] = useState(false);
    const [attSelectedExportMonths, setAttSelectedExportMonths] = useState<number[]>([]);
    const [attExporting, setAttExporting] = useState(false);

    // Keep the sheet's month in step with whatever date Daily has selected.
    useEffect(() => {
        setAttSheetMonth((prev) => (prev === attSelectedDate.getMonth() ? prev : attSelectedDate.getMonth()));
    }, [attSelectedDate]);

    const attTodayForYear = new Date();
    const attStartYear = attTodayForYear.getMonth() >= 5 ? attTodayForYear.getFullYear() : attTodayForYear.getFullYear() - 1;
    const attSheetYear = attSheetMonth >= 5 ? attStartYear : attStartYear + 1;
    const attSheetMonthKey = `${attSheetYear}-${String(attSheetMonth + 1).padStart(2, '0')}`;

    useEffect(() => {
        api.get(`${attBase}/monthly?month=${attSheetMonthKey}${attQS(true)}`)
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
        if (isHistoricalYear) return;
        setAttDateRemarks((prev) => ({ ...prev, [dk]: remark }));
        if (dk === attCurrentDk) {
            setAttGlobalRemark(remark);
        } else {
            api.post(`${attBase}/daily`, { date: dk, records: [], dateNote: remark }).catch(() => {});
        }
    }, [attCurrentDk, attBase, isHistoricalYear]);

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
    // Which student attStudentRecords currently holds. The fetch effect below
    // only flips attLoadingStudentRec to true *after* the detail has already
    // rendered once, so without this the 12x31 Attendance Sheet grid got built
    // a first time against the previous student's (or empty) records — ~800
    // views thrown away a moment later. That wasted build was the multi-second
    // freeze on opening a student, which in turn stalled the slide-in.
    const [attStudentRecordsFor, setAttStudentRecordsFor] = useState<string | null>(null);

    // No auto-select here (unlike web) — Student Details now opens on a
    // Manage-style list of students first, and picking one from that list is
    // what sets attOverallSelectedId and opens the detail page below.
    const attSelectedOverallStudent = attOverallStudents.find((s) => s.studentId === attOverallSelectedId) ?? null;

    // Slide the student detail in from the right the moment a student is
    // selected, and slide it back out before clearing the selection — same
    // treatment as Manage's manageDetailSlideX.
    // Driven from an effect, exactly like Manage's manageDetailSlideX. It has
    // to be: with useNativeDriver the animation is attached to the view's
    // native node, so starting it from the press handler (before the detail
    // has mounted) leaves it driving nothing on Android and the panel just
    // appears. The freeze that made this look late is fixed at its source —
    // see attStudentRecordsFor above — not by moving the start earlier.
    const attDetailSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (attOverallSelectedId) Animated.timing(attDetailSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [attOverallSelectedId, attDetailSlideX]);
    const closeAttOverallDetail = useCallback(() => {
        Animated.timing(attDetailSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setAttOverallSelectedId(null);
            attDetailSlideX.setValue(SCREEN_W);
        });
    }, [attDetailSlideX]);

    // Same roll-no sort as sortedAttStudents, just over the summary list
    // (which carries the pct fields the list row and detail page need).
    const sortedOverallStudents = useMemo(() => [...attOverallStudents].sort((a, b) => {
        const ra = parseInt(a.rollNo || '9999', 10);
        const rb = parseInt(b.rollNo || '9999', 10);
        return ra - rb;
    }), [attOverallStudents]);

    useEffect(() => {
        if (!attSelectedOverallStudent) return;
        const forId = attSelectedOverallStudent.studentId;
        setAttLoadingStudentRec(true);
        api.get(`${attBase}/student-records/${forId}?startDate=${attStartYear}-06-01&endDate=${attStartYear + 1}-05-31${attQS(true)}`)
            .then((res) => {
                const recs: Record<string, AttendanceStatus> = {};
                (res.data.data.records ?? []).forEach((r: { date: string; status: string }) => { recs[r.date] = r.status as AttendanceStatus; });
                setAttStudentRecords(recs);
                setAttStudentRecordsFor(forId);
            })
            .catch(() => { setAttStudentRecords({}); setAttStudentRecordsFor(forId); })
            .finally(() => setAttLoadingStudentRec(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attSelectedOverallStudent?.studentId, attBase]);

    const ATT_SHEET_MONTHS_ORDER = useMemo(() => [
        { month: 'June', short: 'Jun', key: 5 }, { month: 'July', short: 'Jul', key: 6 }, { month: 'August', short: 'Aug', key: 7 },
        { month: 'September', short: 'Sep', key: 8 }, { month: 'October', short: 'Oct', key: 9 }, { month: 'November', short: 'Nov', key: 10 },
        { month: 'December', short: 'Dec', key: 11 }, { month: 'January', short: 'Jan', key: 0 }, { month: 'February', short: 'Feb', key: 1 },
        { month: 'March', short: 'Mar', key: 2 }, { month: 'April', short: 'Apr', key: 3 }, { month: 'May', short: 'May', key: 4 },
    ], []);

    // Builds one month's worth of sheet data — exact same headers/columns/
    // rows as web's exportMonthSheet (Roll No., Name, Student ID, one column
    // per day, P/A/L/%/Cumulative %).
    const attExportMonthSheet = useCallback((monthKey: number) => {
        const exportYear = monthKey >= 5 ? attStartYear : attStartYear + 1;
        const days = new Date(exportYear, monthKey + 1, 0).getDate();
        const dates = Array.from({ length: days }, (_, i) => i + 1);
        const exportMonthStr = `${exportYear}-${String(monthKey + 1).padStart(2, '0')}`;
        const headers = ['Roll No.', 'Name', 'Student ID', ...dates.map(String), 'P', 'A', 'L', '%', 'Cumulative %'];
        const rows = sortedAttStudents.map((student) => {
            let p = 0, a = 0, l = 0;
            const dateCells = dates.map((d) => {
                const dk = attMakeDateKey(exportYear, monthKey, d);
                if (attHolidays[dk]) return 'H';
                const status = attGetLiveStatus(student.id, dk);
                if (status === 'P') p++; else if (status === 'A') a++; else if (status === 'L') l++;
                return status ?? '—';
            });
            const total = p + a + l;
            const pct = total > 0 ? `${Math.round(((p + l) / total) * 100)}%` : '—';
            const cumulativePct = student.cumulativeByMonth?.[exportMonthStr] ?? null;
            return [student.rollNo, student.name, student.studentId, ...dateCells, p || '—', a || '—', l || '—', pct, cumulativePct !== null ? `${cumulativePct}%` : '—'];
        });
        const short = ATT_SHEET_MONTHS_ORDER.find((m) => m.key === monthKey)?.short ?? String(monthKey);
        return { headers, rows, sheetName: short, exportYear };
    }, [attStartYear, sortedAttStudents, attHolidays, attGetLiveStatus, ATT_SHEET_MONTHS_ORDER]);

    // Writes a workbook to a local file and hands it to the OS share sheet —
    // RN has no browser-style automatic download, so sharing (save to
    // Files, email, WhatsApp, etc.) is the mobile equivalent of web's
    // XLSX.writeFile triggering a download.
    const attShareWorkbook = useCallback(async (wb: XLSX.WorkBook, filename: string) => {
        setAttExporting(true);
        try {
            const Sharing = loadSharing();
            if (!Sharing) { Alert.alert('Needs a full app build', 'Exporting to Excel isn\'t available in Expo Go — needs a full app build.'); return; }
            const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const fileUri = `${FileSystem.cacheDirectory}${filename}`;
            await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            const available = await Sharing.isAvailableAsync();
            if (!available) { Alert.alert('Sharing not available', 'This device cannot share files.'); return; }
            await Sharing.shareAsync(fileUri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: filename,
                UTI: 'org.openxmlformats.spreadsheetml.sheet',
            });
        } catch {
            Alert.alert('Export failed', 'Could not generate the Excel file.');
        } finally {
            setAttExporting(false);
        }
    }, []);

    const handleAttExportThisMonth = useCallback(() => {
        setAttShowExportMenu(false);
        setAttExporting(true);
        const { headers, rows, sheetName, exportYear } = attExportMonthSheet(attSheetMonth);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${sheetName} Attendance`);
        // iOS specifically: presenting the native share sheet while our own
        // <Modal> (the export dropdown) is still mid-dismiss silently no-ops
        // — the app just sits there like nothing happened. Waiting for the
        // Modal's own fade-out (animationType="fade") to actually finish
        // before calling Sharing.shareAsync avoids the two native
        // presentations colliding. Android doesn't need this, but it's
        // harmless there too.
        setTimeout(() => attShareWorkbook(wb, `Attendance_${sheetName}_${exportYear}.xlsx`), 400);
    }, [attExportMonthSheet, attSheetMonth, attShareWorkbook]);

    const handleAttExportSelectedMonths = useCallback(() => {
        if (attSelectedExportMonths.length === 0) return;
        setAttExporting(true);
        const wb = XLSX.utils.book_new();
        attSelectedExportMonths.forEach((monthKey) => {
            const { headers, rows, sheetName, exportYear } = attExportMonthSheet(monthKey);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, `${sheetName} ${exportYear} Attendance`);
        });
        setAttShowMonthSelector(false);
        setAttSelectedExportMonths([]);
        // Same iOS modal-dismiss race as handleAttExportThisMonth above.
        setTimeout(() => attShareWorkbook(wb, `Attendance_${attStartYear}_Selected.xlsx`), 400);
    }, [attSelectedExportMonths, attExportMonthSheet, attShareWorkbook, attStartYear]);

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
                    <Text style={[styles.cardHeaderText, { color: theme.text }]}>{manageSelectedStudent ? 'Student Info' : `Students (${sortedManageStudents.length})`}</Text>
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
                                <View key={stat.label} style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
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
                                            style={{ includeFontPadding: false, flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.purple, paddingVertical: 2 }} />
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

    // ── Students tab — subject-teacher's restricted roster, mirrors web's
    // StudentsTab.tsx: same list as Manage (rank + attendance% per row), but
    // selecting a student shows only a summary (no editable info, no
    // guardians, no account controls) plus the same Report button/flow.
    const studentsPageContent = useMemo(() => {
        if (!division) return null;
        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 12 }}>
                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: -12 }]}>
                    <Users size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                    <Text style={[styles.cardHeaderText, { color: theme.text }]}>{studentsSelectedStudent ? 'Student Details' : `Students (${sortedManageStudents.length})`}</Text>
                </View>
                <View style={{ flex: 1 }}>
                {studentsSelectedStudent ? (
                    <Animated.View style={{ flex: 1, transform: [{ translateX: studentsDetailSlideX }] }}>
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 24 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={closeStudentsDetail} style={[styles.manageBackBtn, { borderColor: theme.cardBorder, marginTop: Platform.OS === 'android' ? -16 : -12 }]}>
                                <ArrowLeft size={15} color={theme.text} />
                            </TouchableOpacity>
                            <View
                                style={[styles.avatarSm, { width: 44, height: 44, borderRadius: 15, backgroundColor: studentsSelectedStudent.avatarUrl ? 'transparent' : getAvatarColor(studentsSelectedStudent.user.name ?? studentsSelectedStudent.studentId) }]}>
                                {studentsSelectedStudent.avatarUrl
                                    ? <Image source={{ uri: studentsSelectedStudent.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                    : <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(studentsSelectedStudent.user.name ?? studentsSelectedStudent.studentId)}</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{studentsSelectedStudent.user.name ?? '-'}</Text>
                                <Text style={[{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }, Platform.OS === 'android' ? { marginTop: -3 } : undefined]}>
                                    {studentsSelectedStudent.studentId}{studentsSelectedStudent.rollNo ? ` · Roll ${studentsSelectedStudent.rollNo}` : ''}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity onPress={openManageReportBoard}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: theme.cardBorder, alignSelf: 'flex-start' }}>
                            <Flag size={11} color="#EF4444" />
                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#EF4444' }}>Report</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {[
                                { label: 'Class Rank', value: studentsLoadingStats ? '…' : (studentsStats?.classRank != null ? `#${studentsStats.classRank}` : '-'), color: studentsStats?.classRank == null ? theme.purple : studentsStats.classRank === 1 ? '#F59E0B' : studentsStats.classRank <= 3 ? theme.purple : '#64748B' },
                                { label: 'Score %', value: studentsLoadingStats ? '…' : (studentsStats?.score.pct != null ? `${studentsStats.score.pct}%` : '-'), color: studentsStats?.score.pct == null ? theme.purple : studentsStats.score.pct >= 75 ? '#059669' : studentsStats.score.pct >= 35 ? '#F59E0B' : '#DC2626' },
                                { label: 'Attendance', value: studentsLoadingStats ? '…' : (studentsStats?.attendance.pct != null ? `${studentsStats.attendance.pct}%` : '-'), color: studentsStats?.attendance.pct == null ? theme.purple : studentsStats.attendance.pct >= 75 ? '#10B981' : studentsStats.attendance.pct >= 65 ? '#F59E0B' : '#EF4444' },
                            ].map((stat) => (
                                <View key={stat.label} style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_800ExtraBold', color: stat.color }}>{stat.value}</Text>
                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>{stat.label}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.subText, lineHeight: 16 }}>
                                Full student details, guardians, and account management are handled by {division.name}&apos;s class teacher.
                            </Text>
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
                                        <TouchableOpacity key={student.id} onPress={() => setStudentsSelectedId(student.id)} activeOpacity={0.7} style={[styles.manageStudentRow, { paddingHorizontal: 0, borderBottomColor: theme.cardBorder }]}>
                                            <View
                                                style={[styles.avatarSm, { width: 42, height: 42, borderRadius: 14, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.user.name ?? student.studentId) }]}>
                                                {student.avatarUrl
                                                    ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                    : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.user.name ?? student.studentId)}</Text>}
                                            </View>
                                            <View style={{ flex: 1, gap: 2 }}>
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{student.user.name ?? '-'}</Text>
                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>
                                                    {student.studentId}{student.rollNo ? ` · Roll ${student.rollNo}` : ''}
                                                </Text>
                                            </View>
                                            {student.status === 'INACTIVE' && (
                                                <View style={[styles.manageBadge, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2' }]}>
                                                    <Text style={[styles.manageBadgeText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>Inactive</Text>
                                                </View>
                                            )}
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
                        studentName={reportStudent?.user.name ?? 'Student'}
                        flags={manageReportFlags} loading={manageReportLoadingList}
                        onAdd={() => openManageReportForm()} onEdit={openManageReportForm}
                    />
                )}

                {manageReportModalOpen && (
                    <ManageReportForm
                        theme={theme} isDark={isDark}
                        studentName={reportStudent?.user.name ?? 'Student'}
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
        );
    }, [
        division, theme, isDark, sortedManageStudents, loadingManageStudents, leaderboard,
        studentsSelectedStudent, studentsDetailSlideX, closeStudentsDetail, studentsStats, studentsLoadingStats,
        reportStudent, manageReportBoardOpen, openManageReportBoard, manageReportFlags, manageReportLoadingList,
        openManageReportForm, manageReportModalOpen, manageReportEditing, manageReportForm,
        manageReportAttachments, manageReportUploading, manageReportSubmitting, handleManageReportAttach, handleManageReportSubmit,
        manageReportCategoryPickerOpen, manageReportBoardSlideX, closeManageReportBoard, closeManageReportForm,
    ]);

    // ── Tasks tab — subject-teacher's Tests/Assignments monitor ─────────────
    const tasksPageContent = useMemo(() => {
        if (!division) return null;
        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
                <View style={[styles.manageSegTrack, { backgroundColor: trackBg, alignSelf: 'flex-end' }]}>
                    {([
                        { key: 'tests' as const, label: 'Tests', Icon: BookOpen },
                        { key: 'assignments' as const, label: 'Assignments', Icon: FileText },
                    ]).map(({ key, label, Icon }) => {
                        const active = tasksSubTab === key;
                        return (
                            <TouchableOpacity key={key} onPress={() => setTasksSubTab(key)}
                                style={[styles.manageSegBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, Platform.OS === 'android' ? { paddingVertical: 5 } : undefined, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                <Icon size={12} color={active ? theme.text : theme.subText} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={{ flex: 1 }}>
                {tasksSubTab === 'tests' ? (
                    <ScrollView showsVerticalScrollIndicator={false}
                        contentContainerStyle={tasksTests.length === 0 ? { flexGrow: 1 } : { gap: 10, paddingBottom: 24 }}
                        refreshControl={<RefreshControl refreshing={tasksRefreshing} onRefresh={handleTasksRefresh} tintColor={theme.muted} />}>
                        {loadingTasksTests ? (
                            <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                        ) : tasksTests.length === 0 ? (
                            <View style={styles.centerFill}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No tests yet</Text>
                            </View>
                        ) : (() => {
                            const now = new Date();
                            const isExpired = (t: TaskTest) => t.status === 'COMPLETED' || (!!t.validUntil && new Date(t.validUntil) < now);
                            const liveTests = tasksTests.filter((t) => !isExpired(t));
                            const historyTests = tasksTests.filter((t) => isExpired(t));
                            const renderTestCard = (test: TaskTest) => (
                                <TaskTestCard key={test.id} theme={theme} isDark={isDark} test={test}
                                    onActivate={() => handleActivateTest(test)}
                                    onStopNow={() => handleStopTest(test)}
                                    onDelete={() => handleDeleteTest(test)}
                                    onCopyLink={() => handleCopyTestLink(test)}
                                    onResults={() => openTasksResults(test.id)}
                                    copied={copiedTestLink === test.testLink}
                                />
                            );
                            return (
                                <>
                                    <TasksSectionHeader theme={theme} icon={<TasksLiveDot />} label="Live Tests" count={liveTests.length} />
                                    {liveTests.length === 0 ? (
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: historyTests.length > 0 ? 16 : 0 }}>No active or draft tests</Text>
                                    ) : (
                                        <View style={{ gap: 10, marginBottom: historyTests.length > 0 ? 16 : 0 }}>{liveTests.map(renderTestCard)}</View>
                                    )}
                                    {historyTests.length > 0 && (
                                        <>
                                            <TasksSectionHeader theme={theme} icon={<Clock size={11} color={theme.muted} />} label="History" count={historyTests.length} />
                                            <View style={{ gap: 10 }}>{historyTests.map(renderTestCard)}</View>
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </ScrollView>
                ) : (
                    <ScrollView showsVerticalScrollIndicator={false}
                        contentContainerStyle={tasksAssignments.length === 0 ? { flexGrow: 1 } : { gap: 10, paddingBottom: 24 }}
                        refreshControl={<RefreshControl refreshing={tasksRefreshing} onRefresh={handleTasksRefresh} tintColor={theme.muted} />}>
                        {loadingTasksAssignments ? (
                            <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                        ) : tasksAssignments.length === 0 ? (
                            <View style={styles.centerFill}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No assignments yet</Text>
                            </View>
                        ) : (() => {
                            const liveAssignments = tasksAssignments.filter((a) => a.status !== 'COMPLETED');
                            const historyAssignments = tasksAssignments.filter((a) => a.status === 'COMPLETED');
                            const renderAssignmentCard = (assignment: TaskAssignment) => (
                                <TaskAssignmentCard key={assignment.id} theme={theme} isDark={isDark} assignment={assignment}
                                    onActivate={() => handleActivateAssignment(assignment)}
                                    onStopNow={() => handleStopAssignment(assignment)}
                                    onDelete={() => handleDeleteAssignment(assignment)}
                                    onSubmissions={() => openTasksSubmissions(assignment.id)}
                                />
                            );
                            return (
                                <>
                                    <TasksSectionHeader theme={theme} icon={<TasksLiveDot />} label="Live Assignments" count={liveAssignments.length} />
                                    {liveAssignments.length === 0 ? (
                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: historyAssignments.length > 0 ? 16 : 0 }}>No active or draft assignments</Text>
                                    ) : (
                                        <View style={{ gap: 10, marginBottom: historyAssignments.length > 0 ? 16 : 0 }}>{liveAssignments.map(renderAssignmentCard)}</View>
                                    )}
                                    {historyAssignments.length > 0 && (
                                        <>
                                            <TasksSectionHeader theme={theme} icon={<Clock size={11} color={theme.muted} />} label="History" count={historyAssignments.length} />
                                            <View style={{ gap: 10 }}>{historyAssignments.map(renderAssignmentCard)}</View>
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </ScrollView>
                )}

                {tasksResultsOpen && tasksResultsTestId && (
                    <TaskResultsPanel theme={theme} isDark={isDark} testId={tasksResultsTestId} onClose={closeTasksResults} slideX={tasksResultsSlideX} />
                )}
                {tasksSubmissionsOpen && tasksSubmissionsAssignmentId && (
                    <TaskAssignmentSubmissionsPanel theme={theme} isDark={isDark} assignmentId={tasksSubmissionsAssignmentId} onClose={closeTasksSubmissions} slideX={tasksSubmissionsSlideX} />
                )}
                </View>
            </View>
        );
    }, [
        division, theme, isDark, tasksSubTab, loadingTasksTests, tasksTests, copiedTestLink,
        handleActivateTest, handleStopTest, handleDeleteTest, handleCopyTestLink, tasksRefreshing, handleTasksRefresh,
        tasksResultsOpen, tasksResultsTestId, openTasksResults, closeTasksResults, tasksResultsSlideX,
        loadingTasksAssignments, tasksAssignments, handleActivateAssignment, handleStopAssignment, handleDeleteAssignment,
        tasksSubmissionsOpen, tasksSubmissionsAssignmentId, openTasksSubmissions, closeTasksSubmissions, tasksSubmissionsSlideX,
    ]);

    // ── Marksheet tab — class teacher view (Offline sub-tab first) ──────────
    // Exam marks are the assigned subject teacher's job (bulkUpsertScores is
    // gated to restrictToSubjectId on web); the class teacher only owns
    // structure (add/edit exams, add/edit graded subjects) and the Graded
    // Subjects grade values themselves. Structure management needs the same
    // web-only judgment call already made for Attendance's export/setup
    // flows — it's a once-a-term action best done on a bigger screen — so
    // this screen is read-only for exam marks and structure, with graded
    // grade-entry as the one thing the class teacher can edit here.
    const marksAcademicYear = useMemo(() => {
        if (aySelectedYear) return aySelectedYear.label;
        const now = new Date();
        const yr = now.getFullYear();
        return now.getMonth() >= 5 ? `${yr}-${String(yr + 1).slice(2)}` : `${yr - 1}-${String(yr).slice(2)}`;
    }, [aySelectedYear]);
    const [marksSubTab, setMarksSubTab] = useState<'offline' | 'online' | 'overall'>('offline');
    const [marksLoading, setMarksLoading] = useState(true);
    const [marksInitialized, setMarksInitialized] = useState(true);
    const [marksheetId, setMarksheetId] = useState<string | null>(null);
    const [marksStudents, setMarksStudents] = useState<MarksStudent[]>([]);
    const [marksExamColumns, setMarksExamColumns] = useState<Record<string, MarksExamColumn[]>>({});
    const [marksScores, setMarksScores] = useState<Record<string, Record<string, MarksScoreEntry>>>({});
    const [marksGradedSubjects, setMarksGradedSubjects] = useState<MarksGradedSubject[]>([]);
    const [marksGradedScores, setMarksGradedScores] = useState<Record<string, Record<string, MarksGradedScoreEntry>>>({});
    const [marksGradeScale, setMarksGradeScale] = useState<MarksGradeScaleEntry[]>([]);
    const [marksGradedSectionTitle, setMarksGradedSectionTitle] = useState('Graded Subjects');
    // Per-student Conduct/Remarks — offline-only, class-teacher writable,
    // mirrors web's marksheetHook.remarks (keyed by studentId).
    const [marksRemarks, setMarksRemarks] = useState<Record<string, { conduct: string | null; remarks: string | null }>>({});

    const fetchMarksheet = useCallback(async () => {
        setMarksLoading(true);
        try {
            const res = await api.get(`/teacher/marksheet/division/${divisionId}`, { params: { academicYear: marksAcademicYear } });
            const data = res.data?.data;
            setMarksInitialized(true);
            setMarksheetId(data?.marksheet?.id ?? null);
            setMarksStudents(data?.students ?? []);
            setMarksExamColumns(data?.examColumns ?? {});
            setMarksScores(data?.scores ?? {});
            setMarksGradedSubjects(data?.gradedSubjects ?? []);
            setMarksGradedScores(data?.gradedScores ?? {});
            setMarksGradeScale(data?.gradeScale ?? []);
            setMarksGradedSectionTitle(data?.marksheet?.gradedSectionTitle || 'Graded Subjects');
            setMarksRemarks(data?.remarks ?? {});
        } catch (err) {
            // 404 here means the class teacher hasn't set the marksheet up yet
            // on web — this screen has no "Add Exam" to fix that from, so it
            // just shows the not-set-up state rather than an error.
            if ((err as { response?: { status?: number } })?.response?.status === 404) {
                setMarksInitialized(false);
            }
            setMarksStudents([]);
            setMarksExamColumns({});
            setMarksScores({});
            setMarksGradedSubjects([]);
            setMarksGradedScores({});
            setMarksRemarks({});
        } finally {
            setMarksLoading(false);
        }
    }, [divisionId, marksAcademicYear]);

    // Conduct/Remarks — debounced save-as-you-type (600ms), same PUT the web
    // Report Card's textareas use. Local state updates immediately; the
    // network call fires after the user pauses typing.
    const marksRemarkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const handleMarksRemarkChange = useCallback((studentId: string, patch: { conduct?: string | null; remarks?: string | null }) => {
        if (isHistoricalYear) return;
        setMarksRemarks((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? { conduct: null, remarks: null }), ...patch } }));
        if (!marksheetId) return;
        if (marksRemarkTimers.current[studentId]) clearTimeout(marksRemarkTimers.current[studentId]);
        marksRemarkTimers.current[studentId] = setTimeout(() => {
            setMarksRemarks((prev) => {
                const val = prev[studentId] ?? { conduct: null, remarks: null };
                api.put(`/teacher/marksheet/${marksheetId}/remarks/${studentId}`, { conduct: val.conduct, remarks: val.remarks }).catch(() => {});
                return prev;
            });
        }, 600);
    }, [marksheetId, isHistoricalYear]);

    // Online marksheet — auto-computed server-side from completed tests, so
    // unlike Offline it's always live (no init step, no 404/not-set-up case)
    // and fully read-only: no graded subjects, no grade editing. Roster comes
    // from the roster call already made for Manage (manageStudents), same as
    // web's useOnlineMarksheet falling back to getClassStudents.
    const [marksOnlineLoading, setMarksOnlineLoading] = useState(true);
    const [marksOnlineFetched, setMarksOnlineFetched] = useState(false);
    const [marksOnlineExamColumns, setMarksOnlineExamColumns] = useState<Record<string, MarksExamColumn[]>>({});
    const [marksOnlineScores, setMarksOnlineScores] = useState<Record<string, Record<string, MarksScoreEntry>>>({});
    const fetchMarksOnline = useCallback(async () => {
        setMarksOnlineLoading(true);
        try {
            const res = await api.get(`/teacher/marksheet/division/${divisionId}/online`);
            const data = res.data?.data;
            setMarksOnlineExamColumns(data?.examColumns ?? {});
            setMarksOnlineScores(data?.scores ?? {});
        } catch {
            setMarksOnlineExamColumns({});
            setMarksOnlineScores({});
        } finally {
            setMarksOnlineLoading(false);
            setMarksOnlineFetched(true);
        }
    }, [divisionId]);
    useEffect(() => {
        if ((marksSubTab === 'online' || marksSubTab === 'overall') && !marksOnlineFetched) fetchMarksOnline();
    }, [marksSubTab, marksOnlineFetched, fetchMarksOnline]);

    // Local-first grade edit — matches Attendance's own pattern (update state
    // immediately, save in the background) rather than waiting on the PUT
    // before the cell shows the new value.
    const marksSavingGradeRef = useRef<Set<string>>(new Set());
    const handleMarksGradeChange = useCallback((gsId: string, stId: string, term: 't1' | 't2', value: string | null) => {
        if (isHistoricalYear) return;
        setMarksGradedScores((prev) => {
            const existing = prev[gsId]?.[stId] ?? { term1Grade: null, term2Grade: null };
            const updated: MarksGradedScoreEntry = term === 't1' ? { ...existing, term1Grade: value } : { ...existing, term2Grade: value };
            return { ...prev, [gsId]: { ...prev[gsId], [stId]: updated } };
        });
        if (!marksheetId) return;
        const key = `${gsId}:${stId}`;
        marksSavingGradeRef.current.add(key);
        const existing = marksGradedScores[gsId]?.[stId] ?? { term1Grade: null, term2Grade: null };
        const payload = term === 't1' ? { ...existing, term1Grade: value } : { ...existing, term2Grade: value };
        api.put(`/teacher/marksheet/${marksheetId}/graded-scores`, {
            scores: [{ gradedSubjectId: gsId, studentId: stId, term1Grade: payload.term1Grade, term2Grade: payload.term2Grade }],
        }).catch(() => {
            Alert.alert('Error', 'Could not save the grade. Please try again.');
        }).finally(() => {
            marksSavingGradeRef.current.delete(key);
        });
    }, [marksheetId, marksGradedScores, isHistoricalYear]);

    // fetchMarksheet is declared just above, after the shared useFocusEffect
    // higher up in this component — referencing it there would hit the const
    // temporal-dead-zone (that effect runs during the same render, before
    // this line is reached), so it gets its own fetch-once-on-mount effect
    // here instead.
    const marksFetchedRef = useRef(false);
    useEffect(() => {
        if (marksFetchedRef.current) return;
        marksFetchedRef.current = true;
        fetchMarksheet();
    }, [fetchMarksheet]);

    // Grade-entry modal for a single Graded Subject cell (Term 1 or Term 2) —
    // class-teacher only (per confirmed scope: "Sirf dikhe, edit na ho" for
    // a subject teacher viewing this screen).
    const [marksGradeModal, setMarksGradeModal] = useState<{ gsId: string; gsName: string; stId: string; stName: string; term: 't1' | 't2'; current: string | null } | null>(null);
    const [marksGradeDraft, setMarksGradeDraft] = useState('');

    // Score-entry modal for a single Offline exam-mark cell — a subject
    // teacher's own subject column only (matches web: exam marks are
    // editable per-subject by whoever teaches that subject; Online stays
    // read-only everywhere since it's auto-computed).
    const [marksScoreModal, setMarksScoreModal] = useState<{ examId: string; examName: string; maxMarks: number; stId: string; stName: string; current: number | null } | null>(null);
    const [marksScoreDraft, setMarksScoreDraft] = useState('');
    const marksSavingScoreRef = useRef<Set<string>>(new Set());
    const handleMarksScoreChange = useCallback((examId: string, stId: string, value: number | null) => {
        if (isHistoricalYear) return;
        setMarksScores((prev) => ({
            ...prev,
            [examId]: { ...prev[examId], [stId]: { score: value, isAbsent: prev[examId]?.[stId]?.isAbsent ?? false } },
        }));
        if (!marksheetId || !subjectId) return;
        const key = `${examId}:${stId}`;
        marksSavingScoreRef.current.add(key);
        api.put(`/teacher/marksheet/${marksheetId}/scores/subject/${subjectId}`, {
            scores: [{ studentId: stId, examColumnId: examId, score: value, isAbsent: false }],
        }).catch(() => {
            Alert.alert('Error', 'Could not save the score. Please try again.');
        }).finally(() => {
            marksSavingScoreRef.current.delete(key);
        });
    }, [marksheetId, subjectId, isHistoricalYear]);

    const marksValidGrades = useMemo(() => (
        marksGradeScale.length > 0 ? marksGradeScale.map((g) => g.grade.toUpperCase()) : ['A+', 'A', 'B', 'C', 'D', 'F']
    ), [marksGradeScale]);

    const marksGradeLabel = useCallback((pct: number) => {
        if (marksGradeScale.length === 0) {
            if (pct >= 75) return 'A';
            if (pct >= 60) return 'B';
            if (pct >= 45) return 'C';
            if (pct >= 35) return 'D';
            return 'F';
        }
        const sorted = [...marksGradeScale].sort((a, b) => b.minPct - a.minPct);
        for (const entry of sorted) { if (pct >= entry.minPct) return entry.grade; }
        return sorted[sorted.length - 1]?.grade ?? 'F';
    }, [marksGradeScale]);

    const marksScoreColor = useCallback((pct: number) => (pct >= 75 ? '#059669' : pct >= 35 ? '#F59E0B' : '#DC2626'), []);

    // Online's roster is the same class roster Manage already fetches — no
    // separate students call needed, just mapped to the marksheet shape.
    const marksOnlineStudents: MarksStudent[] = useMemo(() => (
        manageStudents.map((s) => ({ id: s.id, name: s.user.name, rollNo: s.rollNo ?? '', avatarUrl: s.avatarUrl }))
    ), [manageStudents]);

    // Overall — mirrors web's OverallView, scoped to what the class teacher's
    // app view needs: per-student Offline %/Online %/Combined %, same rules
    // as web's studentStats (offline only counts a column if this student has
    // a real score in it; online always counts in full — a missed test is a
    // real 0). Roster is the offline roster (marksStudents) when it's loaded
    // (has remarks/whatever else), falling back to the roster-only online one
    // so Overall still works before Offline has ever been opened.
    const [marksOverallRightTab, setMarksOverallRightTab] = useState<'class' | 'student'>('class');
    const [marksRankTab, setMarksRankTab] = useState<'offline' | 'online' | 'combined'>('combined');
    const [marksTopperTab, setMarksTopperTab] = useState<'offline' | 'online' | 'combined'>('combined');
    const [marksOverallSelectedId, setMarksOverallSelectedId] = useState<string | null>(null);
    const [marksTrendSubjectId, setMarksTrendSubjectId] = useState<string>('');
    const [marksTrendMode, setMarksTrendMode] = useState<'offline' | 'online' | 'combined'>('combined');
    const [marksChartTooltip, setMarksChartTooltip] = useState<number | null>(null);
    const [marksReportCardTab, setMarksReportCardTab] = useState<'offline' | 'online'>('offline');
    useEffect(() => {
        if (!marksTrendSubjectId && (division?.subjects.length ?? 0) > 0) setMarksTrendSubjectId(division!.subjects[0].id);
    }, [division, marksTrendSubjectId]);
    useEffect(() => {
        setMarksChartTooltip(null);
    }, [marksTrendSubjectId, marksTrendMode, marksOverallSelectedId]);

    const marksOverallRoster: MarksStudent[] = marksStudents.length > 0 ? marksStudents : marksOnlineStudents;

    const marksStudentStats = useMemo(() => {
        return marksOverallRoster.map((st) => {
            let offScored = 0, offMax = 0, onScored = 0, onMax = 0;
            (division?.subjects ?? []).forEach((sub) => {
                const offCols = marksExamColumns[sub.id] ?? [];
                offCols.forEach((col) => {
                    const sc = marksScores[col.id]?.[st.id]?.score;
                    if (sc != null) { offScored += sc; offMax += col.maxMarks; }
                });
                const onCols = marksOnlineExamColumns[sub.id] ?? [];
                onCols.forEach((col) => {
                    onMax += col.maxMarks;
                    const e = marksOnlineScores[col.id]?.[st.id];
                    onScored += e?.isAbsent ? 0 : (e?.score ?? 0);
                });
            });
            const offPct = offMax > 0 ? Math.round((offScored / offMax) * 100) : null;
            const onPct = onMax > 0 ? Math.round((onScored / onMax) * 100) : null;
            const combMax = offMax + onMax;
            const combPct = combMax > 0 ? Math.round(((offScored + onScored) / combMax) * 100) : null;
            return { student: st, offPct, onPct, combPct };
        });
    }, [marksOverallRoster, division, marksExamColumns, marksScores, marksOnlineExamColumns, marksOnlineScores]);

    // Per-subject class average (combined offline+online), for the Class
    // Overview bars — averaged only over students who have an entered %
    // for that subject, same "don't let missing data drag the bar to 0" rule
    // used throughout this screen.
    const marksSubjectStats = useMemo(() => {
        return (division?.subjects ?? []).map((sub) => {
            const pcts: number[] = [];
            marksOverallRoster.forEach((st) => {
                let offScored = 0, offMax = 0, onScored = 0, onMax = 0;
                (marksExamColumns[sub.id] ?? []).forEach((col) => {
                    const sc = marksScores[col.id]?.[st.id]?.score;
                    if (sc != null) { offScored += sc; offMax += col.maxMarks; }
                });
                (marksOnlineExamColumns[sub.id] ?? []).forEach((col) => {
                    onMax += col.maxMarks;
                    const e = marksOnlineScores[col.id]?.[st.id];
                    onScored += e?.isAbsent ? 0 : (e?.score ?? 0);
                });
                const max = offMax + onMax;
                if (max > 0) pcts.push(Math.round(((offScored + onScored) / max) * 100));
            });
            const avg = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
            return { sub, avg };
        });
    }, [division, marksOverallRoster, marksExamColumns, marksScores, marksOnlineExamColumns, marksOnlineScores]);

    const marksSelectedOverallStudent = marksStudentStats.find((s) => s.student.id === marksOverallSelectedId) ?? null;

    // Slide the student detail in from the right the moment a student is
    // selected, and slide it back out before clearing the selection — same
    // treatment as Manage's manageDetailSlideX.
    // Effect-driven for the same reason as attDetailSlideX above.
    const marksDetailSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (marksOverallSelectedId) Animated.timing(marksDetailSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [marksOverallSelectedId, marksDetailSlideX]);
    const closeMarksOverallDetail = useCallback(() => {
        Animated.timing(marksDetailSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setMarksOverallSelectedId(null);
            marksDetailSlideX.setValue(SCREEN_W);
        });
    }, [marksDetailSlideX]);

    // Class rank — combined % descending, matching web's rankMap exactly.
    const marksRankMap = useMemo(() => {
        const sorted = [...marksStudentStats].sort((a, b) => (b.combPct ?? 0) - (a.combPct ?? 0));
        const m: Record<string, number> = {};
        sorted.forEach((r, i) => { m[r.student.id] = i + 1; });
        return m;
    }, [marksStudentStats]);

    // Per-subject top-3 — mirrors web's subjectToppers exactly: per-student
    // entered max, not a subject-wide constant (a freshly-added column with
    // no marks yet doesn't drag down everyone's %, only the columns THIS
    // student actually has a score for count toward their own denominator).
    const marksSubjectToppers = useMemo(() => {
        return (division?.subjects ?? []).map((sub) => {
            const offCols = marksExamColumns[sub.id] ?? [];
            const onCols = marksOnlineExamColumns[sub.id] ?? [];
            const onMax = onCols.reduce((s, c) => s + c.maxMarks, 0);
            const rows = marksOverallRoster.map((st) => {
                let offScored = 0, offMax = 0, onScored = 0;
                offCols.forEach((col) => {
                    const sc = marksScores[col.id]?.[st.id]?.score;
                    if (sc != null) { offScored += sc; offMax += col.maxMarks; }
                });
                onCols.forEach((col) => {
                    const e = marksOnlineScores[col.id]?.[st.id];
                    onScored += e?.isAbsent ? 0 : (e?.score ?? 0);
                });
                const offPct = offMax > 0 ? Math.round((offScored / offMax) * 100) : null;
                const onPct = onMax > 0 ? Math.round((onScored / onMax) * 100) : null;
                const combMax = offMax + onMax;
                const combPct = combMax > 0 ? Math.round(((offScored + onScored) / combMax) * 100) : 0;
                return { student: st, offPct, onPct, combPct };
            });
            const getPct = (r: typeof rows[0]) => marksTopperTab === 'offline' ? (r.offPct ?? 0) : marksTopperTab === 'online' ? (r.onPct ?? 0) : r.combPct;
            const sorted = [...rows].sort((a, b) => getPct(b) - getPct(a));
            return { sub, top3: sorted.slice(0, 3), getPct };
        });
    }, [division, marksOverallRoster, marksExamColumns, marksScores, marksOnlineExamColumns, marksOnlineScores, marksTopperTab]);

    // Export — a real .xlsx of the Offline marksheet grid, same mechanism as
    // Attendance Sheet's Export (XLSX.write → base64 → cache file → share
    // sheet), just its own loading flag so the two features' spinners don't
    // collide.
    const [marksExporting, setMarksExporting] = useState(false);
    const marksShareWorkbook = useCallback(async (wb: XLSX.WorkBook, filename: string) => {
        setMarksExporting(true);
        try {
            const Sharing = loadSharing();
            if (!Sharing) { Alert.alert('Needs a full app build', 'Exporting to Excel isn\'t available in Expo Go — needs a full app build.'); return; }
            const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const fileUri = `${FileSystem.cacheDirectory}${filename}`;
            await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            const available = await Sharing.isAvailableAsync();
            if (!available) { Alert.alert('Sharing not available', 'This device cannot share files.'); return; }
            await Sharing.shareAsync(fileUri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: filename,
                UTI: 'org.openxmlformats.spreadsheetml.sheet',
            });
        } catch {
            Alert.alert('Export failed', 'Could not generate the Excel file.');
        } finally {
            setMarksExporting(false);
        }
    }, []);

    const handleMarksExport = useCallback(() => {
        if (!division) return;
        const isOffline = marksSubTab === 'offline';
        const activeStudents = isOffline ? marksStudents : marksOnlineStudents;
        const activeExamColumns = isOffline ? marksExamColumns : marksOnlineExamColumns;
        const activeScores = isOffline ? marksScores : marksOnlineScores;
        const activeGradedSubjects = isOffline ? marksGradedSubjects : [];
        const activeGradedScores = isOffline ? marksGradedScores : {};
        const getExams = (subId: string) => activeExamColumns[subId] ?? [];
        const getScoreVal = (examId: string, stId: string) => {
            const sc = activeScores[examId]?.[stId]?.score ?? null;
            return isOffline ? sc : (sc ?? 0);
        };

        const headers: string[] = ['Roll No.', 'Student Name'];
        division.subjects.forEach((sub) => {
            getExams(sub.id).forEach((ex) => headers.push(`${sub.name} - ${ex.name} (/${ex.maxMarks})`));
            headers.push(`${sub.name} - Total`, `${sub.name} - %`);
        });
        activeGradedSubjects.forEach((gsub) => headers.push(`${gsub.name} - Term 1`, `${gsub.name} - Term 2`));
        headers.push('Grand Total', 'Overall %', 'Grade');

        const rows = activeStudents.map((student) => {
            const row: (string | number)[] = [student.rollNo || '', student.name ?? ''];
            let grandScored = 0, grandTotal = 0, grandEnteredTotal = 0;
            division.subjects.forEach((sub) => {
                const exams = getExams(sub.id);
                let scored = 0, total = 0, enteredTotal = 0;
                exams.forEach((ex) => {
                    const sc = getScoreVal(ex.id, student.id);
                    row.push(sc !== null ? sc : '');
                    total += ex.maxMarks;
                    if (sc !== null) { scored += sc; enteredTotal += ex.maxMarks; }
                });
                const subPct = enteredTotal > 0 ? Math.round((scored / enteredTotal) * 100) : null;
                row.push(`${scored}/${total}`, subPct !== null ? `${subPct}%` : '');
                grandScored += scored; grandTotal += total; grandEnteredTotal += enteredTotal;
            });
            activeGradedSubjects.forEach((gsub) => {
                const entry = activeGradedScores[gsub.id]?.[student.id];
                row.push(entry?.term1Grade ?? '', entry?.term2Grade ?? '');
            });
            const grandPct = grandEnteredTotal > 0 ? Math.round((grandScored / grandEnteredTotal) * 100) : null;
            row.push(`${grandScored}/${grandTotal}`, grandPct !== null ? `${grandPct}%` : '', grandPct !== null ? marksGradeLabel(grandPct) : '');
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isOffline ? 'Offline' : 'Online');
        setTimeout(() => marksShareWorkbook(wb, `${division.name}_Marksheet_${isOffline ? 'Offline' : 'Online'}_${marksAcademicYear}.xlsx`), 400);
    }, [division, marksSubTab, marksExamColumns, marksScores, marksGradedSubjects, marksGradedScores, marksStudents, marksOnlineStudents, marksOnlineExamColumns, marksOnlineScores, marksGradeLabel, marksShareWorkbook, marksAcademicYear]);

    const marksPageContent = useMemo(() => {
        // Same parchment palette as web's marksheet (distinct from Attendance's
        // green Sheet grid, matching web's own MarkSheet component 1:1).
        const msColors = {
            bg: '#F8F3EC', hdrBg: '#EDE4D6', hdrText: '#2A1F10', hdrBorder: '#D8C4A0',
            rowBase: '#FAF5EE', summaryBg: '#E8DDD0',
        };
        // Online is auto-computed server-side (always live, fully read-only —
        // no graded subjects, no editing); Offline is the persisted, class-
        // teacher-editable-for-grades sheet. Both render through this same
        // grid, switched on which data set is "active".
        const isOffline = marksSubTab === 'offline';
        const activeStudents = isOffline ? marksStudents : marksOnlineStudents;
        const activeExamColumns = isOffline ? marksExamColumns : marksOnlineExamColumns;
        const activeScores = isOffline ? marksScores : marksOnlineScores;
        const activeGradedSubjects = isOffline ? marksGradedSubjects : [];
        const activeGradedScores = isOffline ? marksGradedScores : {};
        const activeLoading = isOffline ? marksLoading : marksOnlineLoading;

        // Name column sizes itself to the longest student name (avatar + gap +
        // paddingHorizontal*2, plus an estimated text width for the name at
        // this cell's font — there's no native text-measurement here, so this
        // is a per-character estimate, clamped to a sane range).
        const longestNameLen = activeStudents.reduce((max, s) => Math.max(max, (s.name ?? s.rollNo ?? '').length), 4);
        const NAME_AVATAR_SPACE = 18 + 5 + 12; // avatar width + gap + paddingHorizontal*2
        const NAME_W = Math.min(260, Math.max(90, NAME_AVATAR_SPACE + Math.ceil(longestNameLen * 7.6) + 8));
        const ROLL_W = 58, EXAM_W = 82, SUBJ_TOTAL_W = 56, SUBJ_PCT_W = 40, GRADED_W = 46, GRAND_W = 58, PCT_W = 40, GRADE_W = 40;
        // Matches web's two 12px spacer <th>/<td> on each side of the Graded
        // Subjects section (24px total gap, transparent, no border).
        const GRADED_GAP_W = 24;

        // Grade Scale — set/edited on web only; the app just displays whatever
        // is configured there (same DEFAULT_GRADE_SCALE fallback and color ramp
        // as web's GradeScaleEditor, minus the edit controls).
        const GRADE_COLOR_RAMP = ['#059669', '#16A34A', '#65A30D', '#CA8A04', '#D97706', '#EA580C', '#DC2626', '#B91C1C', '#991B1B'];
        const gradeRankColor = (rank: number, total: number) => {
            if (total <= 1) return GRADE_COLOR_RAMP[0];
            const idx = Math.round((rank / (total - 1)) * (GRADE_COLOR_RAMP.length - 1));
            return GRADE_COLOR_RAMP[idx];
        };
        const displayGradeScale = marksGradeScale.length > 0
            ? [...marksGradeScale].sort((a, b) => b.minPct - a.minPct)
            : [{ grade: 'A', minPct: 75 }, { grade: 'B', minPct: 60 }, { grade: 'C', minPct: 45 }, { grade: 'D', minPct: 35 }, { grade: 'F', minPct: 0 }];
        // Graded Subjects' Term 1/Term 2 grade values are colored by their
        // rank within the scale (mirrors web's gradeValColor), not by score —
        // there's no % behind a manually-assigned grade to score-color from.
        const gradeValColor = (g: string | null) => {
            if (!g) return msColors.hdrBorder;
            const rank = displayGradeScale.findIndex((e) => e.grade.toUpperCase() === g.toUpperCase());
            if (rank === -1) return msColors.hdrBorder;
            return gradeRankColor(rank, displayGradeScale.length);
        };

        const getSubjectExams = (subId: string) => activeExamColumns[subId] ?? [];
        // Offline: a blank cell means "not entered yet" and stays a dash.
        // Online: the test is already complete — every student had their
        // shot, so no recorded attempt is a missed test (hard 0), not an
        // unknown/blank value. Matches web's getScore exactly.
        const getScore = (examId: string, stId: string) => {
            const sc = activeScores[examId]?.[stId]?.score ?? null;
            return isOffline ? sc : (sc ?? 0);
        };
        const getSubjectTotal = (subId: string, stId: string) => {
            const exams = getSubjectExams(subId);
            const total = exams.reduce((s, ex) => s + ex.maxMarks, 0);
            const scored = exams.reduce((s, ex) => s + (getScore(ex.id, stId) ?? 0), 0);
            const enteredTotal = exams.reduce((s, ex) => (getScore(ex.id, stId) !== null ? s + ex.maxMarks : s), 0);
            return { total, scored, enteredTotal };
        };
        const getGrandTotal = (stId: string) => {
            let total = 0, scored = 0, enteredTotal = 0;
            division?.subjects.forEach((sub) => {
                const t = getSubjectTotal(sub.id, stId);
                total += t.total; scored += t.scored; enteredTotal += t.enteredTotal;
            });
            return { total, scored, pct: enteredTotal > 0 ? Math.round((scored / enteredTotal) * 100) : null };
        };
        const getGrade = (gsId: string, stId: string, term: 't1' | 't2'): string | null => {
            const entry = activeGradedScores[gsId]?.[stId];
            return term === 't1' ? (entry?.term1Grade ?? null) : (entry?.term2Grade ?? null);
        };

        const openGradeEditor = (gsId: string, gsName: string, stId: string, stName: string, term: 't1' | 't2') => {
            const current = getGrade(gsId, stId, term);
            setMarksGradeModal({ gsId, gsName, stId, stName, term, current });
            setMarksGradeDraft(current ?? '');
        };

        const openScoreEditor = (examId: string, examName: string, maxMarks: number, stId: string, stName: string) => {
            const current = getScore(examId, stId);
            setMarksScoreModal({ examId, examName, maxMarks, stId, stName, current });
            setMarksScoreDraft(current !== null ? String(current) : '');
        };

        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
                <View style={[styles.manageSegTrack, { backgroundColor: trackBg, alignSelf: 'flex-end' }]}>
                    {([
                        { key: 'offline' as const, label: 'Offline', Icon: FileText },
                        { key: 'online' as const, label: 'Online', Icon: BookOpen },
                        { key: 'overall' as const, label: 'Overall', Icon: BarChart2 },
                    ].filter((t) => isClassTeacher || t.key !== 'overall')).map(({ key, label, Icon }) => {
                        const active = marksSubTab === key;
                        return (
                            <TouchableOpacity key={key} onPress={() => setMarksSubTab(key)}
                                style={[styles.manageSegBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, Platform.OS === 'android' ? { paddingVertical: 5 } : undefined, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                <Icon size={12} color={active ? theme.text : theme.subText} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {marksSubTab === 'overall' ? (
                    <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 }}>
                            {marksOverallRightTab === 'class'
                                ? <Users size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                                : <User size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />}
                            <Text style={[styles.cardHeaderText, { color: theme.text }]}>
                                {marksOverallRightTab === 'class' ? 'Class Overview' : marksSelectedOverallStudent ? 'Student Details' : `Students (${marksStudentStats.length})`}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <View style={[styles.manageSegTrack, { backgroundColor: trackBg }]}>
                                <TouchableOpacity onPress={() => setMarksOverallRightTab('class')}
                                    style={[styles.manageSegBtn, marksOverallRightTab === 'class' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                    <Users size={12} color={marksOverallRightTab === 'class' ? theme.text : theme.subText} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setMarksOverallRightTab('student')}
                                    style={[styles.manageSegBtn, marksOverallRightTab === 'student' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                    <User size={12} color={marksOverallRightTab === 'student' ? theme.text : theme.subText} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Class/list and the student detail each get their own
                            ScrollView, with the slide wrapper on the detail's
                            alone — see the matching note in Attendance's
                            Overall for why it can't be shared or nested. Only
                            one of the two is ever mounted, so they can share
                            marksOverallScrollRef (the keyboard-scroll helper
                            for Conduct/Remarks reads it on the detail side). */}
                        {!(marksOverallRightTab === 'student' && marksSelectedOverallStudent) ? (
                        <ScrollView ref={marksOverallScrollRef}
                            onScrollEndDrag={(e) => { marksOverallScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                            onMomentumScrollEnd={(e) => { marksOverallScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                            onLayout={(e) => { marksOverallContainerHRef.current = e.nativeEvent.layout.height; }}
                            onContentSizeChange={(_w, h) => { marksOverallContentHRef.current = h; }}
                            style={{ flex: 1, marginHorizontal: -10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 10, paddingHorizontal: 10, paddingBottom: 30 + marksKbPad }}>
                            {marksOverallRightTab === 'class' ? (() => {
                                // Leaderboard — same podium-for-top-3 + list-for-rest shape
                                // as web's, with the same offline/online/combined tab.
                                const getRankPct = (s: (typeof marksStudentStats)[0]) => marksRankTab === 'offline' ? (s.offPct ?? 0) : marksRankTab === 'online' ? (s.onPct ?? 0) : (s.combPct ?? 0);
                                const sorted = [...marksStudentStats].sort((a, b) => getRankPct(b) - getRankPct(a));
                                const top3 = sorted.slice(0, 3);
                                const rest = sorted.slice(3);
                                const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
                                const podiumCfg = [
                                    { height: 44, color: '#C0C0C0', label: '2nd' },
                                    { height: 66, color: '#F59E0B', label: '1st' },
                                    { height: 34, color: '#CD7F32', label: '3rd' },
                                ];
                                // Offline High / Online High — mirrors web's OverallView
                                // stat pills exactly (the class's single best offline %
                                // and best online %, not an average).
                                const offPcts = marksStudentStats.map((s) => s.offPct).filter((p): p is number => p !== null);
                                const onPcts = marksStudentStats.map((s) => s.onPct).filter((p): p is number => p !== null);
                                const highOff = offPcts.length > 0 ? Math.max(...offPcts) : null;
                                const highOn = onPcts.length > 0 ? Math.max(...onPcts) : null;
                                return (
                                    <Fragment key="marks-overall-class">
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                                <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: highOff !== null ? marksScoreColor(highOff) : theme.muted }}>{highOff !== null ? `${highOff}%` : '—'}</Text>
                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Offline High</Text>
                                            </View>
                                            <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                                <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: highOn !== null ? marksScoreColor(highOn) : theme.muted }}>{highOn !== null ? `${highOn}%` : '—'}</Text>
                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Online High</Text>
                                            </View>
                                        </View>

                                        <View style={styles.cardShadowWrap}>
                                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Trophy size={12} color={theme.muted} />
                                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Leaderboard</Text>
                                                    </View>
                                                    <InlineWheel
                                                        options={['offline', 'online', 'combined']}
                                                        value={marksRankTab}
                                                        onChange={(v) => setMarksRankTab(v as 'offline' | 'online' | 'combined')}
                                                        isDark={isDark}
                                                        theme={{ purple: accent.purple, purpleLight: accent.purpleLight }}
                                                    />
                                                </View>

                                                {marksStudentStats.length === 0 ? (
                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 14 }}>No students yet</Text>
                                                ) : (
                                                    <>
                                                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14, paddingTop: 14, paddingBottom: 8 }}>
                                                            {podiumOrder.map((st, i) => {
                                                                const cfg = podiumCfg[i];
                                                                const pct = getRankPct(st);
                                                                return (
                                                                    <TouchableOpacity key={st.student.id} onPress={() => { setMarksOverallSelectedId(st.student.id); setMarksOverallRightTab('student'); }} activeOpacity={0.7} style={{ alignItems: 'center', gap: 4 }}>
                                                                        <View style={[styles.avatarSm, { width: 38, height: 38, borderRadius: 13, backgroundColor: st.student.avatarUrl ? 'transparent' : getAvatarColor(st.student.name ?? st.student.rollNo) }]}>
                                                                            {st.student.avatarUrl
                                                                                ? <Image source={{ uri: st.student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                                : <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(st.student.name ?? st.student.rollNo)}</Text>}
                                                                        </View>
                                                                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: theme.text, width: 60, textAlign: 'center' }} numberOfLines={1}>{st.student.name ?? '-'}</Text>
                                                                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: marksScoreColor(pct) }}>{pct}%</Text>
                                                                        <View style={{ width: 52, height: cfg.height, borderRadius: 10, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: cfg.color, alignItems: 'center', justifyContent: 'center' }}>
                                                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_800ExtraBold', color: '#fff' }}>{cfg.label}</Text>
                                                                        </View>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>

                                                        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 6 }}>
                                                            {rest.map((st, i) => {
                                                                const pct = getRankPct(st);
                                                                return (
                                                                    <TouchableOpacity key={st.student.id} onPress={() => { setMarksOverallSelectedId(st.student.id); setMarksOverallRightTab('student'); }} activeOpacity={0.7}
                                                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: trackBg }}>
                                                                        <Text style={{ width: 16, fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: theme.muted, textAlign: 'center' }}>{i + 4}</Text>
                                                                        <View style={[styles.avatarSm, { width: 24, height: 24, borderRadius: 8, backgroundColor: st.student.avatarUrl ? 'transparent' : getAvatarColor(st.student.name ?? st.student.rollNo) }]}>
                                                                            {st.student.avatarUrl
                                                                                ? <Image source={{ uri: st.student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                                : <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(st.student.name ?? st.student.rollNo)}</Text>}
                                                                        </View>
                                                                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{st.student.name ?? '-'}</Text>
                                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: marksScoreColor(pct) }}>{pct}%</Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    </>
                                                )}
                                            </View>
                                        </View>

                                        {/* Subject Toppers — per-subject top-3, same tab switch. */}
                                        <View style={styles.cardShadowWrap}>
                                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                                                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Trophy size={12} color={theme.muted} />
                                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Subject Toppers</Text>
                                                    </View>
                                                    <InlineWheel
                                                        options={['offline', 'online', 'combined']}
                                                        value={marksTopperTab}
                                                        onChange={(v) => setMarksTopperTab(v as 'offline' | 'online' | 'combined')}
                                                        isDark={isDark}
                                                        theme={{ purple: accent.purple, purpleLight: accent.purpleLight }}
                                                    />
                                                </View>
                                                <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 12 }}>
                                                    {marksSubjectToppers.length === 0 ? (
                                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>No subjects yet</Text>
                                                    ) : marksSubjectToppers.map(({ sub, top3: subTop3, getPct }) => (
                                                        <View key={sub.id} style={{ gap: 5 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
                                                                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colorForSubject(sub) }} />
                                                                <Text numberOfLines={1} style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: colorForSubject(sub) }}>{sub.name}</Text>
                                                            </View>
                                                            {subTop3.map((row, idx) => {
                                                                const pct = getPct(row);
                                                                return (
                                                                    <TouchableOpacity key={row.student.id} onPress={() => { setMarksOverallSelectedId(row.student.id); setMarksOverallRightTab('student'); }} activeOpacity={0.7}
                                                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: trackBg }}>
                                                                        <Text style={{ width: 12, fontSize: 9.5, fontFamily: 'Poppins_800ExtraBold', color: theme.muted }}>{idx + 1}</Text>
                                                                        <View style={[styles.avatarSm, { width: 20, height: 20, borderRadius: 7, backgroundColor: row.student.avatarUrl ? 'transparent' : getAvatarColor(row.student.name ?? row.student.rollNo) }]}>
                                                                            {row.student.avatarUrl
                                                                                ? <Image source={{ uri: row.student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                                : <Text style={{ fontSize: 7.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(row.student.name ?? row.student.rollNo)}</Text>}
                                                                        </View>
                                                                        <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{row.student.name ?? '-'}</Text>
                                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: marksScoreColor(pct) }}>{pct}%</Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        </View>
                                    </Fragment>
                                );
                            })() : (
                                marksStudentStats.length === 0 ? (
                                    <View key="marks-overall-empty" style={styles.centerFill}>
                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students yet</Text>
                                    </View>
                                ) : (
                                    <View key="marks-overall-list" style={{ marginTop: -4 }}>
                                        {marksStudentStats.map(({ student, offPct, onPct }) => (
                                            <TouchableOpacity key={student.id} onPress={() => setMarksOverallSelectedId(student.id)} activeOpacity={0.7}
                                                style={[styles.manageStudentRow, { paddingHorizontal: 0, borderBottomColor: theme.cardBorder }]}>
                                                <View style={[styles.avatarSm, { width: 42, height: 42, borderRadius: 14, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name ?? student.rollNo) }]}>
                                                    {student.avatarUrl
                                                        ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                        : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name ?? student.rollNo)}</Text>}
                                                </View>
                                                <View style={{ flex: 1, gap: 2 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{student.name ?? '-'}</Text>
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {student.rollNo || '—'}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: StyleSheet.hairlineWidth, height: 22, backgroundColor: theme.cardBorder }} />
                                                    <View style={{ alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: offPct !== null ? marksScoreColor(offPct) : theme.muted }}>{offPct !== null ? `${offPct}%` : '—'}</Text>
                                                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Offline</Text>
                                                    </View>
                                                    <View style={{ width: StyleSheet.hairlineWidth, height: 22, backgroundColor: theme.cardBorder }} />
                                                    <View style={{ alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: onPct !== null ? marksScoreColor(onPct) : theme.muted }}>{onPct !== null ? `${onPct}%` : '—'}</Text>
                                                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Online</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )
                            )}
                        </ScrollView>
                        ) : (
                        <Animated.View style={{ flex: 1, transform: [{ translateX: marksDetailSlideX }] }}>
                        <ScrollView ref={marksOverallScrollRef}
                            onScrollEndDrag={(e) => { marksOverallScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                            onMomentumScrollEnd={(e) => { marksOverallScrollYRef.current = e.nativeEvent.contentOffset.y; }}
                            onLayout={(e) => { marksOverallContainerHRef.current = e.nativeEvent.layout.height; }}
                            onContentSizeChange={(_w, h) => { marksOverallContentHRef.current = h; }}
                            style={{ flex: 1, marginHorizontal: -10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 10, paddingHorizontal: 10, paddingBottom: 30 + marksKbPad }}>
                            {(() => {
                                const sel = marksSelectedOverallStudent;
                                if (!sel) return null;
                                const rank = marksRankMap[sel.student.id];

                                // Performance Trend — same data + rules as web (a blank
                                // offline column is excluded entirely, not shown as 0%;
                                // online always shows, missed test = 0%).
                                const trendSub = (division?.subjects ?? []).find((s) => s.id === marksTrendSubjectId) ?? (division?.subjects ?? [])[0];
                                const trendColor = trendSub ? colorForSubject(trendSub) : '#999';
                                const trendData = (() => {
                                    if (!trendSub) return [];
                                    const offRows = (marksExamColumns[trendSub.id] ?? [])
                                        .filter((col) => marksScores[col.id]?.[sel.student.id]?.score != null)
                                        .map((col) => {
                                            const e = marksScores[col.id]?.[sel.student.id];
                                            const sc = e?.isAbsent ? 0 : (e?.score ?? 0);
                                            return { name: col.name, score: col.maxMarks > 0 ? Math.round((sc / col.maxMarks) * 100) : 0 };
                                        });
                                    const onRows = (marksOnlineExamColumns[trendSub.id] ?? []).map((col) => {
                                        const e = marksOnlineScores[col.id]?.[sel.student.id];
                                        const sc = e?.isAbsent ? 0 : (e?.score ?? 0);
                                        return { name: col.name, score: col.maxMarks > 0 ? Math.round((sc / col.maxMarks) * 100) : 0 };
                                    });
                                    if (marksTrendMode === 'online') return onRows;
                                    if (marksTrendMode === 'offline') return offRows;
                                    return [...offRows, ...onRows];
                                })();

                                return (
                                    <Fragment key="marks-overall-student">
                                        <TouchableOpacity onPress={closeMarksOverallDetail} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Platform.OS === 'android' ? 4 : 0 }}>
                                            <View style={[styles.manageBackBtn, { borderColor: theme.cardBorder }, Platform.OS === 'android' ? { marginTop: -2 } : undefined]}>
                                                <ArrowLeft size={15} color={theme.text} />
                                            </View>
                                            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{sel.student.name ?? '-'}</Text>
                                        </TouchableOpacity>

                                        {/* Student info card — photo, name, roll no, class
                                            rank, overall %, laid out in a single row. */}
                                        <View style={styles.cardShadowWrap}>
                                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }]}>
                                                <View style={[styles.avatarSm, { width: 44, height: 44, borderRadius: 16, backgroundColor: sel.student.avatarUrl ? 'transparent' : getAvatarColor(sel.student.name ?? sel.student.rollNo) }]}>
                                                    {sel.student.avatarUrl
                                                        ? <Image source={{ uri: sel.student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                        : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(sel.student.name ?? sel.student.rollNo)}</Text>}
                                                </View>
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: theme.text }}>{sel.student.name ?? '-'}</Text>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {sel.student.rollNo}</Text>
                                                </View>
                                                <View style={{ alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: '#F59E0B4D', backgroundColor: '#F59E0B0D' }}>
                                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_800ExtraBold', color: '#F59E0B' }}>#{rank ?? '—'}</Text>
                                                    <Text style={{ fontSize: 7, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Class Rank</Text>
                                                </View>
                                                <View style={{ alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5 }}>
                                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_800ExtraBold', color: sel.combPct !== null ? marksScoreColor(sel.combPct) : theme.muted }}>{sel.combPct !== null ? `${sel.combPct}%` : '—'}</Text>
                                                    <Text style={{ fontSize: 7, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Overall</Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Performance Trend card — subject-pill row + mode
                                            toggle in the header, chart below. Same
                                            react-native-chart-kit LineChart used for the
                                            student app's Class → Subjects "Performance Trend"
                                            chart (app/(tabs)/class.tsx) — bezier line, shaded
                                            fill under the curve, min/max score callouts, and a
                                            tap-to-reveal tooltip via invisible tap-zone
                                            overlays (chart-kit's own onDataPointClick only
                                            fires on an exact dot hit). */}
                                        <View style={styles.cardShadowWrap}>
                                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                                                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, justifyContent: 'space-between' }]}>
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Performance Trend</Text>
                                                    <InlineWheel
                                                        options={['offline', 'online', 'combined']}
                                                        value={marksTrendMode}
                                                        onChange={(v) => setMarksTrendMode(v as 'offline' | 'online' | 'combined')}
                                                        isDark={isDark}
                                                        theme={{ purple: accent.purple, purpleLight: accent.purpleLight }}
                                                    />
                                                </View>
                                                <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder, backgroundColor: trackBg }}>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 6 }}>
                                                        {(division?.subjects ?? []).map((sub) => {
                                                            const active = marksTrendSubjectId === sub.id;
                                                            const col = colorForSubject(sub);
                                                            return (
                                                                <TouchableOpacity key={sub.id} onPress={() => setMarksTrendSubjectId(sub.id)}
                                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? col + '22' : theme.card, borderWidth: 1, borderColor: active ? col + '66' : theme.cardBorder }}>
                                                                    <BookOpen size={10} color={active ? col : theme.subText} />
                                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: active ? col : theme.subText }}>{sub.name}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </ScrollView>
                                                </View>

                                                {trendData.length === 0 ? (
                                                    <View style={{ height: 190, alignItems: 'center', justifyContent: 'center' }}>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted }}>No data</Text>
                                                    </View>
                                                ) : (() => {
                                                    const chartLabels = trendData.map((d) => d.name);
                                                    const axisLabels = chartLabels.map((l) => (l.length > 6 ? `${l.slice(0, 5)}…` : l));
                                                    const chartValues = trendData.map((d) => d.score);
                                                    const chartW = Math.max(220, SCREEN_W - 64);
                                                    return (
                                                        <View style={{ position: 'relative', paddingVertical: 10 }}>
                                                            <LineChart
                                                                renderDotContent={({ x, y, index, indexData }) => {
                                                                    const max = Math.max(...chartValues);
                                                                    const min = Math.min(...chartValues);
                                                                    if (marksChartTooltip === index) {
                                                                        const tooltipW = 60;
                                                                        const clampedLeft = Math.max(2, Math.min(x - tooltipW / 2, chartW - tooltipW - 2));
                                                                        const showBelow = y - 38 < 4;
                                                                        return (
                                                                            <View key={index} style={{ position: 'absolute', top: showBelow ? y + 10 : y - 38, left: clampedLeft, backgroundColor: theme.text, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, alignItems: 'center', minWidth: 52 }}>
                                                                                <Text style={{ fontSize: 9, color: theme.card, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={1}>{chartLabels[index]}</Text>
                                                                                <Text style={{ fontSize: 11, color: theme.card, fontFamily: 'Poppins_700Bold' }}>{indexData}%</Text>
                                                                            </View>
                                                                        );
                                                                    }
                                                                    if (indexData !== max && indexData !== min) return null;
                                                                    const isMin = indexData === min;
                                                                    return (
                                                                        <View key={index} style={{ position: 'absolute', top: isMin ? y + 6 : y - 22, left: x - 12, backgroundColor: isMin ? '#DC2626' : '#059669', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                                                                            <Text style={{ fontSize: 9, color: 'white', fontFamily: 'Poppins_600SemiBold' }}>{indexData}%</Text>
                                                                        </View>
                                                                    );
                                                                }}
                                                                onDataPointClick={({ index }) => setMarksChartTooltip((prev) => (prev === index ? null : index))}
                                                                data={{ labels: axisLabels, datasets: [{ data: chartValues, color: () => trendColor, strokeWidth: 2 }] }}
                                                                width={chartW}
                                                                height={180}
                                                                yAxisSuffix="%"
                                                                chartConfig={{
                                                                    backgroundColor: 'transparent',
                                                                    backgroundGradientFrom: theme.card,
                                                                    backgroundGradientTo: theme.card,
                                                                    decimalPlaces: 0,
                                                                    color: () => trendColor,
                                                                    fillShadowGradient: trendColor,
                                                                    fillShadowGradientOpacity: 0.15,
                                                                    labelColor: () => theme.subText,
                                                                    propsForDots: { r: '4', strokeWidth: '2', stroke: theme.card, fill: trendColor },
                                                                    propsForBackgroundLines: { stroke: theme.cardBorder, strokeWidth: 1, strokeDasharray: '' },
                                                                    propsForLabels: { fontSize: 9, fontFamily: 'Poppins_400Regular' },
                                                                }}
                                                                bezier
                                                                style={{ borderRadius: 12, marginLeft: -16, marginBottom: 4 }}
                                                                fromZero
                                                                withInnerLines
                                                                withHorizontalLabels
                                                                segments={5}
                                                            />
                                                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                                                                {(() => {
                                                                    const gutter = 64;
                                                                    const n = axisLabels.length;
                                                                    const binWidth = n > 0 ? (chartW - gutter) / n : 0;
                                                                    const tapWidth = Math.max(28, Math.min(binWidth, 56));
                                                                    return axisLabels.map((_, i) => {
                                                                        const cx = gutter + i * binWidth;
                                                                        return (
                                                                            <TouchableOpacity
                                                                                key={i}
                                                                                activeOpacity={1}
                                                                                style={{ position: 'absolute', top: 0, bottom: 0, left: cx - tapWidth / 2, width: tapWidth }}
                                                                                onPress={() => setMarksChartTooltip((prev) => (prev === i ? null : i))}
                                                                            />
                                                                        );
                                                                    });
                                                                })()}
                                                            </View>
                                                        </View>
                                                    );
                                                })()}
                                            </View>
                                        </View>

                                        {/* Report Card — full parity with web's per-student
                                            grid: subjects × exam columns (offline) or tests-as-chips
                                            (online), Total/%/Grade per subject, a Grand Total row,
                                            and (offline only) editable Conduct/Remarks rows +
                                            a Graded Subjects mini-table, matching
                                            marksheetHook.remarks / handleRemarkChange on web. RN has
                                            no <table>, so this is the same column-width grid
                                            technique already used for the main Offline/Online sheet
                                            above (msColors, fixed-width columns inside one shared
                                            horizontal ScrollView so every row's columns line up). */}
                                        {(() => {
                                            const RC_SUBJ_W = 116, RC_EXAM_W = 62, RC_TESTS_W = 230, RC_TOTAL_W = 52, RC_PCT_W = 42, RC_GRADE_W = 40;
                                            const rcIsOffline = marksReportCardTab === 'offline';
                                            const rcExamColumns = rcIsOffline ? marksExamColumns : marksOnlineExamColumns;
                                            const rcScores = rcIsOffline ? marksScores : marksOnlineScores;
                                            const rcHeaderExams = rcIsOffline ? (rcExamColumns[(division?.subjects ?? [])[0]?.id ?? ''] ?? []) : [];
                                            const rcGradedSubs = rcIsOffline ? marksGradedSubjects : [];

                                            let rcGrandScored = 0, rcGrandMax = 0;
                                            const rcSubjectData = (division?.subjects ?? []).map((sub) => {
                                                const examList = rcExamColumns[sub.id] ?? [];
                                                let scored = 0, maxTotal = 0;
                                                const cells = examList.map((col) => {
                                                    const e = rcScores[col.id]?.[sel.student.id];
                                                    const val = e?.isAbsent ? null : (e?.score ?? (rcIsOffline ? null : 0));
                                                    const pct = val !== null && col.maxMarks > 0 ? Math.round((val / col.maxMarks) * 100) : null;
                                                    if (val !== null) { maxTotal += col.maxMarks; scored += val; }
                                                    return { ex: col, val, maxMarks: col.maxMarks, pct };
                                                });
                                                const totalPct = maxTotal > 0 ? Math.round((scored / maxTotal) * 100) : null;
                                                rcGrandScored += scored;
                                                rcGrandMax += maxTotal;
                                                return { sub, cells, scored, maxTotal, totalPct };
                                            });
                                            const rcGrandPct = rcGrandMax > 0 ? Math.round((rcGrandScored / rcGrandMax) * 100) : null;
                                            const rcHasOnlineData = rcSubjectData.some((s) => s.maxTotal > 0);
                                            const rcGridW = rcIsOffline
                                                ? RC_SUBJ_W + rcHeaderExams.length * RC_EXAM_W + RC_TOTAL_W + RC_PCT_W + RC_GRADE_W
                                                : RC_SUBJ_W + RC_TESTS_W + RC_TOTAL_W + RC_PCT_W + RC_GRADE_W;
                                            const rcRemark = marksRemarks[sel.student.id] ?? { conduct: null, remarks: null };

                                            const cellStyle = { borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder };

                                            return (
                                                <View style={styles.cardShadowWrap}>
                                                    <View style={[styles.card, { backgroundColor: msColors.bg, borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                                                        <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder, gap: 6 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Report Card</Text>
                                                                <View style={[styles.manageSegTrack, { backgroundColor: trackBg, padding: 2 }]}>
                                                                    {(['offline', 'online'] as const).map((t) => {
                                                                        const active = marksReportCardTab === t;
                                                                        return (
                                                                            <TouchableOpacity key={t} onPress={() => setMarksReportCardTab(t)}
                                                                                style={[styles.manageSegBtn, { paddingHorizontal: 10, paddingVertical: 4 }, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
                                                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText, textTransform: 'capitalize' }}>{t}</Text>
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                </View>
                                                            </View>
                                                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                                                <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: theme.text }}>{sel.student.name ?? '-'}</Text>
                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {sel.student.rollNo}</Text>
                                                            </View>
                                                        </View>

                                                        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                                                            {!rcIsOffline && !rcHasOnlineData ? (
                                                                <View style={{ width: Math.max(rcGridW, 260), paddingVertical: 28, alignItems: 'center', gap: 3 }}>
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>No completed tests yet</Text>
                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.7 }}>Online results appear here once a test is completed</Text>
                                                                </View>
                                                            ) : (
                                                                <View style={{ width: rcGridW }}>
                                                                    {/* Header row */}
                                                                    <View style={{ flexDirection: 'row' }}>
                                                                        <View style={[cellStyle, { width: RC_SUBJ_W, backgroundColor: msColors.hdrBg, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 }]}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Subjects</Text>
                                                                        </View>
                                                                        {rcIsOffline ? (
                                                                            rcHeaderExams.map((ex) => (
                                                                                <View key={ex.id} style={[cellStyle, { width: RC_EXAM_W, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }]}>
                                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrText }} numberOfLines={1}>{ex.name}</Text>
                                                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.7 }}>/{ex.maxMarks}</Text>
                                                                                </View>
                                                                            ))
                                                                        ) : (
                                                                            <View style={[cellStyle, { width: RC_TESTS_W, backgroundColor: msColors.hdrBg, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 }]}>
                                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Tests & Marks</Text>
                                                                            </View>
                                                                        )}
                                                                        <View style={[cellStyle, { width: RC_TOTAL_W, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Total</Text>
                                                                        </View>
                                                                        <View style={[cellStyle, { width: RC_PCT_W, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>%</Text>
                                                                        </View>
                                                                        <View style={[cellStyle, { width: RC_GRADE_W, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Grade</Text>
                                                                        </View>
                                                                    </View>

                                                                    {/* Subject rows */}
                                                                    {rcSubjectData.map(({ sub, cells, scored, maxTotal, totalPct }) => {
                                                                        const subCol = colorForSubject(sub);
                                                                        return (
                                                                            <View key={sub.id} style={{ flexDirection: 'row' }}>
                                                                                <View style={[cellStyle, { width: RC_SUBJ_W, backgroundColor: msColors.rowBase, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                                                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: subCol }} />
                                                                                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 10, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>{sub.name}</Text>
                                                                                </View>
                                                                                {rcIsOffline ? (
                                                                                    cells.map(({ ex, val, pct }) => (
                                                                                        <View key={ex.id} style={[cellStyle, { width: RC_EXAM_W, backgroundColor: msColors.rowBase, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }]}>
                                                                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: val !== null ? marksScoreColor(pct ?? 0) : msColors.hdrText + '80' }}>{val !== null ? val : '—'}</Text>
                                                                                        </View>
                                                                                    ))
                                                                                ) : (
                                                                                    <View style={[cellStyle, { width: RC_TESTS_W, backgroundColor: msColors.rowBase, paddingHorizontal: 6, paddingVertical: 5, alignItems: 'flex-start' }]}>
                                                                                        {cells.length === 0 ? (
                                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: msColors.hdrText + '80' }}>—</Text>
                                                                                        ) : (
                                                                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                                                                                {cells.map(({ ex, val, maxMarks }) => (
                                                                                                    <View key={ex.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                                                        <Text numberOfLines={1} style={{ fontSize: 8.5, color: msColors.hdrText, opacity: 0.7, maxWidth: 70 }}>{ex.name}</Text>
                                                                                                        {val === null ? (
                                                                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#DC2626' }}>Ab</Text>
                                                                                                        ) : (
                                                                                                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: marksScoreColor(maxMarks > 0 ? Math.round((val / maxMarks) * 100) : 0) }}>{val}/{maxMarks}</Text>
                                                                                                        )}
                                                                                                    </View>
                                                                                                ))}
                                                                                            </View>
                                                                                        )}
                                                                                    </View>
                                                                                )}
                                                                                <View style={[cellStyle, { width: RC_TOTAL_W, backgroundColor: msColors.summaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>{maxTotal > 0 ? `${scored}/${maxTotal}` : '—'}</Text>
                                                                                </View>
                                                                                <View style={[cellStyle, { width: RC_PCT_W, backgroundColor: msColors.rowBase, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: totalPct !== null ? marksScoreColor(totalPct) : msColors.hdrText + '80' }}>{totalPct !== null ? `${totalPct}%` : '—'}</Text>
                                                                                </View>
                                                                                <View style={[cellStyle, { width: RC_GRADE_W, backgroundColor: msColors.rowBase, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: totalPct !== null ? marksScoreColor(totalPct) : msColors.hdrText + '80' }}>{totalPct !== null ? marksGradeLabel(totalPct) : '—'}</Text>
                                                                                </View>
                                                                            </View>
                                                                        );
                                                                    })}

                                                                    {/* Grand Total row */}
                                                                    <View style={{ flexDirection: 'row' }}>
                                                                        <View style={[cellStyle, { width: RC_SUBJ_W, backgroundColor: msColors.rowBase, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: msColors.hdrText }}>Grand Total</Text>
                                                                        </View>
                                                                        <View style={[cellStyle, { width: rcIsOffline ? rcHeaderExams.length * RC_EXAM_W : RC_TESTS_W, backgroundColor: msColors.rowBase }]} />
                                                                        <View style={[cellStyle, { width: RC_TOTAL_W, backgroundColor: msColors.summaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_800ExtraBold', color: msColors.hdrText }}>{rcGrandMax > 0 ? `${rcGrandScored}/${rcGrandMax}` : '—'}</Text>
                                                                        </View>
                                                                        <View style={[cellStyle, { width: RC_PCT_W, backgroundColor: msColors.summaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: rcGrandPct !== null ? marksScoreColor(rcGrandPct) : msColors.hdrText + '80' }}>{rcGrandPct !== null ? `${rcGrandPct}%` : '—'}</Text>
                                                                        </View>
                                                                        <View style={[cellStyle, { width: RC_GRADE_W, backgroundColor: msColors.summaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: rcGrandPct !== null ? marksScoreColor(rcGrandPct) : msColors.hdrText + '80' }}>{rcGrandPct !== null ? marksGradeLabel(rcGrandPct) : '—'}</Text>
                                                                        </View>
                                                                    </View>

                                                                    {/* Graded Subjects mini table — offline only. */}
                                                                    {rcIsOffline && rcGradedSubs.length > 0 && (
                                                                        <View style={{ marginTop: 10 }}>
                                                                            <View style={{ flexDirection: 'row' }}>
                                                                                <View style={[cellStyle, { width: RC_SUBJ_W, backgroundColor: msColors.hdrBg, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>{marksGradedSectionTitle}</Text>
                                                                                </View>
                                                                                <View style={[cellStyle, { width: 90, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Term 1</Text>
                                                                                </View>
                                                                                <View style={[cellStyle, { width: 90, backgroundColor: msColors.hdrBg, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Term 2</Text>
                                                                                </View>
                                                                            </View>
                                                                            {rcGradedSubs.map((gs) => {
                                                                                const gsScore = marksGradedScores[gs.id]?.[sel.student.id];
                                                                                return (
                                                                                    <View key={gs.id} style={{ flexDirection: 'row' }}>
                                                                                        <View style={[cellStyle, { width: RC_SUBJ_W, backgroundColor: msColors.rowBase, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }]}>
                                                                                            <Text numberOfLines={1} style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrText }}>{gs.name}</Text>
                                                                                        </View>
                                                                                        <View style={[cellStyle, { width: 90, backgroundColor: msColors.rowBase, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: gsScore?.term1Grade ? gradeValColor(gsScore.term1Grade) : msColors.hdrText + '80' }}>{gsScore?.term1Grade ?? '—'}</Text>
                                                                                        </View>
                                                                                        <View style={[cellStyle, { width: 90, backgroundColor: msColors.rowBase, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: gsScore?.term2Grade ? gradeValColor(gsScore.term2Grade) : msColors.hdrText + '80' }}>{gsScore?.term2Grade ?? '—'}</Text>
                                                                                        </View>
                                                                                    </View>
                                                                                );
                                                                            })}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            )}
                                                        </ScrollView>

                                                        {/* Conduct + Remarks — offline only, class-teacher
                                                            editable (same PUT as web's textareas), read-only
                                                            text for a subject teacher viewing the app.
                                                            Rendered OUTSIDE the horizontal grid ScrollView
                                                            above (full width instead of a "colSpan" cell) —
                                                            on Android a TextInput nested inside a horizontal
                                                            ScrollView that sits inside a vertical one doesn't
                                                            reliably receive focus (the ScrollView's touch
                                                            responder swallows the tap before the keyboard can
                                                            open), so these need to sit outside that nesting
                                                            entirely. */}
                                                        {rcIsOffline && (
                                                            <View style={{ paddingTop: 4 }}>
                                                                <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder, borderBottomWidth: 0 }}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: msColors.hdrBorder }}>
                                                                        <View style={{ width: 68, backgroundColor: msColors.hdrBg, paddingHorizontal: 8, paddingVertical: 8 }}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: msColors.hdrText }}>Conduct</Text>
                                                                        </View>
                                                                        <View style={{ flex: 1, backgroundColor: msColors.bg, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' }}>
                                                                            {isClassTeacher ? (
                                                                                <TextInput
                                                                                    ref={marksConductInputRef}
                                                                                    onFocus={() => scrollMarksFieldAboveKeyboard(marksConductInputRef.current)}
                                                                                    value={rcRemark.conduct ?? ''}
                                                                                    onChangeText={(t) => handleMarksRemarkChange(sel.student.id, { conduct: t || null })}
                                                                                    placeholder="—"
                                                                                    placeholderTextColor={msColors.hdrText + '80'}
                                                                                    multiline
                                                                                    style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, includeFontPadding: false, padding: 0 }}
                                                                                />
                                                                            ) : (
                                                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: msColors.hdrText }}>{rcRemark.conduct || '—'}</Text>
                                                                            )}
                                                                        </View>
                                                                    </View>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                                                                        <View style={{ width: 68, backgroundColor: msColors.hdrBg, paddingHorizontal: 8, paddingVertical: 8 }}>
                                                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_800ExtraBold', color: msColors.hdrText }}>Remarks</Text>
                                                                        </View>
                                                                        <View style={{ flex: 1, backgroundColor: msColors.bg, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' }}>
                                                                            {isClassTeacher ? (
                                                                                <TextInput
                                                                                    ref={marksRemarksInputRef}
                                                                                    onFocus={() => scrollMarksFieldAboveKeyboard(marksRemarksInputRef.current)}
                                                                                    value={rcRemark.remarks ?? ''}
                                                                                    onChangeText={(t) => handleMarksRemarkChange(sel.student.id, { remarks: t || null })}
                                                                                    placeholder="—"
                                                                                    placeholderTextColor={msColors.hdrText + '80'}
                                                                                    multiline
                                                                                    style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: msColors.hdrText, includeFontPadding: false, padding: 0 }}
                                                                                />
                                                                            ) : (
                                                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', color: msColors.hdrText }}>{rcRemark.remarks || '—'}</Text>
                                                                            )}
                                                                        </View>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        )}

                                                        {/* Footer legend — same Pass/Fail color key as the
                                                            main sheet. */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder, backgroundColor: theme.card }}>
                                                            {[
                                                                { label: '≥75% Pass', color: '#059669', sample: 75 },
                                                                { label: '35–74% Pass', color: '#F59E0B', sample: 36 },
                                                                { label: '<35% Fail', color: '#DC2626', sample: 17 },
                                                            ].map((item) => (
                                                                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: item.color }}>{item.sample}%</Text>
                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{item.label}</Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    </View>
                                                </View>
                                            );
                                        })()}
                                    </Fragment>
                                );
                            })()}
                        </ScrollView>
                        </Animated.View>
                        )}
                    </View>
                ) : activeLoading ? (
                    <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                ) : (isOffline && !marksInitialized) ? (
                    <View style={[styles.centerFill, { paddingHorizontal: 24 }]}>
                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.muted, textAlign: 'center' }}>
                            Marksheet not set up yet for this class — set it up from the web dashboard first.
                        </Text>
                    </View>
                ) : (
                    <View style={[styles.cardShadowWrap, { flex: 1 }]}>
                        <View style={[styles.card, { flex: 1, backgroundColor: msColors.bg, borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <BookOpen size={13} color={theme.text} style={{ marginTop: Platform.OS === 'android' ? 1 : 3 }} />
                                        <Text
                                            style={{ flexShrink: 1, fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: theme.text, includeFontPadding: false, marginTop: Platform.OS === 'ios' ? 3 : 0 }}
                                            numberOfLines={1}
                                        >
                                            {division?.name} Marksheet
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: 10, lineHeight: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, marginLeft: 19, marginTop: 2, includeFontPadding: false }}>
                                        Academic Year {marksAcademicYear} - {isOffline ? 'Offline' : 'Online'}
                                    </Text>
                                </View>

                                {/* Export — same mechanism as Attendance Sheet's Export: a
                                    real .xlsx built client-side with the xlsx (SheetJS)
                                    library, then handed to the OS share sheet. */}
                                <TouchableOpacity onPress={handleMarksExport} disabled={marksExporting} activeOpacity={0.85} style={{ opacity: marksExporting ? 0.6 : 1 }}>
                                    <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 8 }}>
                                        {marksExporting ? <ActivityIndicator size="small" color="#fff" /> : (
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>⬇ Export</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                                <View>
                                    {/* Header — Roll No. + Name form one merged cell spanning
                                        both header rows (mirrors web's rowSpan={2} sticky
                                        columns), with the subject-group row and the per-exam
                                        row stacked to its right. */}
                                    <View style={{ flexDirection: 'row' }}>
                                        <View style={{ width: ROLL_W + NAME_W, flexDirection: 'row', alignItems: 'stretch', backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                            <View style={{ width: ROLL_W, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText, includeFontPadding: false }}>Roll No.</Text>
                                            </View>
                                            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: msColors.hdrBorder }} />
                                            <View style={{ width: NAME_W - StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText, includeFontPadding: false }}>Student Name</Text>
                                            </View>
                                        </View>
                                        <View>
                                    {/* Row 1 — subject group headers (colored, spanning that
                                        subject's exam columns + its Total/% below). */}
                                    <View style={{ flexDirection: 'row' }}>
                                        {(division?.subjects ?? []).map((sub) => {
                                            const w = getSubjectExams(sub.id).length * EXAM_W + SUBJ_TOTAL_W + SUBJ_PCT_W;
                                            const col = colorForSubject(sub);
                                            return (
                                                <View key={sub.id} style={{ width: w, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, backgroundColor: col + '22', borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder, borderBottomWidth: 2, borderBottomColor: col + '99' }}>
                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col }} />
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: col }} numberOfLines={1}>{sub.name}</Text>
                                                </View>
                                            );
                                        })}
                                        {activeGradedSubjects.length > 0 && (
                                            <>
                                                <View style={{ width: GRADED_GAP_W }} />
                                                <View style={{ width: GRADED_W * 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }} numberOfLines={1}>{marksGradedSectionTitle}</Text>
                                                </View>
                                                <View style={{ width: GRADED_GAP_W }} />
                                            </>
                                        )}
                                        <View style={{ width: GRAND_W + PCT_W + GRADE_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Overall</Text>
                                        </View>
                                    </View>

                                    {/* Row 2 — per-exam sub-headers + Total/% + graded Term1/Term2 + Grand/%/Grade. */}
                                    <View style={{ flexDirection: 'row' }}>
                                        {(division?.subjects ?? []).map((sub) => (
                                            <Fragment key={sub.id}>
                                                {getSubjectExams(sub.id).map((ex) => (
                                                    <View key={ex.id} style={{ width: EXAM_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                        <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrText }} numberOfLines={1}>{ex.name}</Text>
                                                        <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.75 }}>/{ex.maxMarks}</Text>
                                                        {!isOffline && ex.examDate && (
                                                            <Text style={{ fontSize: 7, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.6 }} numberOfLines={1}>
                                                                {new Date(ex.examDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                            </Text>
                                                        )}
                                                    </View>
                                                ))}
                                                <View style={{ width: SUBJ_TOTAL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Total</Text>
                                                </View>
                                                <View style={{ width: SUBJ_PCT_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>%</Text>
                                                </View>
                                            </Fragment>
                                        ))}
                                        {activeGradedSubjects.length > 0 && <View style={{ width: GRADED_GAP_W }} />}
                                        {activeGradedSubjects.map((gsub) => (
                                            <Fragment key={gsub.id}>
                                                <View style={{ width: GRADED_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                    <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }} numberOfLines={1}>{gsub.name}</Text>
                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.75 }}>Term 1</Text>
                                                </View>
                                                <View style={{ width: GRADED_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, backgroundColor: msColors.hdrBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                    <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }} numberOfLines={1}>{gsub.name}</Text>
                                                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: msColors.hdrText, opacity: 0.75 }}>Term 2</Text>
                                                </View>
                                            </Fragment>
                                        ))}
                                        {activeGradedSubjects.length > 0 && <View style={{ width: GRADED_GAP_W }} />}
                                        <View style={{ width: GRAND_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Grand</Text>
                                        </View>
                                        <View style={{ width: PCT_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>%</Text>
                                        </View>
                                        <View style={{ width: GRADE_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrText }}>Grade</Text>
                                        </View>
                                    </View>
                                        </View>
                                    </View>

                                    {/* Body — vertical scroll of student rows, same trick as the
                                        Sheet tab: a plain vertical ScrollView nested inside this
                                        horizontal one is safe here because this whole grid is a
                                        direct child of the tab page (no extra vertical ScrollView
                                        sits between it and the top-level tab pager) — the exact
                                        structural difference that caused Android's first-swipe bug
                                        on the Overall tab's student sheet. */}
                                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                        {activeStudents.length === 0 ? (
                                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students yet</Text>
                                            </View>
                                        ) : activeStudents.map((student, si) => {
                                            const rowBg = si % 2 === 0 ? msColors.rowBase : msColors.rowBase;
                                            const grand = getGrandTotal(student.id);
                                            return (
                                                <View key={student.id} style={{ flexDirection: 'row', backgroundColor: rowBg }}>
                                                    <Text style={[styles.attGridCell, { width: ROLL_W, fontFamily: 'Poppins_700Bold', backgroundColor: msColors.rowBase, borderColor: msColors.hdrBorder, color: msColors.hdrText }]}>{student.rollNo || '-'}</Text>
                                                    <View style={{ width: NAME_W, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                        <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name ?? student.rollNo), overflow: 'hidden' }}>
                                                            {student.avatarUrl
                                                                ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                : <Text style={{ fontSize: 7.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name ?? student.rollNo)}</Text>}
                                                        </View>
                                                        <Text style={{ flex: 1, fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrText }} numberOfLines={1}>{student.name ?? '-'}</Text>
                                                    </View>
                                                    {(division?.subjects ?? []).map((sub) => {
                                                        // Matches web's isRestricted: a subject teacher sees only
                                                        // their own subject's column — every other subject's exam
                                                        // marks and subject total/% are blanked out entirely.
                                                        const subRestricted = !isClassTeacher && !!subjectId && sub.id !== subjectId;
                                                        const { total, scored, enteredTotal } = getSubjectTotal(sub.id, student.id);
                                                        const subPct = enteredTotal > 0 ? Math.round((scored / enteredTotal) * 100) : null;
                                                        return (
                                                            <Fragment key={sub.id}>
                                                                {getSubjectExams(sub.id).map((ex) => {
                                                                    if (subRestricted) {
                                                                        return (
                                                                            <View key={ex.id} style={{ width: EXAM_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrBorder }}>—</Text>
                                                                            </View>
                                                                        );
                                                                    }
                                                                    const sc = getScore(ex.id, student.id);
                                                                    const cellPct = sc !== null ? (sc / ex.maxMarks) * 100 : null;
                                                                    // A subject teacher can edit Offline marks for
                                                                    // their own subject column only (matches web);
                                                                    // Online is always auto-computed/read-only, and
                                                                    // a class teacher never edits marks here either.
                                                                    const editable = isOffline && !isClassTeacher && !!subjectId && sub.id === subjectId;
                                                                    const cellContent = (
                                                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: sc !== null ? marksScoreColor(cellPct!) : msColors.hdrBorder }}>
                                                                            {sc !== null ? sc : '-'}
                                                                        </Text>
                                                                    );
                                                                    return editable ? (
                                                                        <TouchableOpacity key={ex.id} onPress={() => openScoreEditor(ex.id, ex.name, ex.maxMarks, student.id, student.name ?? student.rollNo)}
                                                                            style={{ width: EXAM_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                            {cellContent}
                                                                        </TouchableOpacity>
                                                                    ) : (
                                                                        <View key={ex.id} style={{ width: EXAM_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                            {cellContent}
                                                                        </View>
                                                                    );
                                                                })}
                                                                <View style={{ width: SUBJ_TOTAL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg + '80', borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: subRestricted ? msColors.hdrBorder : msColors.hdrText }}>{subRestricted ? '—' : `${scored}/${total}`}</Text>
                                                                </View>
                                                                <View style={{ width: SUBJ_PCT_W, alignItems: 'center', justifyContent: 'center', backgroundColor: msColors.summaryBg + '80', borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: subRestricted ? msColors.hdrBorder : (subPct !== null ? marksScoreColor(subPct) : msColors.hdrBorder) }}>{subRestricted ? '—' : (subPct !== null ? `${subPct}%` : '-')}</Text>
                                                                </View>
                                                            </Fragment>
                                                        );
                                                    })}
                                                    {activeGradedSubjects.length > 0 && <View style={{ width: GRADED_GAP_W }} />}
                                                    {activeGradedSubjects.map((gsub) => {
                                                        const t1 = getGrade(gsub.id, student.id, 't1');
                                                        const t2 = getGrade(gsub.id, student.id, 't2');
                                                        // Graded Subjects are class-teacher-only, matching web's
                                                        // isRestricted: a subject teacher gets a blank "—" here,
                                                        // not the real grade value.
                                                        const gradedCellStyle = { width: GRADED_W, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder };
                                                        return isClassTeacher ? (
                                                            <Fragment key={gsub.id}>
                                                                <TouchableOpacity onPress={() => openGradeEditor(gsub.id, gsub.name, student.id, student.name ?? student.rollNo, 't1')}
                                                                    style={gradedCellStyle}>
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: gradeValColor(t1) }}>{t1 ?? '-'}</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => openGradeEditor(gsub.id, gsub.name, student.id, student.name ?? student.rollNo, 't2')}
                                                                    style={gradedCellStyle}>
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: gradeValColor(t2) }}>{t2 ?? '-'}</Text>
                                                                </TouchableOpacity>
                                                            </Fragment>
                                                        ) : (
                                                            <Fragment key={gsub.id}>
                                                                <View style={gradedCellStyle}>
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrBorder }}>—</Text>
                                                                </View>
                                                                <View style={gradedCellStyle}>
                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: msColors.hdrBorder }}>—</Text>
                                                                </View>
                                                            </Fragment>
                                                        );
                                                    })}
                                                    {activeGradedSubjects.length > 0 && <View style={{ width: GRADED_GAP_W }} />}
                                                    <View style={{ width: GRAND_W, alignItems: 'center', justifyContent: 'center', backgroundColor: rowBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: msColors.hdrText }}>{isClassTeacher ? `${grand.scored}/${grand.total}` : '—'}</Text>
                                                    </View>
                                                    <View style={{ width: PCT_W, alignItems: 'center', justifyContent: 'center', backgroundColor: rowBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_800ExtraBold', color: isClassTeacher && grand.pct !== null ? marksScoreColor(grand.pct) : msColors.hdrBorder }}>{isClassTeacher ? (grand.pct !== null ? `${grand.pct}%` : '-') : '—'}</Text>
                                                    </View>
                                                    <View style={{ width: GRADE_W, alignItems: 'center', justifyContent: 'center', backgroundColor: rowBg, borderWidth: StyleSheet.hairlineWidth, borderColor: msColors.hdrBorder }}>
                                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_800ExtraBold', color: isClassTeacher && grand.pct !== null ? marksScoreColor(grand.pct) : msColors.hdrBorder }}>{isClassTeacher ? (grand.pct !== null ? marksGradeLabel(grand.pct) : '-') : '—'}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </ScrollView>

                            {/* Grade Scale — offline only, matching web (the
                                GradeScaleEditor there is gated the same way);
                                read-only here — the class teacher configures/
                                edits this on web only, the app just mirrors
                                whatever is currently set. */}
                            {isOffline && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder }}>
                                    <Trophy size={11} color={theme.muted} style={Platform.OS === 'android' ? { marginTop: 1 } : undefined} />
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.muted, marginRight: 2 }}>Grade Scale</Text>
                                    {displayGradeScale.map((entry, i) => {
                                        const isFail = i === displayGradeScale.length - 1;
                                        const color = gradeRankColor(i, displayGradeScale.length);
                                        return (
                                            <View key={entry.grade + i} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: color + '1A' }}>
                                                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color }}>
                                                    {entry.grade}{isFail ? ' (Fail)' : ` ≥${entry.minPct}%`}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                            {!isOffline && (
                                <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder }}>
                                    <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>
                                        Auto-filled from completed test results · best attempt counts
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}
            </View>
        );
    }, [
        division, trackBg, isDark, theme, marksSubTab, marksLoading, marksInitialized, marksAcademicYear,
        marksExamColumns, marksScores, marksGradedSubjects, marksGradedScores, marksGradedSectionTitle,
        marksStudents, marksGradeLabel, marksScoreColor, marksGradeScale, marksExporting, handleMarksExport,
        marksOnlineLoading, marksOnlineStudents, marksOnlineExamColumns, marksOnlineScores,
        marksOverallRightTab, marksOverallSelectedId, marksStudentStats, marksSubjectStats, marksSelectedOverallStudent,
        marksRankTab, marksTopperTab, marksSubjectToppers, marksTrendSubjectId, marksTrendMode, marksRankMap, marksChartTooltip,
        marksReportCardTab, marksRemarks, handleMarksRemarkChange, isClassTeacher, marksKbPad, scrollMarksFieldAboveKeyboard,
        marksDetailSlideX, closeMarksOverallDetail,
    ]);

    // ── Fees tab — read-only mirror of web's FeesTab.tsx. Teachers (even the
    // class teacher) cannot edit the fee structure or mark a payment — only
    // admins do that; this is strictly a viewer.
    const [feesLoading, setFeesLoading] = useState(true);
    const [feesFetched, setFeesFetched] = useState(false);
    const [feesRoster, setFeesRoster] = useState<FeesRosterStudent[]>([]);
    const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
    const [feeMonths, setFeeMonths] = useState<FeeMonth[]>([]);
    const [feePayments, setFeePayments] = useState<FeePayment[]>([]);
    const [feeRulesAndRegs, setFeeRulesAndRegs] = useState<{ id: string; text: string }[]>([]);
    const [feeExtraColumns, setFeeExtraColumns] = useState<{ label: string }[]>([]);
    const [feeCardTheme, setFeeCardTheme] = useState<FeeCardThemeKey>('yellow');
    const [feeSchoolLogoUrl, setFeeSchoolLogoUrl] = useState<string | null>(null);
    const [feeSchoolName, setFeeSchoolName] = useState('');
    const [feeStudentFields, setFeeStudentFields] = useState<FeeStudentDetailField[]>(DEFAULT_FEE_STUDENT_FIELDS);

    const fetchFees = useCallback(async () => {
        setFeesLoading(true);
        try {
            const feeYq = !ayIsCurrent && aySelectedYearId ? `?academicYearId=${aySelectedYearId}` : '';
            const [studentsRes, structureRes, paymentsRes] = await Promise.all([
                api.get(`/teacher/classes/${divisionId}/students${feeYq}`).catch(() => ({ data: { data: [] } })),
                api.get(`/teacher/campus/divisions/${divisionId}/fee-structure${feeYq}`).catch(() => ({ data: { data: null } })),
                // StudentFeePayment has no academicYearId — payment status is
                // always live regardless of the selected year (same scope cut
                // as the web admin/teacher fee screens).
                api.get(`/teacher/campus/divisions/${divisionId}/fee-payments`).catch(() => ({ data: { data: [] } })),
            ]);
            const studentsRaw: { id: string; studentId: string; user: { name: string | null }; rollNo: string | null; extraDetailFields: Record<string, string> | null; avatarUrl: string | null }[] = studentsRes.data?.data ?? [];
            setFeesRoster(studentsRaw.map((s) => ({
                id: s.id,
                studentId: s.studentId,
                name: s.user?.name ?? 'Unknown',
                rollNo: s.rollNo ?? '—',
                extraDetailFields: s.extraDetailFields ?? null,
                avatarUrl: s.avatarUrl ?? null,
            })));

            const structure = structureRes.data?.data;
            setFeeStructures(feeNormalizeStructureColors(structure?.feeStructures ?? []));
            setFeeMonths(structure?.feeMonths ?? []);
            setFeeRulesAndRegs(structure?.rulesAndRegs ?? []);
            setFeeExtraColumns(structure?.extraColumns ?? []);
            if (structure?.studentFields && structure.studentFields.length > 0) {
                const hasBus = structure.studentFields.some((f: FeeStudentDetailField) => f.kind === 'default' && f.defaultKey === 'bus');
                setFeeStudentFields(hasBus ? structure.studentFields : [...structure.studentFields, { id: 'f-bus', kind: 'default' as const, defaultKey: 'bus' as const, label: 'Bus' }]);
            } else {
                setFeeStudentFields(DEFAULT_FEE_STUDENT_FIELDS);
            }
            const themeKey = structure?.feeCardTheme;
            setFeeCardTheme(themeKey && themeKey in FEE_CARD_THEMES ? themeKey as FeeCardThemeKey : 'yellow');
            setFeeSchoolLogoUrl(structure?.schoolLogoUrl ?? null);
            setFeeSchoolName(structure?.schoolName ?? '');

            setFeePayments(paymentsRes.data?.data ?? []);
        } catch {
            setFeesRoster([]);
            setFeeStructures([]);
            setFeeMonths([]);
            setFeePayments([]);
        } finally {
            setFeesLoading(false);
            setFeesFetched(true);
        }
    }, [divisionId, ayIsCurrent, aySelectedYearId]);
    useEffect(() => {
        setFeesFetched(false);
    }, [aySelectedYearId, ayIsCurrent]);
    useEffect(() => {
        if (activeTab === 'fees' && !feesFetched) fetchFees();
    }, [activeTab, feesFetched, fetchFees]);

    const [feesSelectedStudentId, setFeesSelectedStudentId] = useState<string | null>(null);
    const [feesStudentFilter, setFeesStudentFilter] = useState<'all' | 'paid' | 'pending'>('all');
    const [feesSelectedMonth, setFeesSelectedMonth] = useState<string | null>(null);
    // Card front/back flip and item-expand state now live inside FeeFlipCard
    // itself (imported from fees_detail.tsx) — it's the same component the
    // student app uses, so this tab no longer manages that state locally.

    // Slide the fee card in from the right the moment a student is selected,
    // and slide it back out before clearing the selection — same treatment
    // as Manage's manageDetailSlideX.
    const feesDetailSlideX = useRef(new Animated.Value(SCREEN_W)).current;
    useEffect(() => {
        if (feesSelectedStudentId) Animated.timing(feesDetailSlideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [feesSelectedStudentId, feesDetailSlideX]);
    const closeFeesDetail = useCallback(() => {
        Animated.timing(feesDetailSlideX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
            setFeesSelectedStudentId(null);
            feesDetailSlideX.setValue(SCREEN_W);
        });
    }, [feesDetailSlideX]);

    const feesPageContent = useMemo(() => {
        const getPayment = (studentId: string, feeMonthId: string): FeePayment =>
            feePayments.find((p) => p.studentId === studentId && p.feeMonthId === feeMonthId)
                ?? { studentId, feeMonthId, status: 'PENDING', paidDate: null, remark: null, extraFields: null, extraStructureIds: null };

        // Overall paid/pending tracks only the current calendar month's fee
        // status (the most recently applicable configured month, at or
        // before now) — matches web's isStudentPaid exactly.
        const isStudentPaid = (studentId: string) => {
            if (feeMonths.length === 0) return false;
            const currentMonthIndex = new Date().getMonth();
            const withIdx = feeMonths.map((m) => ({ m, idx: FEE_MONTHS.indexOf(m.month) })).filter((x) => x.idx !== -1);
            if (withIdx.length === 0) return false;
            const pastOrCurrent = withIdx.filter((x) => x.idx <= currentMonthIndex).sort((a, b) => b.idx - a.idx)[0];
            const target = pastOrCurrent ?? [...withIdx].sort((a, b) => a.idx - b.idx)[0];
            return getPayment(studentId, target.m.id).status === 'PAID';
        };

        const feesStudents = feesRoster.map((s) => ({ ...s, paid: isStudentPaid(s.id) }));
        const selectedStudent = feesStudents.find((s) => s.id === feesSelectedStudentId) ?? null;

        // Late Fee Fine / Bus Fee auto-apply and per-month totals are now
        // computed inside FeeFlipCard itself (same logic, ported from
        // web/fees_detail.tsx) — this tab only needs isStudentPaid above,
        // for the list's Paid/Pending badges.

        const fc = FEE_CARD_THEMES[feeCardTheme];
        const filteredStudents = feesStudents.filter((s) => (feesStudentFilter === 'all' ? true : feesStudentFilter === 'paid' ? s.paid : !s.paid));

        // FeeFlipCard reads the built-in Student Details fields (roll no,
        // student id, class, division) off this same extraDetailFields map
        // via their well-known keys — mirrors fees_detail.tsx's own
        // mergedDetailFields exactly.
        const divisionName = division?.name ?? '';
        const classValue = divisionName.split('-')[0] ?? divisionName;
        const divisionValue = divisionName.split('-')[1] ?? '';
        const mergedFeeDetailFields: Record<string, string> = selectedStudent ? {
            ...(selectedStudent.extraDetailFields ?? {}),
            rollNo: selectedStudent.rollNo,
            studentId: selectedStudent.studentId,
            class: classValue || '—',
            division: divisionValue || '—',
        } : {};

        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4 }}>
                <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 0 }]}>
                    <Users size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                    <Text style={[styles.cardHeaderText, { color: theme.text }]}>{selectedStudent ? 'Fee Details' : `Students (${feesStudents.length})`}</Text>
                </View>

                <View style={{ flex: 1 }}>
                {!selectedStudent ? (
                    <>
                        {/* Filter pills — same shape/colors as web's (all = purple,
                            paid = emerald, pending = red), not the segmented-control
                            style used elsewhere in this app. */}
                        <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                            {(['all', 'paid', 'pending'] as const).map((f) => {
                                const active = feesStudentFilter === f;
                                const activeBg = f === 'paid' ? (isDark ? '#052E20' : '#D1FAE5') : f === 'pending' ? (isDark ? '#450A0A' : '#FEE2E2') : theme.purple;
                                const activeText = f === 'paid' ? (isDark ? '#6EE7B7' : '#047857') : f === 'pending' ? (isDark ? '#FCA5A5' : '#B91C1C') : '#FFFFFF';
                                return (
                                    <TouchableOpacity key={f} onPress={() => setFeesStudentFilter(f)}
                                        style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? activeBg : trackBg }}>
                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: active ? activeText : theme.subText, textTransform: 'capitalize' }}>{f}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {feesLoading ? (
                            <View style={styles.centerFill}><ActivityIndicator color={theme.purple} /></View>
                        ) : filteredStudents.length === 0 ? (
                            <View style={styles.centerFill}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students yet</Text>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {filteredStudents.map((student) => (
                                    <TouchableOpacity key={student.id}
                                        onPress={() => {
                                            setFeesSelectedStudentId(student.id);
                                            setFeesSelectedMonth(null);
                                        }}
                                        activeOpacity={0.7}
                                        style={[styles.manageStudentRow, { paddingHorizontal: 0, borderBottomColor: theme.cardBorder }]}>
                                        <View style={[styles.avatarSm, { width: 42, height: 42, borderRadius: 14, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name) }]}>
                                            {student.avatarUrl
                                                ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name)}</Text>}
                                        </View>
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{student.name}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {student.rollNo}</Text>
                                        </View>
                                        <View style={[styles.manageBadge, { backgroundColor: student.paid ? (isDark ? '#052E20' : '#D1FAE5') : (isDark ? '#450A0A' : '#FEE2E2') }]}>
                                            <Text style={[styles.manageBadgeText, { color: student.paid ? (isDark ? '#6EE7B7' : '#047857') : (isDark ? '#FCA5A5' : '#B91C1C') }]}>{student.paid ? 'Paid' : 'Pending'}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </>
                ) : (
                    <Animated.View style={{ flex: 1, transform: [{ translateX: feesDetailSlideX }] }}>
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 30 }}>
                        <TouchableOpacity onPress={closeFeesDetail} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                            <View style={[styles.manageBackBtn, { borderColor: theme.cardBorder }, Platform.OS === 'android' ? { marginTop: -2 } : undefined]}>
                                <ArrowLeft size={15} color={theme.text} />
                            </View>
                            <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{selectedStudent.name}</Text>
                        </TouchableOpacity>

                        <View style={styles.cardShadowWrap}>
                            {/* Exact same Fee Card component the student app
                                renders (front/back 3D flip, its own internal
                                flip/expand state) — no hand-built lookalike. */}
                            <FeeFlipCard
                                theme={theme as never}
                                isDark={isDark}
                                selectedMonth={feesSelectedMonth}
                                setSelectedMonth={setFeesSelectedMonth}
                                fc={fc}
                                schoolLogoUrl={feeSchoolLogoUrl}
                                schoolName={feeSchoolName}
                                studentName={selectedStudent.name}
                                feeStructures={feeStructures}
                                feeMonths={feeMonths}
                                feePayments={feePayments}
                                studentFields={feeStudentFields}
                                extraDetailFields={mergedFeeDetailFields}
                                rulesAndRegs={feeRulesAndRegs}
                            />
                        </View>
                    </ScrollView>
                    </Animated.View>
                )}
                </View>
            </View>
        );
    }, [
        feesLoading, feesRoster, feeStructures, feeMonths, feePayments, feeStudentFields, feeRulesAndRegs,
        feeCardTheme, feeSchoolLogoUrl, feeSchoolName, feesSelectedStudentId, feesStudentFilter, feesSelectedMonth,
        theme, trackBg, isDark, division, feesDetailSlideX, closeFeesDetail,
    ]);

    const attendancePageContent = useMemo(() => {
        const today = new Date();
        const startOffset = (new Date(attCalYear, attCalMonth, 1).getDay() + 6) % 7;
        const daysInCalMonth = new Date(attCalYear, attCalMonth + 1, 0).getDate();
        const attCalendarCells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInCalMonth }, (_, i) => i + 1)];
        while (attCalendarCells.length % 7 !== 0) attCalendarCells.push(null);

        return (
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
                <View style={[styles.manageSegTrack, { backgroundColor: trackBg, alignSelf: 'flex-end' }]}>
                    {([
                        { key: 'daily' as const, label: 'Daily', Icon: CalendarCheck },
                        { key: 'sheet' as const, label: 'Sheet', Icon: CalendarDays },
                        { key: 'overall' as const, label: 'Overall', Icon: BarChart2 },
                    ]).map(({ key, label, Icon }) => {
                        const active = attSubTab === key;
                        return (
                            <TouchableOpacity key={key} onPress={() => setAttSubTab(key)}
                                style={[styles.manageSegBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, Platform.OS === 'android' ? { paddingVertical: 5 } : undefined, active && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                <Icon size={12} color={active ? theme.text : theme.subText} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: active ? theme.text : theme.subText }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {attSubTab === 'overall' ? (
                    <View style={{ flex: 1, gap: 4 }}>
                        {/* Heading styled like Manage's ManageSectionHeader (icon +
                            small uppercase bold label) instead of the old
                            Class Overview / Student Details pill tabs — the label
                            itself now reflects whichever side is active, and the
                            switch on the right (same icon-only track as
                            CampusStaffroom's Staffroom/DMs switch) is what
                            actually changes it. Get List sits at the very end.
                            marginBottom:6 matches ManageSectionHeader's own
                            internal spacing exactly (its row has the same
                            marginBottom:6 before whatever content follows). */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 }}>
                            {attOverallRightTab === 'class'
                                ? <Users size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />
                                : <User size={16} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -3 } : undefined} />}
                            <Text style={[styles.cardHeaderText, { color: theme.text }]}>
                                {attOverallRightTab === 'class' ? 'Class Overview' : attSelectedOverallStudent ? 'Student Details' : `Students (${sortedOverallStudents.length})`}
                            </Text>
                            {attOverallRightTab === 'student' && !attSelectedOverallStudent && (
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={() => Alert.alert('Get List', 'Export attendance report', [
                                        { text: 'All Months', onPress: () => handleAttGetList('all') },
                                        { text: 'Current Month', onPress: () => handleAttGetList('current') },
                                        { text: 'Cancel', style: 'cancel' },
                                    ])}>
                                    <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.attGetListBtn}>
                                        <Download size={12} color="#fff" />
                                    </LinearGradient>
                                </TouchableOpacity>
                            )}
                            <View style={{ flex: 1 }} />
                            <View style={[styles.manageSegTrack, { backgroundColor: trackBg }]}>
                                <TouchableOpacity onPress={() => setAttOverallRightTab('class')}
                                    style={[styles.manageSegBtn, attOverallRightTab === 'class' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                    <Users size={12} color={attOverallRightTab === 'class' ? theme.text : theme.subText} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setAttOverallRightTab('student')}
                                    style={[styles.manageSegBtn, attOverallRightTab === 'student' && { backgroundColor: isDark ? '#000000' : '#FFFFFF', ...styles.manageSegBtnActiveShadow }]}>
                                    <User size={12} color={attOverallRightTab === 'student' ? theme.text : theme.subText} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* marginHorizontal:-10 on the ScrollView itself widens
                            its own frame (its clipping bounds on iOS) 10px
                            past the cards on each side, and the matching
                            paddingHorizontal:10 on contentContainerStyle pulls
                            the cards back to their original position/width —
                            net zero visual change to the cards, but now the
                            cardShadowWrap shadow (radius:18, offset height:8)
                            has real room to blur into before it hits the
                            ScrollView's clip edge, instead of being
                            hard-clipped flush against the card into what read
                            as a left/right/bottom border. */}
                        {/* marginHorizontal:-10 on the ScrollView itself widens
                            its own frame (its clipping bounds on iOS) 10px
                            past the cards on each side, and the matching
                            paddingHorizontal:10 on contentContainerStyle pulls
                            the cards back to their original position/width —
                            net zero visual change to the cards, but now the
                            cardShadowWrap shadow (radius:18, offset height:8)
                            has real room to blur into before it hits the
                            ScrollView's clip edge, instead of being
                            hard-clipped flush against the card into what read
                            as a left/right/bottom border. */}
                        {/* Class/list and the student detail each get their own
                            ScrollView, and the slide wrapper belongs to the
                            detail alone — exactly how Manage is built. Sharing
                            one wrapper between list and detail can't work: it
                            has to sit at 0 for the list and off-screen for a
                            closed detail, and whichever one loses that fight
                            either vanishes or flashes back in for a frame.
                            The wrapper also has to be *outside* the ScrollView,
                            since Android clips scroll children and would clip
                            the panel away mid-slide instead of moving it. */}
                        {!(attOverallRightTab === 'student' && attSelectedOverallStudent) ? (
                        <ScrollView style={{ flex: 1, marginHorizontal: -10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 10, paddingHorizontal: 10, paddingBottom: 30 }}>
                            {attOverallRightTab === 'class' ? (
                                <Fragment key="att-overall-class">
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attClassStats?.overallPct ?? null) }}>{attClassStats?.overallPct != null ? `${attClassStats.overallPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Class Overall</Text>
                                        </View>
                                        <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
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
                                </Fragment>
                            ) : (
                                // Manage-style student list — same row layout as the
                                // Manage tab's roster (avatar/name/roll no), just with
                                // this page's own overall% on the right instead of
                                // Manage's rank/leaderboard columns. Tapping a row opens
                                // the detail page below (stat boxes + the 3 cards).
                                sortedOverallStudents.length === 0 ? (
                                    <View key="att-overall-empty" style={styles.centerFill}>
                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic' }}>No students yet</Text>
                                    </View>
                                ) : (
                                    // Plain View (no gap) so the ScrollView's own
                                    // gap:10 — meant for spacing between the class-tab's
                                    // stat boxes/cards — doesn't also land between every
                                    // row here; Manage's list relies on each row's own
                                    // borderBottom for separation, not an extra gap.
                                    <View key="att-overall-list" style={{ marginTop: -4 }}>
                                        {sortedOverallStudents.map((s) => (
                                            <TouchableOpacity key={s.studentId} onPress={() => setAttOverallSelectedId(s.studentId)} activeOpacity={0.7}
                                                style={[styles.manageStudentRow, { paddingHorizontal: 0, borderBottomColor: theme.cardBorder }]}>
                                                <View style={[styles.avatarSm, { width: 42, height: 42, borderRadius: 14, backgroundColor: s.avatarUrl ? 'transparent' : getAvatarColor(s.name) }]}>
                                                    {s.avatarUrl
                                                        ? <Image source={{ uri: s.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                        : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(s.name)}</Text>}
                                                </View>
                                                <View style={{ flex: 1, gap: 2 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{s.name}</Text>
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll {s.rollNo || '—'}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(s.overallPct) }}>{s.overallPct != null ? `${s.overallPct}%` : '—'}</Text>
                                                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>overall</Text>
                                                    </View>
                                                    <View style={{ width: StyleSheet.hairlineWidth, height: 22, backgroundColor: theme.cardBorder }} />
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(s.currentMonthPct) }}>{s.currentMonthPct != null ? `${s.currentMonthPct}%` : '—'}</Text>
                                                        <Text style={{ fontSize: 8, fontFamily: 'Poppins_400Regular', color: theme.muted }}>this month</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )
                            )}
                        </ScrollView>
                        ) : (
                        <Animated.View style={{ flex: 1, transform: [{ translateX: attDetailSlideX }] }}>
                        <ScrollView style={{ flex: 1, marginHorizontal: -10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 10, paddingHorizontal: 10, paddingBottom: 30 }}>
                                <Fragment key="att-overall-student">
                                    <TouchableOpacity onPress={closeAttOverallDetail} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Platform.OS === 'android' ? 4 : 0 }}>
                                        <View style={[styles.manageBackBtn, { borderColor: theme.cardBorder }, Platform.OS === 'android' ? { marginTop: -2 } : undefined]}>
                                            <ArrowLeft size={15} color={theme.text} />
                                        </View>
                                        <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>{attSelectedOverallStudent.name}</Text>
                                    </TouchableOpacity>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(attSelectedOverallStudent.overallPct) }}>{attSelectedOverallStudent.overallPct != null ? `${attSelectedOverallStudent.overallPct}%` : '—'}</Text>
                                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Overall</Text>
                                        </View>
                                        <View style={[styles.manageStatBox, { minWidth: 0, borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
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
                                            <View style={[styles.cardHeader, { borderBottomColor: theme.cardBorder, backgroundColor: theme.card, justifyContent: 'space-between' }]}>
                                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: theme.muted, textTransform: 'uppercase' }}>Attendance Sheet</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }} numberOfLines={1}>{attSelectedOverallStudent.name}</Text>
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>Roll No. {attSelectedOverallStudent.rollNo || '—'}</Text>
                                                </View>
                                            </View>
                                            {attLoadingStudentRec || attStudentRecordsFor !== attSelectedOverallStudent.studentId ? (
                                                <View style={{ paddingVertical: 24 }}><ActivityIndicator color={theme.purple} /></View>
                                            ) : (
                                                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                                                    <View>
                                                        <View style={{ flexDirection: 'row' }}>
                                                            <Text style={[styles.attGridHeadCell, { width: 40 }]}>Mo</Text>
                                                            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                                                <Text key={d} style={[styles.attGridHeadCell, { width: Platform.OS === 'android' ? 26 : 24 }]}>{d}</Text>
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
                                                                            // Web shows the holiday's name on hover (title=);
                                                                            // there's no hover on mobile, so tapping the ×
                                                                            // cell shows the same name in an Alert instead.
                                                                            // (Ruled out as the cause of Android's first-swipe
                                                                            // problem on this grid — making every cell a plain
                                                                            // View changed nothing.)
                                                                            <TouchableOpacity key={d} disabled={!isHol} activeOpacity={isHol ? 0.6 : 1}
                                                                                onPress={() => { if (isHol) Alert.alert('Holiday', attHolidays[dk] || 'Holiday'); }}
                                                                                style={[styles.attGridDayCell, { width: Platform.OS === 'android' ? 26 : 24, backgroundColor: isOut ? '#ECF3D0' : isSun || isHol ? '#FFF0F0' : 'transparent' }]}>
                                                                                {isOut ? <Text style={{ fontSize: 9, color: '#BACE85' }}>·</Text>
                                                                                    : isHol ? <Text style={{ fontSize: 10, color: '#FCA5A5' }}>×</Text>
                                                                                        : status ? (
                                                                                            // Same Patrick Hand + text-shadow-stroke trick as the
                                                                                            // main Sheet grid's P/A/L cells, not a bold sans.
                                                                                            <Text style={{
                                                                                                fontFamily: 'PatrickHand_400Regular', fontSize: Platform.OS === 'ios' ? 15 : 14, fontWeight: '700',
                                                                                                textShadowColor: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                                                                textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0,
                                                                                                color: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                                                            }}>{status}</Text>
                                                                                        )
                                                                                            : <Text style={{ fontSize: 9, color: '#BACE85' }}>—</Text>}
                                                                            </TouchableOpacity>
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
                                </Fragment>
                        </ScrollView>
                        </Animated.View>
                        )}
                    </View>
                ) : attSubTab === 'sheet' ? (
                    <View style={{ flex: 1, gap: 8, marginHorizontal: -8 }}>
                        {/* Month chips — same order as web's academic year (Jun→May).
                            Explicit height + flexGrow:0 pins this to the chip's own
                            26px height so it can't stretch to fill any of the
                            parent's flex:1 space (which would otherwise show up as a
                            big empty gap above the grid card below it). */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{ flexGrow: 0, height: 26 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
                            {[5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4].map((mIdx) => {
                                const active = attSheetMonth === mIdx;
                                const hasSelectedDate = attSelectedDate.getMonth() === mIdx;
                                return (
                                    <TouchableOpacity key={mIdx} onPress={() => setAttSheetMonth(mIdx)}
                                        style={[styles.attMonthChip, { backgroundColor: active ? theme.purple : trackBg }]}>
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : theme.subText }}>{ATT_MONTHS[mIdx].slice(0, 3)}</Text>
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
                                {/* Header — mirrors web's AttendanceSheet panel header
                                    (title + academic year + Export button). */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder }}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <CalendarDays size={13} color={theme.text} style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />
                                            <Text
                                                style={{ flexShrink: 1, fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: theme.text, includeFontPadding: false, marginTop: Platform.OS === 'ios' ? 3 : 0 }}
                                                numberOfLines={1}
                                            >
                                                {division?.name ?? ''} Attendance Sheet
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 10, lineHeight: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, marginLeft: 19, marginTop: 2, includeFontPadding: false }}>
                                            Academic Year {attStartYear}–{String(attStartYear + 1).slice(2)} · {ATT_MONTHS[attSheetMonth]}
                                        </Text>
                                    </View>

                                    {/* Export button + dropdown — same two options as web
                                        ("This Month" / "Select Months"), same function: a
                                        real .xlsx workbook built client-side with the xlsx
                                        (SheetJS) library, written to a local file, then
                                        handed to the OS share sheet (expo-sharing) — RN has
                                        no browser download, so the share sheet is the mobile
                                        equivalent of web's automatic file download. */}
                                    <TouchableOpacity onPress={() => setAttShowExportMenu((v) => !v)} disabled={attExporting} activeOpacity={0.85} style={{ opacity: attExporting ? 0.6 : 1 }}>
                                        <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 8 }}>
                                            {attExporting ? <ActivityIndicator size="small" color="#fff" /> : (
                                                <>
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>⬇ Export</Text>
                                                    <ChevronDown size={11} color="#fff" />
                                                </>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>

                                {/* Export dropdown menu */}
                                <Modal visible={attShowExportMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttShowExportMenu(false)}>
                                    <Pressable style={[styles.timetableOverlay, { backgroundColor: 'transparent' }]} onPress={() => setAttShowExportMenu(false)}>
                                        {/* width:'100%' is load-bearing — timetableOverlay's
                                            alignItems:'center' otherwise shrinks this to its
                                            content width and centers it, which throws off the
                                            right:20 below (menu opened on the left instead of
                                            under the Export button). */}
                                        <View style={{ flex: 1, width: '100%' }}>
                                            <Pressable onPress={(e) => e.stopPropagation()}
                                                style={{ position: 'absolute', top: Platform.OS === 'ios' ? 290 : 280, right: 20, width: 200, borderRadius: 14, paddingVertical: 4, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder }}>
                                                <TouchableOpacity onPress={handleAttExportThisMonth} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                                                    <Text style={{ fontSize: 14 }}>📅</Text>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>This Month ({ATT_MONTHS[attSheetMonth]})</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setAttShowExportMenu(false); setAttShowMonthSelector(true); setAttSelectedExportMonths([]); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                                                    <Text style={{ fontSize: 14 }}>🗓️</Text>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>Select Months</Text>
                                                </TouchableOpacity>
                                            </Pressable>
                                        </View>
                                    </Pressable>
                                </Modal>

                                {/* Month selector modal — pick multiple months to export
                                    into one workbook (one sheet per month), same as web. */}
                                <Modal visible={attShowMonthSelector} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAttShowMonthSelector(false)}>
                                    <Pressable style={styles.timetableOverlay} onPress={() => setAttShowMonthSelector(false)}>
                                        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '86%', maxWidth: 340, borderRadius: 18, padding: 18, backgroundColor: theme.card }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                                <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: theme.text }}>🗓️ Select Months to Export</Text>
                                                <TouchableOpacity onPress={() => setAttShowMonthSelector(false)} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: trackBg }}>
                                                    <X size={13} color={theme.subText} />
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                                {ATT_SHEET_MONTHS_ORDER.map((m) => {
                                                    const checked = attSelectedExportMonths.includes(m.key);
                                                    return (
                                                        <TouchableOpacity key={m.key}
                                                            onPress={() => setAttSelectedExportMonths((prev) => prev.includes(m.key) ? prev.filter((k) => k !== m.key) : [...prev, m.key])}
                                                            style={{
                                                                width: '30%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
                                                                borderColor: checked ? theme.purple : theme.cardBorder, backgroundColor: checked ? (theme as { purpleLight?: string }).purpleLight : 'transparent',
                                                            }}>
                                                            <View style={{ width: 14, height: 14, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: checked ? theme.purple : theme.subText, backgroundColor: checked ? theme.purple : 'transparent' }}>
                                                                {checked && <Text style={{ fontSize: 8, fontFamily: 'Poppins_800ExtraBold', color: '#fff' }}>✓</Text>}
                                                            </View>
                                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: checked ? theme.purple : theme.subText }}>{m.short}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                                <TouchableOpacity onPress={() => setAttSelectedExportMonths(ATT_SHEET_MONTHS_ORDER.map((m) => m.key))}
                                                    style={{ flex: 1, height: 30, borderRadius: 9, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Select All</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => setAttSelectedExportMonths([])}
                                                    style={{ flex: 1, height: 30, borderRadius: 9, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Clear</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity onPress={handleAttExportSelectedMonths} disabled={attSelectedExportMonths.length === 0} activeOpacity={0.85}
                                                style={{ opacity: attSelectedExportMonths.length === 0 ? 0.4 : 1 }}>
                                                <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                                    style={{ height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>
                                                        ⬇ Download {attSelectedExportMonths.length > 0 ? `(${attSelectedExportMonths.length} month${attSelectedExportMonths.length > 1 ? 's' : ''})` : ''}
                                                    </Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </Pressable>
                                    </Pressable>
                                </Modal>
                                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                                    <View>
                                        <View style={{ flexDirection: 'row' }}>
                                            <Text style={[styles.attGridHeadCell, { width: 58 }]}>Roll No.</Text>
                                            <Text style={[styles.attGridHeadCell, { width: 130, textAlign: 'left' }]}>Name</Text>
                                            {Array.from({ length: new Date(attSheetYear, attSheetMonth + 1, 0).getDate() }, (_, i) => i + 1).map((d) => {
                                                const dk = attMakeDateKey(attSheetYear, attSheetMonth, d);
                                                const isSel = d === attSelectedDate.getDate() && attSheetMonth === attSelectedDate.getMonth() && attSheetYear === attSelectedDate.getFullYear();
                                                const weekend = new Date(attSheetYear, attSheetMonth, d).getDay() === 0;
                                                const isHol = !!attHolidays[dk];
                                                return (
                                                    <TouchableOpacity key={d} onPress={() => setAttHeaderPopupDate(d)}
                                                        style={[styles.attGridDateHead, { backgroundColor: isHol || weekend ? '#FFE4E4' : isSel ? '#DCEAFE' : '#ECF3D0' }]}>
                                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: isHol || weekend ? '#EF4444' : '#2A3A10' }}>{d}</Text>
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
                                            {/* position:relative wrapper lets the holiday-column
                                                overlays below be absolutely positioned across every
                                                row at once — RN has no <td rowSpan>, so instead of
                                                web's single merged cell per holiday date, each
                                                holiday date gets one tall vertical-text overlay
                                                drawn on top of that column's (now-blank) per-row
                                                cells, visually the same "Holiday" running top-to-
                                                bottom the full height of the table. */}
                                            <View style={{ position: 'relative' }}>
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
                                                            <Text style={[styles.attGridCell, { width: 58, fontFamily: 'Poppins_700Bold' }]}>{student.rollNo || '—'}</Text>
                                                            <Text style={[styles.attGridCell, { width: 130, textAlign: 'left', paddingHorizontal: 6 }]} numberOfLines={1}>{student.name}</Text>
                                                            {dayCells.map(({ d, dk, status, isHol, weekend }) => (
                                                                <View key={d} style={[styles.attGridDayCell, { backgroundColor: isHol ? '#FEF2F2' : weekend ? '#FFF5F5' : dk === attCurrentDk ? '#EEF4FF' : 'transparent' }]}>
                                                                    {isHol ? null : status ? (
                                                                    // Matches web's Sheet cell exactly (Patrick Hand
                                                                    // handwriting font, not a bold sans) — same trick
                                                                    // the student-facing AttendanceSheet.tsx already
                                                                    // uses: a matching-color text-shadow offset fakes
                                                                    // a bolder stroke since Patrick Hand only ships a
                                                                    // 400 weight.
                                                                    <Text style={{
                                                                        fontFamily: 'PatrickHand_400Regular', fontSize: Platform.OS === 'ios' ? 15 : 14, fontWeight: '700',
                                                                        textShadowColor: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                                        textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0,
                                                                        color: status === 'P' ? '#16a34a' : status === 'A' ? '#dc2626' : '#d97706',
                                                                    }}>{status}</Text>
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

                                                {/* Holiday column overlays — one tall vertical-text
                                                    label per holiday date, drawn on top of that
                                                    column's now-blank per-row cells, spanning every
                                                    row (mirrors web's single rowSpan-merged cell). */}
                                                {Array.from({ length: new Date(attSheetYear, attSheetMonth + 1, 0).getDate() }, (_, i) => i + 1)
                                                    .filter((d) => !!attHolidays[attMakeDateKey(attSheetYear, attSheetMonth, d)])
                                                    .map((d) => {
                                                        const dk = attMakeDateKey(attSheetYear, attSheetMonth, d);
                                                        const label = attHolidays[dk] ? `Holiday — ${attHolidays[dk]}` : 'Holiday';
                                                        return (
                                                            <View key={d} pointerEvents="none" style={{
                                                                position: 'absolute', top: 0, bottom: 0, left: 58 + 130 + 26 * (d - 1), width: 26,
                                                                backgroundColor: '#FEF2F2', borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth,
                                                                borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                                            }}>
                                                                <Text numberOfLines={1} style={{
                                                                    width: Math.max(200, sortedAttStudents.length * 42),
                                                                    textAlign: 'center', color: '#EF4444', fontWeight: '700', fontSize: 10.5, letterSpacing: 0.5,
                                                                    fontFamily: 'Poppins_600SemiBold', transform: [{ rotate: '-90deg' }],
                                                                }}>{label}</Text>
                                                            </View>
                                                        );
                                                    })}
                                            </View>
                                        </ScrollView>
                                    </View>
                                </ScrollView>
                            </View>
                        </View>

                        {/* Legend — same Patrick Hand + text-shadow-stroke trick as
                            the grid cells above and as the student-facing
                            AttendanceSheet.tsx's own footer legend. */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {[{ l: 'P', c: '#16A34A', t: 'Present' }, { l: 'A', c: '#DC2626', t: 'Absent' }, { l: 'L', c: '#D97706', t: 'Late' }].map((it) => (
                                <View key={it.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{
                                        fontFamily: 'PatrickHand_400Regular', fontSize: Platform.OS === 'ios' ? 18 : 17, fontWeight: '700', lineHeight: Platform.OS === 'ios' ? 18 : 17,
                                        textShadowColor: it.c, textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0,
                                        color: it.c,
                                    }}>{it.l}</Text>
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{it.t}</Text>
                                </View>
                            ))}
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: theme.muted, fontStyle: 'italic', marginLeft: 'auto' }}>Tap a date for options</Text>
                        </View>
                    </View>
                ) : (
                    <>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => setAttShowDatePicker(true)}
                                style={[styles.attDateBtn, { borderColor: attIsHoliday || attIsSunday ? '#FCA5A5' : theme.cardBorder, backgroundColor: attIsHoliday || attIsSunday ? (isDark ? '#450A0A' : '#FEF2F2') : theme.card }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <CalendarDays size={13} color={attIsHoliday || attIsSunday ? '#EF4444' : theme.subText} />
                                    <Text
                                        style={{ flex: 1, fontSize: 12, lineHeight: 14, fontFamily: 'Poppins_600SemiBold', color: attIsHoliday || attIsSunday ? '#EF4444' : theme.text, includeFontPadding: false }}
                                    >{attFormatDate(attSelectedDate)}</Text>
                                    <ChevronDown size={12} color={theme.subText} />
                                </View>
                                <Text
                                    style={{
                                        fontSize: 9.5, lineHeight: 11, fontFamily: 'Poppins_400Regular',
                                        color: attIsHoliday || attIsSunday ? '#EF4444' : theme.muted,
                                        marginLeft: 19, includeFontPadding: false,
                                        marginTop: 2,
                                    }}
                                >
                                    {attIsHoliday ? `🏖️ ${attHolidays[attCurrentDk]}` : attIsSunday ? '🔴 Sunday' : attSelectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={attMarkAllPresent} disabled={attIsHoliday || attIsSunday || attStudents.length === 0}
                                style={[styles.attAllPBtn, {
                                    backgroundColor: isDark ? '#052E16' : '#D1FAE5',
                                    borderColor: isDark ? '#065F46' : '#6EE7B7',
                                    opacity: (attIsHoliday || attIsSunday || attStudents.length === 0) ? 0.4 : 1,
                                }]}>
                                <CheckCircle2 size={12} color={isDark ? '#6EE7B7' : '#047857'} />
                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: isDark ? '#6EE7B7' : '#047857' }}>All P</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setAttVoiceOpen(true)} disabled={attIsHoliday || attIsSunday || attStudents.length === 0 || isHistoricalYear}
                                style={[styles.attAllPBtn, {
                                    backgroundColor: isDark ? '#2D1F50' : '#EDE9FE',
                                    borderColor: theme.purple,
                                    opacity: (attIsHoliday || attIsSunday || attStudents.length === 0 || isHistoricalYear) ? 0.4 : 1,
                                }]}>
                                <Mic size={12} color={theme.purple} />
                                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Voice</Text>
                            </TouchableOpacity>
                            {/* Zero-size absolute wrapper so the Modal host never counts as a flex/gap child of this row. */}
                            <View pointerEvents="box-none" style={{ position: 'absolute', width: 0, height: 0 }}>
                                <VoiceAttendanceSheet
                                    visible={attVoiceOpen}
                                    onClose={() => setAttVoiceOpen(false)}
                                    students={attStudents.map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo }))}
                                    theme={theme}
                                    isDark={isDark}
                                    onApply={attApplyVoice}
                                />
                            </View>

                            {/* Class Overall / This Month — mirrors the header stats on
                                qubeex-web's DivisionClassPageClient (value on top, label
                                below, right-aligned pair). flex:1 + minWidth:0 (instead of
                                a fixed-content marginLeft:'auto' block) lets this shrink
                                into whatever room is left rather than overflowing past the
                                screen edge — Android's default font metrics render this
                                combo of fonts a bit wider than iOS, which was pushing
                                "This Month" off-screen there specifically. */}
                            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                                {[
                                    { label: 'Class Overall', value: attClassStats?.overallPct ?? null },
                                    { label: 'This Month', value: attClassStats?.currentMonthPct ?? null },
                                ].map(({ label, value }) => (
                                    <View key={label} style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                                        <Text allowFontScaling={false} style={{ fontSize: 15, fontFamily: 'Poppins_800ExtraBold', color: attPctColor(value), lineHeight: 18 }}>
                                            {value != null ? `${value}%` : '—'}
                                        </Text>
                                        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                                            style={{ fontSize: 9, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{label}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={[styles.attRemarkBox, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
                            <MessageSquare size={12} color={theme.muted} />
                            <TextInput
                                value={attGlobalRemark}
                                onChangeText={(v) => { setAttGlobalRemark(v); setAttDateRemarks((p) => ({ ...p, [attCurrentDk]: v })); }}
                                placeholder="Remark for this day..." placeholderTextColor={theme.muted}
                                textAlignVertical="center"
                                style={{ includeFontPadding: false, flex: 1, height: '100%', fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text, paddingVertical: 0 }}
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
                                                            <View style={[styles.avatarSm, { width: 38, height: 38, borderRadius: 12, backgroundColor: student.avatarUrl ? 'transparent' : getAvatarColor(student.name) }]}>
                                                                {student.avatarUrl
                                                                    ? <Image source={{ uri: student.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                                                                    : <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{getInitials(student.name)}</Text>}
                                                            </View>
                                                        </TouchableOpacity>
                                                        <View style={{ flex: 1 }}>
                                                            <Text
                                                                style={{ fontSize: 11.5, lineHeight: 14, fontFamily: 'Poppins_600SemiBold', color: theme.text, includeFontPadding: false }}
                                                                numberOfLines={1}
                                                            >{student.name}</Text>
                                                            <Text
                                                                style={{ fontSize: 9.5, lineHeight: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, includeFontPadding: false }}
                                                            >Roll {student.rollNo || '—'}</Text>
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
                                                                style={{ includeFontPadding: false,
                                                                    paddingHorizontal: 10,
                                                                    paddingVertical: Platform.OS === 'android' ? 5 : 7,
                                                                    borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder, backgroundColor: theme.bg,
                                                                    fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.text,
                                                                }}
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
                                    activeOpacity={0.85}
                                    style={{ opacity: (attSaveStatus === 'saving' || attStudents.length === 0 || !attHasAnyMarked) ? 0.4 : 1 }}>
                                    <LinearGradient
                                        colors={attSaveStatus === 'saved' ? ['#10B981', '#10B981'] : ['#E8876A', '#DA7756', '#C06040']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.attSaveBtn}
                                    >
                                        {attSaveStatus === 'saving' ? <ActivityIndicator size="small" color="#fff" /> : attSaveStatus === 'saved' ? <CheckCircle2 size={12} color="#fff" style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} /> : <Save size={12} color="#fff" style={Platform.OS === 'android' ? { marginTop: -2 } : undefined} />}
                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{attSaveStatus === 'saving' ? 'Saving…' : attSaveStatus === 'saved' ? 'Saved' : 'Save'}</Text>
                                    </LinearGradient>
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
        attShowExportMenu, attShowMonthSelector, attSelectedExportMonths, attExporting, handleAttExportThisMonth, handleAttExportSelectedMonths,
        attOverallStudents, attClassStats, attOverallSelectedId, attOverallRightTab, attShortTab, attStudentRecords, attLoadingStudentRec,
        attSelectedOverallStudent, sortedOverallStudents, ATT_SHEET_MONTHS_ORDER, handleAttGetList, attStartYear, attDetailSlideX,
        closeAttOverallDetail, attStudentRecordsFor, attVoiceOpen, attApplyVoice, isHistoricalYear,
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
                        restrictToSubjectId={isClassTeacher ? null : subjectId ?? null}
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
                        <LiveTimetable
                            role="teacher"
                            divisionId={divisionId}
                            academicYearId={!ayIsCurrent ? aySelectedYearId : null}
                            theme={theme}
                            isDark={isDark}
                            fallback={
                                <>
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
                                </>
                            }
                        />
                    </View>
                    </View>

                    {/* Academic Calendar */}
                    <ClassCalendar divisionId={divisionId} divisionName={division.name} isClassTeacher={isClassTeacher} isSubjectTeacher={!isClassTeacher} />

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
    }, [feedKbPad, theme, classTeacherAssignment, isClassTeacher, divisionId, division, leaderTab, isDark, accent, top5, podium, pctFor, uploadingTimetable, pickTimetable, timetableImage, uploadingResult, handleUploadResult, materials, results, renderFeedItemRow, subjectId]);


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
                    onPress={() => {
                        if (manageSelectedStudent) {
                            // The topbar's own back button should leave the class
                            // screen outright, not close the Manage detail first
                            // the way hardware back / hardware-back-equivalent does
                            // — suppress the usePreventRemove guard for this one
                            // dispatch (see manageBackGuardSuppressed below).
                            setManageBackGuardSuppressed(true);
                            requestAnimationFrame(() => router.back());
                            return;
                        }
                        router.back();
                    }}
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
                        <Text style={[styles.headerSub, { color: theme.subText, flexShrink: 0 }]}>{division.standard.name}</Text>
                        <ChevronRight size={9} color={theme.subText} />
                        <Text style={[styles.headerSub, { color: theme.subText, flexShrink: 0 }]}>{division.name}</Text>
                        {isClassTeacher ? (
                            <View style={[styles.roleBadge, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7', flexShrink: 1 }]}>
                                <Text style={[styles.roleBadgeText, { color: isDark ? '#FCD34D' : '#B45309' }]} numberOfLines={1} ellipsizeMode="tail">Class Teacher</Text>
                            </View>
                        ) : (
                            // A long subject name (e.g. "Mathematics 2") pushed this
                            // badge's text past the topbar's flex:1 title column and
                            // it overlapped the theme-toggle button, since RN doesn't
                            // clip a Text that overflows its box by default —
                            // flexShrink lets the badge give up width first, and
                            // numberOfLines+ellipsizeMode truncate the subject name
                            // with "…" instead of overlapping the button behind it.
                            <View style={[styles.roleBadge, { backgroundColor: accent.purpleLight, flexShrink: 1 }]}>
                                <Text style={[styles.roleBadgeText, { color: accent.purple }]} numberOfLines={1} ellipsizeMode="tail">Subject Teacher{restrictSubjectName ? ` · ${restrictSubjectName}` : ''}</Text>
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

            {(activeTab === 'attendance' || activeTab === 'marks' || activeTab === 'fees') && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
                    <AcademicYearPicker years={ayYears} selectedYearId={aySelectedYearId} onSelect={setAySelectedYearId} loading={ayLoading} />
                    <HistoricalYearBanner visible={isHistoricalYear} label={aySelectedYear?.label} />
                </View>
            )}

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
                            : tabDef.key === 'marks' ? marksPageContent
                            : tabDef.key === 'fees' ? feesPageContent
                            : tabDef.key === 'students' ? studentsPageContent
                            : tabDef.key === 'tasks' ? tasksPageContent
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

            {/* Marksheet — Graded Subject grade-entry modal. Class-teacher
                only; a subject teacher sees these cells but can't open this
                modal (per confirmed scope: "Sirf dikhe, edit na ho"). */}
            <Modal visible={!!marksGradeModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMarksGradeModal(null)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setMarksGradeModal(null)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '86%', maxWidth: 340, backgroundColor: theme.card, borderRadius: 16, padding: 16, gap: 12 }}>
                        <View>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>
                                {marksGradeModal?.gsName} — {marksGradeModal?.term === 't1' ? 'Term 1' : 'Term 2'}
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginTop: 2 }} numberOfLines={1}>
                                {marksGradeModal?.stName}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {marksValidGrades.map((g) => {
                                const active = marksGradeDraft === g;
                                return (
                                    <TouchableOpacity key={g} onPress={() => setMarksGradeDraft(g)}
                                        style={{
                                            width: 44, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: active ? theme.purple : (isDark ? '#000' : '#F3EEE6'),
                                            borderWidth: 1, borderColor: active ? theme.purple : theme.cardBorder,
                                        }}>
                                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : theme.text }}>{g}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity onPress={() => setMarksGradeModal(null)} style={{ flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.cardBorder }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    if (marksGradeModal) {
                                        handleMarksGradeChange(marksGradeModal.gsId, marksGradeModal.stId, marksGradeModal.term, marksGradeDraft || null);
                                    }
                                    setMarksGradeModal(null);
                                }}
                                activeOpacity={0.85} style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
                                <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Save</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Marksheet — Offline exam-mark score-entry modal. A subject
                teacher's own subject column only, matching web's per-subject
                marks entry. */}
            <Modal visible={!!marksScoreModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMarksScoreModal(null)}>
                <Pressable style={styles.timetableOverlay} onPress={() => setMarksScoreModal(null)}>
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '86%', maxWidth: 340, backgroundColor: theme.card, borderRadius: 16, padding: 16, gap: 12 }}>
                        <View>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text }} numberOfLines={1}>
                                {marksScoreModal?.examName} <Text style={{ color: theme.muted }}>(/{marksScoreModal?.maxMarks})</Text>
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginTop: 2 }} numberOfLines={1}>
                                {marksScoreModal?.stName}
                            </Text>
                        </View>
                        <TextInput
                            value={marksScoreDraft}
                            onChangeText={(t) => setMarksScoreDraft(t.replace(/[^0-9.]/g, ''))}
                            keyboardType="numeric"
                            placeholder="Enter marks"
                            placeholderTextColor={theme.muted}
                            style={{
                                height: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.cardBorder,
                                paddingHorizontal: 12, fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: theme.text,
                                includeFontPadding: false, textAlignVertical: 'center',
                            }}
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                            <TouchableOpacity onPress={() => setMarksScoreModal(null)} style={{ flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.cardBorder }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.subText }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    if (marksScoreModal) {
                                        const trimmed = marksScoreDraft.trim();
                                        const parsed = trimmed === '' ? null : Math.min(marksScoreModal.maxMarks, Math.max(0, parseFloat(trimmed)));
                                        handleMarksScoreChange(marksScoreModal.examId, marksScoreModal.stId, parsed !== null && !Number.isNaN(parsed) ? parsed : null);
                                    }
                                    setMarksScoreModal(null);
                                }}
                                activeOpacity={0.85} style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
                                <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Save</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
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
    attDateBtn: { width: '45%', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
    attAllPBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1 },
    attRemarkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
    attRemarkToggle: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    attSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 12, borderRadius: 9 },
    attCalCard: { width: 300, borderRadius: 18, padding: 14 },
    attCalNavBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    // Attendance — Sheet (month grid) + popups.
    attMonthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 8 },
    attMonthChipDot: { width: 4, height: 4, borderRadius: 2 },
    attGridHeadCell: { paddingVertical: 6, paddingHorizontal: 4, textAlign: 'center', fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: '#2A3A10', backgroundColor: '#ECF3D0', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridDateHead: { width: 26, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridRemarkDot: { position: 'absolute', top: 2, right: 2, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#DA7756' },
    attGridCell: { paddingVertical: 8, textAlign: 'center', fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#2A3A10', backgroundColor: '#F5F8EE', borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attGridDayCell: { width: 26, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#BACE85' },
    attPopupCard: { width: 220, borderRadius: 16, padding: 12 },
    // Attendance — Overall (class + student summary).
    attGetListBtn: { width: 34, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    attStudentChip: { paddingHorizontal: 10, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    attPopupRow: { paddingVertical: 9 },
});
