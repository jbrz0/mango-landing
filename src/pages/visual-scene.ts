import {
  AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture,
  Color, CylinderGeometry, DirectionalLight, FogExp2, Group, HemisphereLight, IcosahedronGeometry,
  Line, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PointLight, Points, PointsMaterial, Raycaster,
  Scene, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
  type Material, type Object3D,
} from 'three';
import type { VisualLens, VisualNode } from './visual-data';

type AtlasNode = {
  data: VisualNode;
  object: Group;
  anchor: Vector3;
  label: HTMLButtonElement;
  leader: HTMLDivElement;
  materials: MeshStandardMaterial[];
};
type Axis = { position: Vector3; label: HTMLDivElement; owner?: string };

const mango = '#ffae35';
const muted = '#586879';
const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatTick = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}%`;

function disposeObject(object: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  object.traverse(child => {
    if (child instanceof Mesh || child instanceof Line || child instanceof Points || child instanceof Sprite) {
      if (!(child instanceof Sprite)) geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function mountAtlas(canvas: HTMLCanvasElement, labelHost: HTMLElement, onSelect: (id: string) => void) {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }); }
  catch { return null; }
  if (!renderer.getContext()) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(max-width: 700px)').matches ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x050910, 0);

  const scene = new Scene();
  scene.fog = new FogExp2(0x070b12, 0.015);
  const camera = new PerspectiveCamera(39, 1, 0.1, 140);
  const target = new Vector3(0, 0.6, 0);
  const sceneBase = new Group();
  const dataRoot = new Group();
  scene.add(sceneBase, dataRoot);
  const light = new DirectionalLight(0xffe6bc, 3.2);
  light.position.set(6, 12, 8);
  scene.add(light, new HemisphereLight(0x9acaff, 0x172333, 1.45), new AmbientLight(0xffffff, 0.38));
  const orange = new PointLight(0xff9e22, 50, 26, 1.9);
  orange.position.set(-6, 3, 5);
  const blue = new PointLight(0x83b7e4, 40, 24, 1.8);
  blue.position.set(7, 6, -5);
  scene.add(orange, blue);

  const stone = new MeshStandardMaterial({ color: '#0d1521', metalness: 0.7, roughness: 0.43, transparent: true, opacity: 0.78 });
  const platform = new Mesh(new CylinderGeometry(10.4, 10.7, 0.22, 100), stone);
  platform.position.y = -2.02;
  sceneBase.add(platform);
  const ringMaterial = new MeshBasicMaterial({ color: '#55718c', transparent: true, opacity: 0.19 });
  for (const radius of [2.1, 3.7, 5.4, 7.2, 8.9, 10.45]) {
    const ring = new Mesh(new TorusGeometry(radius, radius === 10.45 ? 0.019 : 0.011, 5, 160), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.88;
    sceneBase.add(ring);
  }
  const dashes: number[] = [];
  for (let i = 0; i < 100; i++) {
    const a = i / 100 * TAU;
    const inner = i % 5 === 0 ? 9.76 : 10.05;
    dashes.push(Math.cos(a) * inner, -1.87, Math.sin(a) * inner, Math.cos(a) * 10.24, -1.87, Math.sin(a) * 10.24);
  }
  const dashGeometry = new BufferGeometry();
  dashGeometry.setAttribute('position', new BufferAttribute(new Float32Array(dashes), 3));
  sceneBase.add(new LineSegments(dashGeometry, new LineBasicMaterial({ color: '#a67b41', transparent: true, opacity: 0.48 })));
  // The deterministic stars are decoration, separate from the data geometry.
  const starPositions: number[] = [];
  let seed = 719;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 180; i++) starPositions.push((random() - 0.5) * 70, random() * 24 - 5, (random() - 0.5) * 65);
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new BufferAttribute(new Float32Array(starPositions), 3));
  const stars = new Points(starGeometry, new PointsMaterial({ color: '#a0bfd6', size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.63 }));
  sceneBase.add(stars);

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 256;
  const haloContext = haloCanvas.getContext('2d');
  if (haloContext) {
    const gradient = haloContext.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.06)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    haloContext.fillStyle = gradient;
    haloContext.fillRect(0, 0, 256, 256);
  }
  const haloTexture = new CanvasTexture(haloCanvas);

  const selector = new Mesh(new TorusGeometry(0.62, 0.024, 8, 64), new MeshBasicMaterial({ color: mango, transparent: true, opacity: 0.95 }));
  selector.rotation.x = Math.PI / 2;
  selector.visible = false;
  scene.add(selector);

  let nodes: AtlasNode[] = [];
  let axes: Axis[] = [];
  let lens: VisualLens | null = null;
  let selected: string | null = null;
  let hovered: string | null = null;
  let autoRotate = false;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw = 0.27;
  let pitch = 0.38;
  let radius = 25;
  let goalYaw = yaw;
  let goalPitch = pitch;
  let goalRadius = radius;
  let baseRadius = radius;
  let disposed = false;
  let renderFrame = 0;
  let lastTime = 0;
  let entry = 1;
  let dragDistance = 0;
  let cameraDirty = true;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const scratch = new Vector3();
  const world = new Vector3();
  const direction = new Vector3();
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  let pinchDistance = 0;

  const standard = (color: string, intensity = 0.2) => new MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.27, metalness: 0.47,
  });
  const basic = (color: string, opacity = 1) => new MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  function line(points: Vector3[], color: string, opacity = 0.45, dashed = false, parent: Group = dataRoot) {
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = dashed
      ? new LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.1, gapSize: 0.11 })
      : new LineBasicMaterial({ color, transparent: true, opacity });
    const mesh = new Line(geometry, material);
    if (dashed) mesh.computeLineDistances();
    parent.add(mesh);
    return mesh;
  }
  function circle(radiusValue: number, y: number, color: string, opacity = 0.5, dashed = false) {
    const points = Array.from({ length: 129 }, (_, i) => new Vector3(Math.cos(i / 128 * TAU) * radiusValue, y, Math.sin(i / 128 * TAU) * radiusValue));
    return line(points, color, opacity, dashed);
  }
  function axis(position: Vector3, text: string, owner?: string) {
    const label = document.createElement('div');
    label.className = 'atlas-axis';
    label.textContent = text;
    label.style.position = 'absolute';
    label.style.pointerEvents = 'none';
    label.setAttribute('aria-hidden', 'true');
    labelHost.append(label);
    axes.push({ position, label, owner });
  }
  function addNode(data: VisualNode, position: Vector3, anchor: Vector3) {
    const object = new Group();
    object.position.copy(position);
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'atlas-label';
    label.dataset.node = data.id;
    label.setAttribute('aria-label', `${data.label}: ${data.value}`);
    label.setAttribute('aria-pressed', 'false');
    label.style.position = 'absolute';
    const name = document.createElement('b');
    name.textContent = data.label;
    const value = document.createElement('span');
    value.textContent = data.value;
    value.style.color = data.color;
    label.append(name, value);
    label.addEventListener('pointerdown', event => event.stopPropagation());
    label.addEventListener('click', event => { event.stopPropagation(); onSelect(data.id); });
    label.addEventListener('pointerenter', () => { hovered = data.id; paint(); });
    label.addEventListener('pointerleave', () => { hovered = null; paint(); });
    const leader = document.createElement('div');
    leader.className = 'atlas-label-leader';
    Object.assign(leader.style, { position: 'absolute', height: '1px', pointerEvents: 'none', backgroundColor: data.color, transformOrigin: '0 50%', opacity: '0.32', zIndex: '0' });
    label.style.zIndex = '1';
    labelHost.append(leader, label);
    dataRoot.add(object);
    const item: AtlasNode = { data, object, anchor, label, leader, materials: [] };
    nodes.push(item);
    return item;
  }
  function orb(node: AtlasNode, size = 0.43, faceted = false) {
    const material = standard(node.data.color, 0.31);
    const sphere = new Mesh(faceted ? new IcosahedronGeometry(size, 1) : new SphereGeometry(size, 32, 24), material);
    node.object.add(sphere);
    node.materials.push(material);
    const ring = new Mesh(new TorusGeometry(size * 1.35, 0.012, 6, 64), basic(node.data.color, 0.8));
    ring.rotation.x = Math.PI / 2.7;
    node.object.add(ring);
  }
  function foot(node: AtlasNode, y: number, width = 0.5) {
    const base = new Mesh(new CylinderGeometry(width, width, 0.04, 32), standard('#182a3a', 0));
    base.position.y = y;
    node.object.add(base);
    const rim = new Mesh(new TorusGeometry(width, 0.012, 5, 48), basic(node.data.color, 0.64));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y + 0.025;
    node.object.add(rim);
  }
  function bars(current: VisualLens) {
    const extent = Math.max(0.25, ...current.nodes.map(node => Math.abs(node.metric ?? 0)));
    const scale = 4.25 / extent;
    const groups = [...new Set(current.nodes.map(node => node.group))];
    const largestGroup = Math.max(1, ...groups.map(group => current.nodes.filter(node => node.group === group).length));
    const isMarket = current.id === 'markets';
    const spacing = isMarket ? 14 / Math.max(1, current.nodes.length - 1 + (groups.length - 1) * 0.55) : Math.min(1.65, 14 / Math.max(1, largestGroup - 1));
    const depth = !isMarket && groups.length > 1 ? 3 : 0;
    const width = isMarket ? 14.8 : Math.max(4, (largestGroup - 1) * spacing + 1.9);
    const zero = new Mesh(new BoxGeometry(width + 0.7, 0.035, Math.max(1.5, (groups.length - 1) * depth + 1.6)), basic('#466b88', 0.15));
    zero.position.set(0, 0, 0);
    dataRoot.add(zero);
    const tick = extent / 2;
    for (const value of [-extent, -tick, 0, tick, extent]) {
      const y = value * scale;
      line([new Vector3(-width / 2, y, -Math.max(1, (groups.length - 1) * depth / 2 + 0.8)), new Vector3(width / 2, y, -Math.max(1, (groups.length - 1) * depth / 2 + 0.8))], '#7b93a4', value === 0 ? 0.57 : 0.16);
      axis(new Vector3(-width / 2 - 0.4, y, -Math.max(1, (groups.length - 1) * depth / 2 + 0.8)), formatTick(value));
    }
    let groupOffset = 0;
    groups.forEach((group, groupIndex) => {
      const members = current.nodes.filter(node => node.group === group);
      const z = (groupIndex - (groups.length - 1) / 2) * depth;
      const groupX = isMarket ? -7 + (groupOffset + (members.length - 1) / 2) * spacing : 0;
      axis(new Vector3(groupX, -4.8, z + 0.7), group);
      members.forEach((data, i) => {
        const height = data.metric == null ? 0 : data.metric * scale;
        const x = isMarket ? -7 + (groupOffset + i) * spacing : (i - (members.length - 1) / 2) * spacing;
        const item = addNode(data, new Vector3(x, 0, z), new Vector3(0, height < -0.15 ? height - 0.15 : Math.max(0.32, height) + 0.2, 0));
        const material = standard(data.color, 0.24);
        const bar = new Mesh(new BoxGeometry(Math.min(0.68, spacing * 0.62), Math.max(0.045, Math.abs(height)), 0.65), material);
        bar.position.y = height / 2;
        item.object.add(bar);
        item.materials.push(material);
        // A missing observation gets a flat marker; it is never assigned a return.
        if (data.metric == null) {
          const noValue = new Mesh(new TorusGeometry(0.25, 0.025, 6, 32), basic(muted));
          noValue.rotation.x = Math.PI / 2;
          noValue.position.y = 0.09;
          item.object.add(noValue);
        }
        foot(item, 0, 0.46);
        if (height < -0.2) line([new Vector3(item.object.position.x, height, z), new Vector3(item.object.position.x, 0.2, z)], data.color, 0.24, true);
      });
      groupOffset += members.length + 0.55;
    });
  }
  function overview(current: VisualLens) {
    const regime = current.nodes.find(node => node.id === 'regime');
    if (!regime) return;
    // The core is the published categorical regime. Geometry carries no invented weight.
    const core = addNode(regime, new Vector3(0, 0.5, 0), new Vector3(0, 2.72, 0));
    const globe = core.object;
    const coreMaterial = new MeshStandardMaterial({ color: regime.color, emissive: regime.color, emissiveIntensity: 0.39, metalness: 0.64, roughness: 0.28 });
    core.materials.push(coreMaterial);
    const shell = new Mesh(new IcosahedronGeometry(2.02, 4), coreMaterial);
    const wireColor = new Color(regime.color).lerp(new Color('#fff1d7'), 0.38);
    const wire = new Mesh(new IcosahedronGeometry(2.05, 2), new MeshBasicMaterial({ color: wireColor, wireframe: true, transparent: true, opacity: 0.24 }));
    const glow = new Mesh(new SphereGeometry(2.17, 32, 24), new MeshBasicMaterial({ color: regime.color, wireframe: true, transparent: true, opacity: 0.055, blending: AdditiveBlending, depthWrite: false }));
    const halo = new Sprite(new SpriteMaterial({ map: haloTexture, color: regime.color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
    halo.scale.set(10, 10, 1);
    halo.raycast = () => {};
    globe.add(halo, shell, wire, glow);
    for (let i = 0; i < 3; i++) {
      const orbit = new Mesh(new TorusGeometry(2.48 + i * 0.15, 0.015, 5, 128), basic(i === 1 ? wireColor.getStyle() : regime.color, i === 1 ? 0.7 : 0.36));
      orbit.rotation.set(Math.PI / 2 + i * 0.48, i * 0.65, i * 0.4);
      globe.add(orbit);
    }
    circle(6.1, -0.65, regime.color, 0.38);
    circle(6.35, -0.65, '#6594b5', 0.15, true);
    const signals = current.nodes.filter(node => node.id !== regime.id);
    signals.forEach((data, i) => {
      const angle = -Math.PI / 2 + 0.25 + i / signals.length * TAU;
      const position = new Vector3(Math.cos(angle) * 6.1, 0.6 + (i % 2 ? 0.55 : -0.2), Math.sin(angle) * 4.65);
      const item = addNode(data, position, new Vector3(0, 0.88, 0));
      orb(item, 0.49, true);
      line([new Vector3(0, 0.5, 0), position], data.color, 0.15, true);
      line([position, new Vector3(position.x, -1.83, position.z)], data.color, 0.2);
      foot(item, -1.83 - position.y, 0.54);
    });
  }
  function levels(current: VisualLens) {
    const count = current.nodes.length;
    const columns = Math.min(count, canvas.clientWidth < 700 ? 3 : 5);
    const rows = Math.ceil(count / Math.max(1, columns));
    current.nodes.forEach((data, index) => {
      const marks = data.levels ?? [];
      const values = marks.map(mark => mark.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min;
      const yFor = (value: number) => span > 0 ? -1.35 + (value - min) / span * 4.65 : 1;
      const row = Math.floor(index / Math.max(1, columns));
      const item = addNode(data, new Vector3((index % columns - (columns - 1) / 2) * 2.95, 0, (row - (rows - 1) / 2) * 3.65), new Vector3(0, 3.75, 0));
      foot(item, -1.6, 0.78);
      line([item.object.position.clone().add(new Vector3(0, -1.5, 0)), item.object.position.clone().add(new Vector3(0, 3.3, 0))], '#688198', 0.28, true);
      if (!marks.length) orb(item, 0.22);
      for (const mark of marks) {
        const color = mark.kind === 'support' ? '#6ed2b1' : mark.kind === 'resistance' ? '#f08b87' : mango;
        const material = standard(color, mark.kind === 'price' ? 0.5 : 0.18);
        const plate = new Mesh(new BoxGeometry(mark.kind === 'price' ? 1.6 : 1.25, mark.kind === 'price' ? 0.11 : 0.075, 0.85), material);
        plate.position.y = yFor(mark.value);
        item.object.add(plate);
        item.materials.push(material);
        axis(item.object.position.clone().add(new Vector3(0.89, yFor(mark.value), 0.1)), `${mark.value}`, data.id);
      }
    });
  }
  function history(current: VisualLens) {
    const dates = [...new Set(current.nodes.map(node => node.date ?? ''))].sort();
    const xFor = (date: string) => dates.length > 1 ? (dates.indexOf(date) / (dates.length - 1) - 0.5) * 14 : 0;
    for (const [track, z] of [['Broad', 1.45], ['Nasdaq', -1.45]] as const) {
      const members = current.nodes.filter(node => node.group === track);
      axis(new Vector3(-8, 0.2, z), track);
      line([new Vector3(-7.1, 0, z), new Vector3(7.1, 0, z)], '#67819d', 0.35);
      members.forEach(data => {
        const y = (data.metric ?? 0) * 1.5;
        const item = addNode(data, new Vector3(xFor(data.date ?? ''), y, z), new Vector3(0, 0.42, 0));
        if (data.metric == null) {
          const ring = new Mesh(new TorusGeometry(0.2, 0.026, 6, 24), basic(muted, 0.6));
          item.object.add(ring);
        } else {
          orb(item, 0.19);
          line([item.object.position.clone(), new Vector3(item.object.position.x, 0, z)], data.color, 0.18);
        }
      });
    }
    const map = new Map(nodes.map(node => [node.data.id, node]));
    current.links.forEach(linkData => {
      const from = map.get(linkData.from);
      const to = map.get(linkData.to);
      if (from && to && from.data.metric != null && to.data.metric != null) line([from.object.position.clone(), to.object.position.clone()], linkData.color ?? from.data.color, 0.85);
    });
    for (const value of [-2, -1, 0, 1, 2]) {
      const names: Record<number, string> = { [-2]: 'Bearish', [-1]: 'Mildly bearish', 0: 'Neutral', 1: 'Mildly bullish', 2: 'Bullish' };
      axis(new Vector3(-7.9, value * 1.5, -3.1), names[value]!);
      line([new Vector3(-7.2, value * 1.5, -2.25), new Vector3(7.2, value * 1.5, -2.25)], '#66829a', 0.1);
    }
    const stride = Math.max(1, Math.ceil(dates.length / 5));
    dates.forEach((date, index) => { if (index % stride === 0 || index === dates.length - 1) axis(new Vector3(xFor(date), -3.7, 1.5), date.slice(5)); });
  }
  function catalysts(current: VisualLens) {
    const ordered = [...current.nodes].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const spacing = Math.min(2.1, 14 / Math.max(1, ordered.length - 1));
    line([new Vector3(-7.2, -1.4, 0), new Vector3(7.2, -1.4, 0)], '#d79443', 0.55);
    ordered.forEach((data, index) => {
      const height = data.metric == null ? 0.05 : clamp(data.metric, 1, 3) * 1.35;
      const x = (index - (ordered.length - 1) / 2) * spacing;
      const item = addNode(data, new Vector3(x, -1.4, 0), new Vector3(0, height + 0.48, 0));
      const material = standard(data.color, 0.22);
      const pillar = new Mesh(new CylinderGeometry(0.17, 0.27, height, 24), material);
      pillar.position.y = height / 2;
      item.object.add(pillar);
      item.materials.push(material);
      const tip = new Mesh(new IcosahedronGeometry(0.3, 1), material);
      tip.position.y = height;
      item.object.add(tip);
      foot(item, 0, 0.55);
      if (index % Math.max(1, Math.ceil(ordered.length / 6)) === 0 && data.date) axis(new Vector3(x, -1.9, 0.75), data.date.slice(5, 10));
    });
    axis(new Vector3(-7.7, 2.65, -1.5), 'High');
    axis(new Vector3(-7.7, 1.3, -1.5), 'Medium');
    axis(new Vector3(-7.7, -0.05, -1.5), 'Low');
    for (const y of [-0.05, 1.3, 2.65]) line([new Vector3(-7.2, y, -1.5), new Vector3(7.2, y, -1.5)], '#6f8196', 0.17);
  }
  function themes(current: VisualLens) {
    const groups = [...new Set(current.nodes.map(node => node.group))];
    groups.forEach((group, groupIndex) => {
      const members = current.nodes.filter(node => node.group === group);
      const cx = groups.length === 1 ? 0 : (groupIndex - (groups.length - 1) / 2) * 7;
      const radiusValue = 2.8;
      const ringPoints = Array.from({ length: 81 }, (_, i) => new Vector3(cx + Math.cos(i / 80 * TAU) * radiusValue, 0, Math.sin(i / 80 * TAU) * radiusValue));
      line(ringPoints, members[0]?.color ?? mango, 0.4);
      axis(new Vector3(cx, 1.45, 0), group);
      const center = new Mesh(new TorusGeometry(0.86, 0.018, 6, 64), basic(members[0]?.color ?? mango, 0.65));
      center.rotation.x = Math.PI / 2;
      center.position.set(cx, -0.25, 0);
      dataRoot.add(center);
      members.forEach((data, index) => {
        const angle = -Math.PI / 2 + index / members.length * TAU;
        const position = new Vector3(cx + Math.cos(angle) * radiusValue, 0.15, Math.sin(angle) * radiusValue);
        const item = addNode(data, position, new Vector3(0, 0.6, 0));
        orb(item, 0.34, true);
        line([new Vector3(cx, -0.25, 0), position], data.color, 0.17);
      });
    });
  }
  function wire(current: VisualLens) {
    const topics = current.nodes.filter(node => node.group === 'Topic');
    const stories = current.nodes.filter(node => node.group !== 'Topic');
    const max = Math.max(1, ...topics.map(node => node.metric ?? 0));
    topics.forEach((data, index) => {
      const angle = -Math.PI / 2 + index / Math.max(1, topics.length) * TAU;
      const size = 0.24 + ((data.metric ?? 0) / max) * 0.48;
      const item = addNode(data, new Vector3(Math.cos(angle) * 2.85, 1.1, Math.sin(angle) * 2.85), new Vector3(0, size + 0.42, 0));
      orb(item, size);
    });
    stories.forEach((data, index) => {
      const angle = -Math.PI / 2 + index / Math.max(1, stories.length) * TAU;
      const item = addNode(data, new Vector3(Math.cos(angle) * 6.7, -0.35 + (index % 2) * 0.6, Math.sin(angle) * 5.1), new Vector3(0, 0.5, 0));
      orb(item, 0.2, true);
    });
    const map = new Map(nodes.map(node => [node.data.id, node]));
    current.links.forEach(linkData => {
      const from = map.get(linkData.from);
      const to = map.get(linkData.to);
      if (from && to) {
        const start = from.object.position.clone();
        const end = to.object.position.clone();
        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.y += 0.7;
        const points = Array.from({ length: 21 }, (_, i) => {
          const t = i / 20;
          return start.clone().multiplyScalar((1 - t) ** 2).add(mid.clone().multiplyScalar(2 * (1 - t) * t)).add(end.clone().multiplyScalar(t * t));
        });
        line(points, linkData.color ?? from.data.color, 0.45);
      }
    });
    circle(2.85, -1.3, '#7c96ad', 0.25, true);
    circle(6.7, -1.3, '#d99745', 0.19, true);
  }
  function paint() {
    nodes.forEach(node => {
      const hot = node.data.id === selected || node.data.id === hovered;
      node.materials.forEach(material => { material.emissiveIntensity = hot ? 0.72 : 0.23; });
      node.label.classList.toggle('is-selected', node.data.id === selected);
      node.label.classList.toggle('is-hovered', node.data.id === hovered);
      node.label.setAttribute('aria-pressed', String(node.data.id === selected));
    });
    const active = nodes.find(node => node.data.id === selected);
    selector.visible = Boolean(active);
    if (active) {
      selector.position.copy(active.object.position);
      selector.position.y = lens?.id === 'markets' || lens?.id === 'leadership' ? 0.1 : lens?.id === 'history' ? active.object.position.y - 0.3 : lens?.id === 'catalysts' ? -1.32 : -1.72;
    }
    cameraDirty = true;
  }
  function positionCamera() {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius + target.y, Math.cos(yaw) * Math.cos(pitch) * radius);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function reset() {
    goalYaw = lens?.id === 'markets' || lens?.id === 'leadership' || lens?.id === 'history' || lens?.id === 'catalysts' ? 0.12 : 0.27;
    goalPitch = lens?.id === 'history' ? 0.2 : lens?.id === 'markets' || lens?.id === 'leadership' ? 0.24 : 0.4;
    goalRadius = baseRadius;
    cameraDirty = true;
  }
  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height || disposed) return;
    const previousBase = baseRadius;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    baseRadius = 24 * Math.max(1, 1.3 / camera.aspect);
    // Keep a user's zoom ratio while resizing a phone or window.
    goalRadius = clamp(goalRadius / previousBase * baseRadius, baseRadius * 0.52, baseRadius * 1.75);
    cameraDirty = true;
  }
  function clearLens() {
    nodes.forEach(node => { node.label.remove(); node.leader.remove(); });
    axes.forEach(item => item.label.remove());
    nodes = [];
    axes = [];
    disposeObject(dataRoot);
    dataRoot.clear();
  }
  function setLens(next: VisualLens) {
    clearLens();
    lens = next;
    selected = null;
    hovered = null;
    selector.visible = false;
    entry = reducedMotion ? 1 : 0;
    sceneBase.position.y = next.id === 'markets' || next.id === 'leadership' ? -3.4 : next.id === 'history' ? -1.7 : 0;
    target.set(0, next.id === 'markets' || next.id === 'leadership' || next.id === 'history' ? 0 : 0.6, 0);
    switch (next.id) {
      case 'overview': overview(next); break;
      case 'markets': case 'leadership': bars(next); break;
      case 'levels': levels(next); break;
      case 'history': history(next); break;
      case 'catalysts': catalysts(next); break;
      case 'themes': themes(next); break;
      case 'wire': wire(next); break;
    }
    nodes.forEach(node => node.object.traverse(child => { child.userData.nodeId = node.data.id; }));
    paint();
    reset();
  }
  function highlight(id: string | null) { selected = id; paint(); }
  function project(position: Vector3) {
    scratch.copy(position).project(camera);
    return { x: (scratch.x * 0.5 + 0.5) * canvas.clientWidth, y: (-scratch.y * 0.5 + 0.5) * canvas.clientHeight, z: scratch.z };
  }
  function projectLabels() {
    camera.getWorldDirection(direction);
    const rect = canvas.getBoundingClientRect();
    const hostRect = labelHost.getBoundingClientRect();
    const left = rect.left - hostRect.left;
    const top = rect.top - hostRect.top;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const reserved = ['.lens-heading', '.scene-bottom', '.world-stats'].flatMap(selectorName => {
      const element = labelHost.closest('.atlas-world')?.querySelector<HTMLElement>(selectorName);
      if (!element) return [];
      const bounds = element.getBoundingClientRect();
      const x = Math.max(0, bounds.left - rect.left - 8);
      const y = Math.max(0, bounds.top - rect.top - 8);
      const right = Math.min(width, bounds.right - rect.left + 8);
      const bottom = Math.min(height, bounds.bottom - rect.top + 8);
      return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
    });
    const occupied: { x: number; y: number; width: number; height: number }[] = [...reserved];
    const ranked = [...nodes].sort((a, b) => Number(b.data.id === selected || b.data.id === hovered) - Number(a.data.id === selected || a.data.id === hovered) || Number(b.data.metric != null) - Number(a.data.metric != null));
    const mobile = width < 640;
    const limit = mobile ? 6 : width < 1000 ? 12 : 22;
    let visible = 0;
    for (const node of ranked) {
      node.object.localToWorld(world.copy(node.anchor));
      const facing = world.clone().sub(camera.position).dot(direction) > 0;
      const p = project(world);
      const pinned = node.data.id === selected || node.data.id === hovered;
      node.label.style.display = '';
      const labelWidth = Math.min(node.label.offsetWidth || 120, width - 20);
      const labelHeight = node.label.offsetHeight || 46;
      const onScreen = facing && p.z > -1 && p.z < 1 && p.x > -20 && p.x < width + 20 && p.y > -20 && p.y < height + 20;
      const candidatePoints = [
        { x: p.x - labelWidth / 2, y: p.y - labelHeight },
        { x: p.x - labelWidth / 2, y: p.y + 10 },
        { x: p.x - labelWidth - 16, y: p.y - labelHeight / 2 },
        { x: p.x + 16, y: p.y - labelHeight / 2 },
        { x: p.x - labelWidth / 2, y: p.y - labelHeight - (mobile ? 55 : 32) },
        { x: p.x - labelWidth / 2, y: p.y + (mobile ? 65 : 38) },
      ];
      const candidates = candidatePoints.map(candidate => ({ x: clamp(candidate.x, 10, Math.max(10, width - labelWidth - 10)), y: clamp(candidate.y, 12, Math.max(12, height - labelHeight - 12)) }));
      const placement = candidates.find(candidate => !occupied.some(other => candidate.x < other.x + other.width + 8 && candidate.x + labelWidth + 8 > other.x && candidate.y < other.y + other.height + 7 && candidate.y + labelHeight + 7 > other.y));
      if (!onScreen || !placement || (!pinned && visible >= limit)) { node.label.style.display = 'none'; node.leader.style.display = 'none'; continue; }
      const { x, y } = placement ?? candidates[0]!;
      node.label.style.left = `${left + x}px`;
      node.label.style.top = `${top + y}px`;
      node.label.style.opacity = `${entry}`;
      const edgeX = clamp(p.x, x, x + labelWidth);
      const edgeY = clamp(p.y, y, y + labelHeight);
      const length = Math.hypot(edgeX - p.x, edgeY - p.y);
      node.leader.style.display = length > 4 ? '' : 'none';
      node.leader.style.left = `${left + p.x}px`;
      node.leader.style.top = `${top + p.y}px`;
      node.leader.style.width = `${length}px`;
      node.leader.style.opacity = `${entry * (pinned ? 0.64 : 0.32)}`;
      node.leader.style.transform = `rotate(${Math.atan2(edgeY - p.y, edgeX - p.x)}rad)`;
      occupied.push({ x, y, width: labelWidth, height: labelHeight });
      visible++;
    }
    const axisBoxes: { x: number; y: number; width: number; height: number }[] = [];
    const rankedAxes = [...axes].sort((a, b) => Number(b.owner === selected) - Number(a.owner === selected));
    for (const item of rankedAxes) {
      const p = project(item.position);
      item.label.style.display = '';
      const axisWidth = item.label.offsetWidth || 45;
      const axisHeight = item.label.offsetHeight || 15;
      const box = { x: p.x - axisWidth / 2, y: p.y - axisHeight / 2, width: axisWidth, height: axisHeight };
      const onScreen = p.z > -1 && p.z < 1 && box.x > 4 && box.x + axisWidth < width - 4 && box.y > 4 && box.y + axisHeight < height - 4;
      const collides = [...axisBoxes, ...occupied].some(other => box.x < other.x + other.width + 4 && box.x + box.width + 4 > other.x && box.y < other.y + other.height + 4 && box.y + box.height + 4 > other.y);
      item.label.style.display = onScreen && !collides ? '' : 'none';
      if (onScreen && !collides) axisBoxes.push(box);
      item.label.style.left = `${left + p.x}px`;
      item.label.style.top = `${top + p.y}px`;
      item.label.style.transform = 'translate(-50%, -50%)';
      item.label.style.opacity = `${entry}`;
    }
  }
  function hit(x: number, y: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(dataRoot.children, true).find(result => result.object.userData.nodeId)?.object.userData.nodeId as string | undefined;
  }
  const pinch = () => {
    const values = [...pointers.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0]!.x - values[1]!.x, values[0]!.y - values[1]!.y);
  };
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    dragDistance = 0;
    pinchDistance = pinch();
    canvas.style.cursor = 'grabbing';
  }
  function pointerMove(event: PointerEvent) {
    const active = pointers.get(event.pointerId);
    if (!active) {
      const nextHover = hit(event.clientX, event.clientY) ?? null;
      if (hovered !== nextHover) { hovered = nextHover; canvas.style.cursor = hovered ? 'pointer' : 'grab'; paint(); }
      return;
    }
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    active.x = event.clientX;
    active.y = event.clientY;
    dragDistance = Math.max(dragDistance, Math.hypot(event.clientX - active.startX, event.clientY - active.startY));
    if (pointers.size > 1) {
      const distance = pinch();
      if (pinchDistance > 0 && distance > 0) goalRadius = clamp(goalRadius * pinchDistance / distance, baseRadius * 0.52, baseRadius * 1.75);
      pinchDistance = distance;
      dragDistance = 20;
    } else {
      goalYaw -= dx * 0.006;
      goalPitch = clamp(goalPitch + dy * 0.004, 0.03, 0.9);
    }
    cameraDirty = true;
  }
  function pointerUp(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const wasPinch = pointers.size > 1;
    if (!wasPinch && dragDistance < 7 && event.type === 'pointerup') {
      const id = hit(event.clientX, event.clientY);
      if (id) onSelect(id);
    }
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) canvas.style.cursor = hovered ? 'pointer' : 'grab';
    pinchDistance = pinch();
  }
  function pointerLeave() { if (!pointers.size && hovered) { hovered = null; paint(); } }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    goalRadius = clamp(goalRadius * Math.exp(event.deltaY * 0.001), baseRadius * 0.52, baseRadius * 1.75);
    cameraDirty = true;
  }
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  const sizeObserver = new ResizeObserver(fit);
  sizeObserver.observe(canvas);
  fit();
  radius = goalRadius;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const motionChange = () => { reducedMotion = media.matches; if (reducedMotion) { entry = 1; nodes.forEach(node => node.object.scale.setScalar(1)); } cameraDirty = true; };
  void document.fonts.ready.then(() => { if (!disposed) cameraDirty = true; });
  media.addEventListener('change', motionChange);
  function draw(now: number) {
    if (disposed || document.hidden) { renderFrame = 0; return; }
    const dt = Math.min(0.06, (now - (lastTime || now)) / 1000);
    lastTime = now;
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    if (autoRotate && !reducedMotion && !pointers.size) goalYaw += dt * 0.045;
    yaw += (goalYaw - yaw) * alpha;
    pitch += (goalPitch - pitch) * alpha;
    radius += (goalRadius - radius) * alpha;
    const moving = Math.abs(goalYaw - yaw) + Math.abs(goalPitch - pitch) + Math.abs(goalRadius - radius) > 0.0002;
    if (entry < 1) {
      entry = Math.min(1, entry + dt * 2.4);
      nodes.forEach((node, index) => {
        const fraction = reducedMotion ? 1 : clamp((entry * 1.28 - index / Math.max(1, nodes.length) * 0.23), 0.02, 1);
        node.object.scale.setScalar(1 - (1 - fraction) ** 3);
      });
      cameraDirty = true;
    }
    positionCamera();
    scene.updateMatrixWorld();
    if (cameraDirty || moving || (autoRotate && !reducedMotion)) {
      projectLabels();
      renderer.render(scene, camera);
    }
    cameraDirty = false;
    renderFrame = requestAnimationFrame(draw);
  }
  function visibility() {
    if (document.hidden) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
    else if (!disposed && !renderFrame) { lastTime = 0; cameraDirty = true; renderFrame = requestAnimationFrame(draw); }
  }
  document.addEventListener('visibilitychange', visibility);
  positionCamera();
  renderFrame = requestAnimationFrame(draw);
  return {
    setLens, highlight, reset,
    setAutoRotate(enabled: boolean) { autoRotate = enabled; cameraDirty = true; },
    destroy() {
      disposed = true;
      cancelAnimationFrame(renderFrame);
      sizeObserver.disconnect();
      media.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('wheel', wheel);
      clearLens();
      disposeObject(scene);
      scene.clear();
      haloTexture.dispose();
      renderer.dispose();
    },
  };
}
