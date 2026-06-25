import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

const PHOTO_KEY = 'studentPhoto';

type StudentContextType = {
    photo: string | null;
    setPhoto: (uri: string | null) => void;
};

const StudentContext = createContext<StudentContextType>({
    photo: null,
    setPhoto: () => { },
});

export function StudentProvider({ children }: { children: React.ReactNode }) {
    const [photo, setPhotoState] = useState<string | null>(null);

    useEffect(() => {
        AsyncStorage.getItem(PHOTO_KEY).then((val) => {
            if (val) setPhotoState(val);
        });
    }, []);

    const setPhoto = (uri: string | null) => {
        setPhotoState(uri);
        if (uri) AsyncStorage.setItem(PHOTO_KEY, uri);
        else AsyncStorage.removeItem(PHOTO_KEY);
    };

    return (
        <StudentContext.Provider value={{ photo, setPhoto }}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    return useContext(StudentContext);
}
