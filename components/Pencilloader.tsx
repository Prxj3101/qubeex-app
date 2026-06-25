import { useTheme } from '@/context/ThemeContext';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

interface PencilLoaderProps {
    size?: number;
}

export default function PencilLoader({ size = 100 }: PencilLoaderProps) {
    const { isDark } = useTheme();
    const bg = isDark ? '#0F0A1E' : '#FAF8FF';
    const strokeColor = isDark ? '#D97757' : '#000000';
    const leadColor   = isDark ? '#D97757' : '#000000';

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    background: ${bg};
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .pencil { display: block; width: 10em; height: 10em; }

  .pencil__body1, .pencil__body2, .pencil__body3,
  .pencil__eraser, .pencil__eraser-skew,
  .pencil__point, .pencil__rotate, .pencil__stroke {
    animation-duration: 2s;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }
  .pencil__body1, .pencil__body2, .pencil__body3 { transform: rotate(-90deg); }
  .pencil__body1 { animation-name: pencilBody1; }
  .pencil__body2 { animation-name: pencilBody2; }
  .pencil__body3 { animation-name: pencilBody3; }
  .pencil__eraser {
    animation-name: pencilEraser;
    transform: rotate(-90deg) translate(49px, 0);
  }
  .pencil__eraser-skew {
    animation-name: pencilEraserSkew;
    animation-timing-function: ease-in-out;
  }
  .pencil__point {
    animation-name: pencilPoint;
    transform: rotate(-90deg) translate(49px, -30px);
  }
  .pencil__rotate { animation-name: pencilRotate; }
  .pencil__stroke {
    animation-name: pencilStroke;
    transform: translate(100px, 100px) rotate(-113deg);
  }

  @keyframes pencilBody1 {
    from, to { stroke-dashoffset: 351.86; transform: rotate(-90deg); }
    50% { stroke-dashoffset: 150.8; transform: rotate(-225deg); }
  }
  @keyframes pencilBody2 {
    from, to { stroke-dashoffset: 406.84; transform: rotate(-90deg); }
    50% { stroke-dashoffset: 174.36; transform: rotate(-225deg); }
  }
  @keyframes pencilBody3 {
    from, to { stroke-dashoffset: 296.88; transform: rotate(-90deg); }
    50% { stroke-dashoffset: 127.23; transform: rotate(-225deg); }
  }
  @keyframes pencilEraser {
    from, to { transform: rotate(-45deg) translate(49px, 0); }
    50% { transform: rotate(0deg) translate(49px, 0); }
  }
  @keyframes pencilEraserSkew {
    from, 32.5%, 67.5%, to { transform: skewX(0); }
    35%, 65% { transform: skewX(-4deg); }
    37.5%, 62.5% { transform: skewX(8deg); }
    40%, 45%, 50%, 55%, 60% { transform: skewX(-15deg); }
    42.5%, 47.5%, 52.5%, 57.5% { transform: skewX(15deg); }
  }
  @keyframes pencilPoint {
    from, to { transform: rotate(-90deg) translate(49px, -30px); }
    50% { transform: rotate(-225deg) translate(49px, -30px); }
  }
  @keyframes pencilRotate {
    from { transform: translate(100px, 100px) rotate(0); }
    to { transform: translate(100px, 100px) rotate(720deg); }
  }
  @keyframes pencilStroke {
    from { stroke-dashoffset: 439.82; transform: translate(100px, 100px) rotate(-113deg); }
    50% { stroke-dashoffset: 164.93; transform: translate(100px, 100px) rotate(-113deg); }
    75%, to { stroke-dashoffset: 439.82; transform: translate(100px, 100px) rotate(112deg); }
  }
</style>
</head>
<body>
  <svg class="pencil" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="pe">
        <rect rx="5" ry="5" width="30" height="30"></rect>
      </clipPath>
    </defs>

    <!-- Stroke (line being drawn) -->
    <circle class="pencil__stroke" r="70" fill="none"
      stroke="${strokeColor}" stroke-width="2"
      stroke-dasharray="439.82 439.82"
      stroke-dashoffset="439.82"
      stroke-linecap="round"
      transform="rotate(-113,100,100)"/>

    <!-- Rotating pencil group -->
    <g class="pencil__rotate" transform="translate(100,100)">
      <g fill="none">
        <!-- Body layers - terracotta colors -->
        <circle class="pencil__body1" r="64"
          stroke="#D97757" stroke-width="30"
          stroke-dasharray="402.12 402.12"
          stroke-dashoffset="402"
          transform="rotate(-90)"/>
        <circle class="pencil__body2" r="74"
          stroke="#E89578" stroke-width="10"
          stroke-dasharray="464.96 464.96"
          stroke-dashoffset="465"
          transform="rotate(-90)"/>
        <circle class="pencil__body3" r="54"
          stroke="#C05F3C" stroke-width="10"
          stroke-dasharray="339.29 339.29"
          stroke-dashoffset="339"
          transform="rotate(-90)"/>
      </g>

      <!-- Eraser -->
      <g class="pencil__eraser" transform="rotate(-90) translate(49,0)">
        <g class="pencil__eraser-skew">
          <rect fill="#EBB49E" rx="5" ry="5" width="30" height="30"/>
          <rect fill="#D97757" width="5" height="30" clip-path="url(#pe)"/>
          <rect fill="#FAF8FF" width="30" height="20"/>
          <rect fill="#EDE9FE" width="15" height="20"/>
          <rect fill="#F4F0FA" width="5" height="20"/>
          <rect fill="rgba(45,31,16,0.2)" y="6" width="30" height="2"/>
          <rect fill="rgba(45,31,16,0.2)" y="13" width="30" height="2"/>
        </g>
      </g>

      <!-- Pencil tip/point -->
      <g class="pencil__point" transform="rotate(-90) translate(49,-30)">
        <polygon fill="#F4A261" points="15 0,30 30,0 30"/>
        <polygon fill="#E07C3A" points="15 0,6 30,0 30"/>
        <polygon fill="${leadColor}" points="15 0,20 10,10 10"/>
      </g>
    </g>
  </svg>
</body>
</html>
    `;

    return (
        <View style={{ width: size, height: size }}>
            <WebView
                source={{ html }}
                style={{ width: size, height: size, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
                bounces={false}
            />
        </View>
    );
}