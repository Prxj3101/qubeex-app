import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { Check, ClipboardList, Pencil, Pin, Plus, StickyNote, X } from 'lucide-react-native';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Note {
    id: string;
    text: string;
    color: string;
    createdAt: string;
}

interface Task {
    id: string;
    text: string;
    done: boolean;
}

// Same 5 pastel colors as the web TeacherNotepad
const NOTE_COLORS = [
    { bg: '#FEF08A', border: '#FDE047', text: '#713F12' },
    { bg: '#BBF7D0', border: '#86EFAC', text: '#14532D' },
    { bg: '#BFDBFE', border: '#93C5FD', text: '#1E3A5F' },
    { bg: '#FED7AA', border: '#FDBA74', text: '#7C2D12' },
    { bg: '#E9D5FF', border: '#D8B4FE', text: '#4C1D95' },
];

const ACCENT = ['#E8876A', '#DA7756', '#C06040'];

export interface TeacherNotepadHandle {
    refresh: () => Promise<void>;
}

export const TeacherNotepad = forwardRef<TeacherNotepadHandle>(function TeacherNotepad(_props, ref) {
    const { isDark } = useTheme();
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? '#1E1E1E' : '#F8FAFC';
    const tabTrackBg = isDark ? '#000000' : '#EDEFF3';
    const tabActiveBg = isDark ? '#2A2A2A' : '#FFFFFF';

    const [tab, setTab] = useState<'tasks' | 'notes'>('tasks');
    const [loading, setLoading] = useState(true);

    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState('');
    const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]);
    const [showNoteInput, setShowNoteInput] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingNoteText, setEditingNoteText] = useState('');

    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTask, setNewTask] = useState('');
    const [showTaskInput, setShowTaskInput] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingTaskText, setEditingTaskText] = useState('');

    const fetchNotepad = useCallback(async () => {
        try {
            const res = await api.get('/teacher/notepad');
            const { notes: n, tasks: t } = res.data.data as {
                notes: { id: string; text: string; color: string; createdAt: string }[];
                tasks: { id: string; text: string; done: boolean }[];
            };
            setNotes(n.map((x) => ({
                id: x.id,
                text: x.text,
                color: x.color,
                createdAt: new Date(x.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            })));
            setTasks(t.map((x) => ({ id: x.id, text: x.text, done: x.done })));
        } catch {
            // non-critical widget — leave empty on failure
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchNotepad();
        }, [fetchNotepad])
    );

    useImperativeHandle(ref, () => ({
        refresh: fetchNotepad,
    }), [fetchNotepad]);

    const addNote = () => {
        const t = newNote.trim();
        if (!t) return;
        setNewNote('');
        setShowNoteInput(false);
        Keyboard.dismiss();
        api.post('/teacher/notepad/notes', { text: t, color: selectedColor.bg })
            .then((res) => {
                const created = res.data.data as { id: string; text: string; color: string; createdAt: string };
                setNotes((prev) => [{
                    id: created.id,
                    text: created.text,
                    color: created.color,
                    createdAt: new Date(created.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                }, ...prev]);
            })
            .catch(() => { });
    };

    const addTask = () => {
        const t = newTask.trim();
        if (!t) return;
        setNewTask('');
        setShowTaskInput(false);
        Keyboard.dismiss();
        api.post('/teacher/notepad/tasks', { text: t })
            .then((res) => {
                const created = res.data.data as { id: string; text: string; done: boolean };
                setTasks((prev) => [{ id: created.id, text: created.text, done: created.done }, ...prev]);
            })
            .catch(() => { });
    };

    const toggleTask = (id: string) => {
        const current = tasks.find((t) => t.id === id);
        if (!current) return;
        const done = !current.done;
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
        api.patch(`/teacher/notepad/tasks/${id}`, { done }).catch(() => {
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: current.done } : t)));
        });
    };

    const deleteTask = (id: string) => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        api.delete(`/teacher/notepad/tasks/${id}`).catch(() => { });
    };

    const confirmDeleteTask = (id: string) => {
        Alert.alert('Delete task?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTask(id) },
        ]);
    };

    const saveTaskEdit = (id: string) => {
        const t = editingTaskText.trim();
        setEditingTaskId(null);
        if (!t) return;
        setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, text: t } : task)));
        api.patch(`/teacher/notepad/tasks/${id}`, { text: t }).catch(() => { });
    };

    const deleteNote = (id: string) => {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        api.delete(`/teacher/notepad/notes/${id}`).catch(() => { });
    };

    const confirmDeleteNote = (id: string) => {
        Alert.alert('Delete note?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteNote(id) },
        ]);
    };

    const saveNoteEdit = (id: string) => {
        const t = editingNoteText.trim();
        setEditingNoteId(null);
        if (!t) return;
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text: t } : n)));
        api.patch(`/teacher/notepad/notes/${id}`, { text: t }).catch(() => { });
    };

    const pending = tasks.filter((t) => !t.done).length;
    const done = tasks.filter((t) => t.done).length;

    return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* Header */}
            <View style={styles.headerRow}>
                <Pin size={15} color={subText} />
                <Text style={[styles.headerTitle, { color: text }]}>To-Do List &amp; Notepad</Text>
            </View>

            {/* Tab switcher */}
            <View style={[styles.tabSwitch, { backgroundColor: tabTrackBg }]}>
                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'tasks' && { backgroundColor: tabActiveBg, ...styles.tabBtnActiveShadow }]}
                    onPress={() => setTab('tasks')}
                    activeOpacity={0.8}
                >
                    <ClipboardList size={13} color={tab === 'tasks' ? text : subText} />
                    <Text style={[styles.tabLabel, { color: tab === 'tasks' ? text : subText }]}>Tasks</Text>
                    {pending > 0 && (
                        <View style={[styles.tabBadge, { backgroundColor: ACCENT[1] }]}>
                            <Text style={styles.tabBadgeText}>{pending}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'notes' && { backgroundColor: tabActiveBg, ...styles.tabBtnActiveShadow }]}
                    onPress={() => setTab('notes')}
                    activeOpacity={0.8}
                >
                    <StickyNote size={13} color={tab === 'notes' ? text : subText} />
                    <Text style={[styles.tabLabel, { color: tab === 'notes' ? text : subText }]}>Notes</Text>
                    {notes.length > 0 && (
                        <View style={[styles.tabBadge, { backgroundColor: ACCENT[1] }]}>
                            <Text style={styles.tabBadgeText}>{notes.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator color={ACCENT[1]} />
                </View>
            ) : tab === 'tasks' ? (
                <View style={{ flex: 1 }}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.countText, { color: subText }]}>
                            {pending} pending · <Text style={{ color: '#10B981' }}>{done} done</Text>
                        </Text>
                        <TouchableOpacity
                            style={styles.addBtn}
                            onPress={() => setShowTaskInput((v) => !v)}
                            activeOpacity={0.85}
                        >
                            <Plus size={13} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {showTaskInput && (
                        <View style={styles.inputRow}>
                            <TextInput
                                autoFocus
                                value={newTask}
                                onChangeText={setNewTask}
                                onSubmitEditing={addTask}
                                placeholder="Add task..."
                                placeholderTextColor={subText}
                                style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: cardBorder }]}
                            />
                            <TouchableOpacity style={styles.addTextBtn} onPress={addTask} activeOpacity={0.85}>
                                <Text style={styles.addTextBtnLabel}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {tasks.filter((t) => !t.done).map((task) => (
                            <View key={task.id} style={styles.taskRow}>
                                <TouchableOpacity
                                    onPress={() => toggleTask(task.id)}
                                    style={[styles.checkbox, { borderColor: cardBorder }]}
                                />
                                {editingTaskId === task.id ? (
                                    <>
                                        <TextInput
                                            autoFocus
                                            value={editingTaskText}
                                            onChangeText={setEditingTaskText}
                                            onSubmitEditing={() => saveTaskEdit(task.id)}
                                            style={[styles.editInput, { color: text, borderColor: ACCENT[1] }]}
                                        />
                                        <TouchableOpacity
                                            onPress={() => saveTaskEdit(task.id)}
                                            style={[styles.saveEditBtn, { backgroundColor: '#10B981' }]}
                                        >
                                            <Check size={11} color="#fff" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setEditingTaskId(null)}
                                            style={styles.iconBtn}
                                        >
                                            <X size={13} color={subText} />
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <Text style={[styles.taskText, { color: text }]}>{task.text}</Text>
                                )}
                                {editingTaskId !== task.id && (
                                    <TouchableOpacity
                                        onPress={() => { setEditingTaskId(task.id); setEditingTaskText(task.text); }}
                                        style={styles.iconBtn}
                                    >
                                        <Pencil size={12} color={subText} />
                                    </TouchableOpacity>
                                )}
                                {editingTaskId !== task.id && (
                                    <TouchableOpacity onPress={() => confirmDeleteTask(task.id)} style={styles.iconBtn}>
                                        <X size={13} color={subText} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}

                        {tasks.filter((t) => t.done).length > 0 && (
                            <>
                                <View style={styles.divider}>
                                    <View style={[styles.dividerLine, { backgroundColor: cardBorder }]} />
                                    <Text style={[styles.dividerLabel, { color: subText }]}>DONE</Text>
                                    <View style={[styles.dividerLine, { backgroundColor: cardBorder }]} />
                                </View>
                                {tasks.filter((t) => t.done).map((task) => (
                                    <View key={task.id} style={[styles.taskRow, { opacity: 0.5 }]}>
                                        <TouchableOpacity
                                            onPress={() => toggleTask(task.id)}
                                            style={[styles.checkbox, styles.checkboxDone]}
                                        >
                                            <Check size={10} color="#fff" />
                                        </TouchableOpacity>
                                        <Text style={[styles.taskText, styles.taskTextDone, { color: subText }]}>{task.text}</Text>
                                        <TouchableOpacity onPress={() => confirmDeleteTask(task.id)} style={styles.iconBtn}>
                                            <X size={13} color={subText} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </>
                        )}

                        {tasks.length === 0 && (
                            <View style={styles.emptyBox}>
                                <ClipboardList size={20} color={subText} />
                                <Text style={[styles.emptyText, { color: subText }]}>No tasks yet</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <View style={styles.rowEnd}>
                        <TouchableOpacity
                            style={styles.addBtn}
                            onPress={() => setShowNoteInput((v) => !v)}
                            activeOpacity={0.85}
                        >
                            <Plus size={13} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {showNoteInput && (
                        <View style={{ marginBottom: 8, gap: 6 }}>
                            <View style={styles.colorRow}>
                                {NOTE_COLORS.map((c) => (
                                    <TouchableOpacity
                                        key={c.bg}
                                        onPress={() => setSelectedColor(c)}
                                        style={[
                                            styles.colorDot,
                                            { backgroundColor: c.bg },
                                            selectedColor.bg === c.bg && styles.colorDotSelected,
                                        ]}
                                    />
                                ))}
                            </View>
                            <TextInput
                                autoFocus
                                value={newNote}
                                onChangeText={setNewNote}
                                placeholder="Write a note..."
                                placeholderTextColor={subText}
                                multiline
                                numberOfLines={2}
                                style={[styles.noteInput, { backgroundColor: inputBg, color: text, borderColor: cardBorder }]}
                            />
                            <TouchableOpacity style={styles.addNoteBtn} onPress={addNote} activeOpacity={0.85}>
                                <Text style={styles.addTextBtnLabel}>Add Note</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {notes.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <StickyNote size={20} color={subText} />
                                <Text style={[styles.emptyText, { color: subText }]}>No notes yet</Text>
                            </View>
                        ) : (
                            notes.map((note) => {
                                const c = NOTE_COLORS.find((x) => x.bg === note.color) ?? NOTE_COLORS[0];
                                return (
                                    <View key={note.id} style={[styles.noteCard, { backgroundColor: note.color, borderColor: c.border }]}>
                                        {editingNoteId === note.id ? (
                                            <View style={{ gap: 6 }}>
                                                <TextInput
                                                    autoFocus
                                                    value={editingNoteText}
                                                    onChangeText={setEditingNoteText}
                                                    multiline
                                                    numberOfLines={2}
                                                    style={[styles.noteEditInput, { color: c.text }]}
                                                />
                                                <View style={styles.noteEditActions}>
                                                    <TouchableOpacity
                                                        onPress={() => setEditingNoteId(null)}
                                                        style={styles.noteEditBtn}
                                                    >
                                                        <X size={11} color={c.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => saveNoteEdit(note.id)}
                                                        style={[styles.noteEditBtn, { backgroundColor: 'rgba(0,0,0,0.15)' }]}
                                                    >
                                                        <Check size={11} color={c.text} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <>
                                                <View style={styles.noteActions}>
                                                    <TouchableOpacity
                                                        onPress={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}
                                                        style={styles.noteIconBtn}
                                                    >
                                                        <Pencil size={10} color={c.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => confirmDeleteNote(note.id)}
                                                        style={styles.noteIconBtn}
                                                    >
                                                        <X size={10} color={c.text} />
                                                    </TouchableOpacity>
                                                </View>
                                                <Text style={[styles.noteText, { color: c.text }]}>{note.text}</Text>
                                                <Text style={[styles.noteDate, { color: c.text }]}>{note.createdAt}</Text>
                                            </>
                                        )}
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        height: 340,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
    },
    headerTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    tabSwitch: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 3,
        gap: 3,
        marginBottom: 10,
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 6,
        borderRadius: 8,
    },
    tabBtnActiveShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
        elevation: 2,
    },
    tabLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    tabBadge: {
        minWidth: 15,
        height: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    tabBadgeText: {
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
    },
    loadingBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    rowEnd: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 6,
    },
    countText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    addBtn: {
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ACCENT[1],
    },
    inputRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 8,
    },
    input: {
        flex: 1,
        height: 32,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        ...(Platform.OS === 'android' ? { textAlignVertical: 'center', includeFontPadding: false, paddingTop: 0, paddingBottom: 0 } : null),
    },
    addTextBtn: {
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ACCENT[1],
    },
    addTextBtnLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
    },
    taskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    checkbox: {
        width: 17,
        height: 17,
        borderRadius: 5,
        borderWidth: 2,
    },
    checkboxDone: {
        backgroundColor: '#10B981',
        borderColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskText: {
        flex: 1,
        fontSize: 12.5,
        fontFamily: 'Poppins_400Regular',
    },
    taskTextDone: {
        textDecorationLine: 'line-through',
    },
    editInput: {
        flex: 1,
        height: 26,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    iconBtn: {
        padding: 3,
    },
    saveEditBtn: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginVertical: 4,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerLabel: {
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
    },
    emptyBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        gap: 4,
    },
    emptyText: {
        fontSize: 11.5,
        fontFamily: 'Poppins_400Regular',
    },
    colorRow: {
        flexDirection: 'row',
        gap: 8,
    },
    colorDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotSelected: {
        borderColor: 'rgba(0,0,0,0.4)',
        transform: [{ scale: 1.2 }],
    },
    noteInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        minHeight: 50,
        textAlignVertical: 'top',
    },
    addNoteBtn: {
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ACCENT[1],
    },
    noteCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 10,
        marginBottom: 8,
        position: 'relative',
    },
    noteActions: {
        position: 'absolute',
        top: 6,
        right: 6,
        flexDirection: 'row',
        gap: 4,
    },
    noteIconBtn: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteText: {
        fontSize: 16,
        fontFamily: 'Caveat_700Bold',
        lineHeight: 20,
        paddingRight: 30,
    },
    noteDate: {
        fontSize: 9,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
        opacity: 0.6,
    },
    noteEditInput: {
        fontSize: 15,
        fontFamily: 'Caveat_700Bold',
        backgroundColor: 'rgba(0,0,0,0.08)',
        borderRadius: 6,
        padding: 6,
        minHeight: 44,
        textAlignVertical: 'top',
    },
    noteEditActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 6,
    },
    noteEditBtn: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
