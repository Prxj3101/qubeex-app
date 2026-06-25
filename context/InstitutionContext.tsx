import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
// ─── Types ────────────────────────────────────────────────────────────────────
export type InstitutionType = 'college' | 'school' | 'coaching';

export interface InstitutionConfig {
    type: InstitutionType;
    // Labels
    idFieldLabel: string;        // Roll No | Admission No | Student ID
    classFieldLabel: string;     // Semester | Class | Batch
    divFieldLabel: string;       // Division | Section | Group
    termLabel: string;           // Semester | Term | Module
    batchLabel: string;          // B.Tech CSE | Class 10 | JEE Batch
    // Subjects
    subjects: SubjectConfig[];
    // Test terminology
    testLabel: string;           // Test | Exam | Quiz
    midTermLabel: string;        // Mid Sem | Half Yearly | Module Test
    finalLabel: string;          // End Sem | Annual | Final Test
}

export interface SubjectConfig {
    name: string;
    short: string;
    color: string;
    teacher: string;
}

// ─── Default Configs ──────────────────────────────────────────────────────────
const COLLEGE_CONFIG: InstitutionConfig = {
    type: 'college',
    idFieldLabel: 'Roll No',
    classFieldLabel: 'Semester',
    divFieldLabel: 'Division',
    termLabel: 'Semester',
    batchLabel: 'B.Tech CSE — Division A',
    subjects: [
        { name: 'Data Structures', short: 'DS', color: '#F59E0B', teacher: 'Prof. Amit Shah' },
        { name: 'Operating Systems', short: 'OS', color: '#2563EB', teacher: 'Prof. Rekha Nair' },
        { name: 'DBMS', short: 'DB', color: '#10B981', teacher: 'Prof. Sunil Mehta' },
        { name: 'Computer Networks', short: 'CN', color: '#EF4444', teacher: 'Prof. Anita Roy' },
    ],
    testLabel: 'Test',
    midTermLabel: 'Mid Sem',
    finalLabel: 'End Sem',
};

const SCHOOL_CONFIG: InstitutionConfig = {
    type: 'school',
    idFieldLabel: 'Admission No',
    classFieldLabel: 'Class',
    divFieldLabel: 'Section',
    termLabel: 'Term',
    batchLabel: 'Class 10 — Section A',
    subjects: [
        { name: 'Mathematics 1', short: 'M1', color: '#F59E0B', teacher: 'Mrs. Priya Sharma' },
        { name: 'Mathematics 2', short: 'M2', color: '#F97316', teacher: 'Mr. Rajesh Patil' },
        { name: 'Science 1', short: 'S1', color: '#10B981', teacher: 'Mr. Rahul Verma' },
        { name: 'Science 2', short: 'S2', color: '#06B6D4', teacher: 'Mrs. Anita Desai' },
        { name: 'English', short: 'Eng', color: '#2563EB', teacher: 'Mrs. Sunita Rao' },
        { name: 'Hindi', short: 'Hindi', color: '#7C3AED', teacher: 'Mrs. Kavita Joshi' },
        { name: 'Marathi', short: 'Mar', color: '#EC4899', teacher: 'Mr. Suresh Kulkarni' },
        { name: 'History', short: 'His', color: '#EF4444', teacher: 'Mr. Anil Kumar' },
        { name: 'Geography', short: 'Geo', color: '#84CC16', teacher: 'Mrs. Deepa Nair' },
    ],
    testLabel: 'Exam',
    midTermLabel: 'Half Yearly',
    finalLabel: 'Annual Exam',
};

const COACHING_CONFIG: InstitutionConfig = {
    type: 'coaching',
    idFieldLabel: 'Student ID',
    classFieldLabel: 'Batch',
    divFieldLabel: 'Group',
    termLabel: 'Module',
    batchLabel: 'JEE Advanced — Batch A',
    subjects: [
        { name: 'Physics', short: 'Phy', color: '#2563EB', teacher: 'Mr. Vikram Singh' },
        { name: 'Chemistry', short: 'Chem', color: '#10B981', teacher: 'Mrs. Deepa Nair' },
        { name: 'Mathematics', short: 'Math', color: '#F59E0B', teacher: 'Mr. Suresh Patel' },
    ],
    testLabel: 'Quiz',
    midTermLabel: 'Module Test',
    finalLabel: 'Mock Test',
};

export const INSTITUTION_CONFIGS = {
    college: COLLEGE_CONFIG,
    school: SCHOOL_CONFIG,
    coaching: COACHING_CONFIG,
};

// ─── Context ──────────────────────────────────────────────────────────────────
type InstitutionContextType = {
    institutionType: InstitutionType | null;
    config: InstitutionConfig | null;
    setInstitution: (type: InstitutionType) => void;
    clearInstitution: () => void;
};

const InstitutionContext = createContext<InstitutionContextType>({
    institutionType: null,
    config: null,
    setInstitution: () => { },
    clearInstitution: () => { },
});

export function InstitutionProvider({ children }: { children: React.ReactNode }) {
    const [institutionType, setInstitutionType] = useState<InstitutionType | null>(null);
    useEffect(() => {
        AsyncStorage.getItem('institutionType').then((val) => {
            if (val) setInstitutionType(val as InstitutionType);
        });
    }, []);
    const setInstitution = (type: InstitutionType) => {
        setInstitutionType(type);
        AsyncStorage.setItem('institutionType', type);
    };

    const clearInstitution = () => {
        setInstitutionType(null);
        AsyncStorage.removeItem('institutionType');
    };
    const config = institutionType ? INSTITUTION_CONFIGS[institutionType] : null;

    return (
        <InstitutionContext.Provider value={{
            institutionType,
            config,
            setInstitution,
            clearInstitution,
        }}>
            {children}
        </InstitutionContext.Provider>
    );
}

export function useInstitution() {
    return useContext(InstitutionContext);
}