import { FeedBadgeProvider, useFeedBadge } from '@/context/FeedBadgeContext';
import { InstitutionProvider } from '@/context/InstitutionContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins';
import { RobotoMono_600SemiBold } from '@expo-google-fonts/roboto-mono';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BookOpen, FileText, Home, Rss, User } from 'lucide-react-native';
import { useEffect } from 'react';
import { Image, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ProfileTabIcon({ color, size }: { color: string; size: number }) {
  const { photo } = useStudent();
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

SplashScreen.preventAutoHideAsync();

function FeedTabIcon({ color }: { color: string }) {
  const { isDark } = useTheme();
  const { feedHasNew } = useFeedBadge();
  return (
    <View style={{ position: 'relative' }}>
      <Rss size={22} color={color} />
      <View style={{
        position: 'absolute',
        top: -2, right: -4,
        width: 8, height: 8,
        borderRadius: 99,
        backgroundColor: '#EF4444',
        borderWidth: 1.5,
        borderColor: isDark ? '#141414' : 'white',
        opacity: feedHasNew ? 1 : 0,
      }} />
    </View>
  );
}

function TabLayout() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // On gesture-nav devices the system inset is already small, so this stays
  // close to the original 8px padding (same look as before). On devices with
  // a dedicated 3-button/back-home-recents nav bar, insets.bottom reports
  // that bar's real height, so the tab bar grows to sit above it instead of
  // being covered by it. iOS and Android report very different raw inset
  // values for the same "just clear the home indicator / gesture pill" look,
  // so they're tuned separately rather than sharing one formula.
  const tabBarBottomPadding = Platform.OS === 'ios'
    ? Math.max(insets.bottom - 14, 8)
    : Math.max(insets.bottom, 14);
  const tabBarHeight = 52 + tabBarBottomPadding;

  return (
    <>
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
          tabBarLabelStyle: {
            fontFamily: 'Poppins_600SemiBold',
            fontSize: 10,
          },
        }}
      >
        <Tabs.Screen name="index" options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }} />
        <Tabs.Screen name="feed" options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <FeedTabIcon color={color as string} />,
        }} />
        <Tabs.Screen name="tasks" options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <FileText size={22} color={color} />,
        }} />
        <Tabs.Screen name="class" options={{
          title: 'Class',
          tabBarIcon: ({ color }) => <BookOpen size={22} color={color} />,
        }} />
        <Tabs.Screen name="profile" options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileTabIcon color={color as string} size={22} />,
        }} />
      </Tabs>
    </>
  );
}

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    RobotoMono_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <InstitutionProvider>
      <FeedBadgeProvider>
        <TabLayout />
      </FeedBadgeProvider>
    </InstitutionProvider>
  );
}