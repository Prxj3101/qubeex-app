import { useTeacher } from '@/context/TeacherContext';
import { useTheme } from '@/context/ThemeContext';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Home, User } from 'lucide-react-native';
import { useEffect } from 'react';
import { Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

// Same pattern as the student app's ProfileTabIcon — shows the teacher's own
// photo in a circle on the tab bar once loaded, falling back to the User icon.
function TeacherProfileTabIcon({ color, size }: { color: string; size: number }) {
    const { photo } = useTeacher();
    if (photo) {
        return (
            <Image
                source={{ uri: photo }}
                style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color }}
            />
        );
    }
    return <User size={size} color={color} />;
}

// Teacher's own tab shell — mirrors the student (tabs) layout's chrome
// (colors, tab bar sizing) but its own route group, since teacher screens
// have nothing to do with a student's tabs. Starts with just Home; more
// tabs (Classes, Messages, Profile) get added as those screens are built.
function TeacherTabLayout() {
    const { isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const tabBarBottomPadding = Platform.OS === 'ios'
        ? Math.max(insets.bottom - 14, 8)
        : Math.max(insets.bottom, 14);
    const tabBarHeight = 52 + tabBarBottomPadding;

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#DA7756',
                tabBarInactiveTintColor: isDark ? '#64748B' : '#94A3B8',
                tabBarStyle: {
                    backgroundColor: isDark ? '#141414' : 'white',
                    borderTopColor: isDark ? '#2D1F50' : '#EDE9FE',
                    height: tabBarHeight,
                    paddingBottom: tabBarBottomPadding,
                },
                tabBarLabelStyle: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
            }}
            initialRouteName="index"
        >
            <Tabs.Screen name="index" options={{
                title: 'Home',
                tabBarIcon: ({ color }) => <Home size={22} color={color} />,
            }} />
            <Tabs.Screen name="profile" options={{
                title: 'Profile',
                tabBarIcon: ({ color }) => <TeacherProfileTabIcon color={color} size={22} />,
            }} />
        </Tabs>
    );
}

export default function Layout() {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold,
    });

    useEffect(() => {
        if (fontsLoaded) SplashScreen.hideAsync();
    }, [fontsLoaded]);

    if (!fontsLoaded) return null;

    return <TeacherTabLayout />;
}
