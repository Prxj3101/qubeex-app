import api from '@/lib/api';
import { createContext, useContext, useState } from 'react';

interface Guardian { name: string; number: string; relation: string; }

export interface StudentProfile {
    studentId: string;
    rollNo: string;
    standard: string;
    division: string;
    divisionId: string;
    houseColor: string;
    institutionName: string;
    tempPassword: string | null;
    mustChangePassword: boolean;
    avatarUrl: string | null;
    name: string;
    email: string;
    dob: string;
    phone: string;
    gender: string;
    religion: string;
    category: string;
    nationality: string;
    admissionYear: string;
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

export type ProfilePatch = Partial<Omit<StudentProfile, 'studentId' | 'rollNo' | 'standard' | 'division' | 'houseColor' | 'institutionName' | 'tempPassword' | 'mustChangePassword' | 'avatarUrl'>>;

type StudentContextType = {
    photo: string | null;
    setPhoto: (uri: string | null) => void;
    profile: StudentProfile | null;
    isLoading: boolean;
    isSaving: boolean;
    fetchProfile: () => Promise<void>;
    saveProfile: (patch: ProfilePatch) => Promise<void>;
    uploadPhoto: (uri: string, mimeType: string) => Promise<void>;
};

const StudentContext = createContext<StudentContextType>({
    photo: null,
    setPhoto: () => {},
    profile: null,
    isLoading: false,
    isSaving: false,
    fetchProfile: async () => {},
    saveProfile: async () => {},
    uploadPhoto: async () => {},
});

export function StudentProvider({ children }: { children: React.ReactNode }) {
    const [photo, setPhotoState] = useState<string | null>(null);
    const [profile, setProfile] = useState<StudentProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const setPhoto = (uri: string | null) => {
        setPhotoState(uri);
    };

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/student/me');
            const s = res.data.data;
            setPhotoState(s.avatarUrl ?? null);
            setProfile({
                studentId: s.studentId ?? '',
                rollNo: s.rollNo ?? '',
                standard: s.standard?.name ?? '',
                division: s.division?.name ?? '',
                divisionId: s.division?.id ?? '',
                houseColor: s.houseColor ?? '',
                institutionName: s.institution?.name ?? '',
                tempPassword: s.tempPassword ?? null,
                mustChangePassword: s.user?.mustChangePassword ?? false,
                avatarUrl: s.avatarUrl ?? null,
                name: s.user?.name ?? '',
                email: s.user?.email ?? '',
                dob: s.dob ?? '',
                phone: s.phone ?? '',
                gender: s.gender ?? '',
                religion: s.religion ?? '',
                category: s.category ?? '',
                nationality: s.nationality ?? '',
                admissionYear: s.admissionYear ?? '',
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

    const uploadPhoto = async (uri: string, mimeType: string) => {
        setIsSaving(true);
        try {
            const form = new FormData();
            form.append('photo', { uri, name: 'photo.jpg', type: mimeType } as unknown as Blob);
            const res = await api.post('/student/photo', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const url: string = res.data.data.avatarUrl;
            // Update in-memory state only — signed URLs expire so we don't persist them.
            // fetchProfile will always refresh from the server.
            setPhotoState(url);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <StudentContext.Provider value={{ photo, setPhoto, profile, isLoading, isSaving, fetchProfile, saveProfile, uploadPhoto }}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    return useContext(StudentContext);
}
