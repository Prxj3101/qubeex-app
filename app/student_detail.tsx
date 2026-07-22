import { PhotoViewerModal } from '@/components/PhotoViewerModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Copy } from 'lucide-react-native';

import {
    Camera,
    Check,
    ChevronDown,
    Droplets,
    FileText,
    Hash,
    Heart,
    Home, Info, Pencil,
    Phone,
    Shield,
    User,
    Users,
    X
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    Alert, Animated, Image, ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function PulsingDot({ color }: { color: string }) {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);

    return <Animated.View style={[styles.statusDot, { backgroundColor: color, opacity }]} />;
}

// ─── Format DOB input as YYYY-MM-DD, digits only, capped at 8 digits ────────
function formatDob(text: string): string {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// Converts an uppercase enum-style string ("MALE") into title case ("Male") for display only.
function toTitleCase(value?: string | null): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

// ─── Phone country codes + max digit lengths ────────────────────────────────
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

// ─── Format Aadhar input as "XXXX XXXX XXXX", digits only, capped at 12 ────
function formatAadhar(val: string): string {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    return (digits.match(/.{1,4}/g) ?? []).join(' ');
}

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
    amber: '#F59E0B', amberLight: '#FEF3C7',
    green: '#10B981', greenLight: '#D1FAE5',
    red: '#EF4444', redLight: '#FEE2E2',
    blue: '#2563EB', blueLight: '#DBEAFE',
};

const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
    amber: '#FCD34D', amberLight: '#2D2010',
    green: '#34D399', greenLight: '#0D2B20',
    red: '#F87171', redLight: '#2B0D0D',
    blue: '#60A5FA', blueLight: '#0D1F3C',
};

// ─── Initial Student Data ─────────────────────────────────────────────────────
const INITIAL_STUDENT = {
    name: 'Prajwal Jagdish Kotian',
    gender: 'Male',
    rollNo: '09',
    standard: 'Class 10',
    batch: 'B.Tech CSE',
    div: 'Division A',
    sem: 'Semester 5',
    dob: '2001-05-31',
    email: 'prajwal.kotian@gmail.com',
    bloodGroup: 'B+',
    aadhar: '1234 5678 9012',
    pan: 'ABCPK1234D',
    houseColor: 'Blue House 🔵',
    address: 'Flat 12, Shanti Niwas, Sector 7, Andheri West',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400058',
    country: 'India',
    contactNo: '+91 98765 43210',
    emergencyContact: '+91 98765 00003',
    guardians: [
        { name: 'Jagdish Kotian', number: '+91 98765 00001', relation: 'Father' },
        { name: 'Poornima Kotian', number: '+91 98765 00002', relation: 'Mother' },
    ] as { name: string; number: string; relation: string }[],
    nationality: 'Indian',
    religion: 'Hindu',
    category: 'General',
    admissionYear: '2022',
    uid: 'STU-SCH-MHS01-0042',
};

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, theme, style }: { children: React.ReactNode; theme: typeof LIGHT; style?: object }) {
    return (
        <View style={[{
            backgroundColor: theme.card, borderRadius: 20, padding: 16,
            borderWidth: 1, borderColor: theme.cardBorder,
            shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }, style]}>
            {children}
        </View>
    );
}

// ─── Section Title with optional Edit button ──────────────────────────────────
function SectionTitle({
    icon, title, color, theme,
    editable = false, isEditing = false,
    onEdit, onSave, onCancel, afterTitle,
}: {
    icon: React.ReactNode; title: string; color: string; theme: typeof LIGHT;
    editable?: boolean; isEditing?: boolean;
    onEdit?: () => void; onSave?: () => void; onCancel?: () => void;
    afterTitle?: React.ReactNode;
}) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
            </View>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: theme.text, flex: 1 }}>{title}</Text>

            {afterTitle}

            {editable && !isEditing && (
                <TouchableOpacity
                    onPress={onEdit}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: theme.purpleLight,
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
                    }}
                    activeOpacity={0.75}
                >
                    <Pencil size={11} color={theme.purple} />
                    <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.purple }}>Edit</Text>
                </TouchableOpacity>
            )}

            {editable && isEditing && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                        onPress={onCancel}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            backgroundColor: theme.redLight,
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
                        }}
                        activeOpacity={0.75}
                    >
                        <X size={11} color={theme.red} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onSave}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            backgroundColor: theme.green + '22',
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
                        }}
                        activeOpacity={0.75}
                    >
                        <Check size={11} color={theme.green} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.green }}>Save</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// ─── InfoRow — normal or editable ────────────────────────────────────────────
function InfoRow({
    label, value, theme,
    isEditing = false, editable = false,
    showInfo = false,
    placeholder,
    onChangeText,
}: {
    label: string; value: string; theme: typeof LIGHT;
    isEditing?: boolean; editable?: boolean;
    showInfo?: boolean;
    placeholder?: string;
    onChangeText?: (text: string) => void;
}) {
    const showInput = isEditing && editable;
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <View style={{
            paddingVertical: 9,
            borderBottomWidth: 1, borderBottomColor: theme.cardBorder,
        }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted }}>{label}</Text>
                    {showInfo && (
                        <View style={{ marginTop: -3 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowTooltip(v => !v);
                                    setTimeout(() => setShowTooltip(false), 4000);
                                }}
                            >
                                <Info size={13} color={theme.muted} />
                            </TouchableOpacity>
                            {showTooltip && (
                                <View style={{
                                    position: 'absolute', top: 16, left: -8, zIndex: 10,
                                    width: 190, paddingHorizontal: 10, paddingVertical: 7,
                                    borderRadius: 8, backgroundColor: '#1F2937',
                                }}>
                                    <Text style={{ fontSize: 10, color: 'white', fontFamily: 'Poppins_400Regular', lineHeight: 14 }}>
                                        This email is also used to login to the QubeEx app.
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
                {!showInput && (
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1.5, textAlign: 'right' }}>
                        {value}
                    </Text>
                )}
            </View>
            {showInput && (
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    style={{
                        marginTop: 6,
                        borderWidth: 1.5,
                        borderColor: theme.purple,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 13,
                        fontFamily: 'Poppins_400Regular',
                        color: theme.text,
                        backgroundColor: theme.purpleLight + '55',
                    }}
                    placeholderTextColor={theme.muted}
                />
            )}
        </View>
    );
}

// ─── DropdownRow (e.g. Category) ─────────────────────────────────────────────
function DropdownRow({
    label, value, options, theme, isEditing = false, onSelect,
}: {
    label: string; value: string; options: string[]; theme: typeof LIGHT;
    isEditing?: boolean; onSelect?: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);

    if (!isEditing) {
        return (
            <View style={{
                paddingVertical: 9,
                borderBottomWidth: 1, borderBottomColor: theme.cardBorder,
            }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, flex: 1 }}>{label}</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1.5, textAlign: 'right' }}>
                        {value}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={{
            paddingVertical: 9,
            borderBottomWidth: 1, borderBottomColor: theme.cardBorder,
        }}>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 6 }}>{label}</Text>
            <TouchableOpacity
                onPress={() => setOpen(v => !v)}
                activeOpacity={0.8}
                style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 8,
                    backgroundColor: theme.purpleLight + '55',
                }}
            >
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: value ? theme.text : theme.muted }}>
                    {value || 'Select'}
                </Text>
                <ChevronDown size={14} color={theme.muted} />
            </TouchableOpacity>
            {open && (
                <View style={{
                    marginTop: 6, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: 12,
                    backgroundColor: theme.card, overflow: 'hidden',
                }}>
                    <ScrollView
                        style={{ maxHeight: 4 * 38 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {options.map((o, i) => (
                            <TouchableOpacity
                                key={o}
                                onPress={() => { onSelect?.(o); setOpen(false); }}
                                style={{
                                    paddingHorizontal: 12, paddingVertical: 9,
                                    borderBottomWidth: i === options.length - 1 ? 0 : 1,
                                    borderBottomColor: theme.cardBorder,
                                }}
                            >
                                <Text style={{
                                    fontSize: 13,
                                    fontFamily: o === value ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                    color: o === value ? theme.purple : theme.text,
                                }}>
                                    {o}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

// ─── PhoneRow (country code + digit-limited number) ─────────────────────────
function PhoneRow({
    label, value, theme, isEditing = false, onChange,
}: {
    label: string; value: string; theme: typeof LIGHT;
    isEditing?: boolean; onChange?: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const { code, number } = parsePhone(value);

    if (!isEditing) {
        return (
            <View style={{
                paddingVertical: 9,
                borderBottomWidth: 1, borderBottomColor: theme.cardBorder,
            }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, flex: 1 }}>{label}</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text, flex: 1.5, textAlign: 'right' }}>
                        {value}
                    </Text>
                </View>
            </View>
        );
    }

    const maxDigits = COUNTRY_CODES.find(c => c.code === code)?.max ?? 10;

    return (
        <View style={{
            paddingVertical: 9,
            borderBottomWidth: 1, borderBottomColor: theme.cardBorder,
        }}>
            <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 6 }}>{label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                    onPress={() => setOpen(v => !v)}
                    activeOpacity={0.8}
                    style={{
                        flexDirection: 'row', alignItems: 'center', gap: 3,
                        borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 8,
                        backgroundColor: theme.purpleLight + '55',
                    }}
                >
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                        {COUNTRY_CODES.find(c => c.code === code)?.flag} {code}
                    </Text>
                    <ChevronDown size={12} color={theme.muted} />
                </TouchableOpacity>
                <TextInput
                    value={number}
                    onChangeText={t => {
                        const digits = t.replace(/\D/g, '').slice(0, maxDigits);
                        onChange?.(`${code} ${digits}`);
                    }}
                    placeholder="98765 43210"
                    keyboardType="number-pad"
                    placeholderTextColor={theme.muted}
                    style={{
                        flex: 1,
                        borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 8,
                        fontSize: 13, fontFamily: 'Poppins_400Regular', color: theme.text,
                        backgroundColor: theme.purpleLight + '55',
                    }}
                />
            </View>
            {open && (
                <View style={{
                    marginTop: 6, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: 12,
                    backgroundColor: theme.card, overflow: 'hidden',
                }}>
                    <ScrollView
                        style={{ maxHeight: 4 * 38 }}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {COUNTRY_CODES.map((c, i) => (
                            <TouchableOpacity
                                key={c.code}
                                onPress={() => { onChange?.(`${c.code} ${number}`); setOpen(false); }}
                                style={{
                                    paddingHorizontal: 12, paddingVertical: 9,
                                    borderBottomWidth: i === COUNTRY_CODES.length - 1 ? 0 : 1,
                                    borderBottomColor: theme.cardBorder,
                                }}
                            >
                                <Text style={{
                                    fontSize: 13,
                                    fontFamily: c.code === code ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                    color: c.code === code ? theme.purple : theme.text,
                                }}>
                                    {c.flag} {c.code}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

// ─── EditableTextBlock (for address) ─────────────────────────────────────────
function EditableTextBlock({
    label, value, theme, isEditing, onChangeText, placeholder,
}: {
    label?: string; value: string; theme: typeof LIGHT; isEditing: boolean; onChangeText: (t: string) => void; placeholder?: string;
}) {
    return (
        <View>
            {label ? (
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 4 }}>
                    {label}
                </Text>
            ) : null}
            {!isEditing ? (
                <View style={{ padding: 12, backgroundColor: theme.purpleLight, borderRadius: 14 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_400Regular', color: theme.text, lineHeight: 20 }}>
                        {value}
                    </Text>
                </View>
            ) : (
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    multiline
                    numberOfLines={3}
                    style={{
                        borderWidth: 1.5, borderColor: theme.purple, borderRadius: 12,
                        paddingHorizontal: 12, paddingVertical: 10,
                        fontSize: 13, fontFamily: 'Poppins_400Regular',
                        color: theme.text, backgroundColor: theme.purpleLight + '55',
                        lineHeight: 20, textAlignVertical: 'top',
                    }}
                    placeholderTextColor={theme.muted}
                />
            )}
        </View>
    );
}

// ─── BoxField (label-on-top boxed field, e.g. City/State/Pincode/Country) ────
function BoxField({
    label, value, theme, isEditing = false, placeholder, onChangeText,
}: {
    label: string; value: string; theme: typeof LIGHT;
    isEditing?: boolean; placeholder?: string; onChangeText?: (t: string) => void;
}) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 4 }}>
                {label}
            </Text>
            {isEditing ? (
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    style={{
                        borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 8,
                        fontSize: 12, fontFamily: 'Poppins_400Regular',
                        color: theme.text, backgroundColor: theme.purpleLight + '55',
                    }}
                    placeholderTextColor={theme.muted}
                />
            ) : (
                <View style={{
                    paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10,
                    backgroundColor: theme.purpleLight,
                }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                        {value || '—'}
                    </Text>
                </View>
            )}
        </View>
    );
}

// ─── BoxPhoneField (boxed field with country-code dropdown, for guardians) ───
function BoxPhoneField({
    label, value, theme, isEditing = false, onChange,
}: {
    label: string; value: string; theme: typeof LIGHT;
    isEditing?: boolean; onChange?: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const { code, number } = parsePhone(value);
    const maxDigits = COUNTRY_CODES.find(c => c.code === code)?.max ?? 10;

    return (
        <View style={{ flex: 1.2 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 4 }}>
                {label}
            </Text>
            {!isEditing ? (
                <View style={{
                    paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10,
                    backgroundColor: theme.purpleLight,
                }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                        {value || '—'}
                    </Text>
                </View>
            ) : (
                <View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                            onPress={() => setOpen(v => !v)}
                            activeOpacity={0.8}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                                paddingHorizontal: 8, paddingVertical: 8,
                                backgroundColor: theme.purpleLight + '55',
                            }}
                        >
                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text }}>
                                {COUNTRY_CODES.find(c => c.code === code)?.flag} {code}
                            </Text>
                            <ChevronDown size={11} color={theme.muted} />
                        </TouchableOpacity>
                        <TextInput
                            value={number}
                            onChangeText={t => {
                                const digits = t.replace(/\D/g, '').slice(0, maxDigits);
                                onChange?.(`${code} ${digits}`);
                            }}
                            placeholder="98765 43210"
                            keyboardType="number-pad"
                            placeholderTextColor={theme.muted}
                            style={{
                                flex: 1,
                                borderWidth: 1.5, borderColor: theme.purple, borderRadius: 10,
                                paddingHorizontal: 10, paddingVertical: 8,
                                fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.text,
                                backgroundColor: theme.purpleLight + '55',
                            }}
                        />
                    </View>
                    {open && (
                        <View style={{
                            marginTop: 6, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: 12,
                            backgroundColor: theme.card, overflow: 'hidden',
                        }}>
                            <ScrollView style={{ maxHeight: 4 * 38 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {COUNTRY_CODES.map((c, i) => (
                                    <TouchableOpacity
                                        key={c.code}
                                        onPress={() => { onChange?.(`${c.code} ${number}`); setOpen(false); }}
                                        style={{
                                            paddingHorizontal: 10, paddingVertical: 8,
                                            borderBottomWidth: i === COUNTRY_CODES.length - 1 ? 0 : 1,
                                            borderBottomColor: theme.cardBorder,
                                        }}
                                    >
                                        <Text style={{
                                            fontSize: 12,
                                            fontFamily: c.code === code ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                            color: c.code === code ? theme.purple : theme.text,
                                        }}>
                                            {c.flag} {c.code}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

// ─── GuardianCard (boxed sub-card: Name / Number / Relation) ────────────────
function GuardianCard({
    guardian, index, theme, isEditing, onChange,
}: {
    guardian: { name: string; number: string; relation: string };
    index: number; theme: typeof LIGHT; isEditing: boolean;
    onChange: (field: 'name' | 'number' | 'relation', value: string) => void;
}) {
    return (
        <View style={{
            padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.cardBorder,
            backgroundColor: theme.bg, gap: 8,
        }}>
            <Text style={{
                fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: theme.muted,
                textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
                {guardian.relation || `Entry ${index + 1}`}
            </Text>
            <BoxField
                label="Name" theme={theme} value={guardian.name} isEditing={isEditing}
                placeholder="Full Name" onChangeText={t => onChange('name', t)}
            />
            <BoxPhoneField
                label="Number" theme={theme} value={guardian.number} isEditing={isEditing}
                onChange={t => onChange('number', t)}
            />
            <BoxField
                label="Relation" theme={theme} value={guardian.relation} isEditing={isEditing}
                placeholder="e.g. Father" onChangeText={t => onChange('relation', t)}
            />
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StudentDetail() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const router = useRouter();
    const { photo, setPhoto, profile, fetchProfile, saveProfile, uploadPhoto, isSaving } = useStudent();
    const [photoExpanded, setPhotoExpanded] = useState(false);

    const pickPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission needed', 'Allow photo library access to upload a profile picture.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            // Show preview immediately
            setPhoto(asset.uri);
            // Upload to server
            const mimeType = asset.mimeType ?? 'image/jpeg';
            try { await uploadPhoto(asset.uri, mimeType); } catch { /* preview stays */ }
        }
    };

    // ── State ──
    const profileData = {
        name: profile?.name ?? '',
        gender: profile?.gender ?? '',
        rollNo: profile?.rollNo ?? '',
        standard: profile?.standard ?? '',
        batch: '',
        div: profile?.division ?? '',
        sem: '',
        dob: profile?.dob ?? '',
        email: profile?.email ?? '',
        bloodGroup: profile?.bloodGroup ?? '',
        aadhar: profile?.aadharNo ?? '',
        pan: profile?.panNo ?? '',
        houseColor: profile?.houseColor ?? '',
        address: profile?.address ?? '',
        city: profile?.city ?? '',
        state: profile?.state ?? '',
        pincode: profile?.pincode ?? '',
        country: profile?.country ?? '',
        contactNo: profile?.phone ?? '',
        emergencyContact: profile?.emergencyContact ?? '',
        guardians: profile?.guardians ?? [],
        nationality: profile?.nationality ?? '',
        religion: profile?.religion ?? '',
        category: profile?.category ?? '',
        admissionYear: profile?.admissionYear ?? '',
        uid: profile?.studentId ?? '',
    };
    const [data, setData] = useState(INITIAL_STUDENT);
    const [draft, setDraft] = useState(INITIAL_STUDENT);

    useEffect(() => {
        fetchProfile();
    }, []);

    useEffect(() => {
        if (profile) {
            setData(profileData);
            setDraft(profileData);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    // Which section is editing
    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [uidCopied, setUidCopied] = useState(false);


    const startEdit = (section: string) => {
        setDraft({ ...data });
        setEditingSection(section);
    };
    const saveEdit = async () => {
        await saveProfile({
            name: draft.name,
            gender: draft.gender,
            dob: draft.dob,
            phone: draft.contactNo,
            religion: draft.religion,
            category: draft.category,
            nationality: draft.nationality,
            admissionYear: draft.admissionYear,
            bloodGroup: draft.bloodGroup,
            aadharNo: draft.aadhar,
            panNo: draft.pan,
            emergencyContact: draft.emergencyContact,
            address: draft.address,
            city: draft.city,
            state: draft.state,
            pincode: draft.pincode,
            country: draft.country,
            guardians: draft.guardians,
        });
        setEditingSection(null);
    };
    const cancelEdit = () => {
        setDraft({ ...data });
        setEditingSection(null);
    };

    const isEditing = (section: string) => editingSection === section;

    const updateGuardian = (index: number, field: 'name' | 'number' | 'relation', value: string) => {
        setDraft(d => ({
            ...d,
            guardians: d.guardians.map((g, i) => (i === index ? { ...g, [field]: value } : g)),
        }));
    };

    // Computed
    const dobDate = new Date(data.dob);
    const age = new Date().getFullYear() - dobDate.getFullYear();
    const dobDisplay = dobDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const initials = data.name.split(' ').map(n => n[0]).join('');

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="My Profile" showBack />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

                {/* ── Avatar Banner ── */}
                <View style={styles.heroCardWrap}>
                    <View style={[styles.heroCard, { borderColor: isDark ? 'rgba(167,139,250,0.16)' : theme.cardBorder, shadowColor: theme.purple }]}>
                        <LinearGradient
                            colors={isDark ? ['#4C1D95', '#2D1F50'] : ['#7C3AED', '#5B21B6']}
                            style={styles.banner}
                        >
                            <View style={styles.avatarWrap}>
                                <TouchableOpacity
                                    activeOpacity={photo ? 0.85 : 1}
                                    onPress={() => photo && setPhotoExpanded(true)}
                                >
                                    <LinearGradient colors={['#A78BFA', '#7C3AED']} style={styles.avatar}>
                                        {photo
                                            ? <Image source={{ uri: photo }} style={styles.avatarImage} />
                                            : <Text style={styles.avatarText}>{initials}</Text>
                                        }
                                    </LinearGradient>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={pickPhoto}
                                    style={styles.cameraBtn}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient colors={['#E8876A', '#DA7756', '#C06040']} style={styles.cameraBtnGradient}>
                                        <Camera size={13} color="white" />
                                    </LinearGradient>
                                </TouchableOpacity>
                                <PhotoViewerModal visible={photoExpanded} photoUrl={photo} onClose={() => setPhotoExpanded(false)} />
                            </View>
                            <Text style={styles.bannerName}>{data.name}</Text>
                            <Text style={styles.bannerSub}>
                                Class {data.standard.replace(/^Class\s*/i, '')} · Division {data.div.includes('-') ? data.div.split('-').slice(1).join('-') : data.div.replace(/^Division\s*/i, '')}
                            </Text>
                            <View style={styles.bannerChipRow}>
                                <View style={styles.bannerChip}><Text style={styles.bannerChipText}>Roll No: {data.rollNo}</Text></View>
                                <View style={styles.bannerChip}><Text style={styles.bannerChipText}>{data.standard}</Text></View>
                                <View style={styles.bannerChip}><Text style={styles.bannerChipText}>{data.admissionYear}</Text></View>
                            </View>
                        </LinearGradient>

                        {/* UID strip */}
                        <View style={[styles.uidStrip, { backgroundColor: isDark ? '#241A3D' : theme.purpleLight }]}>
                            <Hash size={13} color={theme.muted} />
                            <Text style={[styles.uidText, { color: '#DA7756' }]} numberOfLines={1}>{data.uid}</Text>
                            <TouchableOpacity
                                onPress={async () => {
                                    await Clipboard.setStringAsync(data.uid);
                                    setUidCopied(true);
                                    setTimeout(() => setUidCopied(false), 1500);
                                }}
                                style={[styles.copyBtn, { borderWidth: 1, borderColor: theme.muted }]}
                            >
                                <Copy size={10} color={theme.muted} />
                                <Text style={[styles.copyBtnText, { color: theme.muted }]}>{uidCopied ? 'Copied!' : 'Copy'}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Status pill */}
                        <View style={[styles.statusPill, {
                            backgroundColor: theme.card,
                            borderTopColor: isDark ? 'rgba(167,139,250,0.16)' : theme.cardBorder,
                        }]}>
                            <View style={styles.statusRow}>
                                <Text style={[styles.statusLabel, { color: theme.muted }]}>Status</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <PulsingDot color={theme.green} />
                                    <Text style={[styles.statusValue, { color: theme.green }]}>Active</Text>
                                </View>
                            </View>
                            <View style={styles.statusRow}>
                                <Text style={[styles.statusLabel, { color: theme.muted }]}>Blood Group</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Heart size={11} color={theme.red} />
                                    <Text style={[styles.statusValue, { color: theme.red, fontFamily: 'Poppins_700Bold' }]}>{data.bloodGroup}</Text>
                                </View>
                            </View>
                            <View style={styles.statusRow}>
                                <Text style={[styles.statusLabel, { color: theme.muted }]}>Emergency</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Phone size={11} color={theme.muted} />
                                    <Text style={[styles.statusValue, { color: theme.text }]}>{data.emergencyContact}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.body}>

                    {/* ── Basic Info ── */}
                    <Card theme={theme}>
                        <SectionTitle
                            icon={<User size={15} color={theme.purple} />}
                            title="Student Info" color={theme.purple} theme={theme}
                            editable isEditing={isEditing('basic')}
                            onEdit={() => startEdit('basic')}
                            onSave={saveEdit} onCancel={cancelEdit}
                        />
                        <InfoRow label="Full Name" value={isEditing('basic') ? draft.name : data.name}
                            theme={theme} isEditing={isEditing('basic')} editable
                            placeholder="Full Name"
                            onChangeText={t => setDraft(d => ({ ...d, name: t }))} />
                        <InfoRow label="Date of Birth" value={isEditing('basic') ? draft.dob : `${dobDisplay} (${age} yrs)`}
                            theme={theme} isEditing={isEditing('basic')} editable
                            placeholder="YYYY-MM-DD"
                            onChangeText={t => setDraft(d => ({ ...d, dob: formatDob(t) }))} />
                        <DropdownRow label="Gender" value={isEditing('basic') ? draft.gender : toTitleCase(data.gender)}
                            options={['Male', 'Female', 'Other']}
                            theme={theme} isEditing={isEditing('basic')}
                            onSelect={v => setDraft(d => ({ ...d, gender: v }))} />
                        <InfoRow label="Religion" value={isEditing('basic') ? draft.religion : data.religion}
                            theme={theme} isEditing={isEditing('basic')} editable
                            placeholder="e.g. Hindu"
                            onChangeText={t => setDraft(d => ({ ...d, religion: t }))} />
                        <DropdownRow label="Category" value={isEditing('basic') ? draft.category : data.category}
                            options={['General', 'OBC', 'SC', 'ST', 'EWS', 'Other']}
                            theme={theme} isEditing={isEditing('basic')}
                            onSelect={v => setDraft(d => ({ ...d, category: v }))} />
                        <InfoRow label="Nationality" value={isEditing('basic') ? draft.nationality : data.nationality}
                            theme={theme} isEditing={isEditing('basic')} editable
                            placeholder="e.g. Indian"
                            onChangeText={t => setDraft(d => ({ ...d, nationality: t }))} />
                        <InfoRow label="Admission Year" value={isEditing('basic') ? draft.admissionYear : data.admissionYear}
                            theme={theme} isEditing={isEditing('basic')} editable
                            placeholder="e.g. 2022"
                            onChangeText={t => {
                                const digits = t.replace(/\D/g, '');
                                if (digits.length <= 4) setDraft(d => ({ ...d, admissionYear: digits }));
                            }} />
                        <InfoRow label="Email" value={isEditing('basic') ? draft.email : data.email}
                            theme={theme} isEditing={isEditing('basic')} editable
                            showInfo={true}
                            placeholder="e.g. name@example.com"
                            onChangeText={t => setDraft(d => ({ ...d, email: t }))} />
                        <PhoneRow label="Contact No" value={isEditing('basic') ? draft.contactNo : data.contactNo}
                            theme={theme} isEditing={isEditing('basic')}
                            onChange={v => setDraft(d => ({ ...d, contactNo: v }))} />
                    </Card>

                    {/* ── Medical & Identity ── */}
                    <Card theme={theme}>
                        <SectionTitle
                            icon={<Droplets size={15} color={theme.red} />}
                            title="Medical & Identity" color={theme.red} theme={theme}
                            editable isEditing={isEditing('medical')}
                            onEdit={() => startEdit('medical')}
                            onSave={saveEdit} onCancel={cancelEdit}
                        />

                        {/* Blood Group */}
                        {isEditing('medical') ? (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular', marginBottom: 4 }}>Blood Group</Text>
                                <TextInput
                                    value={draft.bloodGroup}
                                    onChangeText={t => setDraft(d => ({ ...d, bloodGroup: t }))}
                                    style={{
                                        borderWidth: 1.5, borderColor: theme.red, borderRadius: 10,
                                        paddingHorizontal: 12, paddingVertical: 8,
                                        fontSize: 18, fontFamily: 'Poppins_700Bold', color: theme.red,
                                        backgroundColor: theme.redLight,
                                    }}
                                    placeholderTextColor={theme.muted}
                                />
                            </View>
                        ) : (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: 10,
                                padding: 12, backgroundColor: theme.redLight,
                                borderRadius: 14, marginBottom: 12,
                            }}>
                                <Heart size={20} color={theme.red} />
                                <View>
                                    <Text style={{ fontSize: 11, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Blood Group</Text>
                                    <Text style={{ fontSize: 22, fontFamily: 'Poppins_800ExtraBold', color: theme.red }}>{data.bloodGroup}</Text>
                                </View>
                            </View>
                        )}

                        <InfoRow label="Aadhar Card No" value={isEditing('medical') ? draft.aadhar : data.aadhar}
                            theme={theme} isEditing={isEditing('medical')} editable
                            placeholder="XXXX XXXX XXXX"
                            onChangeText={t => setDraft(d => ({ ...d, aadhar: formatAadhar(t) }))} />
                        <InfoRow label="PAN Number" value={isEditing('medical') ? draft.pan : data.pan}
                            theme={theme} isEditing={isEditing('medical')} editable
                            placeholder="ABCDE1234F"
                            onChangeText={t => {
                                if (t.replace(/\s/g, '').length <= 10) setDraft(d => ({ ...d, pan: t.toUpperCase() }));
                            }} />
                        <PhoneRow label="Emergency Contact" value={isEditing('medical') ? draft.emergencyContact : data.emergencyContact}
                            theme={theme} isEditing={isEditing('medical')}
                            onChange={v => setDraft(d => ({ ...d, emergencyContact: v }))} />
                    </Card>

                    {/* ── Academic (no edit) ── */}
                    <Card theme={theme}>
                        <SectionTitle
                            icon={<FileText size={15} color={theme.blue} />}
                            title="Academic Details" color={theme.blue} theme={theme}
                            editable={false}
                        />
                        <InfoRow label="Class" value={data.standard.replace(/^Class\s*/i, '')} theme={theme} />
                        <InfoRow label="Division" value={data.div.includes('-') ? data.div.split('-').slice(1).join('-') : data.div.replace(/^Division\s*/i, '')} theme={theme} />
                        <InfoRow label="Roll No" value={data.rollNo} theme={theme} />
                        <InfoRow label="House Color" value={data.houseColor.replace(/\s*House\s*/i, ' ').trim()} theme={theme} />
                        {/* Student ID (read only) */}
                        <View style={{ marginTop: 14 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.muted, marginBottom: 4 }}>Student ID</Text>
                            <View style={{
                                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
                                borderWidth: 1, borderColor: theme.cardBorder,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                            }}>
                                <Text style={{ fontSize: 13, fontFamily: 'RobotoMono_600SemiBold', color: '#DA7756' }}>{data.uid}</Text>
                                <Text style={{ fontSize: 10, color: theme.muted, fontFamily: 'Poppins_400Regular' }}>Read only</Text>
                            </View>
                        </View>
                        {/* Lock notice */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, backgroundColor: theme.blueLight, borderRadius: 10 }}>
                            <Text style={{ fontSize: 14 }}>🔒</Text>
                            <Text style={{ fontSize: 11, color: theme.blue, fontFamily: 'Poppins_400Regular', flex: 1 }}>
                                Academic details can only be updated by your institution.
                            </Text>
                        </View>
                    </Card>

                    {/* ── Address ── */}
                    <Card theme={theme}>
                        <SectionTitle
                            icon={<Home size={15} color={theme.amber} />}
                            title="Address" color={theme.amber} theme={theme}
                            editable isEditing={isEditing('address')}
                            onEdit={() => startEdit('address')}
                            onSave={saveEdit} onCancel={cancelEdit}
                        />
                        <EditableTextBlock
                            label="Address"
                            value={isEditing('address') ? draft.address : data.address}
                            theme={theme}
                            isEditing={isEditing('address')}
                            onChangeText={t => setDraft(d => ({ ...d, address: t }))}
                            placeholder="Street / Area"
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <BoxField
                                label="City" theme={theme}
                                value={isEditing('address') ? draft.city : data.city}
                                isEditing={isEditing('address')}
                                placeholder="Mumbai"
                                onChangeText={t => setDraft(d => ({ ...d, city: t }))}
                            />
                            <BoxField
                                label="State" theme={theme}
                                value={isEditing('address') ? draft.state : data.state}
                                isEditing={isEditing('address')}
                                placeholder="Maharashtra"
                                onChangeText={t => setDraft(d => ({ ...d, state: t }))}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <BoxField
                                label="Pincode" theme={theme}
                                value={isEditing('address') ? draft.pincode : data.pincode}
                                isEditing={isEditing('address')}
                                placeholder="400001"
                                onChangeText={t => setDraft(d => ({ ...d, pincode: t }))}
                            />
                            <BoxField
                                label="Country" theme={theme}
                                value={isEditing('address') ? draft.country : data.country}
                                isEditing={isEditing('address')}
                                placeholder="India"
                                onChangeText={t => setDraft(d => ({ ...d, country: t }))}
                            />
                        </View>
                    </Card>

                    {/* ── Parents / Guardian ── */}
                    <Card theme={theme}>
                        <SectionTitle
                            icon={<Users size={15} color={theme.green} />}
                            title="Parents / Guardian" color={theme.green} theme={theme}
                            editable isEditing={isEditing('parents')}
                            onEdit={() => startEdit('parents')}
                            onSave={saveEdit} onCancel={cancelEdit}
                        />
                        <View style={{ gap: 10 }}>
                            {(isEditing('parents') ? draft.guardians : data.guardians).length === 0 && !isEditing('parents') && (
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.muted, textAlign: 'center', paddingVertical: 8 }}>
                                    No parents or guardians added yet
                                </Text>
                            )}
                            {(isEditing('parents') ? draft.guardians : data.guardians).map((g, i) => (
                                <View key={i}>
                                    <GuardianCard
                                        guardian={g}
                                        index={i}
                                        theme={theme}
                                        isEditing={isEditing('parents')}
                                        onChange={(field, value) => updateGuardian(i, field, value)}
                                    />
                                    {isEditing('parents') && (
                                        <TouchableOpacity
                                            onPress={() => setDraft(d => ({ ...d, guardians: d.guardians.filter((_, gi) => gi !== i) }))}
                                            style={{ alignSelf: 'flex-end', marginTop: 4 }}
                                        >
                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.red }}>Remove</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                            {isEditing('parents') && (
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => setDraft(d => ({ ...d, guardians: [...d.guardians, { name: '', number: '', relation: 'Father' }] }))}
                                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.green }}
                                    >
                                        <Text style={{ fontSize: 15, color: theme.green, lineHeight: 17 }}>+</Text>
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.green }}>Add Parent</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setDraft(d => ({ ...d, guardians: [...d.guardians, { name: '', number: '', relation: 'Guardian' }] }))}
                                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.blue }}
                                    >
                                        <Text style={{ fontSize: 15, color: theme.blue, lineHeight: 17 }}>+</Text>
                                        <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.blue }}>Add Guardian</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </Card>

                    {/* ── Privacy Note ── */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: theme.purpleLight, borderRadius: 14 }}>
                        <Shield size={14} color={theme.purple} />
                        <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.purple, flex: 1 }}>
                            Your personal data is encrypted and only visible to you and authorized staff.
                        </Text>
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    banner: { paddingTop: 30, paddingBottom: 18, alignItems: 'center', gap: 6 },
    avatarWrap: { position: 'relative', marginBottom: 4 },
    avatar: { width: 88, height: 88, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { fontSize: 30, fontFamily: 'Poppins_700Bold', color: 'white' },
    cameraBtn: {
        position: 'absolute', bottom: -4, right: -4, width: 26, height: 26,
        borderRadius: 13, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 4,
    },
    cameraBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    bannerName: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: 'white' },
    bannerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.75)', marginTop: -7 },
    bannerChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: -2, paddingHorizontal: 16 },
    bannerChip: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 },
    bannerChipText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: 'white' },
    heroCardWrap: { paddingHorizontal: 14, paddingTop: 14 },
    heroCard: {
        borderRadius: 20, borderWidth: 1, overflow: 'hidden',
        shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8,
    },
    uidStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
    uidText: { flex: 1, fontSize: 12, fontFamily: 'RobotoMono_600SemiBold', letterSpacing: 0.6 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    copyBtnText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    statusPill: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, gap: 7 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    statusValue: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    body: { padding: 14, gap: 14 },
});