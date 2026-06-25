import { useInstitution } from '@/context/InstitutionContext';
import { useTheme } from '@/context/ThemeContext';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';


interface HeaderProps {
  showPurple?: boolean;
}


export function Header({ showPurple = false }: HeaderProps) {
  const { isDark } = useTheme();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const star1Anim = useRef(new Animated.Value(0.15)).current;
  const star2Anim = useRef(new Animated.Value(0.15)).current;
  const star3Anim = useRef(new Animated.Value(0.15)).current;
  const { config } = useInstitution();
  const { institutionType } = useInstitution();
  const CHARACTERS = institutionType === 'school' ? [
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
        Animated.timing(bounceAnim, { toValue: -10, duration: 700, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // Twinkle
    const twinkle = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 0.9, duration: 800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    };
    twinkle(star1Anim, 0);
    twinkle(star2Anim, 600);
    twinkle(star3Anim, 1100);
  }, []);

  useEffect(() => {
    currentIndex.current = 0;
    opacities.forEach((op, i) => op.setValue(i === 0 ? 1 : 0));

    const interval = setInterval(() => {
      const curr = currentIndex.current;
      const next = (curr + 1) % CHARACTERS.length;
      Animated.parallel([
        Animated.timing(opacities[curr], { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.timing(opacities[next], { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start(() => {
        currentIndex.current = next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [institutionType]);
  if (!showPurple) return null;

  // Dark mode mein deeper/richer purple
  const bgColor = isDark ? '#4C1D95' : '#7C3AED';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <Animated.View style={[styles.star, { width: 5, height: 5, top: 22, left: 62, opacity: star1Anim }]} />
      <Animated.View style={[styles.star, { width: 3, height: 3, top: 52, left: 148, opacity: star2Anim }]} />
      <Animated.View style={[styles.star, { width: 4, height: 4, top: 20, left: 198, opacity: star3Anim }]} />

      <View style={styles.row}>
        <View style={styles.greetingBox}>
          <Text style={styles.greetingText}>{greeting},</Text>
          <Text style={styles.nameText}>Prajwal Kotian</Text>
          <Text style={styles.subText}>{config?.batchLabel}</Text>
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
  },
  greetingText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.7)',
  },
  nameText: {
    fontSize: 24,
    fontWeight: '400',
    color: 'white',
    lineHeight: 26,
  },
  subText: {
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.65)',
  },
  charImage: {
    width: 190,
    height: 185,
    marginBottom: -20,
    marginRight: -10,
    marginLeft: -5,
  },
});