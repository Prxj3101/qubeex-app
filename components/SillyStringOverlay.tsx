import {
    AlphaType,
    Canvas,
    Circle,
    ColorType,
    Group,
    LinearGradient,
    matchFont,
    Oval,
    Path,
    RoundedRect,
    Shadow,
    Skia,
    Text as SkiaText,
    vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

interface SillyStringOverlayProps {
    name: string;
    fontSize?: number;
    active?: boolean;
}

// ── Physics (ported 1:1 from web's canvas-based SillyStringOverlay) ──────────
class Pt {
    x: number; y: number; ox: number; oy: number; done = false; st = 0;
    constructor(x: number, y: number, vx: number, vy: number) {
        this.x = x; this.y = y; this.ox = x - vx; this.oy = y - vy;
    }
    update(hit: (x: number, y: number) => boolean, H: number, W: number) {
        if (this.done) return;
        const vx = (this.x - this.ox) * 0.97;
        const vy = (this.y - this.oy) * 0.97;
        this.ox = this.x; this.oy = this.y;
        this.x += vx; this.y += vy + 0.2;
        if (hit(this.x, this.y)) {
            if (!hit(this.x, this.oy)) { this.y = this.oy; this.oy = this.y; }
            else if (!hit(this.ox, this.y)) { this.x = this.ox; this.ox = this.x; }
            else { this.x = this.ox; this.y = this.oy; }
            this.ox = this.x; this.oy = this.y; this.st += 4;
        }
        if (this.y > H - 1) { this.y = H - 1; this.oy = this.y; this.st += 4; }
        if (this.y < 0) { this.y = 0; this.oy = 0; this.st += 4; }
        if (this.x < 0) this.x = 0;
        if (this.x > W) this.x = W;
        if (this.st > 14) this.done = true;
    }
}

class Lk {
    broken = false;
    constructor(public a: Pt, public b: Pt, public l = 2.5) { }
    solve() {
        if (this.broken) return;
        const dx = this.b.x - this.a.x, dy = this.b.y - this.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d > 25) { this.broken = true; return; }
        const f = (this.l - d) / d * 0.25;
        if (!this.a.done) { this.a.x -= dx * f; this.a.y -= dy * f; }
        if (!this.b.done) { this.b.x += dx * f; this.b.y += dy * f; }
    }
}

const COLS = ['#ff1493', '#00d9a0', '#ffc400', '#00b8ff', '#ff5533', '#b84dff'];
const COLS_L = ['#ff6ec7', '#66ffc8', '#ffe066', '#66d9ff', '#ff9a75', '#d4a0ff'];

class Strand {
    pts: Pt[] = []; lks: Lk[] = [];
    constructor(public ci: number) { }
    add(x: number, y: number, vx: number, vy: number) {
        const p = new Pt(x, y, vx, vy);
        if (this.pts.length) this.lks.push(new Lk(this.pts[this.pts.length - 1], p));
        this.pts.push(p);
    }
}

function strandPath(s: Strand): string {
    if (s.pts.length < 2) return '';
    const { pts, lks } = s;
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
        if (i - 1 < lks.length && lks[i - 1].broken) { d += ` M ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`; continue; }
        const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
        if (dx * dx + dy * dy > 600) { d += ` M ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`; continue; }
        const mx = (pts[i - 1].x + pts[i].x) / 2, my = (pts[i - 1].y + pts[i].y) / 2;
        d += ` Q ${pts[i - 1].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    return d;
}

export function SillyStringOverlay({ name, fontSize = 30, active = true }: SillyStringOverlayProps) {
    const topExt = Math.round(60 * Math.min(1, fontSize / 30));
    const LEFT_EXT = 34, RIGHT_EXT = 34, BOT_EXT = 18;
    const scale = Math.min(1, fontSize / 30);

    // Skia font used both for measuring (LW/LH) and for drawing into the offscreen collision surface
    const font = useMemo(() => matchFont({ fontFamily: 'sans-serif', fontSize, fontStyle: 'normal', fontWeight: '600' }), [fontSize]);
    const scaleForLabel = Math.min(1, fontSize / 30);
    const canScaleForLabel = Math.max(0.833, scaleForLabel);
    // Tiny "SILLY STRING" label font drawn on the can body
    const labelFont = useMemo(
        () => matchFont({ fontFamily: 'sans-serif', fontSize: 4 * canScaleForLabel, fontStyle: 'normal', fontWeight: 'bold' }),
        [canScaleForLabel]
    );

    const layout = useMemo(() => {
        if (!font) return null;
        const rect = font.measureText(name);
        const LW = Math.ceil(rect.width) + 4;
        const LH = Math.ceil(fontSize * 1.2);
        return { LW, LH };
    }, [font, name, fontSize]);

    // Build a pixel-accurate collision mask by rendering the text to an offscreen
    // Alpha_8 surface and reading back the alpha channel — mirrors web's
    // ctx.getImageData() pixel-collision approach exactly.
    const collision = useMemo(() => {
        if (!layout || !font) return null;
        const { LW, LH } = layout;
        const W = LEFT_EXT + LW + RIGHT_EXT;
        const H = topExt + LH + BOT_EXT;
        const surface = Skia.Surface.Make(W, H);
        if (!surface) return null;
        const canvas = surface.getCanvas();
        const paint = Skia.Paint();
        paint.setColor(Skia.Color('black'));
        canvas.drawText(name, LEFT_EXT, topExt + fontSize * 0.82, paint, font);
        const image = surface.makeImageSnapshot();
        const data = image.readPixels(0, 0, { width: W, height: H, colorType: ColorType.Alpha_8, alphaType: AlphaType.Unpremul }) as Uint8Array | null;
        return data ? { data, W, H } : null;
    }, [layout, font, name, fontSize]);

    const [, forceTick] = useState(0);

    const stateRef = useRef({
        strands: [] as Strand[],
        cur: null as Strand | null,
        ci: 0,
        spT: 0,
        startTime: 0,
        emitAccum: 0,
        canX: 0,
        canY: 0,
        isSpraying: false,
        angleRad: 0,
        fadeAlpha: 1,
        done: false,
    });

    useEffect(() => {
        if (!active || !layout || !collision) return;
        const st = stateRef.current;
        st.strands = []; st.cur = null; st.ci = 0; st.spT = 0; st.startTime = 0; st.emitAccum = 0; st.done = false;

        const { LW, LH } = layout;
        const LOX = LEFT_EXT, LOY = topExt;
        const W = LEFT_EXT + LW + RIGHT_EXT, H = topExt + LH + BOT_EXT;
        const { data, W: cW, H: cH } = collision;

        function hit(x: number, y: number) {
            const ix = Math.round(x), iy = Math.round(y);
            if (ix < 0 || iy < 0 || ix >= cW || iy >= cH) return false;
            return data[iy * cW + ix] > 20;
        }

        function aimAngle(cx: number, cy: number) {
            const targetX = Math.max(LOX, Math.min(LOX + LW, cx));
            const rawA = Math.atan2(LOY + LH / 2 - cy, targetX - cx);
            return Math.atan2(Math.sin(rawA), Math.cos(rawA) * 0.3);
        }

        // Nozzle offset (in the can's own unrotated local space) — must match the
        // NX/NY used when drawing the nozzle circle in the JSX below.
        const canScale = Math.max(0.833, scale);
        const NX = 10 * canScale;
        const NY = -(23 * canScale) - 3;

        function tipWorld(cx: number, cy: number, rot: number) {
            return {
                x: cx + NX * Math.cos(rot) - NY * Math.sin(rot),
                y: cy + NX * Math.sin(rot) + NY * Math.cos(rot),
            };
        }

        function emitFrom(cx: number, cy: number, count: number) {
            if (!st.cur) return;
            st.spT++;
            const a = aimAngle(cx, cy);
            // Emit from the nozzle tip (matches where the can visual draws its nozzle),
            // not the can's center — this is what keeps the spray visually attached to the can.
            const tip = tipWorld(cx, cy, a);
            const pressure = 3 + 0.5 * 11;
            const curlAmt = 0.5 * 4;
            const chaos = 0.5 * 1.2;
            for (let j = 0; j < count; j++) {
                const speed = pressure + Math.random() * 2;
                const curl = Math.sin(st.spT * 0.35 + j * 1.7) * curlAmt;
                const wobble = (Math.random() - 0.5) * (0.15 + chaos);
                const pa = a + Math.PI / 2;
                st.cur.add(tip.x, tip.y,
                    Math.cos(a + wobble) * speed + Math.cos(pa) * curl,
                    Math.sin(a + wobble) * speed + Math.sin(pa) * curl
                );
            }
            let tot = 0;
            for (const s of st.strands) tot += s.pts.length;
            const MAX_POINTS = 3500;
            while (tot > MAX_POINTS && st.strands.length > 1) {
                const o = st.strands[0];
                if (o === st.cur) break;
                if (o.pts.length) { o.pts.shift(); o.lks.shift(); tot--; } else st.strands.shift();
            }
        }

        const DELAY_MS = 3000, SPRAY_MS = 15000, FADE_MS = 5000;
        let rafId = 0;
        let lastRender = 0;

        function tick(now: number) {
            if (!st.startTime) st.startTime = now;
            const elapsed = now - st.startTime;
            const activeElapsed = elapsed - DELAY_MS;
            const spraying = activeElapsed >= 0 && activeElapsed < SPRAY_MS;
            st.isSpraying = spraying;

            const PASS_MS = SPRAY_MS / 3;
            const passIndex = Math.min(Math.floor(Math.max(activeElapsed, 0) / PASS_MS), 2);
            const passProgress = Math.min((Math.max(activeElapsed, 0) % PASS_MS) / PASS_MS, 1);
            const sweepLeft = LOX - Math.round(50 * Math.max(0.5, scale));
            const sweepRight = LOX + LW - Math.round(50 * scale);
            const canX = passIndex % 2 === 0
                ? sweepLeft + passProgress * (sweepRight - sweepLeft)
                : sweepRight - passProgress * (sweepRight - sweepLeft);
            const canY = topExt * 0.3 + Math.sin(elapsed * 0.003) * 6;
            st.canX = canX; st.canY = canY;
            st.angleRad = aimAngle(canX, canY);

            if (spraying) {
                st.emitAccum += 1;
                const emitEvery = passIndex === 0 ? Math.max(2, Math.round(2 / scale)) : Math.max(3, Math.round(3 / scale));
                const particlesPer = passIndex === 0 ? Math.max(1, Math.round(3 * scale)) : Math.max(1, Math.round(2 * scale));
                if (st.emitAccum >= emitEvery) {
                    st.emitAccum = 0;
                    if (!st.cur || st.cur.pts.length > Math.round(150 * scale)) {
                        st.cur = new Strand(st.ci++ % COLS.length);
                        st.strands.push(st.cur);
                        st.spT = 0;
                    }
                    emitFrom(canX, canY, particlesPer);
                }
            }

            for (const s of st.strands) {
                for (const p of s.pts) p.update(hit, H, W);
                for (let i = 0; i < 2; i++) for (const k of s.lks) k.solve();
            }

            st.fadeAlpha = activeElapsed > SPRAY_MS
                ? Math.max(0, 1 - (activeElapsed - SPRAY_MS) / FADE_MS)
                : 1;

            // Throttle React re-renders to ~30fps regardless of RAF rate
            if (now - lastRender > 33) {
                lastRender = now;
                forceTick(t => t + 1);
            }

            if (activeElapsed > SPRAY_MS + FADE_MS) { st.done = true; forceTick(t => t + 1); return; }
            rafId = requestAnimationFrame(tick);
        }

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [active, layout, collision, scale, topExt]);

    if (!active || !layout) return null;

    const st = stateRef.current;
    const { LW, LH } = layout;
    const W = LEFT_EXT + LW + RIGHT_EXT, H = topExt + LH + BOT_EXT;
    const thick = Math.max(1.2, 2.25 * scale);
    const canScale = Math.max(0.833, scale);
    const CW = 18 * canScale, CH = 46 * canScale;
    const NX = 10 * canScale, NY = -(CH / 2) - 3;

    return (
        <View pointerEvents="none" style={{ position: 'absolute', top: -topExt, left: -LEFT_EXT, right: -RIGHT_EXT, bottom: -BOT_EXT, zIndex: 15, width: W, height: H }}>
            {!st.done && (
                <Canvas style={{ width: W, height: H }}>
                    {st.strands.map((s, i) => {
                        const d = strandPath(s);
                        if (!d) return null;
                        const path = Skia.Path.MakeFromSVGString(d);
                        if (!path) return null;
                        const col = COLS[s.ci];
                        const colL = COLS_L[s.ci];
                        return (
                            <Group key={i}>
                                <Path path={path} style="stroke" strokeWidth={thick + 2} strokeCap="round" strokeJoin="round" color={col} opacity={st.fadeAlpha * 0.12} />
                                <Path path={path} style="stroke" strokeWidth={thick} strokeCap="round" strokeJoin="round" color={col} opacity={st.fadeAlpha * 0.9} />
                                <Path path={path} style="stroke" strokeWidth={thick * 0.3} strokeCap="round" strokeJoin="round" color={colL} opacity={st.fadeAlpha * 0.2} />
                            </Group>
                        );
                    })}

                    {st.isSpraying && (
                        <Group origin={vec(st.canX, st.canY)} transform={[{ rotate: st.angleRad }]}>
                            {/* Body */}
                            <RoundedRect x={st.canX - CW / 2} y={st.canY - CH / 2} width={CW} height={CH} r={4}>
                                <LinearGradient
                                    start={vec(st.canX - CW / 2, st.canY)}
                                    end={vec(st.canX + CW / 2, st.canY)}
                                    colors={['#9a2020', '#d43530', '#ee4e48', '#e84040', '#d43530', '#8a1818']}
                                />
                                <Shadow dx={0} dy={3} blur={4} color="rgba(0,0,0,0.08)" />
                            </RoundedRect>

                            {/* Metallic cap bands (top + bottom) */}
                            <RoundedRect x={st.canX - CW / 2 + 1} y={st.canY - CH / 2} width={CW - 2} height={3} r={1}>
                                <LinearGradient start={vec(st.canX - CW / 2, st.canY)} end={vec(st.canX + CW / 2, st.canY)} colors={['#aaa', '#ddd', '#999']} />
                            </RoundedRect>
                            <RoundedRect x={st.canX - CW / 2 + 1} y={st.canY + CH / 2 - 3} width={CW - 2} height={3} r={1}>
                                <LinearGradient start={vec(st.canX - CW / 2, st.canY)} end={vec(st.canX + CW / 2, st.canY)} colors={['#aaa', '#ddd', '#999']} />
                            </RoundedRect>

                            {/* Glossy highlight strip */}
                            <RoundedRect x={st.canX - CW / 2 + 2} y={st.canY - 5} width={CW - 4} height={12} r={2} color="rgba(255,255,255,0.08)" />

                            {/* SILLY / STRING label */}
                            {labelFont && (
                                <>
                                    <SkiaText
                                        font={labelFont}
                                        text="SILLY"
                                        x={st.canX - labelFont.measureText('SILLY').width / 2}
                                        y={st.canY + 1}
                                        color="rgba(255,255,255,0.25)"
                                    />
                                    <SkiaText
                                        font={labelFont}
                                        text="STRING"
                                        x={st.canX - labelFont.measureText('STRING').width / 2}
                                        y={st.canY + 5.5}
                                        color="rgba(255,255,255,0.25)"
                                    />
                                </>
                            )}

                            {/* Cap mount */}
                            <RoundedRect x={st.canX - 5} y={st.canY - CH / 2 - 4} width={10} height={5} r={2} color="#ddd" />

                            {/* Color indicator cap (shows currently loaded strand color) */}
                            <Oval x={st.canX - 4} y={st.canY - CH / 2 - 7} width={8} height={4} color={st.cur ? COLS[st.cur.ci] : '#d44'} />

                            {/* Nozzle tube connecting cap to nozzle tip */}
                            <Path
                                path={`M ${st.canX + 2} ${st.canY - CH / 2 - 3} L ${st.canX + NX - 1} ${st.canY + NY - 1} L ${st.canX + NX - 1} ${st.canY + NY + 2} L ${st.canX + 2} ${st.canY - CH / 2 + 1} Z`}
                                color="#bbb"
                            />

                            {/* Nozzle tip */}
                            <Circle cx={st.canX + NX} cy={st.canY + NY} r={2} color="#888" />

                            {/* Fine mist puffs at the nozzle while spraying */}
                            {st.cur && [0, 1, 2].map(mi => (
                                <Circle
                                    key={mi}
                                    cx={st.canX + NX + 1 + Math.random() * 5}
                                    cy={st.canY + NY + (Math.random() - 0.5) * 3}
                                    r={0.3 + Math.random() * 0.4}
                                    color={COLS[st.cur!.ci]}
                                    opacity={0.08 + Math.random() * 0.1}
                                />
                            ))}
                        </Group>
                    )}
                </Canvas>
            )}
        </View>
    );
}
