// Generador de Pistas Profesionales (F1, Drag, Touge Montaña, Óvalo Extremo, Técnico)
const TrackBuilder = (() => {
  function getTrackWaypoints(type, miles) {
    const targetPerimeter = miles * 620;
    let basePoints = [];

    if (type === 'drag') {
      basePoints = [
        { x: 0, z: 0 }, { x: 0, z: 320 }, { x: 35, z: 365 },
        { x: 75, z: 320 }, { x: 75, z: 0 }, { x: 38, z: -45 }
      ];
    } else if (type === 'oval') {
      // Óvalo de Alta Velocidad para probar velocidades máximas de +450 km/h
      basePoints = [
        { x: 0, z: 0 }, { x: 0, z: 360 }, { x: 110, z: 460 },
        { x: 240, z: 360 }, { x: 240, z: 0 }, { x: 110, z: -100 }
      ];
    } else if (type === 'touge') {
      // Ruta de Montaña estilo Initial D (curvas enlazadas y horquillas)
      basePoints = [
        { x: 0, z: 0 }, { x: 15, z: 110 }, { x: 95, z: 145 },
        { x: 30, z: 210 }, { x: 130, z: 255 }, { x: 60, z: 330 },
        { x: 185, z: 350 }, { x: 220, z: 210 }, { x: 165, z: 110 },
        { x: 210, z: 20 }, { x: 110, z: -45 }, { x: 40, z: 10 }
      ];
    } else if (type === 'technical') {
      basePoints = [
        { x: 0, z: 0 }, { x: 0, z: 130 }, { x: 70, z: 175 },
        { x: 35, z: 245 }, { x: 140, z: 275 }, { x: 185, z: 185 },
        { x: 120, z: 115 }, { x: 175, z: 35 }, { x: 100, z: -35 },
        { x: 42, z: 25 }
      ];
    } else {
      // Circuito Gran Premio
      basePoints = [
        { x: 0, z: 0 }, { x: 0, z: 220 }, { x: 60, z: 280 },
        { x: 155, z: 255 }, { x: 185, z: 160 }, { x: 125, z: 105 },
        { x: 165, z: 30 }, { x: 95, z: -40 }, { x: 25, z: -40 }
      ];
    }

    let rawLen = 0;
    for (let i = 0; i < basePoints.length; i++) {
      const a = basePoints[i];
      const b = basePoints[(i + 1) % basePoints.length];
      rawLen += Math.hypot(b.x - a.x, b.z - a.z);
    }

    const scale = targetPerimeter / rawLen;
    return basePoints.map(p => new THREE.Vector3(p.x * scale, 0, p.z * scale));
  }

  function buildTrackMesh(scene, type, miles) {
    const group = new THREE.Group();
    const waypoints = getTrackWaypoints(type, miles);
    const curve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.35);

    const roadWidth = type === 'oval' ? 26 : 20;
    const segments = Math.max(180, Math.floor(miles * 110));
    const sampled = curve.getSpacedPoints(segments);

    const positions = [];
    const uvs = [];
    const indices = [];
    const barrierTransforms = [];

    for (let i = 0; i <= segments; i++) {
      const pt = sampled[i % segments];
      const nextPt = sampled[(i + 1) % segments];
      const tangent = new THREE.Vector3().subVectors(nextPt, pt).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      const left = pt.clone().addScaledVector(normal, roadWidth / 2);
      const right = pt.clone().addScaledVector(normal, -roadWidth / 2);

      positions.push(left.x, 0.08, left.z);
      positions.push(right.x, 0.08, right.z);

      const v = (i / segments) * (miles * 20);
      uvs.push(0, v, 1, v);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);

        if (i % 2 === 0) {
          const rotY = Math.atan2(tangent.x, tangent.z);
          const bL = pt.clone().addScaledVector(normal, roadWidth / 2 + 1.2);
          const bR = pt.clone().addScaledVector(normal, -(roadWidth / 2 + 1.2));
          barrierTransforms.push({ x: bL.x, z: bL.z, rotY, red: (i / 2) % 2 === 0 });
          barrierTransforms.push({ x: bR.x, z: bR.z, rotY, red: (i / 2) % 2 !== 0 });
        }
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = type === 'touge' ? '#1e242b' : '#1b202c';
    ctx.fillRect(0, 0, 256, 256);

    const curbColor = type === 'touge' ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = curbColor;
    ctx.fillRect(0, 0, 18, 128);
    ctx.fillRect(238, 0, 18, 128);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 128, 18, 128);
    ctx.fillRect(238, 128, 18, 128);

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(125, 25, 6, 85);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    const roadMesh = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.12 })
    );
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    const barGeo = new THREE.BoxGeometry(0.6, 1.1, 4.2);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    const barInst = new THREE.InstancedMesh(barGeo, barMat, barrierTransforms.length);
    const dummy = new THREE.Object3D();
    const cRed = new THREE.Color(type === 'touge' ? 0xf59e0b : 0xef4444);
    const cWhite = new THREE.Color(0xf8fafc);

    barrierTransforms.forEach((b, i) => {
      dummy.position.set(b.x, 0.55, b.z);
      dummy.rotation.set(0, b.rotY, 0);
      dummy.updateMatrix();
      barInst.setMatrixAt(i, dummy.matrix);
      barInst.setColorAt(i, b.red ? cRed : cWhite);
    });
    group.add(barInst);

    const startPt = sampled[0];
    const dirPt = sampled[1];
    const startAngle = Math.atan2(dirPt.x - startPt.x, dirPt.z - startPt.z);

    const gateGroup = new THREE.Group();
    gateGroup.position.copy(startPt);
    gateGroup.rotation.y = startAngle;

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7 });
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.5, 0.9), pillarMat);
    pL.position.set(roadWidth / 2 + 0.6, 3.75, 0);
    const pR = pL.clone();
    pR.position.x = -(roadWidth / 2 + 0.6);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(roadWidth + 2.2, 1.5, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x0f172a })
    );
    banner.position.set(0, 7.2, 0);

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(6, 5, 28),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    );
    stand.position.set(roadWidth / 2 + 6.5, 2.5, 0);

    gateGroup.add(pL, pR, banner, stand);
    group.add(gateGroup);

    const checkpointCount = 12;
    const checkpoints = [];
    for (let c = 1; c <= checkpointCount; c++) {
      const idx = Math.floor((c / checkpointCount) * (segments - 1));
      checkpoints.push(sampled[idx]);
    }

    const nextCpRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.28, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    nextCpRing.position.set(checkpoints[0].x, 4.5, checkpoints[0].z);
    group.add(nextCpRing);

    scene.add(group);
    return { group, curve, checkpoints, nextCpRing, startPos: startPt, startAngle };
  }

  return { buildTrackMesh };
})();