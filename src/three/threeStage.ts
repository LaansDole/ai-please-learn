import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog,
  HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene,
  SphereGeometry, Sprite, SpriteMaterial, Vector3, WebGLRenderer,
} from 'three';
import { FONT_UI } from '../env/draw2d';
import type { Body3D, Vec3 } from '../env/types';
import { distanceMarkers, focusOf, followCamera } from './follow';

export interface ThreeStage {
  /** Paints one frame; returns the x of the followed (solid) figure in metres, or null when the frame has none. */
  show(bodies: Body3D[]): number | null;
  resize(w: number, h: number): void;
  dispose(): void;
}

const BG = '#eef1e8', GROUND = '#e3e8db', GRID = '#c2cabb', GRID_5M = '#8a968c', START = '#1d4a3b', LABEL = '#4b5a51', DEFAULT_COLOR = '#16241d';
// The spec's camera (0, 1.4, 4.5) looked along the ground, so the grid and the far leg were invisible: it now sits higher and a little
// behind the figure. CAMERA is the followed point (x eases to the figure); the eye is CAMERA + EYE_X and looks ahead by LOOK_X.
const CAMERA: Vec3 = [0, 2.0, 4.6], EYE_X = -0.9, LOOK_X = 0.4, LOOK_Y = 0.75, LERP = 0.08, SNAP = 6;
const TRACK_HALF = 200, LANE_HALF = 5, MARKER_SPAN = 12, MARKER_Y = 0.14, MARKER_Z = 1.1, LABEL_HALF = 0.22, GHOST_OPACITY = 0.18;

/** Faint line every metre across and along the track, brighter every 5 m, and the start line in the accent colour. */
function gridLines(): LineSegments[] {
  const fine: number[] = [], five: number[] = [], start = [0, 0, -LANE_HALF, 0, 0, LANE_HALF];
  for (let x = -TRACK_HALF; x <= TRACK_HALF; x++) if (x !== 0) (x % 5 === 0 ? five : fine).push(x, 0, -LANE_HALF, x, 0, LANE_HALF);
  for (let z = -LANE_HALF; z <= LANE_HALF; z++) fine.push(-TRACK_HALF, 0, z, TRACK_HALF, 0, z);
  return ([[fine, GRID], [five, GRID_5M], [start, START]] as const).map(([points, color]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points, 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ color }));
    lines.position.y = 0.002;                       // just above the plane: no z-fighting
    return lines;
  });
}

/** A pooled "N m" label standing on the near side of the track; its texture is redrawn only when its number changes. */
function markerSprite(): { sprite: Sprite; set(metres: number): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d')!, texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2 * LABEL_HALF, LABEL_HALF, 1);
  let shown = NaN;
  return {
    sprite,
    set(metres) {
      sprite.position.set(metres, MARKER_Y, MARKER_Z);
      if (metres === shown) return;
      shown = metres;
      ctx.clearRect(0, 0, 128, 64);
      ctx.font = `34px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = metres === 0 ? START : LABEL;
      ctx.fillText(`${metres} m`, 64, 34);
      texture.needsUpdate = true;
    },
  };
}

/** Main-thread painter for `3d` frames (spec section 10.6). No animation loop: it renders once per frame it is shown. */
export function createThreeStage(canvas: HTMLCanvasElement): ThreeStage {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG);
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.fog = new Fog(BG, 8, 26);
  const camera = new PerspectiveCamera(40, 800 / 500, 0.1, 60);
  let cam: Vec3 = [...CAMERA], placed = false;
  const edge = new Vector3();

  scene.add(new HemisphereLight('#ffffff', GROUND, 1.2), new AmbientLight('#ffffff', 0.25));
  const sun = new DirectionalLight('#ffffff', 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const ground = new Mesh(new PlaneGeometry(2 * TRACK_HALF, 2 * LANE_HALF), new MeshStandardMaterial({ color: GROUND, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  const grid = gridLines();
  scene.add(ground, ...grid);
  const markers = Array.from({ length: 2 * MARKER_SPAN + 1 }, markerSprite);
  for (const m of markers) scene.add(m.sprite);

  const meshes = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>>();
  const meshFor = (b: Body3D) => {
    let mesh = meshes.get(b.id);
    if (mesh) return mesh;
    const [sx, sy, sz] = b.size;
    const geometry = b.shape === 'box' ? new BoxGeometry(2 * sx, 2 * sy, 2 * sz) : b.shape === 'capsule' ? new CapsuleGeometry(sx, 2 * sy, 4, 12) : new SphereGeometry(sx, 20, 14);
    const material = new MeshStandardMaterial({ color: new Color(b.color ?? DEFAULT_COLOR), roughness: 0.55 });
    if (b.ghost) Object.assign(material, { transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
    mesh = new Mesh(geometry, material);
    mesh.castShadow = !b.ghost;
    meshes.set(b.id, mesh); scene.add(mesh);
    return mesh;
  };

  return {
    show(bodies) {
      for (const mesh of meshes.values()) mesh.visible = false;     // absent this frame: hidden, kept for when it returns
      for (const b of bodies) {
        const mesh = meshFor(b);
        mesh.visible = true;
        mesh.position.set(b.pos[0], b.pos[1], b.pos[2]); mesh.quaternion.set(b.quat[0], b.quat[1], b.quat[2], b.quat[3]);
      }
      const focus = focusOf(bodies);
      if (focus) {
        // A new episode puts the figure back at the start: cut there instead of panning across the whole track.
        cam = !placed || Math.abs(focus[0] - cam[0]) > SNAP ? [focus[0], cam[1], cam[2]] : followCamera(cam, focus, LERP);
        placed = true;
      }
      camera.position.set(cam[0] + EYE_X, cam[1], cam[2]); camera.lookAt(cam[0] + LOOK_X, LOOK_Y, 0);
      sun.position.set(cam[0] + 3, 7, 5); sun.target.position.set(cam[0], 0, 0);
      const shown = distanceMarkers(cam[0], MARKER_SPAN);
      // A label cut by the canvas edge reads as a different number: it shows only once both of its ends are in frame.
      camera.updateMatrixWorld();
      const inFrame = (x: number) => Math.abs(edge.set(x, MARKER_Y, MARKER_Z).project(camera).x) <= 1;
      markers.forEach((m, i) => {
        const x = shown[i];
        m.sprite.visible = x !== undefined && inFrame(x - LABEL_HALF) && inFrame(x + LABEL_HALF);
        if (x !== undefined && m.sprite.visible) m.set(x);
      });
      renderer.render(scene, camera);
      return focus ? focus[0] : null;
    },
    resize(w, h) {
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    dispose() {
      for (const mesh of meshes.values()) { mesh.geometry.dispose(); mesh.material.dispose(); }
      for (const m of markers) { m.sprite.material.map?.dispose(); m.sprite.material.dispose(); }
      for (const g of grid) { g.geometry.dispose(); (g.material as LineBasicMaterial).dispose(); }
      ground.geometry.dispose(); ground.material.dispose();
      sun.dispose();                                // its shadow map
      renderer.dispose();
      renderer.forceContextLoss();                  // browsers cap live WebGL contexts: give this one back now, not at garbage collection
    },
  };
}
