import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Bouquet } from '../../shared/flowers';
import { createRng } from '../../shared/random';
import { easeOutBack, placeHead } from './composition';
import { buildHead, createMaterials, leafGeometry, type Materials } from './flowers3d';

export interface BouquetView {
  show(bouquet: Bouquet): void;
  /** Pauses the render loop while the bouquet is off screen (saves battery and CPU). */
  setActive(active: boolean): void;
  dispose(): void;
}

/** Returns null when WebGL is unavailable, so the caller can show a fallback. */
export function createBouquetView(container: HTMLElement): BouquetView | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Devices without GPU acceleration render WebGL in software: keep them responsive with
  // a lower resolution and frame rate instead of freezing the whole page.
  const software = isSoftwareRenderer(renderer);
  renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  const minFrameMs = software ? 1000 / 20 : 0;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight('#fff1dc', 2.2);
  key.position.set(-2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#c9d4ff', 0.9);
  rim.position.set(3, 2, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#3d4a2f', 0.5));

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0.9, 5.4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.35, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = Math.PI * 0.28;
  controls.maxPolarAngle = Math.PI * 0.58;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.7;
  controls.update();

  const materials = createMaterials();
  let root: THREE.Group | null = null;
  let heads: THREE.Object3D[] = [];
  let startedAt = 0;

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const clock = new THREE.Clock();
  let lastFrame = -Infinity;
  const frame = (now: number) => {
    if (now - lastFrame < minFrameMs) return;
    lastFrame = now;
    const elapsed = clock.getElapsedTime();
    if (root) {
      const t = reducedMotion ? 1 : (elapsed - startedAt) / 1.3;
      const s = easeOutBack(t);
      root.scale.setScalar(Math.max(0.001, s));
      root.position.y = (1 - Math.min(1, Math.max(0, t))) * -0.9;
      heads.forEach((head, i) => {
        const ht = reducedMotion ? 1 : (elapsed - startedAt - 0.35 - i * 0.07) / 0.8;
        head.scale.setScalar(Math.max(0.001, easeOutBack(ht)) * (head.userData.size as number));
      });
      if (!reducedMotion) root.rotation.z = Math.sin(elapsed * 0.6) * 0.015;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  let active = true;
  renderer.setAnimationLoop(frame);

  return {
    show(bouquet) {
      if (root) disposeTree(root);
      const built = buildBouquet(bouquet, materials);
      root = built.root;
      heads = built.heads;
      scene.add(root);
      startedAt = clock.getElapsedTime();
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      renderer.setAnimationLoop(next ? frame : null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      if (root) disposeTree(root);
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function buildBouquet(bouquet: Bouquet, m: Materials): { root: THREE.Group; heads: THREE.Object3D[] } {
  const root = new THREE.Group();
  const heads: THREE.Object3D[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  // Draw the top flowers last so the entrance blooms from the edges inward.
  const order = bouquet.stems.map((s, i) => ({ s, i })).sort((a, b) => a.s.elevation - b.s.elevation);
  for (const { s } of order) {
    const place = placeHead(s);
    const rng = createRng(s.seed ^ 0x9e3779b9);

    const curve = new THREE.CatmullRomCurve3(place.stem.map((p) => new THREE.Vector3(...p)));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, s.type === 'lavanda' ? 0.008 : 0.013, 6), m.stem));

    if (rng() < 0.6) {
      const at = curve.getPoint(0.55 + rng() * 0.25);
      const leaf = new THREE.Mesh(leafGeometry(rng), m.leaf);
      leaf.position.copy(at);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = Math.atan2(at.x, at.z) + (rng() - 0.5) * 0.6;
      leaf.rotation.x = (55 + rng() * 25) * (Math.PI / 180);
      root.add(leaf);
    }

    const head = buildHead(s.type, s.color, s.seed, m);
    head.position.set(...place.position);
    head.quaternion.setFromUnitVectors(up, new THREE.Vector3(...place.direction));
    head.rotateY(rng() * Math.PI * 2);
    const size = (s.type === 'lavanda' ? 1.5 : s.type === 'girasole' || s.type === 'peonia' ? 1.75 : 2.0) * s.scale;
    head.userData.size = size;
    head.scale.setScalar(0.001);
    root.add(head);
    heads.push(head);
  }

  // A collar of foliage over the paper rim, like a florist's greenery.
  const leafRng = createRng(bouquet.stems.reduce((h, s) => (h ^ s.seed) >>> 0, 0x5bd1e995));
  const collar = 16;
  for (let i = 0; i < collar; i++) {
    const a = (i / collar) * Math.PI * 2 + leafRng() * 0.2;
    const leaf = new THREE.Mesh(leafGeometry(leafRng), m.leaf);
    leaf.position.set(Math.sin(a) * 0.5, 0.22 + leafRng() * 0.12, Math.cos(a) * 0.5);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = a + (leafRng() - 0.5) * 0.4;
    leaf.rotation.x = (35 + leafRng() * 30) * (Math.PI / 180);
    leaf.scale.setScalar(1.5 + leafRng() * 0.5);
    root.add(leaf);
  }

  root.add(buildWrap(bouquet.wrap, bouquet.ribbon, m));
  return { root, heads };
}

/** Pleated paper cone plus a ribbon bow at the tie point. */
function buildWrap(paperHex: string, ribbonHex: string, m: Materials): THREE.Group {
  const wrap = new THREE.Group();
  const top = 0.25;
  const bottom = -1.15;
  const rTop = 0.78;
  const rBottom = 0.1;
  const geo = new THREE.CylinderGeometry(rTop, rBottom, top - bottom, 72, 10, true);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = (y + (top - bottom) / 2) / (top - bottom); // 0 bottom .. 1 top
    const pleat = 1 + 0.07 * k * Math.sin(a * 9);
    pos.setXYZ(i, x * pleat, y + k * k * 0.12 * Math.sin(a * 3 + 1), z * pleat);
  }
  geo.computeVertexNormals();
  const paper = new THREE.MeshStandardMaterial({ color: paperHex, roughness: 0.92, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(geo, paper);
  cone.position.y = (top + bottom) / 2;
  wrap.add(cone);

  const tieY = -0.42;
  const k = (tieY - bottom) / (top - bottom);
  const tieR = (rBottom + (rTop - rBottom) * k) * 1.03;
  const ribbon = m.plain(ribbonHex, 0.45);
  const band = new THREE.Mesh(new THREE.TorusGeometry(tieR, 0.028, 10, 64), ribbon);
  band.rotation.x = Math.PI / 2;
  band.position.y = tieY;
  wrap.add(band);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 10, 32), ribbon);
    loop.scale.set(1.3, 0.75, 1);
    loop.position.set(side * 0.1, tieY + 0.02, tieR + 0.02);
    loop.rotation.z = side * 0.35;
    wrap.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.008), ribbon);
    tail.position.set(side * 0.06, tieY - 0.14, tieR + 0.03);
    tail.rotation.z = side * 0.25;
    wrap.add(tail);
  }
  wrap.userData.ownMaterial = paper;
  return wrap;
}

/** Frees geometry and the per-bouquet paper; shared materials stay cached for the next bouquet. */
function disposeTree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
    if (o.userData.ownMaterial instanceof THREE.Material) o.userData.ownMaterial.dispose();
  });
}

function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}
