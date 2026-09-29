import { useTheme } from '@/context/ThemeContext';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line as SvgLine, Polyline, Rect, Text as SvgText } from 'react-native-svg';

interface AttendanceDataPoint {
    month: string;
    attendance: number;
    students: number;
}

interface TeacherAttendanceChartProps {
    data: AttendanceDataPoint[];
}

// Bars follow the school's theme accent; the students line stays amber, except
// on the amber theme where it would blend into the bars - then it goes cyan.
const LINE_AMBER = '#F59E0B';
const LINE_ALT = '#0891B2';
const CHART_HEIGHT = 180;
const Y_TICKS = 4;

export function TeacherAttendanceChart({ data }: TeacherAttendanceChartProps) {
    const { isDark, accent, themeColor } = useTheme();
    const BAR_COLOR = accent.purple;
    const LINE_COLOR = themeColor === 'amber' ? LINE_ALT : LINE_AMBER;
    const cardBg = isDark ? '#141414' : '#FFFFFF';
    const cardBorder = isDark ? '#2A2A2A' : '#EDE9FE';
    const text = isDark ? '#F1F5F9' : '#0F172A';
    const subText = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? '#2A2A2A' : '#E2E8F0';
    const tooltipBg = isDark ? '#1E1E1E' : '#FFFFFF';

    const [width, setWidth] = useState(0);
    const [active, setActive] = useState<number | null>(null);

    const onLayout = (e: LayoutChangeEvent) => {
        setWidth(e.nativeEvent.layout.width);
    };

    const points = data.length > 0 ? data : [];
    const PAD_LEFT = 30;
    const PAD_BOTTOM = 18;
    const PAD_TOP = 8;
    const chartW = Math.max(width - PAD_LEFT, 0);
    const chartH = CHART_HEIGHT - PAD_BOTTOM - PAD_TOP;

    const maxRaw = points.length
        ? Math.max(100, ...points.map((p) => p.attendance), ...points.map((p) => p.students))
        : 100;
    // Round up to a "nice" ceiling, same visual effect as recharts' auto domain.
    const maxVal = Math.ceil(maxRaw / 20) * 20;

    const slot = points.length ? chartW / points.length : 0;
    const barWidth = Math.min(22, slot * 0.5);

    const yFor = (v: number) => PAD_TOP + chartH - (v / maxVal) * chartH;
    const xFor = (i: number) => PAD_LEFT + slot * i + slot / 2;

    const linePoints = points.map((p, i) => `${xFor(i)},${yFor(p.students)}`).join(' ');

    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => Math.round((maxVal / Y_TICKS) * i));

    return (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <CalendarDays size={15} color={subText} />
                    <Text style={[styles.headerTitle, { color: text }]}>Class Attendance Trend</Text>
                </View>
                <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendSwatch, { backgroundColor: BAR_COLOR }]} />
                        <Text style={[styles.legendLabel, { color: subText }]}>Attendance %</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: LINE_COLOR }]} />
                        <Text style={[styles.legendLabel, { color: subText }]}>Students</Text>
                    </View>
                </View>
            </View>

            <View onLayout={onLayout} style={{ height: CHART_HEIGHT }}>
                {width > 0 && points.length > 0 && (
                    <Svg width={width} height={CHART_HEIGHT}>
                        {/* Horizontal grid lines + Y axis labels */}
                        {yTicks.map((tick) => (
                            <SvgLine
                                key={tick}
                                x1={PAD_LEFT}
                                x2={width}
                                y1={yFor(tick)}
                                y2={yFor(tick)}
                                stroke={gridColor}
                                strokeWidth={1}
                                strokeOpacity={0.6}
                            />
                        ))}
                        {yTicks.map((tick) => (
                            <SvgText
                                key={`lbl-${tick}`}
                                x={PAD_LEFT - 6}
                                y={yFor(tick) + 3}
                                fontSize={10}
                                fill={subText}
                                textAnchor="end"
                            >
                                {tick}
                            </SvgText>
                        ))}

                        {/* Bars — attendance % */}
                        {points.map((p, i) => {
                            const barH = (p.attendance / maxVal) * chartH;
                            const x = xFor(i) - barWidth / 2;
                            const y = PAD_TOP + chartH - barH;
                            return (
                                <Rect
                                    key={`bar-${p.month}-${i}`}
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={Math.max(barH, 1)}
                                    rx={4}
                                    fill={BAR_COLOR}
                                    opacity={active === null || active === i ? 0.9 : 0.35}
                                />
                            );
                        })}

                        {/* Line — student count */}
                        <Polyline
                            points={linePoints}
                            fill="none"
                            stroke={LINE_COLOR}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        {points.map((p, i) => (
                            <Circle
                                key={`dot-${p.month}-${i}`}
                                cx={xFor(i)}
                                cy={yFor(p.students)}
                                r={active === i ? 5 : 3.5}
                                fill={LINE_COLOR}
                                stroke={tooltipBg}
                                strokeWidth={2}
                            />
                        ))}

                        {/* X axis labels */}
                        {points.map((p, i) => (
                            <SvgText
                                key={`x-${p.month}-${i}`}
                                x={xFor(i)}
                                y={CHART_HEIGHT - 2}
                                fontSize={10}
                                fill={subText}
                                textAnchor="middle"
                            >
                                {p.month}
                            </SvgText>
                        ))}

                        {/* Invisible touch targets for tooltip */}
                        {points.map((p, i) => (
                            <Rect
                                key={`hit-${p.month}-${i}`}
                                x={PAD_LEFT + slot * i}
                                y={0}
                                width={slot}
                                height={CHART_HEIGHT}
                                fill="transparent"
                                onPressIn={() => setActive(i)}
                                onPressOut={() => setActive(null)}
                            />
                        ))}
                    </Svg>
                )}
            </View>

            {active !== null && points[active] && (
                <View style={[styles.tooltip, { backgroundColor: tooltipBg, borderColor: cardBorder }]}>
                    <Text style={[styles.tooltipMonth, { color: text }]}>{points[active].month}</Text>
                    <Text style={[styles.tooltipRow, { color: BAR_COLOR }]}>{points[active].attendance}% attendance</Text>
                    <Text style={[styles.tooltipRow, { color: LINE_COLOR }]}>{points[active].students} students</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerTitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    legendRow: {
        flexDirection: 'row',
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendSwatch: {
        width: 9,
        height: 9,
        borderRadius: 2,
    },
    legendLine: {
        width: 16,
        height: 2,
        borderRadius: 2,
    },
    legendLabel: {
        fontSize: 10.5,
        fontFamily: 'Poppins_400Regular',
    },
    tooltip: {
        position: 'absolute',
        top: 40,
        right: 14,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 1,
    },
    tooltipMonth: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    tooltipRow: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
});
