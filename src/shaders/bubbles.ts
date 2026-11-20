// Mobile: 20 bubbles + early discard; Desktop: 40 bubbles (original)
function getFragmentShader(bubbleCount: number, useEarlyDiscard: boolean): string {
  const earlySkip = useEarlyDiscard ? 'if (dis > rad * 1.2) continue;' : ''
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float iTime;
uniform vec2 iResolution;
uniform float isDark;

float hash(float n) {
  return fract(sin(dot(vec2(n, n), vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = -1.0 + 2.0 * gl_FragCoord.xy / iResolution.xy;
  uv.x *= iResolution.x / iResolution.y;

  vec3 lightBg = vec3(0.96 + 0.04 * uv.y);
  vec3 darkBg = vec3(0.04, 0.06, 0.07) + vec3(0.02, 0.03, 0.035) * uv.y;
  vec3 color = mix(lightBg, darkBg, isDark);

  for (int i = 0; i < ${bubbleCount}; i++) {
    float pha = sin(float(i) * 546.13 + 1.0) * 0.5 + 0.5;
    float siz = pow(sin(float(i) * 651.74 + 5.0) * 0.5 + 0.5, 4.0);
    float pox = sin(float(i) * 321.55 + 4.1) * iResolution.x / iResolution.y;

    float rad = 0.1 + 0.5 * siz;
    vec2 pos = vec2(pox, -1.0 - rad + (2.0 + 2.0 * rad) * mod(pha + 0.1 * iTime * (0.2 + 0.8 * siz), 1.0));
    float dis = length(uv - pos);

    ${earlySkip}

    // Light mode: warm orange to cool blue
    vec3 col = mix(vec3(0.94, 0.3, 0.0), vec3(0.1, 0.4, 0.8), 0.5 + 0.5 * sin(float(i) * 1.2 + 1.9));
    // Dark mode: emerald-teal to indigo glow. Light mode subtracts the swizzled colour for depth;
    // dark mode adds its own palette directly (swizzling it turned the glow muddy brown).
    vec3 darkCol = mix(vec3(0.04, 0.42, 0.34), vec3(0.2, 0.26, 0.72), 0.5 + 0.5 * sin(float(i) * 1.2 + 1.9));
    vec3 tint = mix(col.zyx, darkCol, isDark);

    float f = dis / rad;
    f = sqrt(clamp(1.0 - f * f, 0.0, 1.0));

    vec3 contribution = tint * (1.0 - smoothstep(rad * 0.95, rad, dis)) * f;
    // Light: subtract for depth; Dark: add gently
    color = mix(color - contribution * 0.8, color + contribution * 0.3, isDark);
  }

  color *= sqrt(1.5 - 0.5 * length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`
}

/** Fragment shader source; phones get a cheaper variant. */
export function fragment(mobile: boolean): string {
  return getFragmentShader(mobile ? 20 : 40, mobile)
}
