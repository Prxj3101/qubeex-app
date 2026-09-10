import api from '@/lib/api';
import { createContext, useContext, useState } from 'react';

export interface TeacherProfile {
    teacherId: string;
    prefix: string | null;
    avatarUrl: string | null;
    name: string;
    email: string;
    dob: string;
    gender: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
}

type TeacherContextType = {
    photo: string | null;
    setPhoto: (uri: string | null) => void;
    profile: TeacherProfile | null;
    isLoading: boolean;
    fetchProfile: () => Promise<void>;
};

const TeacherContext = createContext<TeacherContextType>({
    photo: null,
    setPhoto: () => {},
    profile: null,
    isLoading: false,
    fetchProfile: async () => {},
});

export function TeacherProvider({ children }: { children: React.ReactNode }) {
    const [photo, setPhotoState] = useState<string | null>(null);
    const [profile, setProfile] = useState<TeacherProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const setPhoto = (uri: string | null) => {
        setPhotoState(uri);
    };

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/teacher/me');
            const t = res.data.data;
            setPhotoState(t.avatarUrl ?? null);
            setProfile({
                teacherId: t.teacherId ?? '',
                prefix: t.prefix ?? null,
                avatarUrl: t.avatarUrl ?? null,
                name: t.user?.name ?? '',
                email: t.user?.email ?? '',
                dob: t.dob ?? '',
                gender: t.gender ?? '',
                phone: t.phone ?? '',
                address: t.address ?? '',
                city: t.city ?? '',
                state: t.state ?? '',
                pincode: t.pincode ?? '',
                country: t.country ?? '',
            });
        } catch {
            // keep existing profile on error
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <TeacherContext.Provider value={{ photo, setPhoto, profile, isLoading, fetchProfile }}>
            {children}
        </TeacherContext.Provider>
    );
}

export function useTeacher() {
    return useContext(TeacherContext);
}
