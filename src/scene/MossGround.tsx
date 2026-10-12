import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { createMossTextures, getRockTextures, type SurfaceTextures } from '@/lib/proceduralTextures'
import { makeBoulderGeometry } from '@/lib/grove'
import { fbm2, makeNoise2D, smoothstep } from '@/lib/terrainNoise'
import { getTerrainField, SEA, TERRAIN_RADIUS, type TerrainField } from '@/lib/terrain'

const RINGS = 168
const SECTORS = 192
const INNER_RADIUS = 1.5

const MOSS_DEEP = new THREE.Color('#4d6340')
const MOSS_LIT = new THREE.Color('#6f9159')
const ROCK_DARK = new THREE.Color('#4a5148')
const ROCK_PALE = new THREE.Color('#767a6a')
const PATH_TONE = new THREE.Color('#7b6150')

const LIMESTONE = new THREE.Color('#cdbfad')
const LIMESTONE_WARM = new THREE.Color('#c29f76')
const LIMESTONE_SHADE = new THREE.Color('#8d8579')
const WET_ROCK = new THREE.Color('#3c3e3a')

const TIDE_BAND = 2.4

function buildTerrainGeometry(field: TerrainField) {
  const vertexCount = (RINGS + 1) * (SECTORS + 1)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const rockiness = new Float32Array(vertexCount)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(RINGS * SECTORS * 6)

  const stain = makeNoise2D(40519)
  const color = new THREE.Color()
  const rock = new THREE.Color()
  const stone = new THREE.Color()

  const heights = new Float32Array(vertexCount)
  const radii = new Float32Array(RINGS + 1)
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS
    radii[r] = INNER_RADIUS + (TERRAIN_RADIUS - INNER_RADIUS) * t * t
  }

  for (let r = 0; r <= RINGS; r++) {
    const radius = radii[r]
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      const i = r * (SECTORS + 1) + s
      const y = field.height(x, z)
      heights[i] = y
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      uvs[i * 2] = x * 0.06
      uvs[i * 2 + 1] = z * 0.06
    }
  }

  const sectorStep = (Math.PI * 2) / SECTORS
  for (let r = 0; r <= RINGS; r++) {
    const radius = radii[r]
    const inner = radii[Math.max(r - 1, 0)]
    const outer = radii[Math.min(r + 1, RINGS)]
    const radialSpan = Math.max(outer - inner, 0.01)
    const arcSpan = Math.max(radius * sectorStep * 2, 0.01)
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      const i = r * (SECTORS + 1) + s
      const y = heights[i]

      const up = heights[Math.max(r - 1, 0) * (SECTORS + 1) + s]
      const down = heights[Math.min(r + 1, RINGS) * (SECTORS + 1) + s]
      const left = heights[r * (SECTORS + 1) + (s === 0 ? SECTORS - 1 : s - 1)]
      const right = heights[r * (SECTORS + 1) + (s === SECTORS ? 1 : s + 1)]
      const gradient = Math.hypot((down - up) / radialSpan, (right - left) / arcSpan)
      const slope = gradient / (1 + gradient)
      const moss = field.moss(x, z, slope, y)

      rock.copy(ROCK_DARK).lerp(ROCK_PALE, slope)
      color.copy(MOSS_DEEP).lerp(MOSS_LIT, moss)
      color.lerp(rock, 1 - moss)
      const path = field.onPath(x, z)
      if (path > 0) {
        const tread = smoothstep(0.4, 0.86, path)
        const scuff = 0.5 + 0.5 * fbm2(stain, x * 0.32, z * 0.32, 2)
        color.lerp(PATH_TONE, tread * (0.56 + scuff * 0.34))
      }

      const coast = field.coast(x, z)
      const bare = Math.max(
        smoothstep(0.6, 0.92, slope) * (1 - moss * 0.8),
        coast * smoothstep(0.16, 0.4, slope),
        smoothstep(0.9, 1, coast),
      )
      if (bare > 0) {
        const warm = smoothstep(0.1, 0.6, fbm2(stain, x * 0.045, z * 0.045 + y * 0.08, 3))
        const shade = smoothstep(-0.2, 0.5, fbm2(stain, x * 0.11 + 31.7, y * 0.14, 2))
        stone.copy(LIMESTONE).lerp(LIMESTONE_WARM, warm * 0.8).lerp(LIMESTONE_SHADE, shade * 0.6)
        const tide = 1 - smoothstep(SEA.level, SEA.level + TIDE_BAND, y)
        stone.lerp(WET_ROCK, tide * 0.85)
        color.lerp(stone, bare)
      }
      rockiness[i] = bare

      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
  }
  let o = 0
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SECTORS; s++) {
      const a = r * (SECTORS + 1) + s
      const b = a + SECTORS + 1
      indices[o++] = a
      indices[o++] = a + 1
      indices[o++] = b
      indices[o++] = a + 1
      indices[o++] = b + 1
      indices[o++] = b
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('rockiness', new THREE.BufferAttribute(rockiness, 1))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return geo
}

const GROUND_VERTEX_PARS = `
attribute float rockiness;
varying float vRock;
varying vec3 vGroundWorld;
varying vec3 vGroundNormal;
`

const GROUND_VERTEX = `
vRock = rockiness;
vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vGroundNormal = normalize(mat3(modelMatrix) * objectNormal);
`

const GROUND_FRAGMENT_PARS = `
uniform sampler2D uRockMap;
uniform sampler2D uRockNormal;
varying float vRock;
varying vec3 vGroundWorld;
varying vec3 vGroundNormal;

vec3 groundWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z);
}
`

const GROUND_MAP = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  if (vRock > 0.001) {
    vec3 gw = groundWeights(normalize(vGroundNormal));
    vec3 gp = vGroundWorld * 0.09;
    vec3 rockTexel = texture2D(uRockMap, gp.zy).rgb * gw.x
      + texture2D(uRockMap, gp.xz).rgb * gw.y
      + texture2D(uRockMap, gp.xy).rgb * gw.z;
    float strata = 0.5 + 0.5 * sin(vGroundWorld.y * 2.3 + 1.7 * sin(vGroundWorld.x * 0.07 + vGroundWorld.z * 0.05));
    rockTexel *= mix(0.86, 1.06, smoothstep(0.2, 0.85, strata));
    float streakX = texture2D(uRockMap, vec2(vGroundWorld.x * 0.35, vGroundWorld.y * 0.012)).r;
    float streakZ = texture2D(uRockMap, vec2(vGroundWorld.z * 0.35, vGroundWorld.y * 0.012)).r;
    float streak = mix(streakZ, streakX, gw.z / max(gw.x + gw.z, 0.001));
    rockTexel *= mix(1.0, mix(0.68, 1.05, smoothstep(0.55, 0.95, streak)), 1.0 - gw.y);
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, rockTexel, vRock);
  }
  float patchN = texture2D(map, vGroundWorld.xz * 0.33).g;
  float litter = smoothstep(0.62, 0.96, patchN);
  sampledDiffuseColor.rgb *= mix(vec3(1.0), vec3(1.16, 1.07, 0.9), litter * 0.26 * (1.0 - vRock));

  float gNear = 1.0 - smoothstep(4.0, 26.0, length(vViewPosition));
  if (gNear > 0.002) {
    float fineN = texture2D(map, vGroundWorld.zx * 0.74).g;
    float speck = texture2D(uRockMap, vGroundWorld.xz * 2.3).g;
    vec3 near = sampledDiffuseColor.rgb;
    near *= mix(vec3(1.0), vec3(1.34, 1.06, 0.68), smoothstep(0.62, 0.98, fineN) * 0.55);
    near *= mix(1.0, 0.52, smoothstep(0.52, 0.9, speck) * 0.5);
    float grain = texture2D(map, vGroundWorld.xz * 4.1 + 0.17).g - 0.5;
    near *= 1.0 + grain * 0.5 * (1.0 - smoothstep(2.0, 12.0, length(vViewPosition)));
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, near, gNear);
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`

const GROUND_NORMAL = `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * (1.0 - vRock);
  normal = normalize(tbn * mapN);
#endif
if (vRock > 0.001) {
  vec3 gN = normalize(vGroundNormal);
  vec3 gw = groundWeights(gN);
  vec3 gp = vGroundWorld * 0.09;
  vec3 nx = texture2D(uRockNormal, gp.zy).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(uRockNormal, gp.xz).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(uRockNormal, gp.xy).xyz * 2.0 - 1.0;
  vec3 cp = vGroundWorld * 0.027;
  vec3 cx = texture2D(uRockNormal, cp.zy).xyz * 2.0 - 1.0;
  vec3 cy = texture2D(uRockNormal, cp.xz).xyz * 2.0 - 1.0;
  vec3 cz = texture2D(uRockNormal, cp.xy).xyz * 2.0 - 1.0;
  vec3 fine = vec3(0.0, nx.y, nx.x) * gw.x + vec3(ny.x, 0.0, ny.y) * gw.y + vec3(nz.x, nz.y, 0.0) * gw.z;
  vec3 coarse = vec3(0.0, cx.y, cx.x) * gw.x + vec3(cy.x, 0.0, cy.y) * gw.y + vec3(cz.x, cz.y, 0.0) * gw.z;
  vec3 rockN = normalize(gN + fine * 0.6 + coarse * 0.85);
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(rockN, 0.0)).xyz), vRock));
}

float dNear = 1.0 - smoothstep(3.0, 22.0, length(vViewPosition));
if (dNear > 0.002) {
  vec2 dN = texture2D(normalMap, vGroundWorld.xz * 0.34).xy * 2.0 - 1.0;
  vec2 dF = texture2D(normalMap, vGroundWorld.zx * 1.15).xy * 2.0 - 1.0;
  float crisp = 1.0 - smoothstep(2.0, 14.0, length(vViewPosition));
  vec2 dC = texture2D(normalMap, vGroundWorld.xz * 3.7 + 0.31).xy * 2.0 - 1.0;
  vec2 dM = texture2D(normalMap, vGroundWorld.zx * 9.3 + 0.67).xy * 2.0 - 1.0;
  vec2 relief = dN * 0.55 + dF * 0.7 + (dC * 0.9 + dM * 0.6) * crisp;
  vec3 pert = (viewMatrix * vec4(relief.x, 0.0, relief.y, 0.0)).xyz;
  normal = normalize(normal + pert * (1.0 * dNear * (1.0 - vRock * 0.55)));
}
`

function makeGroundMaterial(moss: SurfaceTextures, rock: SurfaceTextures) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: moss.map,
    normalMap: moss.normalMap,
    roughnessMap: moss.roughnessMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1,
    metalness: 0,
    dithering: true,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRockMap = { value: rock.map }
    shader.uniforms.uRockNormal = { value: rock.normalMap }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GROUND_VERTEX_PARS}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${GROUND_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', GROUND_MAP)
      .replace('#include <normal_fragment_maps>', GROUND_NORMAL)
  }
  return material
}

function buildOutcropMeshes(field: TerrainField) {
  const bodies: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = []
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()

  for (const outcrop of field.outcrops) {
    for (let b = 0; b < outcrop.bodies; b++) {
      const seed = outcrop.seed + b * 977
      const angle = (b / outcrop.bodies) * Math.PI * 2 + outcrop.spin
      const spread = outcrop.radius * (0.18 + ((seed % 53) / 53) * 0.5)
      const x = outcrop.x + Math.cos(angle) * spread
      const z = outcrop.z + Math.sin(angle) * spread
      const size = outcrop.rise * (0.55 + ((seed % 31) / 31) * 0.75)

      pos.set(x, field.height(x, z) + size * 0.32, z)
      euler.set(outcrop.tilt * 0.6, angle + outcrop.spin, outcrop.tilt)
      quat.setFromEuler(euler)
      scale.set(size, size * (0.62 + ((seed % 17) / 17) * 0.4), size)

      bodies.push({
        geometry: makeBoulderGeometry(seed, 2),
        matrix: matrix.clone().compose(pos, quat, scale),
      })
    }
  }
  return bodies
}

export function MossGround() {
  const field = useMemo(() => getTerrainField(), [])
  const geometry = useMemo(() => buildTerrainGeometry(field), [field])
  const outcrops = useMemo(() => buildOutcropMeshes(field), [field])
  const moss = useMemo(() => createMossTextures(), [])
  const rock = useMemo(() => getRockTextures(), [])
  const ground = useMemo(() => makeGroundMaterial(moss, rock), [moss, rock])

  useEffect(() => {
    return () => {
      geometry.dispose()
      outcrops.forEach((body) => body.geometry.dispose())
      ground.dispose()
      moss.dispose()
    }
  }, [geometry, outcrops, ground, moss, rock])

  return (
    <group>
      <mesh geometry={geometry} material={ground} receiveShadow />

      {outcrops.map((body, i) => (
        <mesh
          key={i}
          geometry={body.geometry}
          matrix={body.matrix}
          matrixAutoUpdate={false}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            map={rock.map}
            normalMap={rock.normalMap}
            roughnessMap={rock.roughnessMap}
            normalScale={new THREE.Vector2(1.1, 1.1)}
            color="#7a7d6d"
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  )
}
