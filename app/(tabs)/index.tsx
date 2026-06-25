import { useTheme } from '@/context/ThemeContext';
import { Trophy } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnouncementStrip } from '../../components/AnnouncementStrip';
import { Header } from '../../components/Header';
import { QuickStats } from '../../components/QuickStats';
import { ThoughtOfTheDay } from '../../components/ThoughtOfTheDay';
import { TopBar } from '../../components/TopBar';

const LIGHT = {
  bg: '#FAF8FF',
  card: '#FFFFFF',
  cardBorder: '#EDE9FE',
  text: '#0F172A',
  subText: '#64748B',
  muted: '#94A3B8',
};

const DARK = {
  bg: '#0F0A1E',
  card: '#1A1030',
  cardBorder: '#2D1F50',
  text: '#F1F5F9',
  subText: '#94A3B8',
  muted: '#64748B',
};

function ShinyMedal({ emoji }: { emoji: string }) {
  const shineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(shineAnim, { toValue: 0.4, duration: 400, useNativeDriver: true }),
        Animated.timing(shineAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1500),
      ])
    ).start();
  }, []);

  const scale = shineAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.9, 1.2],
  });

  return (
    <Animated.Text style={{
      fontSize: 28,
      opacity: shineAnim,
      transform: [{ scale }],
    }}>
      {emoji}
    </Animated.Text>
  );
}

export default function Home() {
  const [isParentView, setIsParentView] = useState(false);
  const { isDark } = useTheme();
  const theme = isDark ? DARK : LIGHT;

  const leaderboard = [
    { rank: 1, name: 'Rahul Sharma', percentage: 98.5, color: '#F59E0B', bg: isDark ? '#2D2010' : '#FEF3C7' },
    { rank: 2, name: 'Priya Mehta', percentage: 96.2, color: '#94A3B8', bg: isDark ? '#1E2530' : '#F1F5F9' },
    { rank: 3, name: 'Arjun Verma', percentage: 94.8, color: '#CD7C2F', bg: isDark ? '#2D1F10' : '#FEF3C7' },
    { rank: 4, name: 'Sneha Patel', percentage: 92.1, color: '#878b94ff', bg: isDark ? '#0D1F3C' : '#EFF6FF' },
    { rank: 5, name: 'Karan Singh', percentage: 90.4, color: '#878b94ff', bg: isDark ? '#0D1F3C' : '#EFF6FF' },
  ];

  const Avatar = ({ name, color, bg, size }: { name: string; color: string; bg: string; size: number }) => (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, borderWidth: size > 40 ? 3 : 2,
      borderColor: color, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '700', color }}>{name[0]}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <TopBar
        isParentView={isParentView}
        onToggle={() => setIsParentView(!isParentView)}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Header showPurple={true} />
        <AnnouncementStrip />
        <View style={styles.body}>

          <QuickStats onNavigate={(screen) => console.log(screen)} />
          <ThoughtOfTheDay />

          {/* Leaderboard Header */}
          <View style={styles.lbHeader}>
            <View style={styles.lbTitleRow}>
              <Trophy size={18} color="#F59E0B" strokeWidth={2} />
              <Text style={[styles.lbTitle, { color: theme.text }]}>Overall Leaderboard</Text>
            </View>
            <Text style={[styles.lbSub, { color: theme.muted }]}>Top 5 Students</Text>
          </View>

          {/* Podium — Top 3 */}
          <View style={styles.podium}>

            {/* 2nd */}
            <View style={styles.podiumItem}>
              <Avatar name={leaderboard[1].name} color={leaderboard[1].color} bg={leaderboard[1].bg} size={44} />
              <Text style={[styles.podiumName, { color: theme.text }]}>{leaderboard[1].name.split(' ')[0]}</Text>
              <Text style={[styles.podiumPct, { color: leaderboard[1].color }]}>{leaderboard[1].percentage}%</Text>
              <View style={[styles.podiumBlock, { height: 50, backgroundColor: '#94A3B8' }]}>
                <ShinyMedal emoji="🥈" />
              </View>
            </View>

            {/* 1st */}
            <View style={styles.podiumItem}>
              <Avatar name={leaderboard[0].name} color={leaderboard[0].color} bg={leaderboard[0].bg} size={54} />
              <Text style={[styles.podiumName, { color: theme.text }]}>{leaderboard[0].name.split(' ')[0]}</Text>
              <Text style={[styles.podiumPct, { color: leaderboard[0].color }]}>{leaderboard[0].percentage}%</Text>
              <View style={[styles.podiumBlock, { height: 70, backgroundColor: '#F59E0B' }]}>
                <ShinyMedal emoji="🥇" />
              </View>
            </View>

            {/* 3rd */}
            <View style={styles.podiumItem}>
              <Avatar name={leaderboard[2].name} color={leaderboard[2].color} bg={leaderboard[2].bg} size={44} />
              <Text style={[styles.podiumName, { color: theme.text }]}>{leaderboard[2].name.split(' ')[0]}</Text>
              <Text style={[styles.podiumPct, { color: leaderboard[2].color }]}>{leaderboard[2].percentage}%</Text>
              <View style={[styles.podiumBlock, { height: 40, backgroundColor: '#CD7C2F' }]}>
                <ShinyMedal emoji="🥉" />
              </View>
            </View>

          </View>

          {/* 4th & 5th */}
          <View style={styles.restList}>
            {leaderboard.slice(3).map((student) => (
              <View key={student.rank} style={[styles.restCard, { backgroundColor: student.bg, borderColor: student.color }]}>
                <Text style={styles.restRankEmoji}>
                  {student.rank === 4 ? '4️⃣' : '5️⃣'}
                </Text>
                <Avatar name={student.name} color={student.color} bg={student.bg} size={36} />
                <Text style={[styles.restName, { color: theme.text }]}>{student.name}</Text>
                <Text style={[styles.restPct, { color: student.color }]}>{student.percentage}%</Text>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    padding: 14,
    gap: 14,
  },
  lbHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  lbTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lbTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  lbSub: {
    fontSize: 11,
  },
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  podiumItem: {
    alignItems: 'center',
    gap: 4,
  },
  podiumBlock: {
    width: 80,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumEmoji: {
    fontSize: 24,
  },
  podiumName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  podiumPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  restList: {
    gap: 8,
  },
  restCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  restRankEmoji: {
    fontSize: 18,
  },
  restName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  restPct: {
    fontSize: 13,
    fontWeight: '700',
  },
});