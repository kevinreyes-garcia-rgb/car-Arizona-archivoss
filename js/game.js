// Motor Principal 3D — +5,200 Autos Reales, Siluetas Originales, Garaje Pro, Velocidades Oficiales y GPS
(() => {
  const state = {
    screen: 'login', // 'login' | 'menu' | 'garage' | 'store' | 'game'
    mode: 'openworld', // 'openworld' | 'quickrace' | 'multiplayer'
    isNight: true,
    firstPerson: false,
    headlightsOn: true,
    mapOpen: false,
    gpsTarget: null
  };

  // ==========================================
  // 1. AUDIO REALISTA (MOTOR CON RPM, VÁLVULA TURBO Y CLAXON)
  // ==========================================
  let audioCtx = null;
  let hornOsc1 = null, hornOsc2 = null, hornGain = null;
  let engineOsc1 = null, engineOsc2 = null, engineGain = null, engineFilter = null;

  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();

    engineOsc1 = audioCtx.createOscillator();
    engineOsc2 = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    engineFilter = audioCtx.createBiquadFilter();

    engineOsc1.type = 'sawtooth';
    engineOsc2.type = 'triangle';
    engineOsc1.frequency.value = 50;
    engineOsc2.frequency.value = 100;

    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;
    engineGain.gain.value = 0;

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);

    engineOsc1.start();
    engineOsc2.start();
  }

  function playGearShiftSound(isUp) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isUp ? 230 : 330, now);
    osc.frequency.exponentialRampToValueAtTime(isUp ? 95 : 140, now + 0.14);

    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  function startHorn() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (hornOsc1) return;
    hornGain = audioCtx.createGain();
    hornGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    hornGain.gain.exponentialRampToValueAtTime(0.14, audioCtx.currentTime + 0.04);

    hornOsc1 = audioCtx.createOscillator();
    hornOsc2 = audioCtx.createOscillator();
    hornOsc1.type = 'sawtooth';
    hornOsc2.type = 'triangle';
    hornOsc1.frequency.value = 420;
    hornOsc2.frequency.value = 525;

    hornOsc1.connect(hornGain);
    hornOsc2.connect(hornGain);
    hornGain.connect(audioCtx.destination);
    hornOsc1.start();
    hornOsc2.start();
  }

  function stopHorn() {
    if (!hornOsc1) return;
    hornGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
    const o1 = hornOsc1, o2 = hornOsc2;
    hornOsc1 = null; hornOsc2 = null;
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 70);
  }

  // ==========================================
  // 2. ESCENA THREE.JS (60 FPS)
  // ==========================================
  const canvasEl = document.createElement('canvas');
  canvasEl.id = 'game-canvas';
  document.body.appendChild(canvasEl);

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.FogExp2(0x070b14, 0.0026);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.15, 650);

  const hemiLight = new THREE.HemisphereLight(0x8ec5fc, 0x1e293b, 0.65);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.1);
  dirLight.position.set(45, 75, 35);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  const d = 42;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight, dirLight.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ==========================================
  // 3. MUNDO ABIERTO INFINITO (SECTORES, GASOLINERAS Y ZONAS DE CARRERA)
  // ==========================================
  const openWorldGroup = new THREE.Group();
  scene.add(openWorldGroup);

  const CHUNK_SIZE = 120;
  const activeChunks = new Map();
  const gasStations = [];
  const raceZones = [];

  function createBuildingTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 12; y < 244; y += 18) {
      for (let x = 10; x < 118; x += 20) {
        ctx.fillStyle = Math.random() > 0.35 ? (Math.random() > 0.25 ? '#fef08a' : '#38bdf8') : '#1e293b';
        ctx.fillRect(x, y, 12, 10);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const sharedBuildingMat = new THREE.MeshStandardMaterial({ map: createBuildingTexture(), roughness: 0.6 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });

  function hashChunk(cx, cz) {
    return Math.abs(Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453) % 1;
  }

  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (activeChunks.has(key)) return;

    const chunkGroup = new THREE.Group();
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    chunkGroup.position.set(baseX, 0, baseZ);

    const colliders = [];

    const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    for (let offset = -45; offset <= 45; offset += 15) {
      const l1 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), roadLineMat);
      l1.rotation.x = -Math.PI / 2;
      l1.position.set(0, 0.03, offset);
      const l2 = l1.clone();
      l2.rotation.z = Math.PI / 2;
      l2.position.set(offset, 0.03, 0);
      chunkGroup.add(l1, l2);
    }

    const quadrants = [
      { ox: -34, oz: -34 },
      { ox: 34, oz: -34 },
      { ox: -34, oz: 34 },
      { ox: 34, oz: 34 }
    ];

    quadrants.forEach((q, idx) => {
      if (cx === 0 && cz === 0 && idx < 2) return;

      const worldX = baseX + q.ox;
      const worldZ = baseZ + q.oz;
      const rnd = hashChunk(cx * 4 + idx, cz * 4 - idx);

      const sw = new THREE.Mesh(new THREE.BoxGeometry(36, 0.25, 36), sidewalkMat);
      sw.position.set(q.ox, 0.12, q.oz);
      sw.receiveShadow = true;
      chunkGroup.add(sw);

      if (rnd < 0.14 && !(cx === 0 && cz === 0)) {
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(22, 0.8, 16),
          new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x064e3b })
        );
        canopy.position.set(q.ox, 5.2, q.oz);
        chunkGroup.add(canopy);

        [-8, 8].forEach(px => {
          [-5, 5].forEach(pz => {
            const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5.2, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
            pil.position.set(q.ox + px, 2.6, q.oz + pz);
            chunkGroup.add(pil);
          });
        });

        const pump = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
        pump.position.set(q.ox, 1.2, q.oz);
        chunkGroup.add(pump);

        const pad = new THREE.Mesh(
          new THREE.RingGeometry(4.5, 5.2, 28),
          new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(q.ox, 0.28, q.oz + 6);
        chunkGroup.add(pad);

        if (!gasStations.some(g => Math.hypot(g.x - worldX, g.z - (worldZ + 6)) < 20)) {
          gasStations.push({ x: worldX, z: worldZ + 6, name: `Estación Verde (${cx},${cz})` });
        }
      } else if (rnd >= 0.14 && rnd < 0.24 && !(cx === 0 && cz === 0)) {
        const rzRing = new THREE.Mesh(
          new THREE.TorusGeometry(4.8, 0.35, 10, 32),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b })
        );
        rzRing.position.set(q.ox, 4.8, q.oz);
        chunkGroup.add(rzRing);

        if (!raceZones.some(r => Math.hypot(r.x - worldX, r.z - worldZ) < 20)) {
          raceZones.push({ x: worldX, z: worldZ, name: `Punto de Carrera (${cx},${cz})` });
        }
      } else {
        const h = 20 + Math.floor(rnd * 48);
        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(28, h, 28), sharedBuildingMat);
        bMesh.position.set(q.ox, h / 2 + 0.25, q.oz);
        bMesh.receiveShadow = true;
        chunkGroup.add(bMesh);

        colliders.push({
          minX: worldX - 14.2,
          maxX: worldX + 14.2,
          minZ: worldZ - 14.2,
          maxZ: worldZ + 14.2
        });
      }
    });

    openWorldGroup.add(chunkGroup);
    activeChunks.set(key, { group: chunkGroup, colliders });
  }

  function updateInfiniteWorld(px, pz) {
    const curCx = Math.round(px / CHUNK_SIZE);
    const curCz = Math.round(pz / CHUNK_SIZE);
    const radius = 2;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        buildChunk(curCx + dx, curCz + dz);
      }
    }

    for (const [key, data] of activeChunks.entries()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - curCx) > radius + 1 || Math.abs(cz - curCz) > radius + 1) {
        openWorldGroup.remove(data.group);
        activeChunks.delete(key);
      }
    }
  }

  // Línea GPS 3D
  const gpsLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const gpsLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 3 });
  const gpsWorldLine = new THREE.Line(gpsLineGeo, gpsLineMat);
  gpsWorldLine.visible = false;
  scene.add(gpsWorldLine);

  const gpsBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 45, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  gpsBeacon.visible = false;
  scene.add(gpsBeacon);

  // ==========================================
  // 4. MODELOS 3D ORIGINALES (SUPRA MK4, GTR, BUGATTI, LAMBO, PORSCHE, MUSCLE, WIDEBODY)
  // ==========================================
  function createCarModel(colorHex = '#0284c7', bodyStyle = 'coupe', customOpts = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.78, roughness: 0.18 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x091124, metalness: 0.92, roughness: 0.08, transparent: true, opacity: 0.75 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });

    const isWide = !!customOpts.widebody;
    const widthScale = isWide ? 1.12 : 1.0;
    const rideDrop = customOpts.stance === 'slammed' ? -0.09 : (customOpts.stance === 'sport' ? -0.04 : 0);

    const isHyper = ['hyper', 'bugatti', 'lambo', 'super', 'porsche'].includes(bodyStyle);
    const chassisH = isHyper ? 0.50 : 0.62;
    const roofH = isHyper ? 0.40 : 0.50;

    // Chasis principal
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.08 * widthScale, chassisH, 4.55), bodyMat);
    chassis.position.y = 0.64 + rideDrop;
    chassis.castShadow = true;
    group.add(chassis);

    // Guardabarros ensanchados (Widebody)
    if (isWide) {
      const flareGeo = new THREE.BoxGeometry(0.18, 0.34, 1.05);
      [[1.08, 1.38], [-1.08, 1.38], [1.08, -1.38], [-1.08, -1.38]].forEach(([fx, fz]) => {
        const fl = new THREE.Mesh(flareGeo, bodyMat);
        fl.position.set(fx, 0.52 + rideDrop, fz);
        group.add(fl);
      });
    }

    // Faldones laterales y splitter delantero
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.16 * widthScale, 0.11, 4.72), darkMat);
    splitter.position.y = 0.35 + rideDrop;
    group.add(splitter);

    // Capó aerodinámico esculpido
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.88 * widthScale, 0.14, 1.55), bodyMat);
    hood.position.set(0, 0.64 + chassisH / 2 + 0.03 + rideDrop, 1.34);
    hood.rotation.x = bodyStyle === 'lambo' ? 0.15 : 0.07;
    group.add(hood);

    // Detalles distintivos por marca/modelo real
    if (bodyStyle === 'bugatti') {
      // Parrilla en herradura Bugatti
      const grill = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 20), chromeMat);
      grill.position.set(0, 0.56 + rideDrop, 2.29);
      group.add(grill);
    } else if (bodyStyle === 'muscle') {
      // Toma de aire Supercharger
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.8), darkMat);
      scoop.position.set(0, 0.64 + chassisH / 2 + 0.14 + rideDrop, 1.25);
      group.add(scoop);
    } else if (bodyStyle === 'supra' || bodyStyle === 'gtr') {
      // Intercooler frontal metálico
      const intercooler = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.1), chromeMat);
      intercooler.position.set(0, 0.45 + rideDrop, 2.26);
      group.add(intercooler);
    } else if (bodyStyle === 'lambo' || bodyStyle === 'hyper') {
      // Tomas laterales de aire aerodinámicas
      const intakeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 1.1), darkMat);
      intakeL.position.set(1.06 * widthScale, 0.68 + rideDrop, -0.4);
      const intakeR = intakeL.clone();
      intakeR.position.x = -1.06 * widthScale;
      group.add(intakeL, intakeR);
    }

    // Cabina exterior Fastback / Coupé / Hatchback
    const cabinExt = new THREE.Group();
    const roofLen = bodyStyle === 'hatch' ? 2.45 : ((bodyStyle === 'supra' || bodyStyle === 'porsche') ? 2.15 : 1.90);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, roofH, roofLen), bodyMat);
    roof.position.set(0, 0.64 + chassisH / 2 + roofH / 2 + rideDrop, bodyStyle === 'hatch' ? -0.42 : -0.22);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.56, roofH + 0.04, 0.08), glassMat);
    wind.position.set(0, 0.64 + chassisH / 2 + roofH / 2 - 0.02 + rideDrop, 0.82);
    wind.rotation.x = -0.52;

    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.52, roofH + 0.05, 0.08), glassMat);
    rearGlass.position.set(0, 0.64 + chassisH / 2 + roofH / 2 - 0.04 + rideDrop, bodyStyle === 'hatch' ? -1.68 : -1.32);
    rearGlass.rotation.x = bodyStyle === 'hatch' ? 0.32 : 0.58;

    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), bodyMat);
    mirrorL.position.set(1.06 * widthScale, 0.96 + rideDrop, 0.68);
    const mirrorR = mirrorL.clone();
    mirrorR.position.x = -1.06 * widthScale;

    cabinExt.add(roof, wind, rearGlass, mirrorL, mirrorR);
    group.add(cabinExt);

    // Interior 1ª Persona
    const interior = new THREE.Group();
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.34, 0.55), darkMat);
    dash.position.set(0, 0.96 + rideDrop, 0.62);
    interior.add(dash);

    const steeringWheel = new THREE.Group();
    steeringWheel.position.set(0.38, 1.1 + rideDrop, 0.42);
    steeringWheel.rotation.x = -0.35;
    const swRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 10, 24), darkMat);
    const swSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.02), darkMat);
    steeringWheel.add(swRing, swSpoke);
    interior.add(steeringWheel);
    group.add(interior);

    // Alerón trasero (Estilo Supra MK4 arqueado del color del auto o GT Carbono)
    const spoiler = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.96 * widthScale, 0.08, 0.34), bodyStyle === 'supra' ? bodyMat : darkMat);
    wing.position.set(0, 1.24 + rideDrop, -2.04);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.24), bodyStyle === 'supra' ? bodyMat : darkMat);
    legL.position.set(0.76 * widthScale, 1.06 + rideDrop, -2.04);
    const legR = legL.clone();
    legR.position.x = -0.76 * widthScale;
    spoiler.add(wing, legL, legR);
    group.add(spoiler);

    // Doble escape cromado
    const exL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10), chromeMat);
    exL.rotation.x = Math.PI / 2;
    exL.position.set(0.55, 0.42 + rideDrop, -2.28);
    const exR = exL.clone();
    exR.position.x = -0.55;
    group.add(exL, exR);

    // Luz Neón inferior
    const neon = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35 * widthScale, 4.7),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    neon.rotation.x = -Math.PI / 2;
    neon.position.y = 0.24 + rideDrop;
    neon.visible = false;
    group.add(neon);

    // Ruedas
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.85 });
    const wheels = [];
    const steerPivots = [];
    [
      { x: 1.04 * widthScale, y: 0.38, z: 1.38, f: true },
      { x: -1.04 * widthScale, y: 0.38, z: 1.38, f: true },
      { x: 1.04 * widthScale, y: 0.38, z: -1.38, f: false },
      { x: -1.04 * widthScale, y: 0.38, z: -1.38, f: false }
    ].forEach(wp => {
      const piv = new THREE.Group();
      piv.position.set(wp.x, wp.y, wp.z);
      group.add(piv);
      if (wp.f) steerPivots.push(piv);

      const wm = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 18), tireMat);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.33, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      wm.add(tire, rim);
      piv.add(wm);
      wheels.push(wm);
    });

    // Faros delanteros (Redondos para Porsche/GTR o afilados)
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    const hlGeo = bodyStyle === 'porsche' ? new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12) : new THREE.BoxGeometry(0.42, 0.14, 0.08);
    const hlL = new THREE.Mesh(hlGeo, hlMat);
    if (bodyStyle === 'porsche') hlL.rotation.x = Math.PI / 2;
    hlL.position.set(0.68 * widthScale, 0.70 + rideDrop, 2.28);
    const hlR = hlL.clone();
    hlR.position.x = -0.68 * widthScale;
    group.add(hlL, hlR);

    const spotL = new THREE.SpotLight(0xe0f2fe, 3.0, 65, Math.PI / 5, 0.45, 1.1);
    spotL.position.set(0.68, 0.78, 2.15);
    spotL.target.position.set(0.68, 0.1, 18);
    const spotR = new THREE.SpotLight(0xe0f2fe, 3.0, 65, Math.PI / 5, 0.45, 1.1);
    spotR.position.set(-0.68, 0.78, 2.15);
    spotR.target.position.set(-0.68, 0.1, 18);
    group.add(spotL, spotL.target, spotR, spotR.target);

    // Luces traseras rojas
    const tlMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.15, 0.08), tlMat);
    tlL.position.set(0.66 * widthScale, 0.74 + rideDrop, -2.28);
    const tlR = tlL.clone();
    tlR.position.x = -0.66 * widthScale;
    const tlC = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.06), tlMat);
    tlC.position.set(0, 1.36 + rideDrop, -1.12);
    group.add(tlL, tlR, tlC);

    const brakeLight = new THREE.PointLight(0xff1111, 0, 9);
    brakeLight.position.set(0, 0.75, -2.55);
    group.add(brakeLight);

    // Llamas de nitrógeno personalizables
    const flameMat = new THREE.MeshBasicMaterial({ color: customOpts.exhaustColor || 0x38bdf8 });
    const flameL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.65, 8), flameMat);
    flameL.rotation.x = -Math.PI / 2;
    flameL.position.set(0.55, 0.42 + rideDrop, -2.65);
    flameL.visible = false;
    const flameR = flameL.clone();
    flameR.position.x = -0.55;
    group.add(flameL, flameR);

    return {
      group, bodyMat, rimMat, cabinExt, steeringWheel, spoiler, wing, darkMat,
      neon, wheels, steerPivots, hlMat, spotL, spotR, tlMat, brakeLight, flameL, flameR
    };
  }

  let playerCar = createCarModel('#f97316', 'supra');
  scene.add(playerCar.group);

  function rebuildPlayerCarMesh(activeCar) {
    if (!activeCar) return;
    const model = CarCatalog.getById(activeCar.modelId);
    const oldPos = playerCar.group.position.clone();
    const oldRot = playerCar.group.rotation.clone();
    scene.remove(playerCar.group);

    playerCar = createCarModel(activeCar.color, model.bodyStyle, {
      widebody: activeCar.widebody,
      stance: activeCar.stance || 'stock',
      exhaustColor: activeCar.exhaustColor || '#38bdf8'
    });
    playerCar.group.position.copy(oldPos);
    playerCar.group.rotation.copy(oldRot);

    if (activeCar.finish === 'metallic') { playerCar.bodyMat.metalness = 0.78; playerCar.bodyMat.roughness = 0.18; }
    else if (activeCar.finish === 'matte') { playerCar.bodyMat.metalness = 0.15; playerCar.bodyMat.roughness = 0.78; }
    else { playerCar.bodyMat.metalness = 0.96; playerCar.bodyMat.roughness = 0.06; }

    playerCar.rimMat.color.set(activeCar.rimColor || '#e2e8f0');
    playerCar.neon.visible = activeCar.neon !== 'none';
    if (activeCar.neon !== 'none') playerCar.neon.material.color.set(activeCar.neon);

    if (activeCar.spoiler === 'none') playerCar.spoiler.visible = false;
    else if (activeCar.spoiler === 'street') {
      playerCar.spoiler.visible = true;
      playerCar.wing.scale.set(1, 1, 1);
      playerCar.wing.material = model.bodyStyle === 'supra' ? playerCar.bodyMat : playerCar.darkMat;
    } else {
      playerCar.spoiler.visible = true;
      playerCar.wing.scale.set(1.08, 1.2, 1.35);
      playerCar.wing.material = playerCar.darkMat;
    }

    playerCar.cabinExt.visible = !state.firstPerson;
    scene.add(playerCar.group);
    updateHeadlights();
  }

  // ==========================================
  // 5. NPCs DETALLADOS: AUTOS DE TRÁFICO + PERSONAS CAMINANDO
  // ==========================================
  const npcTrafficCars = [];
  const npcColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
  for (let i = 0; i < 10; i++) {
    const npc = createCarModel(npcColors[i % npcColors.length], i % 3 === 0 ? 'muscle' : 'coupe');
    npc.spotL.visible = false;
    npc.spotR.visible = false;
    npc.spoiler.visible = false;
    openWorldGroup.add(npc.group);
    npcTrafficCars.push({
      car: npc,
      alongX: i % 2 === 0,
      dir: i % 4 < 2 ? 1 : -1,
      offset: ((i % 5) - 2) * 120,
      speed: 12 + (i % 4) * 2
    });
  }

  const pedestrians = [];
  const shirtColors = [0x38bdf8, 0xf43f5e, 0x10b981, 0xfbbf24, 0xa855f7, 0xf8fafc];
  for (let i = 0; i < 24; i++) {
    const ped = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColors[i % shirtColors.length] });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
    head.position.y = 1.62;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.24), shirtMat);
    torso.position.y = 1.16;

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.16), pantsMat);
    legL.position.set(0.11, 0.56, 0);
    const legR = legL.clone();
    legR.position.x = -0.11;

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.14), shirtMat);
    armL.position.set(0.29, 1.16, 0);
    const armR = armL.clone();
    armR.position.x = -0.29;

    ped.add(head, torso, legL, legR, armL, armR);
    openWorldGroup.add(ped);

    pedestrians.push({
      mesh: ped,
      legL, legR, armL, armR,
      angle: Math.random() * Math.PI * 2,
      speed: 1.6 + Math.random() * 0.8,
      phase: Math.random() * 6
    });
  }

  // Plataforma del Garaje 3D
  const garagePlatform = new THREE.Group();
  const platBase = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 4.8, 0.24, 36),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 })
  );
  platBase.position.y = 0.12;
  const platRing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.45, 36),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
  );
  platRing.rotation.x = -Math.PI / 2;
  platRing.position.y = 0.25;
  garagePlatform.add(platBase, platRing);
  garagePlatform.visible = false;
  scene.add(garagePlatform);

  // ==========================================
  // 6. FÍSICA CON TRANSMISIÓN MANUAL (E / Q) Y VELOCIDADES OFICIALES
  // ==========================================
  const keys = {};
  const physics = {
    x: 0, z: 16,
    heading: 0,
    speed: 0,
    steerAngle: 0,
    driftAngle: 0,
    gear: 1,
    fuel: 100,
    nitro: 100
  };

  function getMaxGears() {
    const car = AuthManager.getActiveCar();
    return (car && car.transLvl >= 5) ? 10 : 7;
  }

  function showToast(msg) {
    const el = document.getElementById('toast-banner');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function applyDayNight() {
    if (state.isNight) {
      scene.background.setHex(0x070b14);
      scene.fog.color.setHex(0x070b14);
      hemiLight.intensity = 0.6;
      dirLight.intensity = 0.5;
    } else {
      scene.background.setHex(0x7dd3fc);
      scene.fog.color.setHex(0xbae6fd);
      hemiLight.intensity = 1.05;
      dirLight.intensity = 1.45;
    }
  }

  function updateHeadlights() {
    const on = state.headlightsOn;
    playerCar.spotL.visible = on;
    playerCar.spotR.visible = on;
    playerCar.hlMat.color.setHex(on ? 0xe0f2fe : 0x334155);
    document.getElementById('lamp-lights').classList.toggle('lights-on', on);
  }

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      if (state.screen === 'game' || code === 'Tab') e.preventDefault();
    }
    keys[code] = true;

    if (state.screen !== 'game') return;

    if (code === 'KeyE') {
      const maxG = getMaxGears();
      if (physics.gear < maxG) {
        physics.gear++;
        playGearShiftSound(true);
        showToast(`Marcha ${physics.gear} / ${maxG}`);
      }
    } else if (code === 'KeyQ') {
      if (physics.gear > 1) {
        physics.gear--;
        playGearShiftSound(false);
        showToast(`Marcha ${physics.gear} / ${getMaxGears()}`);
      }
    } else if (code === 'KeyM') {
      toggleMapModal();
    } else if (code === 'KeyF') {
      handleWorldInteraction();
    } else if (code === 'Tab') {
      state.firstPerson = !state.firstPerson;
      playerCar.cabinExt.visible = !state.firstPerson;
      showToast(state.firstPerson ? 'Vista: Primera Persona (Cabina)' : 'Vista: Tercera Persona');
    } else if (code === 'KeyG') {
      state.headlightsOn = !state.headlightsOn;
      state.isNight = state.headlightsOn;
      applyDayNight();
      updateHeadlights();
      showToast(state.headlightsOn ? 'Faros Encendidos • Noche' : 'Faros Apagados • Día');
    } else if (code === 'KeyH') {
      startHorn();
    } else if (code === 'KeyR') {
      physics.speed = 0;
      physics.driftAngle = 0;
      physics.gear = 1;
      showToast('Auto estabilizado en marcha 1');
    } else if (code === 'Escape') {
      if (state.mapOpen) toggleMapModal(false);
      else goToMainMenu();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyH') stopHorn();
  });

  // ==========================================
  // 7. GASOLINERAS, ZONAS DE CARRERA Y MAPA GPS
  // ==========================================
  let nearGasStation = null;
  let nearRaceZone = null;

  function handleWorldInteraction() {
    const user = AuthManager.getUser();
    if (nearGasStation) {
      if (user && user.credits >= 150) {
        user.credits -= 150;
        AuthManager.saveUser();
        physics.fuel = 100;
        physics.nitro = 100;
        showToast('⛽ ¡Gasolina y Nitrógeno al 100%! (-$150)');
      } else {
        physics.fuel = 100;
        physics.nitro = 100;
        showToast('⛽ ¡Recarga de emergencia gratuita aplicada!');
      }
    } else if (nearRaceZone) {
      startQuickRace('circuit', 2, 2);
    }
  }

  const gpsCanvas = document.getElementById('gps-canvas');
  const gpsCtx = gpsCanvas.getContext('2d');

  function toggleMapModal(forceState) {
    state.mapOpen = typeof forceState === 'boolean' ? forceState : !state.mapOpen;
    document.getElementById('map-modal').classList.toggle('hidden', !state.mapOpen);
    if (state.mapOpen) drawGpsMap();
  }

  function drawGpsMap() {
    const w = gpsCanvas.width;
    const h = gpsCanvas.height;
    const scale = 0.45;

    gpsCtx.fillStyle = '#0b1222';
    gpsCtx.fillRect(0, 0, w, h);

    gpsCtx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    gpsCtx.lineWidth = 1;
    const step = CHUNK_SIZE * scale;
    const offX = (w / 2) - ((physics.x * scale) % step);
    const offY = (h / 2) - ((physics.z * scale) % step);

    for (let x = offX - step * 6; x < w + step * 6; x += step) {
      gpsCtx.beginPath(); gpsCtx.moveTo(x, 0); gpsCtx.lineTo(x, h); gpsCtx.stroke();
    }
    for (let y = offY - step * 6; y < h + step * 6; y += step) {
      gpsCtx.beginPath(); gpsCtx.moveTo(0, y); gpsCtx.lineTo(w, y); gpsCtx.stroke();
    }

    gasStations.forEach(gs => {
      const sx = w / 2 + (gs.x - physics.x) * scale;
      const sy = h / 2 + (gs.z - physics.z) * scale;
      gpsCtx.fillStyle = '#10b981';
      gpsCtx.beginPath(); gpsCtx.arc(sx, sy, 6, 0, Math.PI * 2); gpsCtx.fill();
      gpsCtx.fillStyle = '#a7f3d0';
      gpsCtx.font = 'bold 11px sans-serif';
      gpsCtx.fillText('GAS', sx + 8, sy + 4);
    });

    raceZones.forEach(rz => {
      const sx = w / 2 + (rz.x - physics.x) * scale;
      const sy = h / 2 + (rz.z - physics.z) * scale;
      gpsCtx.fillStyle = '#f59e0b';
      gpsCtx.beginPath(); gpsCtx.arc(sx, sy, 6, 0, Math.PI * 2); gpsCtx.fill();
      gpsCtx.fillStyle = '#fde68a';
      gpsCtx.font = 'bold 11px sans-serif';
      gpsCtx.fillText('CARRERA', sx + 8, sy + 4);
    });

    if (state.gpsTarget) {
      const dx = w / 2 + (state.gpsTarget.x - physics.x) * scale;
      const dy = h / 2 + (state.gpsTarget.z - physics.z) * scale;

      gpsCtx.strokeStyle = '#38bdf8';
      gpsCtx.lineWidth = 3;
      gpsCtx.setLineDash([8, 6]);
      gpsCtx.beginPath();
      gpsCtx.moveTo(w / 2, h / 2);
      gpsCtx.lineTo(dx, dy);
      gpsCtx.stroke();
      gpsCtx.setLineDash([]);

      gpsCtx.fillStyle = '#ef4444';
      gpsCtx.beginPath(); gpsCtx.arc(dx, dy, 7, 0, Math.PI * 2); gpsCtx.fill();
    }

    gpsCtx.save();
    gpsCtx.translate(w / 2, h / 2);
    gpsCtx.rotate(-physics.heading);
    gpsCtx.fillStyle = '#38bdf8';
    gpsCtx.beginPath();
    gpsCtx.moveTo(0, 10);
    gpsCtx.lineTo(-7, -8);
    gpsCtx.lineTo(7, -8);
    gpsCtx.closePath();
    gpsCtx.fill();
    gpsCtx.restore();
  }

  gpsCanvas.addEventListener('click', (e) => {
    const rect = gpsCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const scale = 0.45;
    const targetX = physics.x + (cx - gpsCanvas.width / 2) / scale;
    const targetZ = physics.z + (cy - gpsCanvas.height / 2) / scale;

    state.gpsTarget = { x: targetX, z: targetZ };
    document.getElementById('hud-gps-status').classList.remove('hidden');
    drawGpsMap();
    showToast('📍 Ruta GPS trazada en el mapa y carretera');
  });

  document.getElementById('btn-clear-gps').onclick = () => {
    state.gpsTarget = null;
    gpsWorldLine.visible = false;
    gpsBeacon.visible = false;
    document.getElementById('hud-gps-status').classList.add('hidden');
    drawGpsMap();
  };
  document.getElementById('btn-close-map').onclick = () => toggleMapModal(false);

  // ==========================================
  // 8. NAVEGACIÓN ENTRE PANTALLAS, GARAJE PRO Y CONCESIONARIO (+5,200 AUTOS)
  // ==========================================
  function hideAllScreens() {
    ['login-screen', 'main-menu-screen', 'garage-screen', 'store-screen', 'game-hud'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
  }

  function goToMainMenu() {
    stopHorn();
    if (engineGain && audioCtx) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    hideAllScreens();
    state.screen = 'menu';
    raceState.active = false;
    clearRaceEntities();

    playerCar.group.visible = false;
    garagePlatform.visible = false;
    openWorldGroup.visible = false;

    const u = AuthManager.getUser();
    const ac = AuthManager.getActiveCar();
    if (u && ac) {
      const m = CarCatalog.getById(ac.modelId);
      const stats = CarCatalog.getPhysicsStats(ac);
      document.getElementById('menu-pilot-name').textContent = u.name;
      document.getElementById('menu-pilot-email').textContent = u.email;
      document.getElementById('menu-credits').textContent = '$' + u.credits.toLocaleString();
      document.getElementById('menu-active-car').textContent = m.name;
      document.getElementById('menu-car-gears').textContent = `${ac.transLvl >= 5 ? 10 : 7} Marchas • ${stats.currentTopKmh} KM/H`;
    }
    document.getElementById('main-menu-screen').classList.remove('hidden');
  }

  function openGarageScreen() {
    hideAllScreens();
    state.screen = 'garage';
    openWorldGroup.visible = false;
    garagePlatform.visible = true;
    playerCar.group.visible = true;
    playerCar.cabinExt.visible = true;
    state.firstPerson = false;

    refreshGarageUI();
    document.getElementById('garage-screen').classList.remove('hidden');
  }

  function refreshGarageUI() {
    const u = AuthManager.getUser();
    const ac = AuthManager.getActiveCar();
    if (!u || !ac) return;

    if (!ac.turboLvl) ac.turboLvl = 1;
    const model = CarCatalog.getById(ac.modelId);
    const stats = CarCatalog.getPhysicsStats(ac);
    rebuildPlayerCarMesh(ac);

    document.getElementById('garage-credits').textContent = '$' + u.credits.toLocaleString();
    document.getElementById('garage-car-title').textContent = model.name;
    document.getElementById('garage-gear-info').textContent =
      `${ac.transLvl >= 5 ? '10 Marchas' : '7 Marchas'} • Vel. Actual: ${stats.currentTopKmh} KM/H (Full Oficial: ${stats.fullKmh} KM/H)`;

    document.getElementById('owned-cars-count').textContent = u.garage.length;
    const list = document.getElementById('owned-cars-list');
    list.innerHTML = '';
    u.garage.forEach(c => {
      const cm = CarCatalog.getById(c.modelId);
      const div = document.createElement('div');
      div.className = 'owned-item' + (c.uid === ac.uid ? ' active' : '');
      div.innerHTML = `<span><b>${cm.name}</b></span><small>${c.transLvl >= 5 ? '10M' : '7M'}</small>`;
      div.onclick = () => {
        u.activeCarUid = c.uid;
        AuthManager.saveUser();
        refreshGarageUI();
      };
      list.appendChild(div);
    });

    const resale = CarCatalog.calculateResaleValue(ac);
    document.getElementById('garage-sell-price').textContent = '$' + resale.toLocaleString();
    const btnSell = document.getElementById('btn-sell-car');
    const canSell = u.garage.length > 1;
    btnSell.disabled = !canSell;
    document.getElementById('sell-warning').textContent = canSell
      ? 'Venderás este vehículo y recibirás su valor modificado.'
      : 'No puedes vender tu único auto (mínimo 1 vehículo).';

    const items = [
      { key: 'engineLvl', lbl: 'upg-engine-lvl', btn: 'btn-upg-engine', base: 1500 },
      { key: 'turboLvl', lbl: 'upg-turbo-lvl', btn: 'btn-upg-turbo', base: 1600 },
      { key: 'transLvl', lbl: 'upg-trans-lvl', btn: 'btn-upg-trans', base: 1800 },
      { key: 'tiresLvl', lbl: 'upg-tires-lvl', btn: 'btn-upg-tires', base: 1200 },
      { key: 'nitroLvl', lbl: 'upg-nitro-lvl', btn: 'btn-upg-nitro', base: 1400 }
    ];
    items.forEach(it => {
      const elLbl = document.getElementById(it.lbl);
      const elBtn = document.getElementById(it.btn);
      if (!elLbl || !elBtn) return;
      const lvl = ac[it.key] || 1;
      const cost = lvl * it.base;
      elLbl.textContent = `Nv. ${lvl}/5`;
      elBtn.textContent = lvl >= 5 ? 'MÁX' : '$' + cost.toLocaleString();
      elBtn.disabled = lvl >= 5 || u.credits < cost;
    });
  }

  // Concesionario con filtro de marcas y buscador para +5,200 autos sin lag
  let storeFiltersReady = false;
  function openStoreScreen() {
    hideAllScreens();
    state.screen = 'store';
    playerCar.group.visible = false;
    garagePlatform.visible = false;

    const brandSel = document.getElementById('store-brand-filter');
    const searchInp = document.getElementById('store-search-input');
    if (!storeFiltersReady && brandSel && searchInp) {
      storeFiltersReady = true;
      brandSel.innerHTML = '';
      CarCatalog.BRANDS.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b === 'Todas' ? `Todas las Marcas (${CarCatalog.CARS.length} Autos)` : b;
        brandSel.appendChild(opt);
      });
      brandSel.onchange = refreshStoreUI;
      searchInp.oninput = refreshStoreUI;
    }

    refreshStoreUI();
    document.getElementById('store-screen').classList.remove('hidden');
  }

  function refreshStoreUI() {
    const u = AuthManager.getUser();
    if (!u) return;
    document.getElementById('store-credits').textContent = '$' + u.credits.toLocaleString();

    const brandVal = (document.getElementById('store-brand-filter') || {}).value || 'Todas';
    const searchVal = ((document.getElementById('store-search-input') || {}).value || '').toLowerCase().trim();

    let filtered = CarCatalog.CARS;
    if (brandVal !== 'Todas') {
      filtered = filtered.filter(c => c.brand === brandVal);
    }
    if (searchVal) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(searchVal) || c.brand.toLowerCase().includes(searchVal));
    }

    // Mostrar hasta 80 tarjetas por vista para que el renderizado sea instantáneo a 60 FPS
    const visibleCars = filtered.slice(0, 80);
    const grid = document.getElementById('store-grid');
    grid.innerHTML = '';

    visibleCars.forEach(car => {
      const card = document.createElement('div');
      card.className = 'car-box-card';
      const canBuy = u.credits >= car.price;
      const speedPct = Math.min(100, Math.round((car.fullKmh / 515) * 100));

      card.innerHTML = `
        <div>
          <div class="car-preview-banner" style="background: linear-gradient(135deg, ${car.defaultColor}55, #0f172a);">
            <span class="car-class-badge">${car.brand} • ${car.category}</span>
            <span style="font-size:2.4rem;">🏎️</span>
          </div>
          <h3 class="mt-10">${car.name}</h3>
          <div class="inspired">Stock: <b>${car.stockKmh} KM/H</b> • Full Tune: <b style="color:#38bdf8">${car.fullKmh} KM/H</b></div>
        </div>
        <div class="stat-bars">
          <div class="s-line"><span>Vel. Máx (${car.fullKmh} km/h)</span><div class="s-track"><div class="s-fill" style="width:${speedPct}%"></div></div></div>
          <div class="s-line"><span>Aceleración</span><div class="s-track"><div class="s-fill" style="width:${car.accelStat}%"></div></div></div>
          <div class="s-line"><span>Manejo</span><div class="s-track"><div class="s-fill" style="width:${car.handling}%"></div></div></div>
        </div>
        <div class="car-box-footer">
          <span class="car-price">$${car.price.toLocaleString()}</span>
          <button class="btn-primary" ${canBuy ? '' : 'disabled'}>${canBuy ? 'COMPRAR AUTO' : 'SIN FONDOS'}</button>
        </div>
      `;
      card.querySelector('button').onclick = () => {
        const res = AuthManager.buyCar(car.id);
        if (res.ok) {
          refreshStoreUI();
          showToast(`¡Compraste ${car.name}! Ya está en tu Garaje.`);
        }
      };
      grid.appendChild(card);
    });
  }

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = AuthManager.login(
      document.getElementById('pilot-name').value,
      document.getElementById('pilot-email').value
    );
    if (!res.ok) {
      document.getElementById('login-error').textContent = res.msg;
      return;
    }
    goToMainMenu();
  });

  document.getElementById('btn-logout').onclick = () => {
    AuthManager.logout();
    hideAllScreens();
    document.getElementById('login-screen').classList.remove('hidden');
  };

  document.getElementById('nav-openworld').onclick = () => startOpenWorld();
  document.getElementById('nav-garage').onclick = () => openGarageScreen();
  document.getElementById('nav-store').onclick = () => openStoreScreen();
  document.getElementById('nav-quickrace').onclick = () => document.getElementById('menu-subpanel-race').classList.remove('hidden');
  document.getElementById('nav-multiplayer').onclick = () => document.getElementById('menu-subpanel-mp').classList.remove('hidden');

  document.querySelectorAll('.btn-close-sub').forEach(btn => {
    btn.onclick = () => document.getElementById(btn.dataset.close).classList.add('hidden');
  });

  document.getElementById('btn-garage-back').onclick = goToMainMenu;
  document.getElementById('btn-store-back').onclick = goToMainMenu;

  const palette = ['#f97316', '#0284c7', '#e11d48', '#10b981', '#eab308', '#7c3aed', '#f8fafc', '#18181b', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];
  const swatchBox = document.getElementById('garage-swatches');
  palette.forEach(hex => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = hex;
    s.onclick = () => {
      const ac = AuthManager.getActiveCar();
      if (!ac) return;
      ac.color = hex;
      AuthManager.saveUser();
      refreshGarageUI();
    };
    swatchBox.appendChild(s);
  });

  document.querySelectorAll('.g-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.g-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.g-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('gtab-' + btn.dataset.gtab).classList.add('active');
    };
  });

  function bindSeg(id, prop, isBool = false) {
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll('.seg').forEach(btn => {
      btn.onclick = () => {
        box.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ac = AuthManager.getActiveCar();
        if (!ac) return;
        ac[prop] = isBool ? (btn.dataset.val === 'true') : btn.dataset.val;
        AuthManager.saveUser();
        refreshGarageUI();
      };
    });
  }
  bindSeg('garage-finish', 'finish');
  bindSeg('garage-neon', 'neon');
  bindSeg('garage-exhaust', 'exhaustColor');
  bindSeg('garage-widebody', 'widebody', true);
  bindSeg('garage-spoiler', 'spoiler');
  bindSeg('garage-stance', 'stance');
  bindSeg('garage-rim', 'rimColor');

  function bindUpgrade(btnId, prop, baseCost) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = () => {
      const u = AuthManager.getUser();
      const ac = AuthManager.getActiveCar();
      const curLvl = ac[prop] || 1;
      const cost = curLvl * baseCost;
      if (u.credits >= cost && curLvl < 5) {
        u.credits -= cost;
        ac[prop] = curLvl + 1;
        AuthManager.saveUser();
        refreshGarageUI();
      }
    };
  }
  bindUpgrade('btn-upg-engine', 'engineLvl', 1500);
  bindUpgrade('btn-upg-turbo', 'turboLvl', 1600);
  bindUpgrade('btn-upg-trans', 'transLvl', 1800);
  bindUpgrade('btn-upg-tires', 'tiresLvl', 1200);
  bindUpgrade('btn-upg-nitro', 'nitroLvl', 1400);

  document.getElementById('btn-sell-car').onclick = () => {
    const ac = AuthManager.getActiveCar();
    if (!ac) return;
    const res = AuthManager.sellCar(ac.uid);
    if (res.ok) {
      refreshGarageUI();
      showToast(`Vehículo vendido por $${res.earned.toLocaleString()}`);
    }
  };

  let garageYaw = 0.65, garagePitch = 0.24, dragging = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (state.screen === 'garage') { dragging = true; lx = e.clientX; ly = e.clientY; }
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging && state.screen === 'garage') {
      garageYaw -= (e.clientX - lx) * 0.008;
      garagePitch = Math.max(0.1, Math.min(0.65, garagePitch + (e.clientY - ly) * 0.005));
      lx = e.clientX; ly = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // ==========================================
  // 9. INICIO DE MODOS DE CONDUCCIÓN
  // ==========================================
  let activeTrackData = null;
  let aiRacers = [];
  const remoteCarMeshes = {};
  let raceState = {
    active: false,
    lap: 1,
    totalLaps: 2,
    milesGoal: 2,
    milesDriven: 0,
    nextCheckpointIdx: 0,
    finished: false
  };

  function clearRaceEntities() {
    if (activeTrackData && activeTrackData.group) scene.remove(activeTrackData.group);
    activeTrackData = null;
    aiRacers.forEach(ai => scene.remove(ai.car.group));
    aiRacers = [];
    Object.values(remoteCarMeshes).forEach(m => scene.remove(m.group));
    for (const k in remoteCarMeshes) delete remoteCarMeshes[k];
  }

  function prepareDriving(modeName) {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('menu-subpanel-race').classList.add('hidden');
    document.getElementById('menu-subpanel-mp').classList.add('hidden');
    hideAllScreens();

    state.screen = 'game';
    state.mode = modeName;
    state.firstPerson = false;

    const ac = AuthManager.getActiveCar();
    rebuildPlayerCarMesh(ac);
    playerCar.group.visible = true;
    garagePlatform.visible = false;

    physics.gear = 1;
    physics.fuel = 100;
    physics.nitro = 100;
    physics.speed = 0;
    physics.driftAngle = 0;

    document.getElementById('hud-max-gear').textContent = `/ ${getMaxGears()}`;
    document.getElementById('game-hud').classList.remove('hidden');
    updateHeadlights();
  }

  function startOpenWorld() {
    clearRaceEntities();
    raceState.active = false;
    raceState.milesDriven = 0;
    openWorldGroup.visible = true;

    physics.x = 0; physics.z = 16; physics.heading = 0;
    updateInfiniteWorld(0, 16);

    pedestrians.forEach((p, idx) => {
      p.mesh.position.set((idx - 12) * 18, 0.25, ((idx % 4) - 2) * 34);
    });

    document.getElementById('hud-mode-badge').textContent = 'MUNDO ABIERTO INFINITO';
    document.getElementById('hud-race-progress').textContent = 'Usa [M] Mapa GPS • [E/Q] Marchas';
    document.getElementById('hud-room-indicator').classList.add('hidden');
    prepareDriving('openworld');
  }

  function startQuickRace(trackType, laps, miles, isMp = false) {
    clearRaceEntities();
    openWorldGroup.visible = false;
    gpsWorldLine.visible = false;
    gpsBeacon.visible = false;

    activeTrackData = TrackBuilder.buildTrackMesh(scene, trackType, miles);
    raceState = {
      active: true,
      lap: 1,
      totalLaps: laps,
      milesGoal: miles,
      milesDriven: 0,
      nextCheckpointIdx: 0,
      finished: false
    };

    const sp = activeTrackData.startPos;
    const sa = activeTrackData.startAngle;
    const rightVec = new THREE.Vector3(Math.cos(sa), 0, -Math.sin(sa));
    physics.x = sp.x + rightVec.x * 2.5;
    physics.z = sp.z + rightVec.z * 2.5;
    physics.heading = sa;

    if (!isMp) {
      const rivals = [
        { color: '#10b981', style: 'super', speed: 0.00145 },
        { color: '#f59e0b', style: 'supra', speed: 0.00160 },
        { color: '#8b5cf6', style: 'bugatti', speed: 0.00180 }
      ];
      rivals.forEach((rv, i) => {
        const aiCar = createCarModel(rv.color, rv.style);
        aiCar.spotL.visible = false;
        aiCar.spotR.visible = false;
        scene.add(aiCar.group);
        aiRacers.push({ car: aiCar, t: (0.992 - i * 0.008) % 1, speedFactor: rv.speed });
      });
    }

    document.getElementById('hud-mode-badge').textContent = isMp ? 'CARRERA MULTIJUGADOR' : 'CARRERA RÁPIDA';
    document.getElementById('hud-race-progress').textContent = `Vuelta 1 / ${laps} • ${miles} Millas`;
    prepareDriving(isMp ? 'multiplayer' : 'quickrace');
  }

  document.getElementById('btn-launch-quickrace').onclick = () => {
    startQuickRace(
      document.getElementById('qr-track').value,
      parseInt(document.getElementById('qr-laps').value, 10),
      parseFloat(document.getElementById('qr-miles').value),
      false
    );
  };

  MultiplayerManager.setCallbacks(
    (room) => {
      document.getElementById('display-room-code').textContent = room.code;
      const list = document.getElementById('room-players-list');
      list.innerHTML = '';
      const players = Object.values(room.players);
      document.getElementById('room-player-count').textContent = players.length;
      players.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>🏎️ ${p.name}</span><span>${p.id === room.hostId ? 'Anfitrión' : 'Listo'}</span>`;
        list.appendChild(li);
      });
    },
    (room) => {
      const [lapsS, milesS] = (room.lapsMiles || '2-2').split('-');
      document.getElementById('hud-active-room').textContent = room.code;
      document.getElementById('hud-room-indicator').classList.remove('hidden');
      startQuickRace(room.track || 'circuit', parseInt(lapsS, 10), parseFloat(milesS), true);
    }
  );

  document.getElementById('btn-create-room').onclick = async () => {
    const res = await MultiplayerManager.createRoom(AuthManager.getUser(), AuthManager.getActiveCar());
    if (res.ok) {
      document.getElementById('mp-lobby-controls').classList.add('hidden');
      document.getElementById('mp-room-active').classList.remove('hidden');
      document.getElementById('display-room-code').textContent = res.room.code;
    }
  };

  document.getElementById('btn-join-room').onclick = async () => {
    const code = document.getElementById('input-room-code').value;
    if (!code.trim()) return;
    const res = await MultiplayerManager.joinRoom(code, AuthManager.getUser(), AuthManager.getActiveCar());
    if (!res.ok) {
      document.getElementById('mp-status-msg').textContent = res.msg;
      return;
    }
    document.getElementById('mp-status-msg').textContent = '';
    document.getElementById('mp-lobby-controls').classList.add('hidden');
    document.getElementById('mp-room-active').classList.remove('hidden');
  };

  document.getElementById('btn-copy-code').onclick = () => {
    const code = document.getElementById('display-room-code').textContent;
    navigator.clipboard.writeText(code).catch(() => {});
    showToast('Código copiado: ' + code);
  };

  document.getElementById('btn-leave-room').onclick = async () => {
    await MultiplayerManager.leaveRoom(AuthManager.getUser().id);
    document.getElementById('mp-room-active').classList.add('hidden');
    document.getElementById('mp-lobby-controls').classList.remove('hidden');
  };

  document.getElementById('btn-start-mp-race').onclick = async () => {
    await MultiplayerManager.startRoomRace(
      AuthManager.getUser().id,
      document.getElementById('mp-track').value,
      document.getElementById('mp-laps-miles').value
    );
  };

  document.getElementById('btn-finish-to-menu').onclick = () => {
    document.getElementById('race-finish-modal').classList.add('hidden');
    goToMainMenu();
  };

  // ==========================================
  // 10. BUCLE PRINCIPAL DE SIMULACIÓN (60 FPS) CON VELOCIDADES OFICIALES REALES
  // ==========================================
  const clock = new THREE.Clock();
  let lastMpSync = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state.screen === 'garage') {
      if (!dragging) garageYaw += dt * 0.35;
      playerCar.group.position.set(0, 0.24, 0);
      playerCar.group.rotation.set(0, 0, 0);
      platRing.rotation.z += dt * 0.8;

      const dist = 6.2;
      camera.position.set(
        Math.sin(garageYaw) * Math.cos(garagePitch) * dist,
        Math.sin(garagePitch) * dist + 1.1,
        Math.cos(garageYaw) * Math.cos(garagePitch) * dist
      );
      camera.lookAt(0, 0.95, 0);
      renderer.render(scene, camera);
      return;
    }

    if (state.screen !== 'game') return;

    const user = AuthManager.getUser();
    const ac = AuthManager.getActiveCar() || { modelId: 'supra_mk4', engineLvl: 1, transLvl: 1, tiresLvl: 1, nitroLvl: 1, turboLvl: 1 };
    const officialStats = CarCatalog.getPhysicsStats(ac);

    const maxGears = getMaxGears();
    if (physics.gear > maxGears) physics.gear = maxGears;

    // Velocidad tope oficial real del coche (Stock o Full según mejoras)
    const topCarSpeed = officialStats.maxPhysicsSpeed;
    const gearMaxSpeed = (physics.gear / maxGears) * topCarSpeed;
    const gearTorqueFactor = 1.38 - (physics.gear / maxGears) * 0.55;

    const turboBonus = ((ac.turboLvl || 1) - 1) * 2.8;
    const baseAccel = (officialStats.baseAccel + turboBonus) * gearTorqueFactor;
    const brakeForce = 42 + ((ac.tiresLvl || 1) - 1) * 6.5;
    const gripFactor = 5.8 + ((ac.tiresLvl || 1) - 1) * 1.2;

    const throttle = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
    const reverse = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
    const steerInput = ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0) - ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0);
    const handbrake = !!keys['Space'];
    const usingNitro = (keys['ShiftLeft'] || keys['ShiftRight']) && throttle && physics.nitro > 1;

    if (throttle && physics.fuel > 0) {
      if (state.mode === 'openworld') physics.fuel = Math.max(0, physics.fuel - dt * 0.45);
      const fuelPenalty = physics.fuel <= 0 ? 0.35 : 1.0;

      if (physics.speed < gearMaxSpeed * fuelPenalty) {
        physics.speed += baseAccel * fuelPenalty * dt;
      } else {
        physics.speed += (gearMaxSpeed * fuelPenalty - physics.speed) * Math.min(1, dt * 3);
      }
    } else if (reverse) {
      if (physics.speed > 1) physics.speed -= brakeForce * 0.85 * dt;
      else physics.speed -= 18 * dt;
    } else {
      physics.speed *= Math.pow(0.45, dt);
    }

    if (usingNitro) {
      physics.nitro = Math.max(0, physics.nitro - dt * 22);
      const boost = 14 + ((ac.nitroLvl || 1) * 2.8);
      physics.speed = Math.min(topCarSpeed * 1.08, physics.speed + boost * dt);
      playerCar.flameL.visible = true;
      playerCar.flameR.visible = true;
    } else {
      playerCar.flameL.visible = false;
      playerCar.flameR.visible = false;
    }

    const lampBrake = document.getElementById('lamp-brake');
    if (handbrake || (reverse && physics.speed > 1.5)) {
      if (handbrake) {
        if (Math.abs(physics.speed) > 0.4) physics.speed -= Math.sign(physics.speed) * brakeForce * dt;
        else physics.speed = 0;
      }
      playerCar.tlMat.color.setHex(0xff1e1e);
      playerCar.brakeLight.intensity = 3.6;
      lampBrake.classList.add('brake-on');
    } else {
      playerCar.tlMat.color.setHex(state.headlightsOn ? 0x660000 : 0x2a0000);
      playerCar.brakeLight.intensity = state.headlightsOn ? 0.35 : 0;
      lampBrake.classList.remove('brake-on');
    }

    physics.speed = Math.max(-18, physics.speed);

    const targetSteer = steerInput * 0.52;
    physics.steerAngle += (targetSteer - physics.steerAngle) * Math.min(1, dt * 10);

    const speedRatio = Math.min(1, Math.abs(physics.speed) / 14);
    const dirSign = physics.speed >= -0.1 ? 1 : -1;
    physics.heading += (handbrake ? 2.65 : 2.05) * physics.steerAngle * speedRatio * dirSign * dt;

    const targetDrift = (handbrake && Math.abs(physics.speed) > 10) ? steerInput * 0.38 : 0;
    physics.driftAngle += (targetDrift - physics.driftAngle) * Math.min(1, dt * gripFactor);

    const moveAngle = physics.heading - physics.driftAngle * 0.55;
    const nextX = physics.x + Math.sin(moveAngle) * physics.speed * dt;
    const nextZ = physics.z + Math.cos(moveAngle) * physics.speed * dt;

    let collided = false;
    if (state.mode === 'openworld') {
      const r = 1.65;
      for (const data of activeChunks.values()) {
        for (let i = 0; i < data.colliders.length; i++) {
          const c = data.colliders[i];
          if (nextX + r > c.minX && nextX - r < c.maxX && nextZ + r > c.minZ && nextZ - r < c.maxZ) {
            collided = true;
            break;
          }
        }
        if (collided) break;
      }
    }

    if (collided) {
      physics.speed *= -0.35;
    } else {
      const stepDist = Math.hypot(nextX - physics.x, nextZ - physics.z);
      raceState.milesDriven += (stepDist * 2.5) / 1609.34;
      physics.x = nextX;
      physics.z = nextZ;
    }

    playerCar.group.position.set(physics.x, 0, physics.z);
    playerCar.group.rotation.y = physics.heading + physics.driftAngle;
    playerCar.steerPivots.forEach(p => { p.rotation.y = physics.steerAngle; });
    playerCar.wheels.forEach(w => { w.rotation.x += (physics.speed * dt) / 0.38; });
    playerCar.steeringWheel.rotation.z = -physics.steerAngle * 2.4;

    dirLight.position.set(physics.x + 35, 65, physics.z + 25);
    dirLight.target.position.set(physics.x, 0, physics.z);

    if (state.mode === 'openworld') {
      updateInfiniteWorld(physics.x, physics.z);

      npcTrafficCars.forEach(tc => {
        const move = tc.speed * tc.dir * dt;
        if (tc.alongX) {
          tc.car.group.position.x += move;
          tc.car.group.position.z = Math.round(physics.z / 120) * 120 + tc.offset;
          tc.car.group.rotation.y = tc.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (tc.car.group.position.x - physics.x > 260) tc.car.group.position.x = physics.x - 250;
          if (physics.x - tc.car.group.position.x > 260) tc.car.group.position.x = physics.x + 250;
        } else {
          tc.car.group.position.z += move;
          tc.car.group.position.x = Math.round(physics.x / 120) * 120 + tc.offset;
          tc.car.group.rotation.y = tc.dir > 0 ? 0 : Math.PI;
          if (tc.car.group.position.z - physics.z > 260) tc.car.group.position.z = physics.z - 250;
          if (physics.z - tc.car.group.position.z > 260) tc.car.group.position.z = physics.z + 250;
        }
        tc.car.wheels.forEach(w => { w.rotation.x += (tc.speed * dt) / 0.38; });
      });

      pedestrians.forEach(p => {
        p.phase += dt * 7;
        p.legL.rotation.x = Math.sin(p.phase) * 0.5;
        p.legR.rotation.x = -Math.sin(p.phase) * 0.5;
        p.armL.rotation.x = -Math.sin(p.phase) * 0.4;
        p.armR.rotation.x = Math.sin(p.phase) * 0.4;

        p.mesh.position.x += Math.sin(p.angle) * p.speed * dt;
        p.mesh.position.z += Math.cos(p.angle) * p.speed * dt;
        p.mesh.rotation.y = p.angle;

        if (Math.hypot(p.mesh.position.x - physics.x, p.mesh.position.z - physics.z) > 190) {
          p.mesh.position.x = physics.x + (Math.random() - 0.5) * 160;
          p.mesh.position.z = physics.z + (Math.random() - 0.5) * 160;
        }
      });

      nearGasStation = gasStations.find(g => Math.hypot(g.x - physics.x, g.z - physics.z) < 9.5) || null;
      nearRaceZone = raceZones.find(r => Math.hypot(r.x - physics.x, r.z - physics.z) < 9.5) || null;

      const promptEl = document.getElementById('interaction-prompt');
      if (nearGasStation) {
        promptEl.innerHTML = '⛽ Estación de Servicio: Presiona <b>F</b> para recargar Gasolina y Nitro ($150)';
        promptEl.classList.remove('hidden');
      } else if (nearRaceZone) {
        promptEl.innerHTML = '🏁 Zona de Carrera Callejera: Presiona <b>F</b> para iniciar carrera';
        promptEl.classList.remove('hidden');
      } else {
        promptEl.classList.add('hidden');
      }

      if (state.gpsTarget) {
        gpsWorldLine.visible = true;
        gpsBeacon.visible = true;
        gpsBeacon.position.set(state.gpsTarget.x, 22.5, state.gpsTarget.z);
        gpsLineGeo.setFromPoints([
          new THREE.Vector3(physics.x, 0.35, physics.z),
          new THREE.Vector3(state.gpsTarget.x, 0.35, state.gpsTarget.z)
        ]);
        if (Math.hypot(state.gpsTarget.x - physics.x, state.gpsTarget.z - physics.z) < 12) {
          state.gpsTarget = null;
          gpsWorldLine.visible = false;
          gpsBeacon.visible = false;
          document.getElementById('hud-gps-status').classList.add('hidden');
          showToast('📍 ¡Has llegado a tu destino GPS!');
        }
      }
    }

    if (raceState.active && activeTrackData && !raceState.finished) {
      const cp = activeTrackData.checkpoints[raceState.nextCheckpointIdx];
      activeTrackData.nextCpRing.position.set(cp.x, 4.5, cp.z);
      activeTrackData.nextCpRing.rotation.y += dt * 2.5;

      if (Math.hypot(physics.x - cp.x, physics.z - cp.z) < 16) {
        raceState.nextCheckpointIdx++;
        if (raceState.nextCheckpointIdx >= activeTrackData.checkpoints.length) {
          raceState.nextCheckpointIdx = 0;
          raceState.lap++;
          if (raceState.lap > raceState.totalLaps) {
            raceState.finished = true;
            const prize = 2500 + raceState.totalLaps * 650;
            if (user) { user.credits += prize; AuthManager.saveUser(); }
            document.getElementById('finish-subtitle').textContent =
              `Completaste ${raceState.totalLaps} vueltas (${raceState.milesDriven.toFixed(2)} mi). Premio: +$${prize.toLocaleString()}`;
            document.getElementById('race-finish-modal').classList.remove('hidden');
          } else {
            showToast(`¡Vuelta ${raceState.lap} de ${raceState.totalLaps}!`);
          }
        }
      }

      aiRacers.forEach(ai => {
        ai.t += ai.speedFactor * dt * 60;
        if (ai.t >= 1) ai.t -= 1;
        const pt = activeTrackData.curve.getPointAt(ai.t);
        const tan = activeTrackData.curve.getTangentAt(ai.t);
        ai.car.group.position.copy(pt);
        ai.car.group.rotation.y = Math.atan2(tan.x, tan.z);
      });

      document.getElementById('hud-race-progress').textContent =
        `Vuelta ${Math.min(raceState.lap, raceState.totalLaps)} / ${raceState.totalLaps} • ${raceState.milesDriven.toFixed(2)} / ${raceState.milesGoal} Mi`;
    }

    if (state.mode === 'multiplayer' && user) {
      const now = performance.now();
      if (now - lastMpSync > 120) {
        lastMpSync = now;
        MultiplayerManager.syncPlayerPosition(user.id, {
          x: physics.x, z: physics.z, heading: physics.heading, speed: physics.speed, lap: raceState.lap
        });
      }
      const room = MultiplayerManager.getRoom();
      if (room && room.players) {
        Object.values(room.players).forEach(rp => {
          if (rp.id === user.id) return;
          if (!remoteCarMeshes[rp.id]) {
            const rm = CarCatalog.getById(rp.modelId || 'supra_mk4');
            const rc = createCarModel(rp.color || '#38bdf8', rm.bodyStyle);
            scene.add(rc.group);
            remoteCarMeshes[rp.id] = rc;
          }
          const mesh = remoteCarMeshes[rp.id].group;
          mesh.position.lerp(new THREE.Vector3(rp.x || 0, 0, rp.z || 0), 0.35);
          mesh.rotation.y = rp.heading || 0;
        });
      }
    }

    // Lectura real de KM/H calibrada con las velocidades oficiales del catálogo
    const speedKmh = Math.abs(physics.speed) * 4.2;
    if (engineOsc1 && engineGain && audioCtx) {
      const rpmRatio = Math.min(1, Math.abs(physics.speed) / Math.max(8, gearMaxSpeed));
      const baseHz = 48 + rpmRatio * 145 + (usingNitro ? 35 : 0);
      engineOsc1.frequency.setTargetAtTime(baseHz, audioCtx.currentTime, 0.05);
      engineOsc2.frequency.setTargetAtTime(baseHz * 2, audioCtx.currentTime, 0.05);
      engineFilter.frequency.setTargetAtTime(220 + rpmRatio * 720, audioCtx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(0.035 + rpmRatio * 0.055, audioCtx.currentTime, 0.05);
    }

    document.getElementById('hud-speed').textContent = Math.round(speedKmh);
    document.getElementById('hud-miles-driven').textContent = raceState.milesDriven.toFixed(2);
    document.getElementById('hud-gear').textContent = physics.speed < -0.5 ? 'R' : physics.gear;
    document.getElementById('bar-fuel').style.width = `${physics.fuel}%`;
    document.getElementById('bar-nitro').style.width = `${physics.nitro}%`;

    if (state.mapOpen) drawGpsMap();

    if (state.firstPerson) {
      const driverPos = new THREE.Vector3(0.38, 1.22, 0.12).applyMatrix4(playerCar.group.matrixWorld);
      camera.position.copy(driverPos);
      const lookPt = new THREE.Vector3(0.38, 1.15, 14).applyMatrix4(playerCar.group.matrixWorld);
      camera.lookAt(lookPt);
    } else {
      const yaw = physics.heading + physics.driftAngle * 0.45;
      const dist = 6.8 + (speedKmh / 350) * 1.8;
      const targetCam = new THREE.Vector3(
        physics.x - Math.sin(yaw) * dist,
        2.65,
        physics.z - Math.cos(yaw) * dist
      );
      camera.position.lerp(targetCam, 1 - Math.exp(-10 * dt));
      camera.lookAt(physics.x + Math.sin(yaw) * 4, 1.15, physics.z + Math.cos(yaw) * 4);
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const savedUser = AuthManager.loadUser();
  if (savedUser) {
    goToMainMenu();
  }
  applyDayNight();
  animate();
})();