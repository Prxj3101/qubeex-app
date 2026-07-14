import PencilLoader from '@/components/Pencilloader';
import { FeedBadgeProvider, useFeedBadge } from '@/context/FeedBadgeContext';
import { InstitutionProvider } from '@/context/InstitutionContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from '@expo-google-fonts/poppins';
import { RobotoMono_600SemiBold } from '@expo-google-fonts/roboto-mono';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BookOpen, FileText, Home, Rss, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
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
      {feedHasNew && (
        <View style={{
          position: 'absolute',
          top: -2, right: -4,
          width: 8, height: 8,
          borderRadius: 99,
          backgroundColor: '#EF4444',
          borderWidth: 1.5,
          borderColor: isDark ? '#1A1030' : 'white',
        }} />
      )}
    </View>
  );
}

function TabLayout() {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets(); // 👈 yeh add karo
  const [topBarHeight, setTopBarHeight] = useState(64);

  <View onLayout={(e) => setTopBarHeight(e.nativeEvent.layout.height)}>
    <TabLayout />
  </View>


  return (
    <>
      {loading && (
        <View style={{
          position: 'absolute',
          top: insets.top + topBarHeight,
          left: 0,
          right: 0,
          bottom: 60,
          backgroundColor: isDark ? '#0F0A1E' : '#FAF8FF',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        }}>
          <PencilLoader size={85} />
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#DA7756',
          tabBarInactiveTintColor: isDark ? '#64748B' : '#94A3B8',
          tabBarStyle: {
            backgroundColor: isDark ? '#1A1030' : 'white',
            borderTopColor: isDark ? '#2D1F50' : '#EDE9FE',
            height: 60,
            paddingBottom: 8,
          },
          tabBarLabelStyle: {
            fontFamily: 'Poppins_600SemiBold',
            fontSize: 10,
          },
        }}
        screenListeners={{
          tabPress: () => {
            setLoading(true);
            setTimeout(() => setLoading(false), 2000);
          },
        }}
        initialRouteName="index"
      >
        <Tabs.Screen name="feed" options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <FeedTabIcon color={color} />,
        }} />
        <Tabs.Screen name="tasks" options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <FileText size={22} color={color} />,
        }} />
        <Tabs.Screen name="index" options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }} />
        <Tabs.Screen name="class" options={{
          title: 'Class',
          tabBarIcon: ({ color }) => <BookOpen size={22} color={color} />,
        }} />
        <Tabs.Screen name="profile" options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileTabIcon color={color} size={22} />,
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