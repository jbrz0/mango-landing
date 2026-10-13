import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';

export type FieldNode = { id: string; symbol: string; family: string; change: number | null };
export type RegimeState = { sentiment: string | null; confidence: string | null; volatility: string | null; nqBias: string | null };
export type LevelMark = { kind: 'support' | 'resistance' | 'price'; value: number };

const biasHex: Record<string, string> = {
  bearish: '#d48986', mildly_bearish: '#c9847a', neutral: '#ff990a', mildly_bullish: '#9fbfa8', bullish: '#82b99b',
};
const tone = (value: string | null, fallback = '#6e6e6e') => value && biasHex[value] ? biasHex[value] : fallback;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function glRenderer(canvas: HTMLCanvasElement) {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { return null; }
  if (!renderer.getContext()) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function watchSize(canvas: HTMLCanvasElement, camera: PerspectiveCamera, renderer: WebGLRenderer) {
  const fit = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  return () => observer.disconnect();
}

function watchFrame(canvas: HTMLCanvasElement, renderer: WebGLRenderer, draw: (dt: number) => void) {
  let last = performance.now();
  let on = false;
  const stopLoop = () => { on = false; renderer.setAnimationLoop(null); };
  const start = () => {
    if (on || document.hidden) return;
    on = true;
    last = performance.now();
    renderer.setAnimationLoop(now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
    });
  };
  const io = new IntersectionObserver(([entry]) => entry?.isIntersecting ? start() : stopLoop(), { threshold: 0.02 });
  io.observe(canvas);
  const onVis = () => document.hidden ? stopLoop() : start();
  document.addEventListener('visibilitychange', onVis);
  return () => { stopLoop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
}

function columnHeight(change: number | null) {
  if (change == null || change === 0) return 0.32;
  return 0.45 + Math.sqrt(Math.min(Math.abs(change), 8)) * 1.35;
}

function changeColor(change: number | null) {
  if (change == null || change === 0) return '#6a6a6a';
  return change > 0 ? '#82b99b' : '#d48986';
}

type Column = { id: string; mesh: Mesh; material: MeshStandardMaterial; base: Mesh; label: HTMLDivElement; x: number; z: number; target: number };

export function mountField(canvas: HTMLCanvasElement, stage: HTMLElement, onSelect: (id: string) => void) {
  const renderer = glRenderer(canvas);
  if (!renderer) return null;
  const scene = new Scene();
  scene.fog = new Fog(0x050505, 16, 34);
  const camera = new PerspectiveCamera(42, 1, 0.1, 80);
  let yaw = 0.42;
  let pitch = 0.46;
  let radius = 15.5;
  let idle = 1.2;
  const look = new Vector3(0, 1.35, 0);
  const place = () => {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius + 0.4, Math.cos(yaw) * Math.cos(pitch) * radius);
    camera.lookAt(look);
  };
  scene.add(new HemisphereLight(0xfff6ea, 0x111111, 0.85));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const key = new DirectionalLight(0xfff1dc, 2.1);
  key.position.set(6, 12, 8);
  scene.add(key);
  const rim = new PointLight(0xff990a, 18, 40);
  rim.position.set(-6, 4, 5);
  scene.add(rim);
  const grid = new GridHelper(28, 28, 0x3a2e1c, 0x171717);
  scene.add(grid);
  const root = new Group();
  scene.add(root);
  const columnGeo = new CylinderGeometry(0.3, 0.38, 1, 24);
  columnGeo.translate(0, 0.5, 0);
  const baseGeo = new CylinderGeometry(0.48, 0.48, 0.03, 24);
  const ring = new Mesh(new TorusGeometry(0.52, 0.012, 8, 48), new MeshBasicMaterial({ color: new Color().setStyle('#ff990a') }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  root.add(ring);

  const labels = document.createElement('div');
  labels.className = 'field-labels';
  stage.append(labels);
  const columns: Column[] = [];
  const plates: Mesh[] = [];
  let selected: string | null = null;
  let hovered: string | null = null;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const camDir = new Vector3();
  const scratch = new Vector3();

  function paint(column: Column) {
    const hot = column.id === selected || column.id === hovered;
    column.material.emissiveIntensity = hot ? 0.72 : 0.2;
    column.mesh.scale.x = hot ? 1.08 : 1;
    column.mesh.scale.z = hot ? 1.08 : 1;
    (column.base.material as MeshBasicMaterial).color.setStyle(hot ? '#ff990a' : '#2a2a2a');
    column.label.classList.toggle('is-selected', column.id === selected);
  }

  function clearColumns() {
    for (const column of columns) {
      root.remove(column.mesh, column.base);
      column.material.dispose();
      (column.base.material as Material).dispose();
      column.label.remove();
    }
    columns.length = 0;
    for (const plate of plates) {
      root.remove(plate);
      plate.geometry.dispose();
      (plate.material as Material).dispose();
    }
    plates.length = 0;
  }

  function setNodes(nodes: FieldNode[]) {
    clearColumns();
    const families = [...new Set(nodes.map(node => node.family))];
    const zGap = 2.7;
    const xGap = 1.65;
    families.forEach((family, familyIndex) => {
      const members = nodes.filter(node => node.family === family);
      const z = (familyIndex - (families.length - 1) / 2) * zGap;
      const width = Math.max(1.6, (members.length - 1) * xGap + 1.5);
      const plate = new Mesh(new PlaneGeometry(width, 1.35), new MeshBasicMaterial({ color: new Color().setStyle('#14120e'), transparent: true, opacity: 0.92 }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.015, z);
      root.add(plate);
      plates.push(plate);
      members.forEach((node, memberIndex) => {
        const x = (memberIndex - (members.length - 1) / 2) * xGap;
        const color = changeColor(node.change);
        const material = new MeshStandardMaterial({ color: new Color().setStyle(color), emissive: new Color().setStyle(color), emissiveIntensity: 0.2, roughness: 0.42, metalness: 0.12 });
        const mesh = new Mesh(columnGeo, material);
        mesh.position.set(x, 0, z);
        mesh.scale.y = 0.08;
        mesh.userData.id = node.id;
        const base = new Mesh(baseGeo, new MeshBasicMaterial({ color: new Color().setStyle('#2a2a2a') }));
        base.position.set(x, 0.03, z);
        root.add(mesh, base);
        const label = document.createElement('div');
        label.className = 'field-label';
        label.hidden = true;
        label.setAttribute('aria-hidden', 'true');
        const name = document.createElement('b');
        name.textContent = node.symbol;
        const move = document.createElement('small');
        move.textContent = node.change == null ? '—' : `${node.change > 0 ? '+' : ''}${node.change.toFixed(2)}%`;
        move.style.color = color;
        label.append(name, move);
        labels.append(label);
        const column = { id: node.id, mesh, material, base, label, x, z, target: columnHeight(node.change) };
        columns.push(column);
        paint(column);
      });
    });
    const kept = columns.find(column => column.id === selected);
    hovered = null;
    ring.visible = Boolean(kept);
    if (kept) ring.position.set(kept.x, 0.05, kept.z);
    else selected = null;
  }

  function highlight(id: string | null) {
    selected = id;
    const column = columns.find(item => item.id === id);
    ring.visible = Boolean(column);
    if (column) ring.position.set(column.x, 0.05, column.z);
    columns.forEach(paint);
  }

  function projectLabels() {
    camera.getWorldDirection(camDir);
    const placed: { x: number; y: number }[] = [];
    const ranked = [...columns].sort((a, b) => Number(b.id === selected || b.id === hovered) - Number(a.id === selected || a.id === hovered) || b.target - a.target);
    for (const column of ranked) {
      scratch.set(column.x, column.mesh.scale.y + 0.25, column.z);
      const facing = scratch.clone().sub(camera.position).dot(camDir) > 0.4;
      scratch.project(camera);
      const x = (scratch.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-scratch.y * 0.5 + 0.5) * canvas.clientHeight;
      const onScreen = facing && scratch.z < 1 && x > 8 && y > 8 && x < canvas.clientWidth - 8 && y < canvas.clientHeight - 28;
      const pinned = column.id === selected || column.id === hovered;
      const crowded = placed.some(point => Math.hypot(point.x - x, point.y - y) < 58);
      const show = onScreen && (pinned || !crowded);
      column.label.hidden = !show;
      if (!show) continue;
      placed.push({ x, y });
      column.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -115%)`;
    }
  }

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const found = raycaster.intersectObjects(columns.map(column => column.mesh), false)[0];
    const id = found?.object.userData.id as string | undefined;
    if (event.type === 'pointermove') {
      hovered = id ?? null;
      columns.forEach(paint);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      return;
    }
    if (id) onSelect(id);
  }

  const abort = new AbortController();
  const signal = abort.signal;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', event => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) { pick(event); return; }
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (Math.hypot(dx, dy) > 3) moved = true;
    yaw -= dx * 0.005;
    pitch = clamp(pitch + dy * 0.004, 0.2, 1.08);
    idle = 2.4;
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    dragging = false;
    canvas.classList.remove('is-dragging');
    if (!moved) pick(event);
  }, { signal });
  canvas.addEventListener('pointerleave', () => { hovered = null; columns.forEach(paint); }, { signal });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    radius = clamp(radius + event.deltaY * 0.01, 9, 28);
    idle = 2.4;
  }, { passive: false, signal });

  const unsize = watchSize(canvas, camera, renderer);
  const unframe = watchFrame(canvas, renderer, dt => {
    if (!reduceMotion()) idle = Math.max(0, idle - dt);
    if (!reduceMotion() && idle === 0 && !dragging) yaw += dt * 0.16;
    for (const column of columns) column.mesh.scale.y += (column.target - column.mesh.scale.y) * Math.min(1, dt * 6);
    place();
    projectLabels();
    renderer.render(scene, camera);
  });

  return {
    setNodes, highlight,
    reset() { yaw = 0.42; pitch = 0.46; radius = 15.5; idle = 0; },
    destroy() {
      abort.abort();
      unframe();
      unsize();
      clearColumns();
      labels.remove();
      columnGeo.dispose();
      baseGeo.dispose();
      (ring.material as Material).dispose();
      ring.geometry.dispose();
      renderer.dispose();
    },
  };
}

export function mountRegime(canvas: HTMLCanvasElement) {
  const renderer = glRenderer(canvas);
  if (!renderer) return null;
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 40);
  camera.position.set(0, 1.15, 6.2);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 0.45));
  const key = new DirectionalLight(0xfff4e4, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const glow = new PointLight(0xff990a, 12, 16);
  glow.position.set(-2, 1, 3);
  scene.add(glow);
  const group = new Group();
  scene.add(group);
  const wireMat = new MeshBasicMaterial({ color: new Color().setStyle('#ff990a'), wireframe: true, transparent: true, opacity: 0.9 });
  const wire = new Mesh(new IcosahedronGeometry(1.25, 1), wireMat);
  const coreMat = new MeshStandardMaterial({ color: new Color().setStyle('#6e6e6e'), emissive: new Color().setStyle('#6e6e6e'), emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.18 });
  const core = new Mesh(new SphereGeometry(0.58, 40, 28), coreMat);
  const ringMat = new MeshBasicMaterial({ color: new Color().setStyle('#fef3dc'), transparent: true, opacity: 0.75 });
  const ring = new Mesh(new TorusGeometry(1.85, 0.012, 12, 96), ringMat);
  ring.rotation.x = Math.PI / 2.5;
  group.add(wire, core, ring);
  let target = 1;
  let speed = 0.4;
  let spin = 0;

  function setState(state: RegimeState) {
    const shell = tone(state.sentiment);
    wireMat.color.setStyle(shell);
    wireMat.opacity = state.sentiment ? 0.95 : 0.35;
    const inner = tone(state.nqBias);
    coreMat.color.setStyle(inner);
    coreMat.emissive.setStyle(inner);
    target = state.confidence === 'low' ? 0.78 : state.confidence === 'high' ? 1.22 : 1;
    speed = state.volatility === 'falling' ? 0.18 : state.volatility === 'rising' ? 1.05 : state.volatility === 'stable' ? 0.42 : 0;
    glow.color.setStyle(shell);
  }

  const unsize = watchSize(canvas, camera, renderer);
  const unframe = watchFrame(canvas, renderer, dt => {
    group.scale.lerp(new Vector3(target, target, target), Math.min(1, dt * 4));
    if (!reduceMotion() && speed) {
      spin += dt * speed;
      group.rotation.y = spin;
      ring.rotation.z += dt * speed * 0.6;
    }
    renderer.render(scene, camera);
  });
  return {
    setState,
    destroy() {
      unframe();
      unsize();
      group.traverse(object => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as Material | Material[] | undefined;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
    },
  };
}

export function mountLevels(canvas: HTMLCanvasElement) {
  const renderer = glRenderer(canvas);
  if (!renderer) return null;
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(3.4, 1.8, 4.6);
  const root = new Group();
  scene.add(root);
  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xfff6ea, 2);
  key.position.set(2, 6, 3);
  scene.add(key);
  const pole = new Mesh(new CylinderGeometry(0.015, 0.015, 3.4, 8), new MeshBasicMaterial({ color: new Color().setStyle('#3a3a3a') }));
  pole.position.y = 1.5;
  scene.add(pole);
  const planes: Mesh[] = [];
  let spin = 0.5;

  function setMarks(marks: LevelMark[]) {
    for (const plane of planes) {
      root.remove(plane);
      plane.geometry.dispose();
      (plane.material as Material).dispose();
    }
    planes.length = 0;
    if (!marks.length) return;
    const values = marks.map(mark => mark.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(high - low, Math.abs(high) * 0.004, 0.0001);
    const yOf = (value: number) => ((value - low) / span) * 2.8 + 0.2;
    for (const mark of marks) {
      const color = mark.kind === 'price' ? '#ff990a' : mark.kind === 'support' ? '#82b99b' : '#d48986';
      const mesh = new Mesh(
        new BoxGeometry(mark.kind === 'price' ? 2.7 : 2.15, 0.05, mark.kind === 'price' ? 1.4 : 1.08),
        new MeshStandardMaterial({ color: new Color().setStyle(color), emissive: new Color().setStyle(color), emissiveIntensity: mark.kind === 'price' ? 0.7 : 0.4, roughness: 0.38, metalness: 0.1 }),
      );
      mesh.position.y = yOf(mark.value);
      root.add(mesh);
      planes.push(mesh);
    }
    const mid = planes.reduce((sum, plane) => sum + plane.position.y, 0) / planes.length;
    camera.lookAt(0, mid, 0);
    pole.position.y = mid;
    pole.scale.y = Math.max(1, (Math.max(...planes.map(plane => plane.position.y)) - Math.min(...planes.map(plane => plane.position.y)) + 0.8) / 3.4);
  }

  const unsize = watchSize(canvas, camera, renderer);
  const unframe = watchFrame(canvas, renderer, dt => {
    if (!reduceMotion()) spin += dt * 0.25;
    root.rotation.y = spin;
    renderer.render(scene, camera);
  });
  return {
    setMarks,
    destroy() {
      unframe();
      unsize();
      setMarks([]);
      pole.geometry.dispose();
      (pole.material as Material).dispose();
      renderer.dispose();
    },
  };
}
