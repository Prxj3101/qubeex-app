import api from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useState } from 'react';

const PHOTO_KEY = 'studentPhoto';

interface Guardian { name: string; number: string; relation: string; }

export interface StudentProfile {
    studentId: string;
    rollNo: string;
    standard: string;
    division: string;
    houseColor: string;
    name: string;
    email: string;
    dob: string;
    phone: string;
    gender: string;
    religion: string;
    category: string;
    bloodGroup: string;
    aadharNo: string;
    panNo: string;
    emergencyContact: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    guardians: Guardian[];
}

export type ProfilePatch = Partial<Omit<StudentProfile, 'studentId' | 'rollNo' | 'standard' | 'division' | 'houseColor'>>;

type StudentContextType = {
    photo: string | null;
    setPhoto: (uri: string | null) => void;
    profile: StudentProfile | null;
    isLoading: boolean;
    isSaving: boolean;
    fetchProfile: () => Promise<void>;
    saveProfile: (patch: ProfilePatch) => Promise<void>;
};

const StudentContext = createContext<StudentContextType>({
    photo: null,
    setPhoto: () => {},
    profile: null,
    isLoading: false,
    isSaving: false,
    fetchProfile: async () => {},
    saveProfile: async () => {},
});

export function StudentProvider({ children }: { children: React.ReactNode }) {
    const [photo, setPhotoState] = useState<string | null>(null);
    const [profile, setProfile] = useState<StudentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const setPhoto = (uri: string | null) => {
        setPhotoState(uri);
        if (uri) AsyncStorage.setItem(PHOTO_KEY, uri);
        else AsyncStorage.removeItem(PHOTO_KEY);
    };

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/student/me');
            const s = res.data.data;
            const stored = await AsyncStorage.getItem(PHOTO_KEY);
            if (stored) setPhotoState(stored);
            setProfile({
                studentId: s.studentId ?? '',
                rollNo: s.rollNo ?? '',
                standard: s.standard?.name ?? '',
                division: s.division?.name ?? '',
                houseColor: s.houseColor ?? '',
                name: s.user?.name ?? '',
                email: s.user?.email ?? '',
                dob: s.dob ?? '',
                phone: s.phone ?? '',
                gender: s.gender ?? '',
                religion: s.religion ?? '',
                category: s.category ?? '',
                bloodGroup: s.bloodGroup ?? '',
                aadharNo: s.aadharNo ?? '',
                panNo: s.panNo ?? '',
                emergencyContact: s.emergencyContact ?? '',
                address: s.address ?? '',
                city: s.city ?? '',
                state: s.state ?? '',
                pincode: s.pincode ?? '',
                country: s.country ?? '',
                guardians: Array.isArray(s.guardians) ? s.guardians : [],
            });
        } catch {
            // keep existing profile on error
        } finally {
            setIsLoading(false);
        }
    };

    const saveProfile = async (patch: ProfilePatch) => {
        setIsSaving(true);
        try {
            await api.patch('/student/profile', patch);
            await fetchProfile();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <StudentContext.Provider value={{ photo, setPhoto, profile, isLoading, isSaving, fetchProfile, saveProfile }}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    return useContext(StudentContext);
}
