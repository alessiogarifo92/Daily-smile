import * as THREE from 'three';
import type { FlowerType } from '../../shared/flowers';
import { createRng } from '../../shared/random';

const DEG = Math.PI / 180;

interface PetalSpec {
  length: number;
  width: number;
  /** Edges lift toward the flower axis (concave front). */
  cup: number;
  /** Tip bends outward (positive) or inward (negative). */
  curl: number;
  /** 0 = pointed tip, 1 = round tip. */
  round: number;
  ruffle: number;
  color: THREE.Color;
  rng: () => number;
}

/**
 * One petal as a curved surface growing along +Y. Its concave face points to -Z,
 * which the head layout rotates to face up and inward. Vertex colours give the
 * base-to-tip shading that makes petals read as real.
 */
export function petalGeometry(spec: PetalSpec, segL = 10, segW = 6): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = spec.color.clone().multiplyScalar(0.72);
  const tip = spec.color.clone().lerp(new THREE.Color(1, 1, 1), 0.12);
  const phase = spec.rng() * Math.PI * 2;
  const c = new THREE.Color();

  for (let i = 0; i <= segL; i++) {
    const u = i / segL;
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55 + 0.25 * spec.round)), 0.55 + 0.35 * (1 - spec.round));
    const halfW = spec.width * 0.5 * Math.max(profile, 0.04);
    for (let j = 0; j <= segW; j++) {
      const v = (j / segW) * 2 - 1;
      const x = v * halfW;
      const y = u * spec.length;
      const z =
        -spec.cup * v * v * halfW +
        spec.curl * u * u * spec.length +
        spec.ruffle * Math.sin(v * Math.PI * 2.5 + phase) * u * u * spec.length * 0.08;
      positions.push(x, y, z);
      c.copy(base).lerp(tip, Math.pow(u, 0.7));
      c.offsetHSL(0, 0, Math.abs(v) * 0.04);
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = segW + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segW; j++) {
      const a = i * row + j;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export interface Materials {
  petal: THREE.Material;
  stem: THREE.Material;
  leaf: THREE.Material;
  plain: (hex: string, roughness?: number) => THREE.Material;
}

export function createMaterials(): Materials {
  const cache = new Map<string, THREE.Material>();
  return {
    petal: new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      sheen: 0.9,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#ffffff'),
    }),
    stem: new THREE.MeshStandardMaterial({ color: '#4E8448', roughness: 0.7 }),
    leaf: new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.3 }),
    plain(hex, roughness = 0.8) {
      const key = `${hex}|${roughness}`;
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: hex, roughness });
        cache.set(key, m);
      }
      return m;
    },
  };
}

interface Ring {
  count: number;
  length: number;
  width: number;
  /** Opening angle from the head axis, degrees: 0 = closed bud, 90 = flat. */
  tilt: number;
  cup: number;
  curl: number;
  round: number;
  ruffle?: number;
  radius?: number;
  y?: number;
  azimuthOffset?: number;
}

function addRing(head: THREE.Group, ring: Ring, color: THREE.Color, m: Materials, rng: () => number): void {
  for (let i = 0; i < ring.count; i++) {
    const jitter = () => 1 + (rng() - 0.5) * 0.16;
    const g = petalGeometry({
      length: ring.length * jitter(),
      width: ring.width * jitter(),
      cup: ring.cup,
      curl: ring.curl,
      round: ring.round,
      ruffle: ring.ruffle ?? 0,
      color: color.clone().offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.05),
      rng,
    });
    addPetal(head, g, m.petal, (ring.azimuthOffset ?? 0) + (i / ring.count) * Math.PI * 2 + (rng() - 0.5) * 0.12, ring.tilt + (rng() - 0.5) * 6, ring.radius ?? 0.01, ring.y ?? 0);
  }
}

/** Spiral of petals opening gradually: roses, peonies, ranunculi. */
function addSpiral(head: THREE.Group, n: number, size: [number, number], width: [number, number], tilt: [number, number], cup: number, curl: number, ruffle: number, color: THREE.Color, m: Materials, rng: () => number): void {
  const golden = 137.508 * DEG;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const g = petalGeometry({
      length: lerp(size[0], size[1], t) * (1 + (rng() - 0.5) * 0.1),
      width: lerp(width[0], width[1], t),
      cup: cup * (1 - 0.35 * t),
      curl: curl * t * t,
      round: 1,
      ruffle: ruffle * t,
      color: color.clone().offsetHSL(0, 0, (t - 0.5) * 0.08 + (rng() - 0.5) * 0.04),
      rng,
    });
    addPetal(head, g, m.petal, i * golden, lerp(tilt[0], tilt[1], Math.pow(t, 1.6)), 0.006 + 0.022 * t, -0.04 * t);
  }
}

function addPetal(head: THREE.Group, g: THREE.BufferGeometry, mat: THREE.Material, azimuth: number, tiltDeg: number, radius: number, y: number): void {
  const mesh = new THREE.Mesh(g, mat);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = azimuth;
  mesh.rotation.x = tiltDeg * DEG;
  mesh.position.set(Math.sin(azimuth) * radius, y, Math.cos(azimuth) * radius);
  head.add(mesh);
}

function disc(radius: number, height: number, hex: string, m: Materials, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), m.plain(hex, 0.95));
  mesh.scale.set(1, height / radius, 1);
  mesh.position.y = y;
  return mesh;
}

/** Fibonacci-packed seeds/florets on a disc, as one instanced mesh. */
function seeds(count: number, radius: number, size: number, hex: string, m: Materials, y: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 6, 4), m.plain(hex, 1), count);
  const o = new THREE.Object3D();
  const golden = 137.508 * DEG;
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt((i + 0.5) / count);
    const a = i * golden;
    o.position.set(Math.cos(a) * r, y + Math.cos((r / radius) * Math.PI * 0.5) * size * 2, Math.sin(a) * r);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }
  return mesh;
}

/** Builds a flower head around +Y, roughly 0.2-0.3 units across. */
export function buildHead(type: FlowerType, hex: string, seed: number, m: Materials): THREE.Group {
  const head = new THREE.Group();
  const rng = createRng(seed);
  const color = new THREE.Color(hex);

  switch (type) {
    case 'rosa':
      addSpiral(head, 30, [0.07, 0.16], [0.1, 0.2], [3, 62], 1.05, 0.3, 0.15, color, m, rng);
      break;
    case 'peonia':
      addSpiral(head, 48, [0.08, 0.17], [0.11, 0.2], [6, 80], 0.8, 0.2, 1, color, m, rng);
      break;
    case 'ranuncolo':
      addSpiral(head, 64, [0.04, 0.11], [0.06, 0.13], [2, 72], 1.1, 0.05, 0.05, color, m, rng);
      head.add(disc(0.018, 0.012, '#4A5A2A', m, 0.035));
      break;
    case 'tulipano':
      addRing(head, { count: 3, length: 0.3, width: 0.15, tilt: 14, cup: 1.05, curl: 0.06, round: 0.55 }, color, m, rng);
      addRing(head, { count: 3, length: 0.29, width: 0.15, tilt: 9, cup: 1.1, curl: 0.03, round: 0.55, azimuthOffset: Math.PI / 3, radius: 0.005 }, color.clone().offsetHSL(0, 0, -0.04), m, rng);
      break;
    case 'margherita':
      addRing(head, { count: 24, length: 0.17, width: 0.035, tilt: 84, cup: 0.15, curl: -0.04, round: 0.9, radius: 0.04 }, color, m, rng);
      head.add(disc(0.05, 0.028, '#E8B320', m, 0.01));
      head.add(seeds(60, 0.045, 0.006, '#D49A12', m, 0.03));
      break;
    case 'gerbera':
      addRing(head, { count: 20, length: 0.21, width: 0.045, tilt: 86, cup: 0.2, curl: -0.02, round: 0.8, radius: 0.05 }, color, m, rng);
      addRing(head, { count: 18, length: 0.14, width: 0.04, tilt: 70, cup: 0.25, curl: 0, round: 0.8, radius: 0.045, y: 0.01, azimuthOffset: 0.17 }, color.clone().offsetHSL(0, 0, 0.05), m, rng);
      head.add(disc(0.055, 0.025, '#3B2A1A', m, 0.012));
      head.add(seeds(40, 0.035, 0.006, '#9AA43A', m, 0.03));
      break;
    case 'girasole':
      addRing(head, { count: 22, length: 0.19, width: 0.07, tilt: 80, cup: 0.35, curl: -0.05, round: 0.15, radius: 0.1 }, color, m, rng);
      addRing(head, { count: 20, length: 0.16, width: 0.065, tilt: 68, cup: 0.4, curl: 0, round: 0.15, radius: 0.09, y: 0.008, azimuthOffset: 0.15 }, color.clone().offsetHSL(0, 0, -0.05), m, rng);
      head.add(disc(0.12, 0.035, '#4A2C17', m, 0.01));
      head.add(seeds(220, 0.115, 0.007, '#2B190D', m, 0.035));
      break;
    case 'lavanda': {
      const florets = 46;
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 6, 5), m.plain(hex, 0.85), florets);
      const o = new THREE.Object3D();
      for (let i = 0; i < florets; i++) {
        const t = i / florets;
        const a = i * 2.4;
        const r = 0.018 * (1 - t * 0.6);
        o.position.set(Math.cos(a) * r, -0.12 + t * 0.42, Math.sin(a) * r);
        o.scale.setScalar(1 - t * 0.45);
        o.scale.y *= 1.4;
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      head.add(mesh);
      break;
    }
  }
  return head;
}

export function leafGeometry(rng: () => number): THREE.BufferGeometry {
  return petalGeometry({
    length: 0.26 + rng() * 0.08,
    width: 0.07 + rng() * 0.02,
    cup: 0.5,
    curl: 0.2,
    round: 0.1,
    ruffle: 0.2,
    color: new THREE.Color('#4F8F4A').offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.08),
    rng,
  });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
