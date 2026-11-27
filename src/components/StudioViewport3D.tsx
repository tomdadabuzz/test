import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AvatarMode, CameraPreset, JointKey, Landmark3D } from '@/src/types/mocap';
import { getJointPosition, midpoint, POSE_CONNECTIONS } from '@/src/utils/poseEngine';

interface StudioViewport3DProps {
  landmarks: Landmark3D[];
  followerLandmarks?: Landmark3D[] | null;
  liveLandmarksRef?: React.RefObject<Landmark3D[]>;
  liveFollowerLandmarksRef?: React.RefObject<Landmark3D[] | null>;
  avatarMode: AvatarMode;
  cameraPreset: CameraPreset;
  cameraPresetNonce: number;
  selectedJoint: JointKey;
  onSelectJoint: (joint: JointKey) => void;
  showTrails: boolean;
  showGrid: boolean;
}

// Pre-allocated math temporaries (Zero-GC render loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _vX = new THREE.Vector3();
const _vY = new THREE.Vector3();
const _vZ = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();

const CAMERA_TARGETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  orbit: { pos: [2.25, 1.58, 3.0], target: [0, 0.92, 0] },
  front: { pos: [0, 1.05, 3.35], target: [0, 0.92, 0] },
  side: { pos: [3.35, 1.05, 0], target: [0, 0.92, 0] },
  top: { pos: [0, 4.2, 0.35], target: [0, 0.9, 0] },
};

const CLICKABLE_JOINTS: JointKey[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'rightHip',
  'rightKnee',
  'rightAnkle',
];

function createCaptureFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, size * 0.52);
  grad.addColorStop(0, '#181D26');
  grad.addColorStop(0.65, '#11141B');
  grad.addColorStop(1, '#090B0E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const step = size / 12;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const rings = [0.16, 0.30, 0.44];
  rings.forEach((rFrac, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, size * rFrac, 0, Math.PI * 2);
    ctx.strokeStyle = idx === 1 ? 'rgba(245, 158, 11, 0.36)' : 'rgba(6, 182, 212, 0.22)';
    ctx.lineWidth = idx === 1 ? 2 : 1.5;
    ctx.stroke();
  });

  const ringR = size * 0.30;
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const inner = ringR - (deg % 45 === 0 ? 12 : 6);
    const outer = ringR + (deg % 45 === 0 ? 12 : 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
    ctx.strokeStyle = deg % 90 === 0 ? 'rgba(245, 158, 11, 0.65)' : 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = deg % 90 === 0 ? 2 : 1;
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.beginPath();
  ctx.moveTo(cx, cy + ringR + 28);
  ctx.lineTo(cx - 8, cy + ringR + 12);
  ctx.lineTo(cx + 8, cy + ringR + 12);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildOpticalCameraStand(
  darkBodyMat: THREE.Material,
  brushedMetalMat: THREE.Material,
  lensMat: THREE.Material,
  irRingMat: THREE.Material
): THREE.Group {
  const stand = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.014, 0.010, 1.32, 10);

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(legGeo, darkBodyMat);
    leg.position.set(Math.cos(angle) * 0.22, 0.62, Math.sin(angle) * 0.22);
    leg.lookAt(0, 1.24, 0);
    leg.rotateX(Math.PI / 2);
    leg.castShadow = true;
    stand.add(leg);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.09, 16), brushedMetalMat);
  hub.position.y = 1.24;
  stand.add(hub);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.68, 14), brushedMetalMat);
  mast.position.y = 1.56;
  mast.castShadow = true;
  stand.add(mast);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.92;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.14), darkBodyMat);
  chassis.castShadow = true;
  headGroup.add(chassis);

  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.05, 18), brushedMetalMat);
  lensBarrel.rotation.x = Math.PI / 2;
  lensBarrel.position.z = 0.08;
  headGroup.add(lensBarrel);

  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), lensMat);
  lensGlass.position.z = 0.106;
  headGroup.add(lensGlass);

  const irRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0045, 8, 24), irRingMat);
  irRing.position.z = 0.106;
  headGroup.add(irRing);

  stand.add(headGroup);
  return stand;
}

interface PerformerRig {
  root: THREE.Group;
  mannequinGroup: THREE.Group;
  skeletonGroup: THREE.Group;
  contactShadow: THREE.Mesh;
  limbMeshes: Record<string, THREE.Mesh>;
  pelvisGroup: THREE.Group;
  chestGroup: THREE.Group;
  headGroup: THREE.Group;
  lHandMesh: THREE.Mesh;
  rHandMesh: THREE.Mesh;
  mannequinJointSpheres: Array<{ key: JointKey; mesh: THREE.Mesh; radius: number }>;
  skelPositions: Float32Array;
  skelGeo: THREE.BufferGeometry;
  skelLines: THREE.LineSegments;
  rawMarkerMeshes: THREE.Mesh[];
}

function createPerformerRig(
  parentScene: THREE.Scene,
  shared: {
    unitLimbGeo: THREE.CylinderGeometry;
    jointSphereGeo: THREE.SphereGeometry;
    handGeo: THREE.BoxGeometry;
    contactTex: THREE.CanvasTexture;
    visorMat: THREE.Material;
    soleMat: THREE.Material;
  },
  palette: {
    armorColor: number;
    torsoColor: number;
    accentColor: number;
    skeletonLineColor: number;
  }
): PerformerRig {
  const root = new THREE.Group();
  parentScene.add(root);

  const mannequinGroup = new THREE.Group();
  const skeletonGroup = new THREE.Group();
  root.add(mannequinGroup, skeletonGroup);

  const armorMat = new THREE.MeshStandardMaterial({
    color: palette.armorColor,
    roughness: 0.64,
    metalness: 0.28,
  });
  const torsoCoreMat = new THREE.MeshStandardMaterial({
    color: palette.torsoColor,
    roughness: 0.50,
    metalness: 0.35,
  });
  const jointMetalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.88,
  });
  const accentCollarMat = new THREE.MeshStandardMaterial({
    color: palette.accentColor,
    roughness: 0.32,
    metalness: 0.6,
  });

  const createLimbMesh = (radius: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(shared.unitLimbGeo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.radius = radius;
    mannequinGroup.add(m);
    return m;
  };

  const limbMeshes: Record<string, THREE.Mesh> = {
    lUpperArm: createLimbMesh(0.042, armorMat),
    lForeArm: createLimbMesh(0.034, armorMat),
    rUpperArm: createLimbMesh(0.042, armorMat),
    rForeArm: createLimbMesh(0.034, armorMat),
    lThigh: createLimbMesh(0.062, armorMat),
    lShin: createLimbMesh(0.046, armorMat),
    rThigh: createLimbMesh(0.062, armorMat),
    rShin: createLimbMesh(0.046, armorMat),
    neck: createLimbMesh(0.038, jointMetalMat),
    lFoot: createLimbMesh(0.038, shared.soleMat),
    rFoot: createLimbMesh(0.038, shared.soleMat),
  };

  const pelvisGroup = new THREE.Group();
  const pelvisBlock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.15), armorMat);
  pelvisBlock.castShadow = true;
  const pelvisBelt = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.032, 0.165), accentCollarMat);
  pelvisBelt.position.y = 0.035;
  pelvisGroup.add(pelvisBlock, pelvisBelt);
  mannequinGroup.add(pelvisGroup);

  const chestGroup = new THREE.Group();
  const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.25, 0.18), torsoCoreMat);
  chestCore.castShadow = true;
  const chestCollar = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.055, 0.13), accentCollarMat);
  chestCollar.position.y = 0.115;
  const spineCore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.22, 12), armorMat);
  spineCore.position.y = -0.17;
  chestGroup.add(chestCore, chestCollar, spineCore);
  mannequinGroup.add(chestGroup);

  const headGroup = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.102, 20, 16), torsoCoreMat);
  cranium.scale.set(0.92, 1.12, 1.02);
  cranium.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.048, 0.05), shared.visorMat);
  visor.position.set(0, 0.015, 0.088);
  const visorTrim = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.01, 0.055), accentCollarMat);
  visorTrim.position.set(0, 0.044, 0.088);
  headGroup.add(cranium, visor, visorTrim);
  mannequinGroup.add(headGroup);

  const lHandMesh = new THREE.Mesh(shared.handGeo, armorMat);
  const rHandMesh = new THREE.Mesh(shared.handGeo, armorMat);
  lHandMesh.castShadow = true;
  rHandMesh.castShadow = true;
  mannequinGroup.add(lHandMesh, rHandMesh);

  const mannequinJointSpheres: Array<{ key: JointKey; mesh: THREE.Mesh; radius: number }> = [
    { key: 'leftShoulder', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.048 },
    { key: 'leftElbow', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.038 },
    { key: 'leftWrist', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.030 },
    { key: 'rightShoulder', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.048 },
    { key: 'rightElbow', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.038 },
    { key: 'rightWrist', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.030 },
    { key: 'leftHip', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.056 },
    { key: 'leftKnee', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.046 },
    { key: 'leftAnkle', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.038 },
    { key: 'rightHip', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.056 },
    { key: 'rightKnee', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.046 },
    { key: 'rightAnkle', mesh: new THREE.Mesh(shared.jointSphereGeo, jointMetalMat), radius: 0.038 },
  ];
  mannequinJointSpheres.forEach(({ mesh, radius }) => {
    mesh.scale.setScalar(radius);
    mesh.castShadow = true;
    mannequinGroup.add(mesh);
  });

  const skelPositions = new Float32Array(POSE_CONNECTIONS.length * 6);
  const skelGeo = new THREE.BufferGeometry();
  skelGeo.setAttribute('position', new THREE.BufferAttribute(skelPositions, 3));
  const skelLines = new THREE.LineSegments(
    skelGeo,
    new THREE.LineBasicMaterial({ color: palette.skeletonLineColor, transparent: true, opacity: 0.92 })
  );
  skeletonGroup.add(skelLines);

  const rawMarkerMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: palette.skeletonLineColor,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.6,
  });
  const rawMarkerMeshes: THREE.Mesh[] = Array.from({ length: 33 }, () => {
    const m = new THREE.Mesh(shared.jointSphereGeo, rawMarkerMat);
    m.scale.setScalar(0.016);
    skeletonGroup.add(m);
    return m;
  });

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ map: shared.contactTex, transparent: true, depthWrite: false, opacity: 0.52 })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.022;
  root.add(contactShadow);

  return {
    root,
    mannequinGroup,
    skeletonGroup,
    contactShadow,
    limbMeshes,
    pelvisGroup,
    chestGroup,
    headGroup,
    lHandMesh,
    rHandMesh,
    mannequinJointSpheres,
    skelPositions,
    skelGeo,
    skelLines,
    rawMarkerMeshes,
  };
}

export const StudioViewport3D: React.FC<StudioViewport3DProps> = ({
  landmarks,
  followerLandmarks = null,
  liveLandmarksRef,
  liveFollowerLandmarksRef,
  avatarMode,
  cameraPreset,
  cameraPresetNonce,
  selectedJoint,
  onSelectJoint,
  showTrails,
  showGrid,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const fallbackLandmarksRef = useRef<Landmark3D[]>(landmarks);
  fallbackLandmarksRef.current = landmarks;
  const activeLandmarksRef = liveLandmarksRef ?? fallbackLandmarksRef;

  const fallbackFollowerRef = useRef<Landmark3D[] | null>(followerLandmarks ?? null);
  fallbackFollowerRef.current = followerLandmarks ?? null;
  const activeFollowerRef = liveFollowerLandmarksRef ?? fallbackFollowerRef;

  const avatarModeRef = useRef<AvatarMode>(avatarMode);
  avatarModeRef.current = avatarMode;

  const selectedJointRef = useRef<JointKey>(selectedJoint);
  selectedJointRef.current = selectedJoint;

  const showTrailsRef = useRef<boolean>(showTrails);
  showTrailsRef.current = showTrails;

  const showGridRef = useRef<boolean>(showGrid);
  showGridRef.current = showGrid;

  const onSelectJointRef = useRef(onSelectJoint);
  onSelectJointRef.current = onSelectJoint;

  const cameraTransitionRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(...CAMERA_TARGETS.orbit.pos),
    target: new THREE.Vector3(...CAMERA_TARGETS.orbit.target),
  });

  useEffect(() => {
    const cfg = CAMERA_TARGETS[cameraPreset];
    cameraTransitionRef.current.pos.set(...cfg.pos);
    cameraTransitionRef.current.target.set(...cfg.target);
    cameraTransitionRef.current.active = true;
  }, [cameraPreset, cameraPresetNonce]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('当前浏览器环境不支持 WebGL 3D 渲染');
      return;
    }

    const isSoftwareGl = (() => {
      try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL 上下文已暂停，正在尝试恢复...');
    };
    const onContextRestored = () => setWebglError(null);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0e);
    scene.fog = new THREE.FogExp2(0x090b0e, 0.048);

    let envTex: THREE.Texture | null = null;
    if (!isSoftwareGl) {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envTex = pmremGenerator.fromScene(roomEnv, 0.04).texture;
      scene.environment = envTex;
      roomEnv.dispose();
      pmremGenerator.dispose();
    }

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    camera.position.set(...CAMERA_TARGETS.orbit.pos);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...CAMERA_TARGETS.orbit.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 9.0;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.addEventListener('start', () => {
      cameraTransitionRef.current.active = false;
    });
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0x9ec5e8, 0x1a1612, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(3.2, 5.2, 3.6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    const d = 2.8;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-3.0, 2.8, -3.5);
    scene.add(rimLight);

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const floorTex = createCaptureFloorTexture(renderer.capabilities.getMaxAnisotropy());
    const floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78, metalness: 0.12 })
    );
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.receiveShadow = true;
    stageGroup.add(floorDisc);

    const outerPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: 0.95, metalness: 0.0 })
    );
    outerPlane.rotation.x = -Math.PI / 2;
    outerPlane.position.y = -0.02;
    stageGroup.add(outerPlane);

    const camBodyMat = new THREE.MeshStandardMaterial({ color: 0x1d232d, roughness: 0.55, metalness: 0.45 });
    const camMetalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.88 });
    const camLensMat = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.1, clearcoat: 1.0 });
    const camIrMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.75,
      roughness: 0.3,
    });

    (
      [
        [-2.35, -2.35],
        [2.35, -2.35],
        [-2.35, 2.35],
        [2.35, 2.35],
      ] as Array<[number, number]>
    ).forEach(([cx, cz]) => {
      const stand = buildOpticalCameraStand(camBodyMat, camMetalMat, camLensMat, camIrMat);
      stand.position.set(cx, 0, cz);
      stand.children[stand.children.length - 1].lookAt(0, 1.0, 0);
      stageGroup.add(stand);
    });

    const contactCanvas = document.createElement('canvas');
    contactCanvas.width = 128;
    contactCanvas.height = 128;
    const cctx = contactCanvas.getContext('2d')!;
    const cgrad = cctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    cgrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    cgrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
    cgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cctx.fillStyle = cgrad;
    cctx.fillRect(0, 0, 128, 128);
    const contactTex = new THREE.CanvasTexture(contactCanvas);

    const sharedGeos = {
      unitLimbGeo: new THREE.CylinderGeometry(0.85, 1.0, 1, 16),
      jointSphereGeo: new THREE.SphereGeometry(1, 14, 12),
      handGeo: new THREE.BoxGeometry(0.048, 0.095, 0.072),
      contactTex,
      visorMat: new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.2, clearcoat: 1.0 }),
      soleMat: new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.85, metalness: 0.05 }),
    };

    // Primary Performer (Leader / Solo) - Amber accent trim
    const leaderRig = createPerformerRig(scene, sharedGeos, {
      armorColor: 0x2a313d,
      torsoColor: 0x3b4454,
      accentColor: 0xf59e0b,
      skeletonLineColor: 0xf59e0b,
    });

    // Secondary Performer (Follower) - Cyan accent trim
    const followerRig = createPerformerRig(scene, sharedGeos, {
      armorColor: 0x22303c,
      torsoColor: 0x324759,
      accentColor: 0x06b6d4,
      skeletonLineColor: 0x06b6d4,
    });
    followerRig.root.visible = false;

    // Clickable markers on Leader Rig
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

    const defaultMarkerMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.5,
    });
    const selectedMarkerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.4,
    });

    const clickableMarkers: Array<{ key: JointKey; mesh: THREE.Mesh }> = CLICKABLE_JOINTS.map((key) => {
      const m = new THREE.Mesh(sharedGeos.jointSphereGeo, defaultMarkerMat);
      m.scale.setScalar(0.022);
      m.userData.jointKey = key;
      m.layers.enable(1);
      markersGroup.add(m);
      return { key, mesh: m };
    });

    const reticleMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.068, 0.006, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    markersGroup.add(reticleMesh);

    const TRAIL_LEN = 48;
    const createTrail = (colorHex: number) => {
      const arr = new Float32Array(TRAIL_LEN * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 })
      );
      line.frustumCulled = false;
      scene.add(line);
      return { arr, geo, line, count: 0 };
    };
    const lWristTrail = createTrail(0x06b6d4);
    const rWristTrail = createTrail(0xf59e0b);
    const hipTrail = createTrail(0x94a3b8);

    const pushTrail = (trail: ReturnType<typeof createTrail>, pt: { x: number; y: number; z: number }) => {
      if (trail.count < TRAIL_LEN) {
        const idx = trail.count * 3;
        trail.arr[idx] = pt.x;
        trail.arr[idx + 1] = pt.y;
        trail.arr[idx + 2] = pt.z;
        trail.count++;
      } else {
        trail.arr.copyWithin(0, 3);
        const idx = (TRAIL_LEN - 1) * 3;
        trail.arr[idx] = pt.x;
        trail.arr[idx + 1] = pt.y;
        trail.arr[idx + 2] = pt.z;
      }
      (trail.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      trail.geo.setDrawRange(0, trail.count);
    };

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let pointerDownXY: [number, number] | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownXY = [e.clientX, e.clientY];
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerDownXY) return;
      const dist = Math.hypot(e.clientX - pointerDownXY[0], e.clientY - pointerDownXY[1]);
      pointerDownXY = null;
      if (dist > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        clickableMarkers.map((m) => m.mesh),
        false
      );
      if (hits.length > 0) {
        const jk = hits[0].object.userData.jointKey as JointKey | undefined;
        if (jk) onSelectJointRef.current(jk);
      }
    };
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    const placeLimb = (mesh: THREE.Mesh, a: Landmark3D, b: Landmark3D) => {
      _vA.set(a.x, a.y, a.z);
      _vB.set(b.x, b.y, b.z);
      _vMid.copy(_vA).add(_vB).multiplyScalar(0.5);
      _vDir.copy(_vB).sub(_vA);
      const len = _vDir.length();
      if (len < 1e-4) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      _vDir.divideScalar(len);
      mesh.position.copy(_vMid);
      _quat.setFromUnitVectors(_vUp, _vDir);
      mesh.quaternion.copy(_quat);
      const r = mesh.userData.radius as number;
      mesh.scale.set(r, len, r);
    };

    const updateRigPose = (rig: PerformerRig, lm: Landmark3D[], mode: AvatarMode) => {
      if (lm.length < 33) return;
      rig.root.visible = true;
      rig.mannequinGroup.visible = mode === 'mannequin';
      rig.skeletonGroup.visible = mode === 'skeleton' || mode === 'markers';
      rig.skelLines.visible = mode === 'skeleton' || mode === 'markers';
      rig.rawMarkerMeshes.forEach((m) => (m.visible = mode === 'markers'));

      const lHip = lm[23];
      const rHip = lm[24];
      const lSh = lm[11];
      const rSh = lm[12];
      const hipMid = midpoint(lHip, rHip);
      const shMid = midpoint(lSh, rSh);

      rig.contactShadow.position.x = hipMid.x;
      rig.contactShadow.position.z = hipMid.z;
      rig.contactShadow.scale.setScalar(Math.max(0.55, 1.15 - Math.max(0, hipMid.y - 0.85) * 0.6));

      if (mode === 'mannequin') {
        placeLimb(rig.limbMeshes.lUpperArm, lSh, lm[13]);
        placeLimb(rig.limbMeshes.lForeArm, lm[13], lm[15]);
        placeLimb(rig.limbMeshes.rUpperArm, rSh, lm[14]);
        placeLimb(rig.limbMeshes.rForeArm, lm[14], lm[16]);

        placeLimb(rig.limbMeshes.lThigh, lHip, lm[25]);
        placeLimb(rig.limbMeshes.lShin, lm[25], lm[27]);
        placeLimb(rig.limbMeshes.rThigh, rHip, lm[26]);
        placeLimb(rig.limbMeshes.rShin, lm[26], lm[28]);

        placeLimb(rig.limbMeshes.lFoot, lm[29], lm[31]);
        placeLimb(rig.limbMeshes.rFoot, lm[30], lm[32]);

        const neckBase = { x: shMid.x, y: shMid.y + 0.04, z: shMid.z };
        const headCenter = { x: lm[0].x, y: lm[0].y + 0.01, z: (lm[7].z + lm[8].z) * 0.5 };
        placeLimb(rig.limbMeshes.neck, neckBase, headCenter);

        rig.pelvisGroup.position.set(hipMid.x, hipMid.y, hipMid.z);
        _vX.set(lHip.x - rHip.x, lHip.y - rHip.y, lHip.z - rHip.z).normalize();
        _vY.set(shMid.x - hipMid.x, shMid.y - hipMid.y, shMid.z - hipMid.z).normalize();
        _vZ.crossVectors(_vX, _vY).normalize();
        _vY.crossVectors(_vZ, _vX).normalize();
        _mat4.makeBasis(_vX, _vY, _vZ);
        rig.pelvisGroup.quaternion.setFromRotationMatrix(_mat4);

        rig.chestGroup.position.set(
          hipMid.x + (shMid.x - hipMid.x) * 0.72,
          hipMid.y + (shMid.y - hipMid.y) * 0.72,
          hipMid.z + (shMid.z - hipMid.z) * 0.72
        );
        _vX.set(lSh.x - rSh.x, lSh.y - rSh.y, lSh.z - rSh.z).normalize();
        _vY.set(shMid.x - hipMid.x, shMid.y - hipMid.y, shMid.z - hipMid.z).normalize();
        _vZ.crossVectors(_vX, _vY).normalize();
        _vY.crossVectors(_vZ, _vX).normalize();
        _mat4.makeBasis(_vX, _vY, _vZ);
        rig.chestGroup.quaternion.setFromRotationMatrix(_mat4);

        rig.headGroup.position.set(headCenter.x, headCenter.y, headCenter.z);
        const lEar = lm[7];
        const rEar = lm[8];
        const nose = lm[0];
        _vX.set(lEar.x - rEar.x, lEar.y - rEar.y, lEar.z - rEar.z).normalize();
        _vZ.set(nose.x - headCenter.x, nose.y - headCenter.y, nose.z - headCenter.z).normalize();
        _vY.crossVectors(_vZ, _vX).normalize();
        _vZ.crossVectors(_vX, _vY).normalize();
        _mat4.makeBasis(_vX, _vY, _vZ);
        rig.headGroup.quaternion.setFromRotationMatrix(_mat4);

        const lHandPos = midpoint(lm[15], lm[19]);
        rig.lHandMesh.position.set(lHandPos.x, lHandPos.y, lHandPos.z);
        _vDir.set(lm[19].x - lm[15].x, lm[19].y - lm[15].y, lm[19].z - lm[15].z).normalize();
        if (_vDir.lengthSq() > 0.1) rig.lHandMesh.quaternion.setFromUnitVectors(_vUp, _vDir);

        const rHandPos = midpoint(lm[16], lm[20]);
        rig.rHandMesh.position.set(rHandPos.x, rHandPos.y, rHandPos.z);
        _vDir.set(lm[20].x - lm[16].x, lm[20].y - lm[16].y, lm[20].z - lm[16].z).normalize();
        if (_vDir.lengthSq() > 0.1) rig.rHandMesh.quaternion.setFromUnitVectors(_vUp, _vDir);

        for (const item of rig.mannequinJointSpheres) {
          const p = getJointPosition(lm, item.key);
          item.mesh.position.set(p.x, p.y, p.z);
        }
      }

      if (mode === 'skeleton' || mode === 'markers') {
        for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
          const [aIdx, bIdx] = POSE_CONNECTIONS[i];
          const a = lm[aIdx];
          const b = lm[bIdx];
          const off = i * 6;
          rig.skelPositions[off] = a.x;
          rig.skelPositions[off + 1] = a.y;
          rig.skelPositions[off + 2] = a.z;
          rig.skelPositions[off + 3] = b.x;
          rig.skelPositions[off + 4] = b.y;
          rig.skelPositions[off + 5] = b.z;
        }
        (rig.skelGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        if (mode === 'markers') {
          for (let i = 0; i < 33; i++) {
            const p = lm[i];
            rig.rawMarkerMeshes[i].position.set(p.x, p.y, p.z);
          }
        }
      }
    };

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      if (document.hidden) {
        frameId = isSoftwareGl ? window.setTimeout(tick, 200) : requestAnimationFrame(tick);
        return;
      }
      const delta = Math.min(0.1, clock.getDelta());

      const ct = cameraTransitionRef.current;
      if (ct.active) {
        const lambda = 7.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, ct.pos.x, lambda, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, ct.pos.y, lambda, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, ct.pos.z, lambda, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, ct.target.x, lambda, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, ct.target.y, lambda, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, ct.target.z, lambda, delta);
        if (camera.position.distanceTo(ct.pos) < 0.015 && controls.target.distanceTo(ct.target) < 0.015) {
          camera.position.copy(ct.pos);
          controls.target.copy(ct.target);
          ct.active = false;
        }
      }

      controls.update();
      stageGroup.visible = showGridRef.current;

      const mode = avatarModeRef.current;
      const lm = activeLandmarksRef.current;
      updateRigPose(leaderRig, lm, mode);

      const flm = activeFollowerRef.current;
      if (flm && flm.length >= 33) {
        updateRigPose(followerRig, flm, mode);
      } else {
        followerRig.root.visible = false;
      }

      if (lm.length >= 33) {
        const activeJoint = selectedJointRef.current;
        for (const cm of clickableMarkers) {
          const p = getJointPosition(lm, cm.key);
          cm.mesh.position.set(p.x, p.y, p.z);
          const isSel = cm.key === activeJoint;
          cm.mesh.material = isSel ? selectedMarkerMat : defaultMarkerMat;
          cm.mesh.scale.setScalar(isSel ? 0.030 : mode === 'mannequin' ? 0.016 : 0.025);
          if (isSel) {
            reticleMesh.position.set(p.x, p.y, p.z);
            reticleMesh.lookAt(camera.position);
          }
        }

        const trailsVisible = showTrailsRef.current;
        lWristTrail.line.visible = trailsVisible;
        rWristTrail.line.visible = trailsVisible;
        hipTrail.line.visible = trailsVisible;
        if (trailsVisible) {
          pushTrail(lWristTrail, lm[15]);
          pushTrail(rWristTrail, lm[16]);
          pushTrail(hipTrail, midpoint(lm[23], lm[24]));
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine || (obj as THREE.LineSegments).isLineSegments) {
          const mObj = obj as THREE.Mesh;
          mObj.geometry?.dispose();
          if (Array.isArray(mObj.material)) {
            mObj.material.forEach((m) => m.dispose());
          } else {
            mObj.material?.dispose();
          }
        }
      });
      floorTex.dispose();
      contactTex.dispose();
      envTex?.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  if (webglError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#090B0E] text-slate-300 px-6 text-center">
        <p className="text-base font-semibold text-white mb-2">3D 捕捉视口暂不可用</p>
        <p className="text-sm text-slate-400 max-w-md">{webglError}</p>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
};
