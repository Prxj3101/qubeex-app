import { ScreenHeader } from '@/components/ScreenHeader';
import { useBranding } from '@/context/BrandingContext';
import { useInstitution } from '@/context/InstitutionContext';
import { useTeacher } from '@/context/TeacherContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { unregisterCurrentPushToken } from '@/lib/pushNotifications';
import { colorForSubject } from '@/lib/subjectColors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, BookOpen, Briefcase, Calendar, Camera, Check, ChevronDown, ChevronRight, Edit2, GraduationCap, Hash, Layers, LogOut, Mail, MapPin, Phone, Settings, Sparkles, Tag, User as UserIcon, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface TeacherAssignment {
    id: string;
    level1Id: string;
    level1Name: string;
    level2Id: string;
    level2Name: string;
    level3Name: string;
    subjectColor?: string | null;
    role: 'CLASS_TEACHER' | 'SUBJECT_TEACHER';
}

interface TeacherData {
    id: string;
    teacherId: string;
    avatarUrl: string | null;
    prefix: string | null;
    title: string | null;
    status: string;
    joinedAt: string;
    dob: string | null;
    gender: string | null;
    qualification: string | null;
    experience: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    country: string | null;
    user: { id: string; name: string; email: string };
    assignments: TeacherAssignment[];
}

const AVATAR_COLORS = [
    { bg: '#EDE9FE', text: '#7C3AED' },
    { bg: '#FEF3C7', text: '#B45309' },
    { bg: '#D1FAE5', text: '#047857' },
    { bg: '#E0F2FE', text: '#0369A1' },
    { bg: '#FCE7F3', text: '#BE185D' },
];
function getAvatarColor(id: string) {
    return AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function formatDate(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTokens(n: number, decimals: number = 1): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('en-IN');
}
function formatDob(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return digits;
}

const COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', max: 10 },
    { code: '+1', flag: '🇺🇸', max: 10 },
    { code: '+44', flag: '🇬🇧', max: 10 },
    { code: '+61', flag: '🇦🇺', max: 9 },
    { code: '+971', flag: '🇦🇪', max: 9 },
    { code: '+65', flag: '🇸🇬', max: 8 },
];
function parsePhone(val: string) {
    const match = (val ?? '').match(/^(\+\d+)\s*(.*)$/);
    return match ? { code: match[1], number: match[2] } : { code: '+91', number: val ?? '' };
}

const PREFIX_OPTIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Er.', 'CA', 'Adv.'];
const TITLE_OPTIONS = ['Teacher', 'Professor', 'Asst. Teacher', 'Lecturer', 'HOD', 'Mentor', 'Tutor', 'Educator'];
const GENDER_OPTIONS = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
];

function VerifiedBadge() {
    return (
        <Svg width={13} height={13} viewBox="0 0 40 40">
            <Path
                d="M20 2 L23.5 6.5 L29 5 L31.5 10.5 L37.5 12 L36 18 L40 22 L36 26 L37.5 32 L31.5 33.5 L29 39 L23.5 37.5 L20 42 L16.5 37.5 L11 39 L8.5 33.5 L2.5 32 L4 26 L0 22 L4 18 L2.5 12 L8.5 10.5 L11 5 L16.5 6.5 Z"
                fill="#DA7756"
            />
            <Path
                d="M13 21l5 5 9-10"
                fill="none"
                stroke="white"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export default function TeacherProfileScreen() {
    const { setPhoto: setContextPhoto } = useTeacher();
    const { isDark, accent } = useTheme();
    const router = useRouter();
    const { clearInstitution } = useInstitution();
    const { branding, clearBranding } = useBranding();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const bg = isDark ? '#000000' : '#FAF8FF';
    const redColor = isDark ? '#F87171' : '#EF4444';
    const blueColor = isDark ? '#60A5FA' : '#2563EB';

    const [teacher, setTeacher] = useState<TeacherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [photoExpanded, setPhotoExpanded] = useState(false);
    const fetchedOnce = useRef(false);

    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [titleDraft, setTitleDraft] = useState('Teacher');
    const [titleSaved, setTitleSaved] = useState('Teacher');
    const [prefixDraft, setPrefixDraft] = useState('');
    const [prefixSaved, setPrefixSaved] = useState('');
    const [personalDraft, setPersonalDraft] = useState({ name: '', dob: '', gender: '' });
    const [personalSaved, setPersonalSaved] = useState({ name: '', dob: '', gender: '' });
    const [profDraft, setProfDraft] = useState({ qualification: '', experience: '' });
    const [profSaved, setProfSaved] = useState({ qualification: '', experience: '' });
    const [contactDraft, setContactDraft] = useState({ phone: '', address: '', city: '', state: '', pincode: '', country: '' });
    const [contactSaved, setContactSaved] = useState({ phone: '', address: '', city: '', state: '', pincode: '', country: '' });
    const [phoneCodeOpen, setPhoneCodeOpen] = useState(false);

    const [aiUsage, setAiUsage] = useState<{
        totalTokens: number; institutionPoolLimit: number; institutionPoolUsed: number; poolSharePct: number;
    } | null>(null);
    const [aiUsageLoading, setAiUsageLoading] = useState(true);

    const fetchTeacher = useCallback(async () => {
        try {
            const res = await api.get('/teacher/me');
            const d = res.data.data;
            const assignments: TeacherAssignment[] = (d.assignments ?? []).map((a: any) => ({
                id: a.id,
                level1Id: a.division.standard.id,
                level1Name: a.division.standard.name,
                level2Id: a.subject?.id ?? '',
                level2Name: a.subject?.name ?? '',
                level3Name: a.division.name,
                subjectColor: a.subject?.color ?? null,
                role: a.subject ? 'SUBJECT_TEACHER' : 'CLASS_TEACHER',
            }));
            setTeacher({ ...d, assignments });
            setAvatarUrl(d.avatarUrl ?? null);

            const savedPrefix = d.prefix ?? (d.gender === 'MALE' ? 'Mr.' : d.gender === 'FEMALE' ? 'Ms.' : '');
            setPrefixDraft(savedPrefix); setPrefixSaved(savedPrefix);

            const savedTitle = d.title ?? 'Teacher';
            setTitleDraft(savedTitle); setTitleSaved(savedTitle);

            const personal = { name: d.user?.name ?? '', dob: (d.dob ?? '').slice(0, 10), gender: d.gender ?? '' };
            setPersonalDraft(personal); setPersonalSaved(personal);

            const prof = { qualification: d.qualification ?? '', experience: d.experience ?? '' };
            setProfDraft(prof); setProfSaved(prof);

            const contact = {
                phone: d.phone ?? '', address: d.address ?? '',
                city: d.city ?? '', state: d.state ?? '',
                pincode: d.pincode ?? '', country: d.country ?? '',
            };
            setContactDraft(contact); setContactSaved(contact);
        } catch {
            setTeacher(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const cancelEdit = (section: 'personal' | 'prof' | 'contact') => {
        if (section === 'personal') {
            setPersonalDraft({ ...personalSaved });
            setTitleDraft(titleSaved);
            setPrefixDraft(prefixSaved);
        }
        if (section === 'prof') {
            setProfDraft({ ...profSaved });
        }
        if (section === 'contact') {
            setContactDraft({ ...contactSaved });
        }
        setEditingSection(null);
    };

    const saveEdit = async (section: 'personal' | 'prof' | 'contact') => {
        setSaving(true);
        try {
            if (section === 'personal') {
                await api.patch('/teacher/me', {
                    name: personalDraft.name || undefined,
                    dob: personalDraft.dob || null,
                    gender: personalDraft.gender || null,
                    prefix: prefixDraft || null,
                    title: titleDraft || null,
                });
                setPersonalSaved({ ...personalDraft });
                setTitleSaved(titleDraft);
                setPrefixSaved(prefixDraft);
                if (teacher && personalDraft.name) {
                    setTeacher({ ...teacher, user: { ...teacher.user, name: personalDraft.name }, prefix: prefixDraft || null, title: titleDraft || null });
                }
            }
            if (section === 'prof') {
                await api.patch('/teacher/me', {
                    qualification: profDraft.qualification || null,
                    experience: profDraft.experience || null,
                });
                setProfSaved({ ...profDraft });
                if (teacher) {
                    setTeacher({ ...teacher, qualification: profDraft.qualification || null, experience: profDraft.experience || null });
                }
            }
            if (section === 'contact') {
                await api.patch('/teacher/me', {
                    phone: contactDraft.phone || null,
                    address: contactDraft.address || null,
                    city: contactDraft.city || null,
                    state: contactDraft.state || null,
                    pincode: contactDraft.pincode || null,
                    country: contactDraft.country || null,
                });
                setContactSaved({ ...contactDraft });
                if (teacher) {
                    setTeacher({ ...teacher, ...contactDraft });
                }
            }
            setEditingSection(null);
        } catch {
            // keep editing open on failure
        } finally {
            setSaving(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (!fetchedOnce.current) {
                fetchedOnce.current = true;
                fetchTeacher();
                api.get('/teacher/ai-usage')
                    .then((res) => setAiUsage(res.data.data))
                    .catch(() => setAiUsage(null))
                    .finally(() => setAiUsageLoading(false));
            }
        }, [fetchTeacher])
    );

    const pickPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setUploading(true);
        try {
            const form = new FormData();
            form.append('photo', { uri: asset.uri, name: 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
            const res = await api.post('/teacher/photo', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAvatarUrl(res.data.data.avatarUrl);
            setContextPhoto(res.data.data.avatarUrl);
        } catch {
            // keep old photo on failure
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: bg, paddingTop: Constants.statusBarHeight }]}>
                <ScreenHeader title="My Profile" />
                <View style={styles.loadingBox}>
                    <ActivityIndicator color="#DA7756" />
                </View>
            </View>
        );
    }

    if (!teacher) {
        return (
            <View style={[styles.container, { backgroundColor: bg, paddingTop: Constants.statusBarHeight }]}>
                <ScreenHeader title="My Profile" />
                <View style={styles.loadingBox}>
                    <Text style={{ color: subText, fontFamily: 'Poppins_400Regular' }}>Failed to load profile</Text>
                </View>
            </View>
        );
    }

    const avatarColor = getAvatarColor(teacher.id);

    return (
        <View style={[styles.container, { backgroundColor: bg, paddingTop: Constants.statusBarHeight }]}>
            <ScreenHeader title="My Profile" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Header Card — exact copy of teacher web's My Profile header card */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={styles.topRow}>
                        <TouchableOpacity
                            onPress={() => (avatarUrl ? setPhotoExpanded(true) : !uploading && pickPhoto())}
                            style={[styles.avatarWrap, { backgroundColor: avatarColor.bg }]}
                        >
                            {uploading ? (
                                <ActivityIndicator color={avatarColor.text} />
                            ) : avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                            ) : (
                                <Text style={[styles.avatarInitials, { color: avatarColor.text }]}>
                                    {getInitials(teacher.user.name)}
                                </Text>
                            )}
                            <TouchableOpacity
                                onPress={() => !uploading && pickPhoto()}
                                style={[styles.cameraBadge, { borderColor: isDark ? '#000000' : '#fff' }]}
                            >
                                <Camera size={11} color="#fff" />
                            </TouchableOpacity>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                            <View style={styles.nameStatusRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.nameText, { color: text }]} numberOfLines={1}>
                                        {teacher.prefix ? <Text style={{ color: '#DA7756' }}>{teacher.prefix} </Text> : null}
                                        {teacher.user.name}
                                    </Text>
                                    <View style={styles.titleRow}>
                                        <Text style={[styles.titleText, { color: subText }]}>{teacher.title || 'Teacher'}</Text>
                                        <View style={Platform.OS === 'android' ? { top: -2 } : null}>
                                            <VerifiedBadge />
                                        </View>
                                    </View>
                                    <Text style={styles.teacherIdText}>{teacher.teacherId}</Text>
                                </View>
                                <View style={styles.statusBadge}>
                                    <Text style={styles.statusBadgeText}>
                                        {teacher.status === 'ACTIVE' ? 'Active' : teacher.status}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.statsRow, { borderTopColor: cardBorder }]}>
                        {[
                            { label: 'Assignments', value: String(teacher.assignments.length) },
                            { label: 'Joined', value: formatDate(teacher.joinedAt) },
                            { label: 'Experience', value: teacher.experience || '—' },
                        ].map((s) => (
                            <View key={s.label} style={styles.statItem}>
                                <Text style={[styles.statValue, { color: text }]} numberOfLines={1}>{s.value}</Text>
                                <Text style={[styles.statLabel, { color: subText }]}>{s.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Personal Info — exact copy of teacher web's Personal Info section */}
                <View style={[styles.card, styles.cardNoPad, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                    <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                        <Text style={[styles.sectionTitle, { color: subText }]}>PERSONAL INFO</Text>
                        {editingSection === 'personal' ? (
                            <View style={styles.editBtnRow}>
                                <TouchableOpacity onPress={() => cancelEdit('personal')} style={[styles.pillBtn, { backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9' }]}>
                                    <X size={11} color={subText} />
                                    <Text style={[styles.pillBtnText, { color: subText }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => saveEdit('personal')} disabled={saving} style={[styles.pillBtn, { backgroundColor: '#DA7756' }]}>
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={11} color="#fff" />}
                                    <Text style={[styles.pillBtnText, { color: '#fff' }]}>{saving ? 'Saving…' : 'Save'}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity onPress={() => setEditingSection('personal')} style={[styles.pillBtn, { backgroundColor: accent.purpleLight }]}>
                                <Edit2 size={11} color={accent.purple} />
                                <Text style={[styles.pillBtnText, { color: accent.purple }]}>Edit</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.sectionContent}>
                        {editingSection === 'personal' ? (
                            <>
                                <View style={styles.editRow}>
                                    <Text style={[styles.editLabel, { color: subText }]}>Full Name</Text>
                                    <View style={{ flex: 1, gap: 8 }}>
                                        <View style={styles.chipsWrap}>
                                            {PREFIX_OPTIONS.map((opt) => (
                                                <TouchableOpacity
                                                    key={opt}
                                                    onPress={() => setPrefixDraft((p) => (p === opt ? '' : opt))}
                                                    style={[
                                                        styles.chip,
                                                        { borderColor: isDark ? '#2A2A2A' : '#E2E8F0' },
                                                        prefixDraft === opt && styles.chipActive,
                                                    ]}
                                                >
                                                    <Text style={[styles.chipText, { color: prefixDraft === opt ? '#fff' : subText }]}>{opt}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            {prefixDraft ? (
                                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#DA7756' }}>{prefixDraft}</Text>
                                            ) : null}
                                            <TextInput
                                                value={personalDraft.name}
                                                onChangeText={(v) => setPersonalDraft((d) => ({ ...d, name: v }))}
                                                placeholder="Full name"
                                                placeholderTextColor={subText}
                                                style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                            />
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.editRow}>
                                    <Text style={[styles.editLabel, { color: subText }]}>Date of Birth</Text>
                                    <TextInput
                                        value={personalDraft.dob}
                                        onChangeText={(v) => setPersonalDraft((d) => ({ ...d, dob: formatDob(v) }))}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={subText}
                                        keyboardType="number-pad"
                                        maxLength={10}
                                        style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                    />
                                </View>

                                <View style={styles.editRow}>
                                    <Text style={[styles.editLabel, { color: subText }]}>Gender</Text>
                                    <View style={styles.chipsWrap}>
                                        {GENDER_OPTIONS.map((opt) => (
                                            <TouchableOpacity
                                                key={opt.value}
                                                onPress={() => setPersonalDraft((d) => ({ ...d, gender: opt.value }))}
                                                style={[
                                                    styles.chip,
                                                    { borderColor: isDark ? '#2A2A2A' : '#E2E8F0' },
                                                    personalDraft.gender === opt.value && styles.chipActive,
                                                ]}
                                            >
                                                <Text style={[styles.chipText, { color: personalDraft.gender === opt.value ? '#fff' : subText }]}>{opt.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={[styles.editRow, { borderBottomWidth: 0 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, width: 92 }}>
                                        <Tag size={13} color={subText} />
                                        <Text style={[styles.editLabel, { color: subText, width: undefined, marginTop: 0 }]}>Display Title</Text>
                                    </View>
                                    <View style={styles.chipsWrap}>
                                        {TITLE_OPTIONS.map((opt) => (
                                            <TouchableOpacity
                                                key={opt}
                                                onPress={() => setTitleDraft(opt)}
                                                style={[
                                                    styles.chip,
                                                    { borderColor: isDark ? '#2A2A2A' : '#E2E8F0' },
                                                    titleDraft === opt && styles.chipActive,
                                                ]}
                                            >
                                                <Text style={[styles.chipText, { color: titleDraft === opt ? '#fff' : subText }]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.infoRow}>
                                    <Hash size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Teacher ID</Text>
                                    <Text style={[styles.infoValue, { color: '#DA7756', fontFamily: 'RobotoMono_600SemiBold' }]}>{teacher.teacherId}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <UserIcon size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Full Name</Text>
                                    <Text style={[styles.infoValue, { color: text }]} numberOfLines={1}>
                                        {prefixSaved ? <Text style={{ color: '#DA7756', fontFamily: 'Poppins_600SemiBold' }}>{prefixSaved} </Text> : null}
                                        {personalSaved.name}
                                    </Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Tag size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Display Title</Text>
                                    <View style={[styles.titleBadge, { backgroundColor: isDark ? 'rgba(218,119,86,0.15)' : 'rgba(218,119,86,0.12)' }]}>
                                        <Text style={styles.titleBadgeText}>{titleSaved}</Text>
                                    </View>
                                </View>
                                <View style={styles.infoRow}>
                                    <Calendar size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Date of Birth</Text>
                                    <Text style={[styles.infoValue, { color: text }]}>{formatDate(personalSaved.dob)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <UserIcon size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Gender</Text>
                                    <Text style={[styles.infoValue, { color: text }]}>
                                        {personalSaved.gender === 'MALE' ? 'Male' : personalSaved.gender === 'FEMALE' ? 'Female' : personalSaved.gender || '—'}
                                    </Text>
                                </View>
                                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                    <Calendar size={14} color={subText} />
                                    <Text style={[styles.infoLabel, { color: subText }]}>Joined</Text>
                                    <Text style={[styles.infoValue, { color: text }]}>{formatDate(teacher.joinedAt)}</Text>
                                </View>
                            </>
                        )}
                    </View>
                    </View>
                </View>

                {/* AI Token Usage — same live data + layout as the home overview widget, wrapped in the Personal Info card style */}
                <View style={[styles.card, styles.cardNoPad, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF', minHeight: 50 }]}>
                            <Text style={[styles.sectionTitle, { color: subText }]}>AI TOKEN USAGE</Text>
                        </View>

                        <View style={[styles.sectionContent, { paddingTop: 14 }]}>
                            <View style={{ marginBottom: 12 }}>
                                <View style={styles.rowBetween}>
                                    <Text style={[styles.aiRowLabel, { color: text }]}>Your usage · this month</Text>
                                    <Text style={[styles.aiRowValue, { color: text }]}>
                                        {aiUsageLoading ? '…' : formatTokens(aiUsage?.totalTokens ?? 0)}
                                        <Text style={[styles.aiRowValueMuted, { color: subText }]}> / {aiUsageLoading ? '…' : formatTokens(aiUsage?.institutionPoolLimit ?? 0)} pool</Text>
                                    </Text>
                                </View>
                                <View style={[styles.aiBarTrack, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
                                    <View style={[styles.aiBarFill, { width: `${Math.min(aiUsage?.poolSharePct ?? 0, 100)}%`, backgroundColor: accent.purple }]} />
                                </View>
                                <Text style={[styles.aiSubHint, { color: subText }]}>{aiUsageLoading ? '…' : aiUsage?.poolSharePct ?? 0}% of institution pool</Text>
                            </View>

                            <View style={styles.aiStatRow}>
                                <View style={[styles.aiStatBox, { backgroundColor: isDark ? '#1A1A1A' : '#F8FAFC' }]}>
                                    <Text style={[styles.aiStatValue, { color: text }]}>{aiUsageLoading ? '…' : formatTokens(aiUsage?.totalTokens ?? 0)}</Text>
                                    <Text style={[styles.aiStatLabel, { color: subText }]}>Used</Text>
                                </View>
                                <View style={[styles.aiStatBox, { backgroundColor: isDark ? '#1A1A1A' : '#F8FAFC' }]}>
                                    <Text style={[styles.aiStatValue, { color: text }]}>{aiUsageLoading ? '…' : formatTokens(Math.max(0, (aiUsage?.institutionPoolLimit ?? 0) - (aiUsage?.institutionPoolUsed ?? 0)), 2)}</Text>
                                    <Text style={[styles.aiStatLabel, { color: subText }]}>Remaining</Text>
                                </View>
                                <View style={[styles.aiStatBox, { backgroundColor: accent.purpleLight }]}>
                                    <Text style={[styles.aiStatValue, { color: accent.purple }]}>{aiUsageLoading ? '…' : `${aiUsage?.poolSharePct ?? 0}%`}</Text>
                                    <Text style={[styles.aiStatLabel, { color: subText }]}>Pool share</Text>
                                </View>
                            </View>

                            <View style={[styles.aiPoolBox, { backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', borderColor: cardBorder }]}>
                                <View style={styles.rowBetween}>
                                    <Text style={[styles.aiPoolLabel, { color: subText }]}>Institution pool</Text>
                                    <Text style={[styles.aiPoolValue, { color: text }]}>
                                        {aiUsageLoading ? '…' : formatTokens(aiUsage?.institutionPoolUsed ?? 0)}
                                        <Text style={[styles.aiRowValueMuted, { color: subText }]}> / {aiUsageLoading ? '…' : formatTokens(aiUsage?.institutionPoolLimit ?? 0)} used</Text>
                                    </Text>
                                </View>
                                <View style={[styles.aiBarTrackSm, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
                                    <View style={[styles.aiBarFill, {
                                        width: `${aiUsage?.institutionPoolLimit ? Math.min(100, Math.round((aiUsage.institutionPoolUsed / aiUsage.institutionPoolLimit) * 100)) : 0}%`,
                                        backgroundColor: '#DA7756',
                                    }]} />
                                </View>
                                <Text style={[styles.aiSubHint, { color: subText }]}>Shared across all teachers</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Professional Details — exact copy of teacher web's Professional Details section */}
                <View style={[styles.card, styles.cardNoPad, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <Text style={[styles.sectionTitle, { color: subText }]}>PROFESSIONAL DETAILS</Text>
                            {editingSection === 'prof' ? (
                                <View style={styles.editBtnRow}>
                                    <TouchableOpacity onPress={() => cancelEdit('prof')} style={[styles.pillBtn, { backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9' }]}>
                                        <X size={11} color={subText} />
                                        <Text style={[styles.pillBtnText, { color: subText }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => saveEdit('prof')} disabled={saving} style={[styles.pillBtn, { backgroundColor: '#DA7756' }]}>
                                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={11} color="#fff" />}
                                        <Text style={[styles.pillBtnText, { color: '#fff' }]}>{saving ? 'Saving…' : 'Save'}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity onPress={() => setEditingSection('prof')} style={[styles.pillBtn, { backgroundColor: accent.purpleLight }]}>
                                    <Edit2 size={11} color={accent.purple} />
                                    <Text style={[styles.pillBtnText, { color: accent.purple }]}>Edit</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.sectionContent}>
                            {editingSection === 'prof' ? (
                                <>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Qualification</Text>
                                        <TextInput
                                            value={profDraft.qualification}
                                            onChangeText={(v) => setProfDraft((d) => ({ ...d, qualification: v }))}
                                            placeholder="e.g. B.Ed, M.Sc"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                    <View style={[styles.editRow, { borderBottomWidth: 0 }]}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Experience</Text>
                                        <TextInput
                                            value={profDraft.experience}
                                            onChangeText={(v) => setProfDraft((d) => ({ ...d, experience: v }))}
                                            placeholder="e.g. 5 years"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={styles.infoRow}>
                                        <GraduationCap size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Qualification</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{profSaved.qualification || '—'}</Text>
                                    </View>
                                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                        <Briefcase size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Experience</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{profSaved.experience || '—'}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Contact Details — exact copy of teacher web's Contact Details section */}
                <View style={[styles.card, styles.cardNoPad, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <Text style={[styles.sectionTitle, { color: subText }]}>CONTACT DETAILS</Text>
                            {editingSection === 'contact' ? (
                                <View style={styles.editBtnRow}>
                                    <TouchableOpacity onPress={() => cancelEdit('contact')} style={[styles.pillBtn, { backgroundColor: isDark ? '#2A2A2A' : '#F1F5F9' }]}>
                                        <X size={11} color={subText} />
                                        <Text style={[styles.pillBtnText, { color: subText }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => saveEdit('contact')} disabled={saving} style={[styles.pillBtn, { backgroundColor: '#DA7756' }]}>
                                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={11} color="#fff" />}
                                        <Text style={[styles.pillBtnText, { color: '#fff' }]}>{saving ? 'Saving…' : 'Save'}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity onPress={() => setEditingSection('contact')} style={[styles.pillBtn, { backgroundColor: accent.purpleLight }]}>
                                    <Edit2 size={11} color={accent.purple} />
                                    <Text style={[styles.pillBtnText, { color: accent.purple }]}>Edit</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.sectionContent}>
                            {editingSection === 'contact' ? (
                                <>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Phone</Text>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', gap: 6 }}>
                                                <TouchableOpacity
                                                    onPress={() => setPhoneCodeOpen((v) => !v)}
                                                    style={[styles.phoneCodeBtn, { borderColor: '#DA775680', backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED' }]}
                                                >
                                                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: text }}>
                                                        {COUNTRY_CODES.find((c) => c.code === parsePhone(contactDraft.phone).code)?.flag} {parsePhone(contactDraft.phone).code}
                                                    </Text>
                                                    <ChevronDown size={12} color={subText} />
                                                </TouchableOpacity>
                                                <TextInput
                                                    value={parsePhone(contactDraft.phone).number}
                                                    onChangeText={(t) => {
                                                        const maxDigits = COUNTRY_CODES.find((c) => c.code === parsePhone(contactDraft.phone).code)?.max ?? 10;
                                                        const digits = t.replace(/\D/g, '').slice(0, maxDigits);
                                                        setContactDraft((d) => ({ ...d, phone: `${parsePhone(d.phone).code} ${digits}` }));
                                                    }}
                                                    placeholder="98765 43210"
                                                    keyboardType="number-pad"
                                                    placeholderTextColor={subText}
                                                    style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                                />
                                            </View>
                                            {phoneCodeOpen && (
                                                <View style={[styles.phoneCodeDropdown, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: cardBorder }]}>
                                                    {COUNTRY_CODES.map((c, i) => (
                                                        <TouchableOpacity
                                                            key={c.code}
                                                            onPress={() => {
                                                                setContactDraft((d) => ({ ...d, phone: `${c.code} ${parsePhone(d.phone).number}` }));
                                                                setPhoneCodeOpen(false);
                                                            }}
                                                            style={[styles.phoneCodeOption, i === COUNTRY_CODES.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: cardBorder }]}
                                                        >
                                                            <Text style={{
                                                                fontSize: 12,
                                                                fontFamily: c.code === parsePhone(contactDraft.phone).code ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                                                color: c.code === parsePhone(contactDraft.phone).code ? '#DA7756' : text,
                                                            }}>
                                                                {c.flag} {c.code}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Address</Text>
                                        <TextInput
                                            value={contactDraft.address}
                                            onChangeText={(v) => setContactDraft((d) => ({ ...d, address: v }))}
                                            placeholder="Street / Building / Area"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>City</Text>
                                        <TextInput
                                            value={contactDraft.city}
                                            onChangeText={(v) => setContactDraft((d) => ({ ...d, city: v }))}
                                            placeholder="e.g. Mumbai"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>State</Text>
                                        <TextInput
                                            value={contactDraft.state}
                                            onChangeText={(v) => setContactDraft((d) => ({ ...d, state: v }))}
                                            placeholder="e.g. Maharashtra"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                    <View style={styles.editRow}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Pincode</Text>
                                        <TextInput
                                            value={contactDraft.pincode}
                                            onChangeText={(v) => setContactDraft((d) => ({ ...d, pincode: v }))}
                                            placeholder="e.g. 400001"
                                            placeholderTextColor={subText}
                                            keyboardType="number-pad"
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                    <View style={[styles.editRow, { borderBottomWidth: 0 }]}>
                                        <Text style={[styles.editLabel, { color: subText }]}>Country</Text>
                                        <TextInput
                                            value={contactDraft.country}
                                            onChangeText={(v) => setContactDraft((d) => ({ ...d, country: v }))}
                                            placeholder="e.g. India"
                                            placeholderTextColor={subText}
                                            style={[styles.input, { flex: 1, backgroundColor: isDark ? '#1E1E1E' : '#FFF7ED', color: text, borderColor: '#DA775680' }]}
                                        />
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={styles.infoRow}>
                                        <Mail size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Email</Text>
                                        <Text
                                            style={[styles.infoValue, { color: text }, Platform.OS === 'android' && { fontSize: 11.5 }]}
                                            numberOfLines={Platform.OS === 'android' ? 2 : 1}
                                        >
                                            {teacher.user.email}
                                        </Text>
                                    </View>
                                    <View style={styles.infoRow}>
                                        <Phone size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Phone</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.phone || '—'}</Text>
                                    </View>
                                    <View style={styles.infoRow}>
                                        <MapPin size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Address</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.address || '—'}</Text>
                                    </View>
                                    <View style={styles.infoRow}>
                                        <MapPin size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>City</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.city || '—'}</Text>
                                    </View>
                                    <View style={styles.infoRow}>
                                        <MapPin size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>State</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.state || '—'}</Text>
                                    </View>
                                    <View style={styles.infoRow}>
                                        <MapPin size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Pincode</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.pincode || '—'}</Text>
                                    </View>
                                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                        <MapPin size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Country</Text>
                                        <Text style={[styles.infoValue, { color: text }]}>{contactSaved.country || '—'}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Assignments — exact copy of teacher web's Assignments section */}
                <View style={[styles.card, styles.cardNoPad, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF', minHeight: 50 }]}>
                            <Text style={[styles.sectionTitle, { color: subText }]}>{`ASSIGNMENTS (${teacher.assignments.length})`}</Text>
                        </View>

                        <View style={[styles.sectionContent, { paddingTop: 14 }]}>
                            {teacher.assignments.length === 0 ? (
                                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 32 }}>
                                    <View style={[styles.assignmentEmptyIcon, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
                                        <BookOpen size={20} color={subText} />
                                    </View>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: subText }}>No assignments yet</Text>
                                </View>
                            ) : (
                                <ScrollView style={{ maxHeight: 290 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                    {Object.entries(
                                        teacher.assignments.reduce((acc: Record<string, TeacherAssignment[]>, a) => {
                                            (acc[a.level1Name] ??= []).push(a);
                                            return acc;
                                        }, {})
                                    ).map(([level1, group]) => (
                                        <View key={level1} style={{ marginBottom: 14 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                <Layers size={13} color={subText} />
                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: subText }}>{level1}</Text>
                                            </View>
                                            <View style={{ gap: 6, paddingLeft: 10 }}>
                                                {group.map((a) => {
                                                    const subjectColor = a.role === 'SUBJECT_TEACHER'
                                                        ? colorForSubject({ id: a.level2Id || a.id, color: a.subjectColor })
                                                        : null;
                                                    const iconBg = a.role === 'CLASS_TEACHER'
                                                        ? (isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7')
                                                        : `${subjectColor}20`;
                                                    return (
                                                        <View key={a.id} style={[styles.assignmentRow, { borderColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                                                            <View style={[styles.assignmentIconBox, { backgroundColor: iconBg }]}>
                                                                {a.role === 'CLASS_TEACHER'
                                                                    ? <GraduationCap size={13} color={isDark ? '#FBBF24' : '#B45309'} />
                                                                    : <BookOpen size={13} color={subjectColor ?? accent.purple} />
                                                                }
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={[styles.assignmentPrimary, { color: text }]}>
                                                                    {a.role === 'SUBJECT_TEACHER' ? `${a.level2Name} · ${a.level3Name}` : a.level3Name}
                                                                </Text>
                                                                <Text style={[styles.assignmentSecondary, { color: subText }]}>
                                                                    {a.role === 'CLASS_TEACHER' ? 'Class Teacher' : 'Subject Teacher'}
                                                                </Text>
                                                            </View>
                                                            <View style={[styles.assignmentBadge, { backgroundColor: iconBg }]}>
                                                                <Text style={[styles.assignmentBadgeText, { color: a.role === 'CLASS_TEACHER' ? (isDark ? '#FBBF24' : '#B45309') : (subjectColor ?? accent.purple) }]}>
                                                                    {a.role === 'CLASS_TEACHER' ? 'Class Teacher' : 'Subject Teacher'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    </View>
                </View>

                {/* Settings & Logout — exact copy of student app's Settings & Logout block */}
                <View style={{ gap: 4 }}>
                    <Text style={{
                        fontSize: 14,
                        fontFamily: 'Poppins_700Bold',
                        color: text,
                        paddingHorizontal: 14,
                        marginBottom: 4,
                    }}>
                        Settings
                    </Text>

                    <TouchableOpacity onPress={() => router.push('/teacher_settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 }}>
                        <View style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: (isDark ? '#94A3B8' : '#64748B') + '20',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Settings size={16} color={subText} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: text }}>
                            Settings
                        </Text>
                        <ChevronRight size={16} color={subText} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/notifications')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 }}>
                        <View style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: blueColor + '20',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Bell size={16} color={blueColor} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: text }}>
                            Notifications
                        </Text>
                        <ChevronRight size={16} color={subText} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            Alert.alert('Logout', 'Are you sure you want to logout?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Logout',
                                    style: 'destructive',
                                    onPress: async () => {
                                        await unregisterCurrentPushToken();
                                        await AsyncStorage.removeItem('userToken');
                                        await AsyncStorage.removeItem('institutionType');
                                        clearInstitution();
                                        clearBranding();
                                        router.replace('/login');
                                    },
                                },
                            ]);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 }}
                    >
                        <View style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: redColor + '20',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <LogOut size={16} color={redColor} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: redColor }}>
                            Logout
                        </Text>
                        <ChevronRight size={16} color={redColor} />
                    </TouchableOpacity>
                </View>

                {/* Watermark */}
                <View style={{ alignItems: 'center', paddingVertical: 10, gap: 2 }}>
                    <Text style={{
                        fontSize: 15,
                        fontFamily: 'Poppins_600SemiBold',
                        color: subText,
                        opacity: 0.7,
                        letterSpacing: 0.5,
                    }}>
                        {branding.enabled ? branding.brandName : 'QubeEx v1.0'}
                    </Text>
                    <Text style={{
                        fontSize: 11,
                        fontFamily: 'Poppins_400Regular',
                        color: subText,
                        opacity: 0.7,
                    }}>
                        © 2026 All rights reserved.
                    </Text>
                    {branding.enabled && (
                        <Text style={{
                            fontSize: 10,
                            fontFamily: 'Poppins_400Regular',
                            color: subText,
                            opacity: 0.5,
                            marginTop: 2,
                        }}>
                            Powered by QubeEx
                        </Text>
                    )}
                </View>

            </ScrollView>

            <Modal visible={photoExpanded} transparent animationType="fade" onRequestClose={() => setPhotoExpanded(false)}>
                <TouchableOpacity
                    style={styles.photoOverlay}
                    activeOpacity={1}
                    onPress={() => setPhotoExpanded(false)}
                >
                    {avatarUrl && (
                        <View style={styles.photoExpandedWrap}>
                            <Image source={{ uri: avatarUrl }} style={styles.photoExpandedImage} />
                            <TouchableOpacity
                                onPress={() => setPhotoExpanded(false)}
                                style={styles.photoCloseBtn}
                            >
                                <X size={14} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingTop: 6, paddingHorizontal: 14, paddingBottom: 30, gap: 14 },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    cardNoPad: {
        padding: 0,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    avatarWrap: {
        width: 78,
        height: 78,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
    },
    avatarInitials: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
    },
    cameraBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#DA7756',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    nameStatusRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    nameText: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 2,
    },
    titleText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    teacherIdText: {
        fontSize: 13,
        fontFamily: 'RobotoMono_600SemiBold',
        color: '#DA7756',
        letterSpacing: 0.8,
        marginTop: 6,
    },
    statusBadge: {
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 99,
    },
    statusBadgeText: {
        fontSize: 10.5,
        fontFamily: 'Poppins_600SemiBold',
        color: '#047857',
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        gap: 20,
    },
    statItem: {
        flex: 1,
    },
    statValue: {
        fontSize: 11.5,
        fontFamily: 'Poppins_700Bold',
    },
    statLabel: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },
    photoOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoExpandedWrap: {
        width: 280,
        height: 280,
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
    },
    photoCloseBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoExpandedImage: {
        width: 280,
        height: 280,
        borderRadius: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.8,
    },
    sectionContent: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 14,
    },
    editBtnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pillBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 10,
        height: 26,
        borderRadius: 8,
    },
    pillBtnText: {
        fontSize: 10.5,
        fontFamily: 'Poppins_600SemiBold',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(148,163,184,0.25)',
    },
    infoLabel: {
        fontSize: 11.5,
        fontFamily: 'Poppins_400Regular',
        width: 92,
    },
    infoValue: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    titleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 99,
    },
    titleBadgeText: {
        fontSize: 10.5,
        fontFamily: 'Poppins_600SemiBold',
        color: '#DA7756',
    },
    editRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(148,163,184,0.25)',
    },
    editLabel: {
        fontSize: 11.5,
        fontFamily: 'Poppins_400Regular',
        width: 92,
        marginTop: 8,
    },
    input: {
        height: 36,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        ...(Platform.OS === 'android' ? { textAlignVertical: 'center', includeFontPadding: false, paddingTop: 0, paddingBottom: 0 } : null),
    },
    chipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        flex: 1,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 99,
        borderWidth: 1,
    },
    chipActive: {
        borderColor: 'transparent',
        backgroundColor: '#DA7756',
    },
    chipText: {
        fontSize: 10.5,
        fontFamily: 'Poppins_600SemiBold',
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    aiRowLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    aiRowValue: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
    },
    aiRowValueMuted: {
        fontFamily: 'Poppins_400Regular',
    },
    aiBarTrack: {
        height: 8,
        borderRadius: 99,
        overflow: 'hidden',
    },
    aiBarTrackSm: {
        height: 6,
        borderRadius: 99,
        overflow: 'hidden',
        marginTop: 2,
    },
    aiBarFill: {
        height: '100%',
        borderRadius: 99,
    },
    aiSubHint: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },
    aiStatRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    aiStatBox: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    aiStatValue: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    aiStatLabel: {
        fontSize: 9.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    aiPoolBox: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 10,
    },
    aiPoolLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    aiPoolValue: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    phoneCodeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 36,
    },
    phoneCodeDropdown: {
        marginTop: 6,
        borderWidth: 1,
        borderRadius: 10,
        overflow: 'hidden',
    },
    phoneCodeOption: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    assignmentEmptyIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    assignmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    assignmentIconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    assignmentPrimary: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    assignmentSecondary: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },
    assignmentBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 99,
    },
    assignmentBadgeText: {
        fontSize: 9.5,
        fontFamily: 'Poppins_600SemiBold',
    },
});
