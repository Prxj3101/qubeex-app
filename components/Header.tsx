import { isTodayBirthday } from '@/components/BirthdayBanner';
import { SillyStringOverlay } from '@/components/SillyStringOverlay';
import { useInstitution } from '@/context/InstitutionContext';
import { useStudent } from '@/context/StudentContext';
import { useTheme } from '@/context/ThemeContext';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';


interface HeaderProps {
  showPurple?: boolean;
}


function formatDivision(divisionName: string): string {
  if (!divisionName) return '';
  // "10-A" → "Division A", "12-B" → "Division B", "A" → "Division A"
  const parts = divisionName.split('-');
  const letter = parts.length > 1 ? parts.slice(1).join('-') : divisionName;
  return `Division ${letter}`;
}

// `accent.purple` in dark mode is tuned as a light-on-dark accent (text/icon
// tint), not a background — using it directly here made the hero far too
// light/washed out compared to how it always looked. This mirrors the deeper
// per-family dark-mode hero shade the web app already uses (globals.css's
// `.dark[data-theme="X"] { --hero-accent }`), restoring the original rich
// look while still following whichever theme color the institution picked.
const HERO_DARK_BG: Record<string, string> = {
  purple: '#4C1D95',
  blue: '#3557AB',
  teal: '#006666',
  amber: '#D6890F',
  rose: '#B54444',
  indigo: '#3730A3',
  slate: '#334155',
};

// Same idea for light mode — the web app's own `--hero-accent` is a distinct
// (usually slightly deeper) shade from `--primary` for a couple of families
// (blue, teal), not just a straight reuse of the accent color.
const HERO_LIGHT_BG: Record<string, string> = {
  purple: '#7C3AED',
  blue: '#2F6AE6',
  teal: '#008080',
  amber: '#ED9A1F',
  rose: '#DC3D2E',
  indigo: '#5956EB',
  slate: '#64748B',
};

export function Header({ showPurple = false }: HeaderProps) {
  const { isDark, themeColor } = useTheme();
  const { profile } = useStudent();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = profile?.name || 'Student';
  const divisionLabel = formatDivision(profile?.division ?? '');
  const metaLine = `${profile?.standard ?? ''}${divisionLabel ? ` · ${divisionLabel}` : ''}`;
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const star1Anim = useRef(new Animated.Value(0.15)).current;
  const star2Anim = useRef(new Animated.Value(0.15)).current;
  const star3Anim = useRef(new Animated.Value(0.15)).current;
  const { config } = useInstitution();
  const { institutionType } = useInstitution();
  const CHARACTERS = institutionType !== 'college' ? [
    require('../assets/images/school_boy1.png'),
    require('../assets/images/school_girl1.png'),
    require('../assets/images/school_boy2.png'),
    require('../assets/images/school_girl2.png'),
  ] : [
    require('../assets/images/college_boy1.png'),
    require('../assets/images/college_girl1.png'),
    require('../assets/images/college_boy2.png'),
    require('../assets/images/college_girl2.png'),
    require('../assets/images/college_boy3.png'),
    require('../assets/images/college_girl3.png'),
  ];

  const opacities = useRef(
    Array.from({ length: 6 }, (_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;
  const currentIndex = useRef(0);

  useEffect(() => {
    // Bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -10, duration: 1100, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    ).start();

    // Twinkle
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
  }, [institutionType]);
  if (!showPurple) return null;

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
            <SillyStringOverlay name={displayName} fontSize={24} active={isTodayBirthday(profile?.dob ?? '')} />
          </View>
          <Text style={styles.subText}>{metaLine || config?.batchLabel}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
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
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  nameText: {
    fontSize: 23,
    fontWeight: '400',
    color: 'white',
    lineHeight: 26,
  },
  subText: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.65)',
  },
  dateText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  charImage: {
    width: 190,
    height: 185,
    marginBottom: -20,
    marginRight: -10,
    marginLeft: -5,
  },
});