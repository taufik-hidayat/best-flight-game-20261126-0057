// The view: a Three.js chase camera over the valley — warm late-afternoon
// sun, a gradient sky dome, drifting clouds, the terrain mesh with painted
// vertex colours, Mirror Lake, the pine forest, Millbrook village, the
// runway with its markings and windsock, and the glowing courier rings.
// The camera trails the Kestrel and never fights the pilot.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, RUNWAY } from './config.js';
import { groundHeight, groundColour, pinePositions, villageHouses, LAKE_CENTRE } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { forwardVector } from './physics.js';

const SKY_VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = `
varying vec3 vWorld;
uniform vec3 sunDir;
void main() {
  vec3 dir = normalize(vWorld);
  float h = clamp(dir.y, -0.08, 1.0);
  vec3 zenith = vec3(0.16, 0.42, 0.78);
  vec3 horizon = vec3(0.98, 0.78, 0.52);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.62));
  float sun = pow(max(dot(dir, normalize(sunDir)), 0.0), 220.0);
  float glow = pow(max(dot(dir, normalize(sunDir)), 0.0), 6.0);
  col += vec3(1.0, 0.85, 0.55) * glow * 0.35 + vec3(1.0, 0.95, 0.8) * sun * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Build the whole scene once; `update` moves it every frame. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    // Keep the drawing buffer so a screenshot (or the hosted page's capture)
    // reads the frame that was just rendered instead of a cleared buffer.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe8f2, 700, 2600);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 6000);

  // Late-afternoon sun from the west, warm; plus a cool sky fill.
  const sunDir = new THREE.Vector3(-0.55, 0.42, -0.35).normalize();
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 2200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9ec8ee, 0x5d6b46, 0.95));
  // A soft fill from the east, so the plane's shadow side never goes black.
  const fillDir = new THREE.Vector3(0.6, 0.35, 0.4).normalize();
  const fill = new THREE.DirectionalLight(0xdfeaf5, 0.7);
  fill.position.copy(fillDir).multiplyScalar(700);
  scene.add(fill);
  scene.add(fill.target);

  // Sky dome: a gradient shader sphere that follows the camera.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 32, 18),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: { sunDir: { value: sunDir } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(sky);

  // Terrain: a displaced plane with a colour per vertex.
  const SEGMENTS = 190;
  const terrainGeo = new THREE.PlaneGeometry(WORLD.SIZE * 2, WORLD.SIZE * 2, SEGMENTS, SEGMENTS);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const tmpColour = [0, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    groundColour(x, z, h, tmpColour);
    colours[i * 3] = tmpColour[0];
    colours[i * 3 + 1] = tmpColour[1];
    colours[i * 3 + 2] = tmpColour[2];
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Mirror Lake: a still blue disc just under the waterline.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE_CENTRE.radius, 48),
    new THREE.MeshStandardMaterial({ color: 0x2f7fc4, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.92 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE_CENTRE.x, WORLD.WATER_LEVEL, LAKE_CENTRE.z);
  lake.receiveShadow = true;
  scene.add(lake);

  // Pine forest: instanced trunks and canopies.
  const pines = pinePositions(650);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, pines.length);
  const canopyGeo = new THREE.ConeGeometry(2.6, 8.5, 7);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, pines.length);
  const dummy = new THREE.Object3D();
  pines.forEach((pine, i) => {
    dummy.position.set(pine.x, pine.h + 1.4 * pine.s, pine.z);
    dummy.scale.setScalar(pine.s);
    dummy.rotation.set(0, pine.tilt * 8, pine.tilt);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.y = pine.h + (3.2 + 4.2) * pine.s;
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(i, dummy.matrix);
  });
  trunkMesh.castShadow = true;
  canopyMesh.castShadow = true;
  scene.add(trunkMesh);
  scene.add(canopyMesh);

  // Millbrook village: little houses with pitched roofs.
  const houseGroup = new THREE.Group();
  for (const house of villageHouses()) {
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(house.w, 4.5, house.d),
      new THREE.MeshLambertMaterial({ color: house.wall }),
    );
    walls.position.set(house.x, house.h + 2.25, house.z);
    walls.rotation.y = house.rot;
    walls.castShadow = true;
    houseGroup.add(walls);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(house.w, house.d) * 0.78, 3.2, 4),
      new THREE.MeshLambertMaterial({ color: house.roof }),
    );
    roof.position.set(house.x, house.h + 6.1, house.z);
    roof.rotation.y = house.rot + Math.PI / 4;
    roof.castShadow = true;
    houseGroup.add(roof);
  }
  scene.add(houseGroup);

  // The runway: asphalt strip, centreline dashes, threshold bars, numbers.
  const runwayGroup = new THREE.Group();
  const stripLength = RUNWAY.Z_SOUTH - RUNWAY.Z_NORTH;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.HALF_WIDTH * 2, 0.6, stripLength),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 }),
  );
  strip.position.set(RUNWAY.X, RUNWAY.ELEVATION + 0.1, (RUNWAY.Z_NORTH + RUNWAY.Z_SOUTH) / 2);
  strip.receiveShadow = true;
  runwayGroup.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
  for (let z = RUNWAY.Z_NORTH + 25; z < RUNWAY.Z_SOUTH - 10; z += 30) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 12), dashMat);
    dash.position.set(RUNWAY.X, RUNWAY.ELEVATION + 0.45, z);
    runwayGroup.add(dash);
  }
  for (const zEnd of [RUNWAY.Z_NORTH + 8, RUNWAY.Z_SOUTH - 8]) {
    for (let i = -2; i <= 2; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 10), dashMat);
      bar.position.set(RUNWAY.X + i * 4.4, RUNWAY.ELEVATION + 0.45, zEnd);
      runwayGroup.add(bar);
    }
  }
  // Windsock on a pole beside the strip, and a hangar at the south end.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.HALF_WIDTH + 12, RUNWAY.ELEVATION + 4.5, RUNWAY.Z_SOUTH - 30);
  runwayGroup.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.2, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.HALF_WIDTH + 14.2, RUNWAY.ELEVATION + 8.6, RUNWAY.Z_SOUTH - 30);
  runwayGroup.add(sock);
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(26, 9, 20),
    new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.6, metalness: 0.3 }),
  );
  hangar.position.set(-34, RUNWAY.ELEVATION + 4.5, RUNWAY.Z_SOUTH + 26);
  hangar.castShadow = true;
  runwayGroup.add(hangar);
  const hangarRoof = new THREE.Mesh(
    new THREE.BoxGeometry(27, 1.2, 21),
    new THREE.MeshStandardMaterial({ color: 0x8a97a3, roughness: 0.6, metalness: 0.3 }),
  );
  hangarRoof.position.set(-34, RUNWAY.ELEVATION + 9.6, RUNWAY.Z_SOUTH + 26);
  hangarRoof.rotation.z = 0.06;
  hangarRoof.castShadow = true;
  runwayGroup.add(hangarRoof);
  const hangarDoor = new THREE.Mesh(
    new THREE.BoxGeometry(18, 7, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2e3844, roughness: 0.8, metalness: 0.2 }),
  );
  hangarDoor.position.set(-34, RUNWAY.ELEVATION + 3.5, RUNWAY.Z_SOUTH + 16.1);
  runwayGroup.add(hangarDoor);
  scene.add(runwayGroup);

  // Clouds: soft white puffs drifting slowly across the sky. Unlit, so they
  // stay bright from every angle instead of going dark on the shadow side.
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const puffGeo = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 20; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p += 1) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set((p - puffs / 2) * 14, (p % 2) * 3, (p % 3) * 6 - 6);
      puff.scale.set(16 + (p % 3) * 6, 6.5, 11);
      cloud.add(puff);
    }
    const angle = (i / 20) * Math.PI * 2;
    const radius = 350 + ((i * 137) % 620);
    cloud.position.set(Math.cos(angle) * radius, 190 + (i % 5) * 26, Math.sin(angle) * radius);
    cloud.userData.drift = 2.2 + (i % 4);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // The courier rings: glowing hoops with a light pillar, built per run.
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  let ringMeshes = [];

  function rebuildRings(mission) {
    for (const mesh of ringMeshes) ringGroup.remove(mesh);
    ringMeshes = [];
    mission.rings.forEach((ring, index) => {
      const isNext = index === mission.ringIndex;
      const group = new THREE.Group();
      group.position.set(ring.x, ring.y, ring.z);
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(9, 0.9, 12, 40),
        new THREE.MeshStandardMaterial({
          color: isNext ? 0xff8c1a : 0x27b3ff,
          emissive: isNext ? 0xff6a00 : 0x0a6cff,
          emissiveIntensity: isNext ? 1.6 : 0.7,
          roughness: 0.35,
        }),
      );
      group.add(torus);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 160, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: isNext ? 0xffa040 : 0x4fc3ff,
          transparent: true,
          opacity: isNext ? 0.28 : 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      pillar.position.y = 80;
      group.add(pillar);
      // The hoop faces the pilot's approach: turn it toward the runway start
      // on the first ring, then toward the previous ring.
      const from = index === 0 ? { x: RUNWAY.X, z: 520 } : mission.rings[index - 1];
      group.lookAt(from.x, ring.y, from.z);
      ringGroup.add(group);
      ringMeshes.push(group);
    });
  }

  // The Kestrel.
  const aircraft = buildAircraft();
  aircraft.group.castShadow = true;
  aircraft.group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  scene.add(aircraft.group);

  // Chase camera state: a smoothed follow point behind the plane.
  const camPos = new THREE.Vector3(0, 30, 560);
  const camTarget = new THREE.Vector3(0, 15, 520);
  const tmpFwd = { x: 0, y: 0, z: -1 };
  const tmpVec = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();

  /**
   * Where the camera wants to be for a mode, and what it looks at.
   * chase: behind and slightly above, looking ahead of the nose.
   * front: ahead of the nose, looking back at the aircraft.
   * title: further back and higher, looking left of the plane so the
   *   aircraft sits in the right third of the frame, clear of the title text.
   */
  function cameraPose(state, mode, outPos, outTarget) {
    forwardVector(state, tmpFwd);
    const rightX = -tmpFwd.z;
    const rightZ = tmpFwd.x;
    if (mode === 'front') {
      outPos.set(
        state.x - tmpFwd.x * -26 + rightX * 10,
        state.y - tmpFwd.y * -26 + 3.5,
        state.z - tmpFwd.z * -26 + rightZ * 10,
      );
      outTarget.set(state.x, state.y + 1, state.z);
      return;
    }
    if (mode === 'title') {
      outPos.set(state.x - tmpFwd.x * 24, state.y + 4.5, state.z - tmpFwd.z * 24);
      outTarget.set(
        state.x + tmpFwd.x * 26 - rightX * 24,
        state.y + tmpFwd.y * 26 + 3,
        state.z + tmpFwd.z * 26 - rightZ * 24,
      );
      return;
    }
    outPos.set(state.x - tmpFwd.x * 13.5, state.y + 4.6, state.z - tmpFwd.z * 13.5);
    outTarget.set(state.x + tmpFwd.x * 26, state.y + tmpFwd.y * 26 + 1, state.z + tmpFwd.z * 26);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /**
   * Move the world one frame: plane, propeller, nav lights, clouds,
   * windsock, ring pulse and the chase camera.
   */
  function update(state, mission, dt, time, cameraMode) {
    // The plane itself.
    aircraft.group.position.set(state.x, state.y, state.z);
    aircraft.group.rotation.set(state.pitch, state.yaw, state.roll, 'YXZ');
    aircraft.propeller.rotation.z += dt * (4 + state.throttle * 55);
    const blink = Math.sin(time * 5) > 0;
    aircraft.leftNav.visible = blink;
    aircraft.rightNav.visible = blink;
    aircraft.tailNav.visible = !blink;
    sun.position.set(state.x, 0, state.z).addScaledVector(sunDir, 900);
    sun.target.position.set(state.x, 0, state.z);
    sun.target.updateMatrixWorld();
    fill.position.set(state.x, 0, state.z).addScaledVector(fillDir, 700);
    fill.target.position.set(state.x, 0, state.z);
    fill.target.updateMatrixWorld();

    // Rings: the next hoop pulses, passed ones fade out.
    ringMeshes.forEach((group, index) => {
      const ring = mission.rings[index];
      if (!ring) return;
      if (ring.passed) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const isNext = index === mission.ringIndex;
      const s = isNext ? 1 + Math.sin(time * 3.2) * 0.05 : 1;
      group.scale.setScalar(s);
    });

    // Clouds drift with the wind; the windsock streams with it.
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > WORLD.SIZE + 200) cloud.position.x = -WORLD.SIZE - 200;
    }
    sock.rotation.y = Math.sin(time * 0.7) * 0.25;
    sock.rotation.z = Math.PI / 2 - 0.12 + Math.sin(time * 1.3) * 0.05;

    // Camera: chase from behind and slightly above, looking ahead of the nose.
    cameraPose(state, cameraMode, tmpVec, tmpVec2);
    const desired = tmpVec;
    // On the ground the chase camera sits lower and closer, like a spotter.
    if (state.grounded && cameraMode === 'chase') {
      desired.y = state.y + 3.2;
    }
    const ground = groundHeight(desired.x, desired.z) + 2.2;
    if (desired.y < ground) desired.y = ground;
    const smooth = 1 - Math.exp(-dt * (cameraMode === 'front' ? 2.2 : 5.5));
    camPos.lerp(desired, smooth);
    camTarget.lerp(tmpVec2, 1 - Math.exp(-dt * 7));
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    camera.fov = 62 + state.speed * 0.09;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  /** Put the camera somewhere sensible before the first frame. */
  function snapCamera(state, cameraMode) {
    cameraPose(state, cameraMode, camPos, camTarget);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  return { update, rebuildRings, snapCamera, renderer, scene, camera };
}
