// 极光：几道随噪声缓慢摆动的光幕，下缘锐利、向上拖出长尾。暗色是夜空里的绿/紫极光，
// 亮色把同一组光幕化成淡彩丝带。画面本身很柔和，所以用低分辨率渲染再由浏览器放大。
function getFragmentShader(octaves: number): string {
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float iTime;
uniform vec2 iResolution;
uniform float isDark;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < ${octaves}; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = vec2(uv.x * iResolution.x / iResolution.y, uv.y);
  float t = iTime * 0.05;

  vec3 glow = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = fbm(vec2(p.x * 1.5 + fi * 3.1 + t * (1.0 + fi * 0.35), fi * 1.7 + t * 0.6));
    float centre = 0.3 + 0.17 * fi + (wave - 0.5) * 0.8;
    float d = uv.y - centre;
    float band = smoothstep(-0.035, 0.0, d) * exp(-max(d, 0.0) * (4.5 + fi * 1.5));
    float rays = 0.35 + 0.65 * noise(vec2(p.x * 16.0 + fi * 5.0 + wave * 4.0, t * 3.0 + fi));
    vec3 tint = mix(vec3(0.1, 0.95, 0.6), vec3(0.45, 0.35, 1.0), clamp(d * 3.0 + 0.22 * fi + 0.15 * sin(t * 2.0 + fi), 0.0, 1.0));
    glow += tint * band * rays * (0.6 - 0.12 * fi);
  }
  float strength = max(glow.r, max(glow.g, glow.b));

  vec3 darkColor = mix(vec3(0.02, 0.035, 0.06), vec3(0.03, 0.07, 0.09), uv.y) + glow * 0.7;
  float star = step(0.9975, hash(floor(gl_FragCoord.xy / 2.0))) * (0.35 + 0.25 * sin(iTime * 1.5 + gl_FragCoord.x));
  darkColor += vec3(star) * (1.0 - clamp(strength * 2.0, 0.0, 1.0));

  vec3 pastel = mix(vec3(1.0), glow / max(strength, 0.001), 0.62);
  vec3 lightColor = mix(mix(vec3(0.975, 0.985, 0.98), vec3(0.93, 0.965, 0.985), uv.y), pastel, clamp(strength * 1.3, 0.0, 0.85));

  gl_FragColor = vec4(mix(lightColor, darkColor, isDark), 1.0);
}
`
}

/** Fragment shader source; phones get a cheaper variant. */
export function fragment(mobile: boolean): string {
  return getFragmentShader(mobile ? 3 : 4)
}
