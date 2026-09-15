import { isTodayBirthday } from '@/components/BirthdayBanner';
import { SillyStringOverlay } from '@/components/SillyStringOverlay';
import { useTheme } from '@/context/ThemeContext';
import { formatDisplayName } from '@/lib/displayName';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

// Same rotating casual line as the web teacher overview hero
// (CASUAL_MESSAGES / getCasualMessage in qubeex-web's app/teacher/overview/page.tsx)
// — picked by day-of-year so it stays the same all day and changes daily.
const CASUAL_MESSAGES = [
  'Good morning! ☕ Ready to inspire some young minds today?',
  'GM teacher! 🌅 May your first period be as energetic as your coffee!',
  'Rise & shine! 🌞 Aaj ka din productive lagta hai!',
  'Good morning! May your chalk never break and students always listen ✏️',
  'Goood morningggg! 🎉 Today feels like a great teaching day!',
  'GM! 👋 Wonder if anyone did their homework last night...',
  'Morning teacher! The classroom is waiting for its superhero 🦸',
  'Hey! ☀️ Aaj attendance mein kitne \'present sir\' milenge?',
  'Quick question — strict mode or chill mode today? 😎',
  'Pro tip: Jo sabse peeche baitha hai, usse aaj zaroor bulao 😄',
  'Today\'s forecast: 100% chance of someone forgetting their textbook 📚',
  'Reminder: You are literally shaping the future. No pressure! 😅',
  'Fun fact: Your students are more nervous than you right now 😄',
  'Hey! Someone in your class today will remember you for life 🌟',
  'That \'aha!\' moment from a student — absolutely priceless ✨',
  'Teacher mode: ACTIVATED 🚀 Aaj ka din legendary hone wala hai!',
  'You don\'t just teach, you inspire — never forget that 💫',
  'Best moment today? When a student finally gets it 😊',
  'Lesson plan ready? Students ready? Chalein phir! 🎯',
  'Hey teacher! Maybe try something different in class today? 🔬',
  'Reminder: You\'re the world\'s most underrated superhero 🦸‍♀️',
  'Monday energy ON! ⚡ Time to charge up the whole class!',
  'Midweek check-in — class ki energy kaisi hai aaj? 😊',
  'Almost Friday! 🎊 Just one more day — hang in there!',
  'Friday vibes! 🥳 Finish strong, last period matters too!',
  'Psst! 🤖 Busy day ahead — chai pehle, baaki sab baad mein!',
  'AI observation: Your students seem surprisingly motivated today 👀',
  'Fun stat: Your class attendance is improving — keep it up! 📈',
  'Quick check: Aaj ka thought of the day board pe likha kya? 🖊️',
  'Hey! The little things you do in class matter more than you know 💙',
  'Good morning! Every class is a fresh start — make it count 🌟',
  'Teaching tip: A little humor goes a long way in class 😄',
  'Today is a great day to be a great teacher! ✨',
  'GM! Aaj koi student zaroor surprise karega — ready rehna 😊',
  'Good morning! Your energy sets the tone for the whole class today ⚡',
];

function getCasualMessage() {
  const today = new Date();
  const day = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return CASUAL_MESSAGES[day % CASUAL_MESSAGES.length];
}

interface TeacherHeaderProps {
  name: string;
  prefix: string | null;
  dob?: string | null;
  institutionName: string;
  classTeacherDivisionName: string | null;
  loading?: boolean;
}

// Exact copy of the student Header — same orbs/stars/bounce-character
// treatment, colors and layout — just sourced from teacher data (name/prefix/
// dob/institution) via props instead of useStudent().
const HERO_DARK_BG: Record<string, string> = {
  purple: '#4C1D95',
  blue: '#3557AB',
  teal: '#006666',
  amber: '#D6890F',
  rose: '#B54444',
  indigo: '#3730A3',
  slate: '#334155',
};

const HERO_LIGHT_BG: Record<string, string> = {
  purple: '#7C3AED',
  blue: '#2F6AE6',
  teal: '#008080',
  amber: '#ED9A1F',
  rose: '#DC3D2E',
  indigo: '#5956EB',
  slate: '#64748B',
};

export function TeacherHeader({ name, prefix, dob, loading }: TeacherHeaderProps) {
  const { isDark, themeColor } = useTheme();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = loading ? '' : (formatDisplayName(name, prefix) || 'Teacher');
  const casualMessage = getCasualMessage();
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  // Live clock, same as the web hero's date-and-time line.
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    setCurrentTime(fmt());
    const id = setInterval(() => setCurrentTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const star1Anim = useRef(new Animated.Value(0.15)).current;
  const star2Anim = useRef(new Animated.Value(0.15)).current;
  const star3Anim = useRef(new Animated.Value(0.15)).current;
  // Teacher hero uses its own character set (same 8 illustrations as the web
  // teacher overview page's TEACHER_CHARACTERS), not the student
  // school/college mascots — teachers aren't students, regardless of
  // institution type.
  const CHARACTERS = [
    require('../../assets/images/teacher1.png'),
    require('../../assets/images/teacher2.png'),
    require('../../assets/images/teacher3.png'),
    require('../../assets/images/teacher4.png'),
    require('../../assets/images/teacher5.png'),
    require('../../assets/images/teacher6.png'),
    require('../../assets/images/teacher7.png'),
    require('../../assets/images/teacher8.png'),
  ];

  const opacities = useRef(
    Array.from({ length: CHARACTERS.length }, (_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;
  const currentIndex = useRef(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -5, duration: 1100, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    ).start();

    const twinkle = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 0.9, duration: 1000, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    };
    twinkle(star1Anim, 0);
    twinkle(star2Anim, 300);
    twinkle(star3Anim, 500);
  }, []);

  useEffect(() => {
    currentIndex.current = 0;
    opacities.forEach((op, i) => op.setValue(i === 0 ? 1 : 0));

    const interval = setInterval(() => {
      const curr = currentIndex.current;
      const next = (curr + 1) % CHARACTERS.length;
      Animated.parallel([
        Animated.timing(opacities[curr], { toValue: 0, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacities[next], { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]).start(() => {
        currentIndex.current = next;
      });
    }, 7000);

    return () => clearInterval(interval);
  }, []);

  const bgColor = isDark
    ? (HERO_DARK_BG[themeColor] ?? HERO_DARK_BG.purple)
    : (HERO_LIGHT_BG[themeColor] ?? HERO_LIGHT_BG.purple);

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <Animated.View style={[styles.star, { width: 5, height: 5, top: 22, left: 62, opacity: star1Anim }]} />
      <Animated.View style={[styles.star, { width: 3, height: 3, top: 52, left: 148, opacity: star2Anim }]} />
      <Animated.View style={[styles.star, { width: 4, height: 4, top: 20, left: 198, opacity: star3Anim }]} />

      <View style={styles.row}>
        <View style={styles.greetingBox}>
          <Text style={styles.greetingText}>{greeting} 👋</Text>
          <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
            <Text style={styles.nameText}>{displayName}</Text>
            <SillyStringOverlay name={displayName} fontSize={24} active={isTodayBirthday(dob ?? '')} />
          </View>
          <Text style={styles.subText}>{casualMessage}</Text>
          <Text style={styles.dateText}>{dateStr}{currentTime ? `  ·  ${currentTime}` : ''}</Text>
        </View>

        <Animated.View style={{ transform: [{ translateY: bounceAnim }], width: 140, height: 150 }}>
          {CHARACTERS.map((src, i) => (
            <Animated.Image
              key={i}
              source={src}
              style={[styles.charImage, { opacity: opacities[i], position: 'absolute' }]}
              resizeMode="contain"
            />
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    overflow: 'hidden',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  orb1: {
    position: 'absolute',
    width: 130,
    height: 130,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 65,
    top: -40,
    right: -30,
  },
  orb2: {
    position: 'absolute',
    width: 65,
    height: 65,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 32,
    top: 80,
    right: 25,
  },
  star: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 99,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  greetingBox: {
    paddingBottom: 16,
    flex: 1,
    gap: 4,
  },
  greetingText: {
    fontSize: Platform.OS === 'android' ? 15 : 16,
    color: 'rgba(255,255,255,0.7)',
  },
  nameText: {
    fontSize: Platform.OS === 'android' ? 22 : 23,
    fontWeight: '400',
    color: 'white',
    lineHeight: 26,
  },
  subText: {
    fontSize: Platform.OS === 'android' ? 11.5 : 12.5,
    color: 'rgba(255,255,255,0.65)',
  },
  dateText: {
    fontSize: Platform.OS === 'android' ? 10 : 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 3,
  },
  charImage: {
    width: 190,
    height: 185,
    marginTop: 8,
    marginBottom: -20,
    marginRight: -10,
    marginLeft: -5,
  },
});
