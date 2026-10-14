import { useEffect } from 'react'
import { wrapEffect } from '@react-three/postprocessing'
import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2, Vector3, type WebGLRenderer } from 'three'
import { BASE_R, BEAD_R, LEAN, fadeAmount, popScale, pose } from '@/lib/stickPose'
import { useGalleryStore } from '@/store/useGalleryStore'

// Safari cannot refract through backdrop-filter, so the glass stick bends the picture here
// instead, in the last post-processing pass: a soft frosted ring, and a lens that magnifies the
// middle and pulls colour apart at its edge. Everything is in CSS pixels (y down); the DOM
// layers drawn over it supply the milky tint, the reflections and the shadow.
const FRAGMENT = /* glsl */ `
uniform vec2 uView;
uniform vec3 uBase;
uniform vec3 uBead;
uniform float uFade;

vec3 grab(vec2 px) {
  return texture2D(inputBuffer, vec2(px.x / uView.x, 1.0 - px.y / uView.y)).rgb;
}

// a spiral of taps, turned a little differently at every pixel: thin lines in the picture
// come out as fine grain, like frosted glass, instead of ghost copies
vec3 frost(vec2 px, float spread) {
  float turn = 6.2831853 * fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float f = float(i) + 0.5;
    float a = f * 2.3999632 + turn;
    sum += grab(px + vec2(cos(a), sin(a)) * sqrt(f / 12.0) * spread);
  }
  return sum / 12.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;

  if (uFade > 0.001) {
    vec2 p = vec2(uv.x * uView.x, (1.0 - uv.y) * uView.y);

    vec2 d = p - uBase.xy;
    float dist = length(d);
    if (dist < uBase.z + 1.0) {
      // a soft ring of frosted glass: no edge line, it fades in and out like the torus in the
      // reference, brightest a little inside its outer edge
      float t = dist / uBase.z;
      float ring = smoothstep(0.5, 0.85, t);
      vec2 dir = d / max(dist, 0.001);
      vec3 lit = frost(p - dir * ring * ring * uBase.z * 0.1, 2.5 * ring);
      float lift = 0.05 * smoothstep(0.55, 0.88, t) * (1.0 - smoothstep(0.9, 1.0, t));
      lit = mix(lit, vec3(1.0), lift);
      col = mix(col, lit, (1.0 - smoothstep(uBase.z - 5.0, uBase.z, dist)) * uFade);
    }

    vec2 e = p - uBead.xy;
    float er = length(e);
    if (er < uBead.z + 1.0) {
      // magnified in the middle, and near the rim the picture is squeezed and then cut off
      // against what lies outside it, with the colours pulled apart
      float tb = er / uBead.z;
      float k = 0.56 + 0.44 * pow(tb, 2.6) + 0.16 * smoothstep(0.8, 1.0, tb);
      float split = 0.04 * tb + 0.11 * tb * tb * tb;
      vec3 lens = vec3(
        grab(uBead.xy + e * k * (1.0 + split)).r,
        grab(uBead.xy + e * k).g,
        grab(uBead.xy + e * k * (1.0 - split)).b
      );
      col = mix(col, lens, (1.0 - smoothstep(uBead.z - 1.0, uBead.z, er)) * uFade);
    }
  }

  outputColor = vec4(col, inputColor.a);
}
`

class StickLensEffect extends Effect {
  private readonly view: Vector2
  private readonly base: Vector3
  private readonly bead: Vector3
  private readonly fade: Uniform<number>

  constructor() {
    const view = new Vector2()
    const base = new Vector3()
    const bead = new Vector3()
    const fade = new Uniform(0)
    super('StickLensEffect', FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uView', new Uniform(view)],
        ['uBase', new Uniform(base)],
        ['uBead', new Uniform(bead)],
        ['uFade', fade],
      ]),
    })
    this.view = view
    this.base = base
    this.bead = bead
    this.fade = fade
  }

  update(renderer: WebGLRenderer) {
    const fade = fadeAmount()
    this.fade.value = fade
    if (fade <= 0.001) return
    renderer.getSize(this.view)
    const s = popScale()
    this.base.set(pose.x + pose.bx * LEAN, pose.y + pose.by * LEAN, BASE_R * s)
    this.bead.set(pose.x + pose.bx, pose.y + pose.by, BEAD_R * s)
  }
}

const Lens = wrapEffect(StickLensEffect)

export function StickLens() {
  // the DOM stick drops its own blur while this pass is bending the picture
  useEffect(() => {
    useGalleryStore.getState().setLens(true)
    return () => useGalleryStore.getState().setLens(false)
  }, [])
  return <Lens />
}
