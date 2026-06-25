import { ScreenHeader } from '@/components/ScreenHeader';
import { useInstitution } from '@/context/InstitutionContext';
import { useTheme } from '@/context/ThemeContext';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import {
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LIGHT = {
    bg: '#FAF8FF', card: '#FFFFFF', cardBorder: '#EDE9FE',
    text: '#0F172A', subText: '#64748B', muted: '#94A3B8',
    purple: '#7C3AED', purpleLight: '#EDE9FE',
};
const DARK = {
    bg: '#0F0A1E', card: '#1A1030', cardBorder: '#2D1F50',
    text: '#F1F5F9', subText: '#94A3B8', muted: '#64748B',
    purple: '#A78BFA', purpleLight: '#2D1F50',
};

type EventType = 'holiday' | 'test' | 'exam' | 'submission';
interface CalEvent { date: number; type: EventType; label: string; }

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.floor((width - 92) / 7);
const SCHOOL_EVENTS: CalEvent[] = [
    { date: 1, type: 'holiday', label: 'Maharashtra Day' },
    { date: 5, type: 'test', label: 'Mathematics 1 Unit Test' },
    { date: 10, type: 'submission', label: 'History Assignment Due' },
    { date: 14, type: 'holiday', label: 'Budget Holiday' },
    { date: 18, type: 'test', label: 'Science 1 Quiz' },
    { date: 22, type: 'exam', label: 'Half Yearly Exam — English' },
    { date: 23, type: 'exam', label: 'Half Yearly Exam — Maths 1' },
    { date: 25, type: 'submission', label: 'Geography Project Due' },
    { date: 28, type: 'exam', label: 'Half Yearly Exam — Science 1' },
];

const COLLEGE_EVENTS: CalEvent[] = [
    { date: 1, type: 'holiday', label: 'Maharashtra Day' },
    { date: 5, type: 'test', label: 'DS Unit Test 1' },
    { date: 5, type: 'test', label: 'OS Unit Test 1' },
    { date: 10, type: 'submission', label: 'ML Assignment Due' },
    { date: 14, type: 'holiday', label: 'Budget Holiday' },
    { date: 18, type: 'test', label: 'DBMS Quiz' },
    { date: 22, type: 'exam', label: 'Mid Semester Exam — DS' },
    { date: 23, type: 'exam', label: 'Mid Semester Exam — OS' },
    { date: 25, type: 'submission', label: 'Major Project Report Due' },
    { date: 28, type: 'exam', label: 'Mid Semester Exam — CN' },
];

const EVENT_CFG = {
    holiday: { dot: '#EF4444', bg: '#FEE2E2', text: '#991B1B', darkBg: '#2B0D0D', darkText: '#F87171', label: 'Holiday', emoji: '🏖️' },
    test: { dot: '#3B82F6', bg: '#DBEAFE', text: '#1D4ED8', darkBg: '#0D1F3C', darkText: '#60A5FA', label: 'Test', emoji: '📝' },
    exam: { dot: '#F59E0B', bg: '#FEF3C7', text: '#92400E', darkBg: '#2D2010', darkText: '#FCD34D', label: 'Main Exam', emoji: '🎓' },
    submission: { dot: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6', darkBg: '#2D1F50', darkText: '#A78BFA', label: 'Submission', emoji: '📤' },
} as const;

type PostType = 'announcement' | 'notice' | 'material' | 'result';
interface FeedPost {
    id: number; type: PostType; author: string; role: string;
    subject?: string; title: string; body: string; time: string;
    attachments?: { name: string; kind: 'pdf' | 'link' }[];
}

const COLLEGE_FEED_POSTS: FeedPost[] = [
    {
        id: 1, type: 'announcement', author: 'Dr. Ashwini Save', role: 'Faculty', subject: 'SMA',
        title: 'Unit 3 syllabus revised',
        body: 'Chapter 7 has been removed from Unit 3. Focus only on chapters 5 & 6 for the upcoming test. Updated notes will be uploaded by tomorrow evening.',
        time: '2h ago'
    },
    {
        id: 2, type: 'material', author: 'Prof. Sunita Naik', role: 'Faculty', subject: 'Deep Learning',
        title: 'CNN Notes — Unit 4',
        body: 'Uploaded complete notes for Convolutional Neural Networks. Please go through before the next lecture on Friday.',
        time: '5h ago', attachments: [{ name: 'CNN_Unit4_Notes.pdf', kind: 'pdf' }]
    },
    {
        id: 3, type: 'notice', author: 'HOD Office', role: 'Admin',
        title: 'Campus closed on 14th May',
        body: 'The institute will remain closed on 14th May due to a state-declared holiday. All pending submissions are extended by 2 days automatically.',
        time: '1d ago'
    },
    {
        id: 4, type: 'result', author: 'Prof. Bhavika Thakur', role: 'Faculty', subject: 'DC',
        title: 'Unit Test 1 Results Published',
        body: 'Results for Distributed Computing Unit Test 1 are now live. Check your marks in the Tests section. Batch average: 31/40.',
        time: '2d ago'
    },
    {
        id: 5, type: 'announcement', author: 'Prof. Akshata Raut', role: 'Faculty', subject: 'PM',
        title: 'Guest Lecture on Agile — 20th May',
        body: 'Industry expert from TCS speaking on Agile methodologies. Attendance is compulsory. Venue: Seminar Hall B, 11 AM.',
        time: '3d ago'
    },
    {
        id: 6, type: 'material', author: 'Prof. Bhavika Thakur', role: 'Faculty', subject: 'DC',
        title: 'MapReduce Reference Sheet',
        body: 'Quick reference sheet for MapReduce paradigm. Useful for Unit Test 2 and the semester exam.',
        time: '4d ago', attachments: [{ name: 'MapReduce_Ref.pdf', kind: 'pdf' }, { name: 'Practice Problems', kind: 'link' }]
    },
];

const SCHOOL_FEED_POSTS: FeedPost[] = [
    {
        id: 1, type: 'announcement', author: 'Mrs. Priya Sharma', role: 'Faculty', subject: 'M1',
        title: 'Chapter 5 syllabus revised',
        body: 'Algebra chapter 5 topics have been updated. Students are requested to focus on quadratic equations only. Notes will be shared by tomorrow.',
        time: '2h ago'
    },
    {
        id: 2, type: 'material', author: 'Mr. Rahul Verma', role: 'Faculty', subject: 'S1',
        title: 'Physics Notes — Chapter 3',
        body: 'Complete notes for Laws of Motion uploaded. Please revise before the unit test on Friday.',
        time: '5h ago', attachments: [{ name: 'Physics_Ch3_Notes.pdf', kind: 'pdf' }]
    },
    {
        id: 3, type: 'notice', author: 'Principal Office', role: 'Admin',
        title: 'School closed on 14th May',
        body: 'School will remain closed on 14th May due to a state-declared holiday. All pending submissions are extended by 2 days automatically.',
        time: '1d ago'
    },
    {
        id: 4, type: 'result', author: 'Mrs. Sunita Rao', role: 'Faculty', subject: 'Eng',
        title: 'Unit Test 1 Results Published',
        body: 'Results for English Unit Test 1 are now live. Check your marks in the Tests section. Class average: 28/40.',
        time: '2d ago'
    },
    {
        id: 5, type: 'announcement', author: 'Mr. Anil Kumar', role: 'Faculty', subject: 'His',
        title: 'History Project Submission — 20th May',
        body: 'All students must submit their history projects by 20th May. Late submissions will not be accepted. Format: A4 size, handwritten.',
        time: '3d ago'
    },
    {
        id: 6, type: 'material', author: 'Mrs. Deepa Nair', role: 'Faculty', subject: 'Geo',
        title: 'Map Work Reference Sheet',
        body: 'Reference sheet for map work uploaded. Useful for unit test and half yearly exam preparation.',
        time: '4d ago', attachments: [{ name: 'MapWork_Ref.pdf', kind: 'pdf' }, { name: 'Practice Questions', kind: 'link' }]
    },
];

const POST_META = {
    announcement: { emoji: '📢', label: 'Announcement', color: '#D97706', darkColor: '#FCD34D', bg: '#FEF3C7', darkBg: '#2D2010' },
    notice: { emoji: '📌', label: 'Notice', color: '#DC2626', darkColor: '#F87171', bg: '#FEE2E2', darkBg: '#2B0D0D' },
    material: { emoji: '📄', label: 'Material', color: '#2563EB', darkColor: '#60A5FA', bg: '#DBEAFE', darkBg: '#0D1F3C' },
    result: { emoji: '✅', label: 'Result', color: '#059669', darkColor: '#34D399', bg: '#D1FAE5', darkBg: '#0D2B20' },
} as const;

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay(); }

function MiniCalendar({ theme, isDark, events }: { theme: typeof LIGHT; isDark: boolean; events: CalEvent[] }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    const today = now.getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const startOffset = (getFirstDay(year, month) + 6) % 7;
    const daysInMonth = getDaysInMonth(year, month);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const eventsOn = (d: number) => events.filter(e => e.date === d);
    const typesOn = (d: number) => [...new Set(eventsOn(d).map(e => e.type))];

    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelectedDate(null); };


    return (
        <>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: -5, marginTop: -3 }}>
                📅 Academic Calendar
            </Text>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.calHeader}>
                    <TouchableOpacity onPress={prevMonth}
                        style={[styles.navBtn, { borderColor: theme.cardBorder }]}
                        activeOpacity={0.7}>
                        <ChevronLeft size={18} color={theme.purple} />
                    </TouchableOpacity>
                    <Text style={[styles.monthTitle, { color: theme.text }]}>{MONTHS[month]} {year}</Text>
                    <TouchableOpacity onPress={nextMonth}
                        style={[styles.navBtn, { borderColor: theme.cardBorder }]}
                        activeOpacity={0.7}>
                        <ChevronRight size={18} color={theme.purple} />
                    </TouchableOpacity>
                </View>

                <View style={styles.dayHeaderRow}>
                    {DAYS.map((d, i) => (
                        <Text key={i} style={[styles.dayHeader, { color: i >= 5 ? '#EF4444' : theme.muted }]}>{d}</Text>
                    ))}
                </View>

                <View style={styles.grid}>
                    {cells.map((d, i) => {
                        if (!d) return <View key={i} style={styles.gridCell} />;
                        const isToday = isCurrentMonth && d === today;
                        const isSelected = d === selectedDate;
                        const types = typesOn(d);
                        const isWeekend = (i % 7) >= 5;
                        return (
                            // Date number + dots wala part change karo:
                            <TouchableOpacity
                                key={i}
                                style={[
                                    styles.gridCell,
                                    isSelected && { backgroundColor: theme.purpleLight, borderRadius: 99 },
                                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.purple, borderRadius: 99 },
                                ]}
                                onPress={() => {
                                    setSelectedDate(d);
                                    if (eventsOn(d).length > 0) { setModalVisible(true); }
                                }}
                                activeOpacity={0.75}
                            >
                                <Text style={[styles.dateNum, {
                                    color: isSelected ? theme.purple : isToday ? theme.purple : isWeekend ? '#EF4444' : theme.text,
                                    fontFamily: isToday ? 'Poppins_700Bold' : 'Poppins_400Regular',
                                }]}>{d}</Text>
                                {eventsOn(d).length > 0 && (
                                    <View style={styles.dotRow}>
                                        {eventsOn(d).slice(0, 3).map((ev, di) => (
                                            <View key={di} style={[styles.eventDot, { backgroundColor: EVENT_CFG[ev.type].dot }]} />
                                        ))}
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={[styles.legendRow, { borderTopColor: theme.cardBorder }]}>
                    {(Object.keys(EVENT_CFG) as EventType[]).map(type => (
                        <View key={type} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: EVENT_CFG[type].dot }]} />
                            <Text style={[styles.legendText, { color: theme.muted }]}>{EVENT_CFG[type].label}</Text>
                        </View>
                    ))}
                </View>

                <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
                    <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
                        <Pressable style={[styles.modalCard, { backgroundColor: isDark ? '#1A1030' : 'white' }]} onPress={() => { }}>
                            <Text style={[styles.modalDateTitle, { color: theme.text }]}>
                                📅 {selectedDate} {MONTHS_S[month]}, {year}
                            </Text>
                            <View style={{ gap: 10 }}>
                                {selectedDate && eventsOn(selectedDate).map((ev, i) => {
                                    const c = EVENT_CFG[ev.type];
                                    return (
                                        <View key={i} style={[styles.modalEventRow, { backgroundColor: isDark ? c.darkBg : c.bg, borderLeftColor: c.dot }]}>
                                            <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.modalEventType, { color: isDark ? c.darkText : c.text }]}>{c.label}</Text>
                                                <Text style={[styles.modalEventLabel, { color: isDark ? c.darkText : c.text }]}>{ev.label}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                            <TouchableOpacity
                                style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#2D1F50' : '#EDE9FE' }]}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={{ color: theme.purple, fontFamily: 'Poppins_600SemiBold', fontSize: 13 }}>Close</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>
            </View>
        </>
    );
}

function FeedCard({ post, theme, isDark }: { post: FeedPost; theme: typeof LIGHT; isDark: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const meta = POST_META[post.type];
    const initials = post.author.split(' ').map(n => n[0]).join('').slice(0, 2);
    const avatarClrs = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];
    const avatarColor = avatarClrs[post.author.charCodeAt(0) % avatarClrs.length];

    return (
        <View style={[styles.feedCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.typeChip, { backgroundColor: isDark ? meta.darkBg : meta.bg }]}>
                <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
                <Text style={[styles.typeChipText, { color: isDark ? meta.darkColor : meta.color }]}>{meta.label}</Text>
                {post.subject ? <Text style={[styles.subjectTag, { color: isDark ? meta.darkColor : meta.color }]}>· {post.subject}</Text> : null}
            </View>

            <View style={styles.authorRow}>
                <View style={[styles.avatar, { backgroundColor: avatarColor + '22', borderColor: avatarColor }]}>
                    <Text style={[styles.avatarText, { color: avatarColor }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.authorName, { color: theme.text }]}>{post.author}</Text>
                    <Text style={[styles.authorMeta, { color: theme.muted }]}>{post.role} · {post.time}</Text>
                </View>
            </View>

            <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>
            <Text style={[styles.postBody, { color: theme.subText }]} numberOfLines={expanded ? undefined : 2}>{post.body}</Text>

            {post.attachments && expanded && (
                <View style={{ gap: 6, marginTop: 4 }}>
                    {post.attachments.map((att, i) => (
                        <TouchableOpacity key={i} activeOpacity={0.8}
                            style={[styles.attachment, { backgroundColor: isDark ? '#0D1F3C' : '#EFF6FF', borderColor: isDark ? '#1E3A8A' : '#BFDBFE' }]}>
                            <Text style={{ fontSize: 14 }}>{att.kind === 'pdf' ? '📄' : '🔗'}</Text>
                            <Text style={[styles.attachmentName, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>{att.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <TouchableOpacity style={styles.expandRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                {expanded ? <ChevronUp size={13} color={theme.muted} /> : <ChevronDown size={13} color={theme.muted} />}
                <Text style={[styles.expandText, { color: theme.muted }]}>{expanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
        </View>
    );
}

const FILTERS: { key: PostType | 'all'; label: string; emoji: string }[] = [
    { key: 'all', label: 'All', emoji: '🗂️' },
    { key: 'announcement', label: 'Alerts', emoji: '📢' },
    { key: 'notice', label: 'Notice', emoji: '📌' },
    { key: 'material', label: 'Files', emoji: '📄' },
    { key: 'result', label: 'Results', emoji: '✅' },
];

export default function Feed() {
    const { isDark } = useTheme();
    const theme = isDark ? DARK : LIGHT;
    const [activeFilter, setActiveFilter] = useState<PostType | 'all'>('all');
    const { institutionType } = useInstitution();


    const FEED_POSTS = institutionType === 'school' ? SCHOOL_FEED_POSTS : COLLEGE_FEED_POSTS;
    const filteredPosts = activeFilter === 'all' ? FEED_POSTS : FEED_POSTS.filter(p => p.type === activeFilter);
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
            <ScreenHeader title="Feed" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <View style={styles.body}>

                    <MiniCalendar theme={theme} isDark={isDark} events={institutionType === 'school' ? SCHOOL_EVENTS : COLLEGE_EVENTS} />
                    <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: -5, marginTop: -3 }}> 📢 Announcements & Feed  </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                        {FILTERS.map(tab => {
                            const isActive = activeFilter === tab.key;
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[styles.filterChip, {
                                        backgroundColor: isActive ? theme.purple : theme.card,
                                        borderColor: isActive ? theme.purple : theme.cardBorder,
                                    }]}
                                    onPress={() => setActiveFilter(tab.key)}
                                    activeOpacity={0.75}
                                >
                                    <Text style={{ fontSize: 12 }}>{tab.emoji}</Text>
                                    <Text style={[styles.filterChipText, { color: isActive ? 'white' : theme.subText }]}>{tab.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={{ gap: 12 }}>
                        {filteredPosts.map(post => (
                            <FeedCard key={post.id} post={post} theme={theme} isDark={isDark} />
                        ))}
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 14, gap: 14 },

    card: { borderRadius: 20, borderWidth: 1, padding: 16, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },

    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    navBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
    navArrow: { fontSize: 20, fontWeight: '700' },
    monthTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    eventBadge: { paddingHorizontal: 3, paddingVertical: 1, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },

    dayHeaderRow: { flexDirection: 'row', marginBottom: 4, width: CELL_SIZE * 7, alignSelf: 'center' },
    dayHeader: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontFamily: 'Poppins_600SemiBold' },

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
    modalCard: { width: '100%', borderRadius: 24, padding: 20, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 },
    modalDateTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    modalEventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderLeftWidth: 4 },
    modalEventType: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', opacity: 0.75 },
    modalEventLabel: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    modalCloseBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, marginTop: 4 },

    feedDivider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dividerLine: { flex: 1, height: 1 },
    dividerLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    filterRow: { gap: 8, paddingBottom: 2 },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
    filterChipText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

    feedCard: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
    typeChipText: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
    subjectTag: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 38, height: 38, borderRadius: 99, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    authorName: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    authorMeta: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    postTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', lineHeight: 20 },
    postBody: { fontSize: 12, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
    attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
    attachmentName: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', flex: 1 },
    expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    expandText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
});