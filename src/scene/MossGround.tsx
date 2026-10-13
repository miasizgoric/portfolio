import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SurfaceTextures } from '@/lib/proceduralTextures'
import type { World } from '@/world/useWorld'

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

const BOULDER_NORMAL_SCALE = new THREE.Vector2(1.1, 1.1)

function terrainGeometry(world: World) {
  const { terrain } = world
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(terrain.position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(terrain.normal, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(terrain.color, 3))
  geo.setAttribute('rockiness', new THREE.BufferAttribute(terrain.rockiness, 1))
  geo.setAttribute('uv', new THREE.BufferAttribute(terrain.uv, 2))
  geo.setIndex(new THREE.BufferAttribute(terrain.index, 1))
  return geo
}

function boulderBodies(world: World) {
  return world.boulders.map((b) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(b.position, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2))
    geometry.setAttribute('color', new THREE.BufferAttribute(b.color, 3))
    geometry.computeBoundingSphere()
    return { geometry, matrix: new THREE.Matrix4().fromArray(b.matrix) }
  })
}

export function MossGround({ world }: { world: World }) {
  const rock = world.rockTextures
  const geometry = useMemo(() => terrainGeometry(world), [world])
  const outcrops = useMemo(() => boulderBodies(world), [world])
  const ground = useMemo(() => makeGroundMaterial(world.mossTextures, rock), [world, rock])

  useEffect(() => {
    return () => {
      geometry.dispose()
      outcrops.forEach((body) => body.geometry.dispose())
      ground.dispose()
    }
  }, [geometry, outcrops, ground])

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
            normalScale={BOULDER_NORMAL_SCALE}
            color="#7a7d6d"
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  )
}
