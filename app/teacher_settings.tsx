import { ScreenHeader } from '@/components/ScreenHeader';
import { useBranding } from '@/context/BrandingContext';
import { useInstitution } from '@/context/InstitutionContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { getAppIconSafe as getAppIcon, setAppIconSafe as setAppIcon } from '@/lib/appIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import {
    Activity,
    AlertTriangle,
    Calendar,
    Check,
    Eye,
    EyeOff,
    Hash,
    ImageIcon,
    KeyRound,
    Lock,
    Mail,
    MapPin,
    Monitor,
    RefreshCw,
    ShieldCheck,
    User as UserIcon,
    X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// App-icon variants bundled via the @g9k/expo-dynamic-app-icon config plugin
// (see app.json). "white" is the app's shipped default — passing that name
// to setAppIcon() is equivalent to null/reset here since it matches the
// icon already declared at the top level, so it doubles as the "reset" option.
// The swatch shows the actual icon artwork (not a flat color) so it reads as
// a live preview rather than an abstract color picker.
const APP_ICON_OPTIONS: { key: 'black' | 'white' | 'transparent'; label: string; image: number; swatchBg: string; swatchBorder?: string }[] = [
    { key: 'white', label: 'White', image: require('@/assets/icon-white.png'), swatchBg: '#FFFFFF', swatchBorder: '#E2E8F0' },
    { key: 'black', label: 'Black', image: require('@/assets/icon-black.png'), swatchBg: '#000000' },
    { key: 'transparent', label: 'Transparent', image: require('@/assets/icon-transparent-fg.png'), swatchBg: '#F1F5F9', swatchBorder: '#E2E8F0' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function toIST(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

type PasswordStrength = 'weak' | 'medium' | 'strong' | 'very-strong' | null;

function calculateStrength(password: string): { level: PasswordStrength; score: number; checks: Record<string, boolean> } {
    const checks = {
        length: password.length >= 8,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    let level: PasswordStrength = null;
    if (password.length === 0) level = null;
    else if (score <= 2) level = 'weak';
    else if (score <= 3) level = 'medium';
    else if (score <= 4) level = 'strong';
    else level = 'very-strong';
    return { level, score, checks };
}

const STRENGTH_CONFIG: Record<Exclude<PasswordStrength, null>, { label: string; color: string; width: string }> = {
    weak: { label: 'Weak', color: '#EF4444', width: '25%' },
    medium: { label: 'Medium', color: '#F59E0B', width: '50%' },
    strong: { label: 'Strong', color: '#10B981', width: '75%' },
    'very-strong': { label: 'Very Strong', color: '#7C3AED', width: '100%' },
};

interface LoginActivity {
    id: string;
    device: string;
    ip: string;
    location: string;
    time: string;
    latest: boolean;
}

export default function TeacherSettingsScreen() {
    const { isDark, accent } = useTheme();
    const router = useRouter();
    const { clearInstitution } = useInstitution();
    const { clearBranding } = useBranding();

    const bg = isDark ? '#000000' : '#FAF8FF';
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const redColor = isDark ? '#F87171' : '#EF4444';
    const redLight = isDark ? 'rgba(248,113,113,0.12)' : '#FEE2E2';

    // ── Profile ──
    const [profileLoading, setProfileLoading] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [createdAt, setCreatedAt] = useState<string | null>(null);

    // ── Login activity ──
    const [loginActivity, setLoginActivity] = useState<LoginActivity[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);

    // ── Password change ──
    const [oldPwd, setOldPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [savingPwd, setSavingPwd] = useState(false);

    const strength = useMemo(() => calculateStrength(newPwd), [newPwd]);
    const passwordsMatch = confirmPwd.length > 0 && newPwd === confirmPwd;
    const passwordsMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
    const samePwd = oldPwd.length > 0 && newPwd.length > 0 && oldPwd === newPwd;
    const canSubmitPwd =
        oldPwd.length > 0 &&
        newPwd.length >= 8 &&
        passwordsMatch &&
        !samePwd &&
        (strength.level === 'medium' || strength.level === 'strong' || strength.level === 'very-strong');

    // ── App icon ──
    const [appIcon, setAppIconState] = useState<'black' | 'white' | 'transparent'>('white');
    const [iconSwitching, setIconSwitching] = useState<string | null>(null);

    useEffect(() => {
        try {
            const current = getAppIcon();
            if (current === 'black' || current === 'transparent') setAppIconState(current);
            else setAppIconState('white'); // "DEFAULT"/null/"white" all mean the shipped white icon
        } catch {
            // dev client not rebuilt yet with the icon plugin — keep the default
        }
    }, []);

    const handlePickAppIcon = async (key: 'black' | 'white' | 'transparent') => {
        if (key === appIcon || iconSwitching) return;
        setIconSwitching(key);
        try {
            const result = setAppIcon(key === 'white' ? null : key);
            if (result === false) {
                Alert.alert('Couldn’t change icon', 'This build doesn’t have the app-icon feature yet - it needs a fresh install after the next update.');
            } else {
                setAppIconState(key);
            }
        } catch {
            Alert.alert('Couldn’t change icon', 'This build doesn’t have the app-icon feature yet - it needs a fresh install after the next update.');
        } finally {
            setIconSwitching(null);
        }
    };

    const fetchedProfile = useRef(false);
    const fetchedActivity = useRef(false);

    useFocusEffect(
        useCallback(() => {
            if (fetchedProfile.current) return;
            fetchedProfile.current = true;
            (async () => {
                try {
                    setProfileLoading(true);
                    const res = await api.get('/teacher/profile');
                    const p = res.data.data;
                    setName(p.name ?? '');
                    setEmail(p.email ?? '');
                    setCreatedAt(p.createdAt ?? null);
                } catch {
                    // keep blank on failure
                } finally {
                    setProfileLoading(false);
                }
            })();

            if (fetchedActivity.current) return;
            fetchedActivity.current = true;
            (async () => {
                try {
                    setActivityLoading(true);
                    const res = await api.get('/teacher/profile/login-activity?limit=5');
                    setLoginActivity(res.data.data ?? []);
                } catch {
                    // non-blocking
                } finally {
                    setActivityLoading(false);
                }
            })();
        }, [])
    );

    const handleChangePassword = async () => {
        if (!canSubmitPwd) return;
        setSavingPwd(true);
        try {
            await api.put('/teacher/profile/password', { oldPassword: oldPwd, newPassword: newPwd });
            setOldPwd(''); setNewPwd(''); setConfirmPwd('');
            setShowOld(false); setShowNew(false); setShowConfirm(false);
            Alert.alert('Success', 'Password changed successfully');
        } catch {
            Alert.alert('Error', 'Failed to change password');
        } finally {
            setSavingPwd(false);
        }
    };

    const performLogout = async () => {
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('institutionType');
        clearInstitution();
        clearBranding();
        router.replace('/login');
    };

    const confirmSignOutAll = () => {
        Alert.alert(
            'Sign out everywhere?',
            "This will invalidate your session on all devices. You'll need to sign in again on each one.",
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out all', style: 'destructive', onPress: performLogout },
            ]
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top']}>
            <ScreenHeader title="Settings" showBack />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Personal Details */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: accent.purpleLight }]}>
                                    <UserIcon size={15} color={accent.purple} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: text }]}>Personal Details</Text>
                                    <Text style={[styles.sectionDesc, { color: subText }]}>Your basic information</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.sectionContent}>
                            {profileLoading ? (
                                <ActivityIndicator color={accent.purple} style={{ marginVertical: 16 }} />
                            ) : (
                                <>
                                    <View style={styles.infoRow}>
                                        <UserIcon size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Full Name</Text>
                                        <Text style={[styles.infoValue, { color: text }]} numberOfLines={1}>{name || '—'}</Text>
                                    </View>
                                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                        <Mail size={14} color={subText} />
                                        <Text style={[styles.infoLabel, { color: subText }]}>Email</Text>
                                        <Text style={[styles.infoValue, { color: text }]} numberOfLines={1}>{email || '—'}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Account Information */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: accent.purpleLight }]}>
                                    <Hash size={15} color={accent.purple} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: text }]}>Account Information</Text>
                                    <Text style={[styles.sectionDesc, { color: subText }]}>Read-only system details</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.sectionContent}>
                            <View style={styles.infoRow}>
                                <Calendar size={14} color={subText} />
                                <Text style={[styles.infoLabel, { color: subText }]}>Member Since</Text>
                                <Text style={[styles.infoValue, { color: text }]}>{profileLoading ? '…' : toIST(createdAt)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Activity size={14} color={subText} />
                                <Text style={[styles.infoLabel, { color: subText }]}>Last Login</Text>
                                <Text style={[styles.infoValue, { color: text }]}>{activityLoading ? '…' : toIST(loginActivity[0]?.time)}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Monitor size={14} color={subText} />
                                <Text style={[styles.infoLabel, { color: subText }]} numberOfLines={1}>Last Device</Text>
                                <Text style={[styles.infoValue, { color: text }]} numberOfLines={1}>{activityLoading ? '…' : (loginActivity[0]?.device ?? '—')}</Text>
                            </View>
                            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                <MapPin size={14} color={subText} />
                                <Text style={[styles.infoLabel, { color: subText }]}>Last IP</Text>
                                <Text style={[styles.infoValue, { color: text, fontFamily: 'RobotoMono_600SemiBold' }]}>{activityLoading ? '…' : (loginActivity[0]?.ip ?? '—')}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* App Icon */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: accent.purpleLight }]}>
                                    <ImageIcon size={15} color={accent.purple} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: text }]}>App Icon</Text>
                                    <Text style={[styles.sectionDesc, { color: subText }]}>Choose the QubeEx icon on your home screen</Text>
                                </View>
                            </View>
                        </View>
                        <View style={[styles.sectionContent, { flexDirection: 'row', gap: 12 }]}>
                            {APP_ICON_OPTIONS.map((opt) => {
                                const selected = appIcon === opt.key;
                                const busy = iconSwitching === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        onPress={() => handlePickAppIcon(opt.key)}
                                        disabled={!!iconSwitching}
                                        style={{ flex: 1, alignItems: 'center', gap: 6, opacity: iconSwitching && !busy ? 0.5 : 1 }}
                                    >
                                        <View
                                            style={[
                                                styles.iconSwatch,
                                                {
                                                    backgroundColor: opt.swatchBg,
                                                    borderColor: selected ? accent.purple : (opt.swatchBorder ?? 'transparent'),
                                                    borderWidth: selected ? 2.5 : (opt.swatchBorder ? 1 : 0),
                                                },
                                            ]}
                                        >
                                            <Image source={opt.image} style={styles.iconSwatchImage} resizeMode="cover" />
                                            {busy && (
                                                <View style={styles.iconSwatchOverlay}>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                </View>
                                            )}
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            {selected && <Check size={11} color={accent.purple} />}
                                            <Text style={[styles.sectionDesc, { color: selected ? accent.purple : subText, fontFamily: selected ? 'Poppins_600SemiBold' : 'Poppins_400Regular' }]}>
                                                {opt.label}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: subText, paddingHorizontal: 16, paddingBottom: 14, marginTop: -6 }}>
                            On Android, after picking an icon press Home and wait about 10 seconds before checking your home screen. On iOS it applies instantly with a one-time system confirmation.
                        </Text>
                    </View>
                </View>

                {/* Change Password */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: accent.purpleLight }]}>
                                    <KeyRound size={15} color={accent.purple} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: text }]}>Change Password</Text>
                                    <Text style={[styles.sectionDesc, { color: subText }]}>Must remember current password</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.sectionContent}>
                            {/* Current password */}
                            <Text style={[styles.pwdLabel, { color: subText }]}>Current Password</Text>
                            <View style={[styles.pwdInputWrap, { borderColor: cardBorder, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC' }]}>
                                <Lock size={13} color={subText} />
                                <TextInput
                                    value={oldPwd}
                                    onChangeText={setOldPwd}
                                    placeholder="Enter your current password"
                                    placeholderTextColor={subText}
                                    secureTextEntry={!showOld}
                                    style={[styles.pwdInput, { color: text }]}
                                />
                                <TouchableOpacity onPress={() => setShowOld((s) => !s)}>
                                    {showOld ? <EyeOff size={14} color={subText} /> : <Eye size={14} color={subText} />}
                                </TouchableOpacity>
                            </View>

                            {/* New password */}
                            <Text style={[styles.pwdLabel, { color: subText, marginTop: 12 }]}>New Password</Text>
                            <View style={[styles.pwdInputWrap, { borderColor: cardBorder, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC' }]}>
                                <Lock size={13} color={subText} />
                                <TextInput
                                    value={newPwd}
                                    onChangeText={setNewPwd}
                                    placeholder="Enter a strong new password"
                                    placeholderTextColor={subText}
                                    secureTextEntry={!showNew}
                                    editable={oldPwd.length > 0}
                                    style={[styles.pwdInput, { color: text }]}
                                />
                                <TouchableOpacity onPress={() => setShowNew((s) => !s)}>
                                    {showNew ? <EyeOff size={14} color={subText} /> : <Eye size={14} color={subText} />}
                                </TouchableOpacity>
                            </View>

                            {newPwd.length > 0 && strength.level && (
                                <View style={{ marginTop: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9', overflow: 'hidden' }}>
                                            <View style={{ height: '100%', width: STRENGTH_CONFIG[strength.level].width as any, backgroundColor: STRENGTH_CONFIG[strength.level].color, borderRadius: 3 }} />
                                        </View>
                                        <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: STRENGTH_CONFIG[strength.level].color }}>
                                            {STRENGTH_CONFIG[strength.level].label}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {[
                                            { key: 'length', label: 'At least 8 characters' },
                                            { key: 'upper', label: 'Uppercase letter' },
                                            { key: 'lower', label: 'Lowercase letter' },
                                            { key: 'number', label: 'Number' },
                                            { key: 'special', label: 'Special character' },
                                        ].map((c) => {
                                            const ok = strength.checks[c.key];
                                            return (
                                                <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '46%' }}>
                                                    {ok ? <Check size={11} color="#10B981" /> : <X size={11} color={subText} />}
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: ok ? text : subText }}>{c.label}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}
                            {samePwd && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                                    <AlertTriangle size={11} color="#F59E0B" />
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: '#F59E0B' }}>New password must be different from current</Text>
                                </View>
                            )}

                            {/* Confirm password */}
                            <Text style={[styles.pwdLabel, { color: subText, marginTop: 12 }]}>Confirm New Password</Text>
                            <View style={[styles.pwdInputWrap, { borderColor: cardBorder, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC' }]}>
                                <Lock size={13} color={subText} />
                                <TextInput
                                    value={confirmPwd}
                                    onChangeText={setConfirmPwd}
                                    placeholder="Re-enter the new password"
                                    placeholderTextColor={subText}
                                    secureTextEntry={!showConfirm}
                                    editable={oldPwd.length > 0 && newPwd.length > 0}
                                    style={[styles.pwdInput, { color: text }]}
                                />
                                {confirmPwd.length > 0 && (passwordsMatch ? <Check size={14} color="#10B981" /> : <X size={14} color={redColor} />)}
                                <TouchableOpacity onPress={() => setShowConfirm((s) => !s)}>
                                    {showConfirm ? <EyeOff size={14} color={subText} /> : <Eye size={14} color={subText} />}
                                </TouchableOpacity>
                            </View>
                            {passwordsMismatch && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                    <X size={11} color={redColor} />
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: redColor }}>Passwords do not match</Text>
                                </View>
                            )}

                            <TouchableOpacity
                                onPress={handleChangePassword}
                                disabled={!canSubmitPwd || savingPwd}
                                style={[styles.submitPwdBtn, { backgroundColor: '#DA7756', opacity: (!canSubmitPwd || savingPwd) ? 0.4 : 1 }]}
                            >
                                {savingPwd ? (
                                    <>
                                        <RefreshCw size={14} color="#fff" />
                                        <Text style={styles.submitPwdBtnText}>Updating…</Text>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck size={14} color="#fff" />
                                        <Text style={styles.submitPwdBtnText}>Update Password</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Recent Login Activity */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: cardBorder, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFF' }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: accent.purpleLight }]}>
                                    <Activity size={15} color={accent.purple} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: text }]}>Recent Login Activity</Text>
                                    <Text style={[styles.sectionDesc, { color: subText }]}>Sessions in the last 30 days</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.sectionContent}>
                            {activityLoading ? (
                                <ActivityIndicator color={accent.purple} style={{ marginVertical: 16 }} />
                            ) : loginActivity.length === 0 ? (
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: subText, textAlign: 'center', paddingVertical: 24 }}>
                                    No login activity found
                                </Text>
                            ) : (
                                loginActivity.map((session, idx) => (
                                    <View
                                        key={session.id}
                                        style={[
                                            styles.activityRow,
                                            { borderBottomColor: 'rgba(148,163,184,0.25)' },
                                            idx === loginActivity.length - 1 && { borderBottomWidth: 0 },
                                        ]}
                                    >
                                        <View style={[styles.activityIconBox, { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
                                            <Monitor size={14} color={subText} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={[styles.activityDevice, { color: text }]} numberOfLines={1}>{session.device}</Text>
                                                {idx === 0 && (
                                                    <View style={styles.latestBadge}>
                                                        <Text style={styles.latestBadgeText}>LATEST</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.activityMeta, { color: subText }]} numberOfLines={1}>
                                                {session.location} · {session.ip} · {toIST(session.time)}
                                            </Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    </View>
                </View>

                {/* Danger Zone */}
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: isDark ? 'rgba(248,113,113,0.35)' : '#FECACA' }]}>
                    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                        <View style={[styles.sectionHeader, { borderBottomColor: isDark ? 'rgba(248,113,113,0.35)' : '#FECACA', backgroundColor: redLight }]}>
                            <View style={styles.sectionHeaderLeft}>
                                <View style={[styles.iconBox, { backgroundColor: redLight }]}>
                                    <AlertTriangle size={15} color={redColor} />
                                </View>
                                <View>
                                    <Text style={[styles.sectionTitle, { color: redColor }]}>Danger Zone</Text>
                                    <Text style={[styles.sectionDesc, { color: redColor, opacity: 0.8 }]}>Irreversible actions</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.sectionContent}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: text }}>Sign out from all devices</Text>
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_400Regular', color: subText, marginTop: 2 }}>
                                        Invalidates your session everywhere - you&apos;ll need to sign in again
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={confirmSignOutAll} style={[styles.signOutAllBtn, { backgroundColor: redColor }]}>
                                    <Text style={styles.signOutAllBtnText}>Sign out</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingTop: 6, paddingHorizontal: 14, paddingBottom: 30, gap: 14 },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        minHeight: 60,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    sectionDesc: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },
    sectionContent: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
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
    editRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(148,163,184,0.25)',
    },
    editLabel: {
        fontSize: 11.5,
        fontFamily: 'Poppins_400Regular',
        width: 92,
    },
    input: {
        height: 36,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    pwdLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 6,
    },
    pwdInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
    },
    pwdInput: {
        flex: 1,
        fontSize: 12.5,
        fontFamily: 'Poppins_400Regular',
        height: '100%',
    },
    submitPwdBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 42,
        borderRadius: 12,
        marginTop: 16,
    },
    submitPwdBtnText: {
        fontSize: 12.5,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    activityIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityDevice: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        flexShrink: 1,
    },
    activityMeta: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    latestBadge: {
        backgroundColor: '#D1FAE5',
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 99,
    },
    latestBadgeText: {
        fontSize: 8,
        fontFamily: 'Poppins_700Bold',
        color: '#047857',
    },
    signOutAllBtn: {
        paddingHorizontal: 14,
        height: 34,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signOutAllBtnText: {
        fontSize: 11.5,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
    },
    iconSwatch: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    iconSwatchImage: {
        width: '100%',
        height: '100%',
    },
    iconSwatchOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconSwatchCheck: {
        width: 20,
        height: 20,
        borderRadius: 99,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
