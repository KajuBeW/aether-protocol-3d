/**
 * AETHER PROTOCOL - 3D Multi-Level Cyber Courtyard, Sky Shader, Weather,
 * Collision Physics (AABB + Ramps + Platforms), Jump Pads & Supply Stations
 */
class ArenaWorld {
  constructor(THREE, scene, textures) {
    this.THREE = THREE;
    this.scene = scene;
    this.textures = textures;

    this.arenaHalfSize = 34; // 68m x 68m playable arena
    this.colliders = [];     // { minX, maxX, minY, maxY, minZ, maxZ }
    this.ramps = [];         // { minX, maxX, minZ, maxZ, yStart, yEnd, dir }
    this.worldMeshes = [];   // Raycast targets for bullets/lasers
    this.jumpPads = [];      // { x, z, radius, boostY, mesh }
    this.supplyPods = [];    // Respawning tactical pickups
    this.spawnPoints = [];

    this.reactorRings = [];
    this.reactorCore = null;
    this.reactorLight = null;

    this.rainSystem = null;
    this.rainCount = 2200;
    this.dynamicLights = [];
    this.lightCursor = 0;

    this._buildLighting();
    this._buildSkyAndMegacity();
    this._buildArenaArchitecture();
    this._buildJumpPadsAndPickups();
    this._buildRain(this.rainCount);
    this._initLightPool();
  }

  _buildLighting() {
    const THREE = this.THREE;

    // Cool moonlight / cyber-sky hemisphere fill
    const hemi = new THREE.HemisphereLight(0x66a8ff, 0x161b29, 0.85);
    this.scene.add(hemi);

    // Main directional key light with crisp PCF soft shadows
    this.dirLight = new THREE.DirectionalLight(0x9ecbff, 2.2);
    this.dirLight.position.set(28, 46, 22);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 120;
    const d = 42;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Warm industrial rim accent from opposite horizon
    const rimLight = new THREE.DirectionalLight(0xff7b38, 0.75);
    rimLight.position.set(-32, 18, -28);
    this.scene.add(rimLight);

    // Central Aether Reactor pulsing point light
    this.reactorLight = new THREE.PointLight(0x00f0ff, 5.5, 32, 1.5);
    this.reactorLight.position.set(0, 5.2, 0);
    this.scene.add(this.reactorLight);

    // Atmospheric exponential fog blending distant skyline
    this.scene.fog = new THREE.FogExp2(0x070d1a, 0.0095);
  }

  _buildSkyAndMegacity() {
    const THREE = this.THREE;

    // Procedural GLSL Twilight Cyber Sky Dome
    const skyGeo = new THREE.SphereGeometry(220, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform float uTime;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);

          vec3 horizonCol = vec3(0.08, 0.16, 0.30);
          vec3 midCol     = vec3(0.03, 0.06, 0.14);
          vec3 zenithCol  = vec3(0.01, 0.015, 0.04);

          vec3 col = mix(horizonCol, midCol, smoothstep(0.0, 0.28, h));
          col = mix(col, zenithCol, smoothstep(0.28, 0.85, h));

          // Subtle sunset / neon glow on western horizon
          float westGlow = pow(max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(-0.75, 0.0, -0.65)))), 5.0);
          col += vec3(0.26, 0.06, 0.18) * westGlow * (1.0 - smoothstep(0.0, 0.35, h));

          // Procedural stars near zenith
          if (h > 0.18) {
            vec2 starUV = floor(dir.xz / (dir.y + 0.15) * 95.0);
            float s = hash(starUV);
            if (s > 0.992) {
              float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + s * 80.0);
              col += vec3(0.75, 0.9, 1.0) * twinkle * smoothstep(0.18, 0.5, h);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyMat = skyMat;
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyMesh);

    // Distant Cyberpunk Megacity Skyline Silhouettes & Neon Billboards
    const windowCanvas = document.createElement('canvas');
    windowCanvas.width = 128;
    windowCanvas.height = 256;
    const wCtx = windowCanvas.getContext('2d');
    wCtx.fillStyle = '#050811';
    wCtx.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 250; y += 8) {
      for (let x = 4; x < 124; x += 8) {
        if (Math.random() > 0.58) {
          const palette = ['#00e5ff', '#39a0ff', '#ff2a6d', '#ffb800', '#a960ff'];
          wCtx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
          wCtx.globalAlpha = 0.35 + Math.random() * 0.65;
          wCtx.fillRect(x, y, 4, 4);
        }
      }
    }
    const winTex = new THREE.CanvasTexture(windowCanvas);
    winTex.wrapS = THREE.RepeatWrapping;
    winTex.wrapT = THREE.RepeatWrapping;
    winTex.colorSpace = THREE.SRGBColorSpace;

    const towerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: winTex
    });

    const towerGroup = new THREE.Group();
    for (let i = 0; i < 52; i++) {
      const angle = (i / 52) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      const dist = 62 + Math.random() * 68;
      const w = 8 + Math.random() * 14;
      const d = 8 + Math.random() * 14;
      const h = 26 + Math.random() * 68;

      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, towerMat);
      mesh.position.set(Math.cos(angle) * dist, h * 0.5 - 4, Math.sin(angle) * dist);
      towerGroup.add(mesh);

      // Occasional glowing neon rooftop crown strip
      if (i % 3 === 0) {
        const neonColor = i % 6 === 0 ? 0x00f0ff : (i % 9 === 0 ? 0xff2a6d : 0x9d4edd);
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5),
          new THREE.MeshBasicMaterial({ color: neonColor })
        );
        crown.position.set(mesh.position.x, h - 4.2, mesh.position.z);
        towerGroup.add(crown);
      }
    }
    this.scene.add(towerGroup);
  }

  _addSolidBox(x, y, z, w, h, d, material, addCollider = true, castShadow = true) {
    const THREE = this.THREE;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.worldMeshes.push(mesh);

    if (addCollider) {
      this.colliders.push({
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minY: y - h * 0.5,
        maxY: y + h * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5
      });
    }
    return mesh;
  }

  _buildArenaArchitecture() {
    const THREE = this.THREE;

    // Shared PBR Materials
    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.floorAlbedo,
      roughnessMap: this.textures.floorRoughness,
      bumpMap: this.textures.floorBump,
      bumpScale: 0.035,
      metalness: 0.22,
      roughness: 1.0,
      envMapIntensity: 1.55
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.textures.metalAlbedo,
      bumpMap: this.textures.metalBump,
      bumpScale: 0.03,
      metalness: 0.78,
      roughness: 0.34,
      envMapIntensity: 1.25
    });

    this.darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 1.3
    });

    this.hazardMat = new THREE.MeshStandardMaterial({
      map: this.textures.hazardAlbedo,
      metalness: 0.45,
      roughness: 0.5
    });

    this.cyanNeonMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.6,
      roughness: 0.2
    });

    this.amberNeonMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 2.3,
      roughness: 0.2
    });

    this.crimsonNeonMat = new THREE.MeshStandardMaterial({
      color: 0xff2a6d,
      emissive: 0xff1e56,
      emissiveIntensity: 2.4,
      roughness: 0.2
    });

    // 1. Main Wet Concrete Courtyard Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.worldMeshes.push(floor);

    // 2. Perimeter Armored Blast Walls (with buttresses & glowing conduits)
    const hs = this.arenaHalfSize;
    const wallH = 7.5;
    this._addSolidBox(0, wallH / 2, -hs - 1, 70, wallH, 2, this.wallMat, true, true);
    this._addSolidBox(0, wallH / 2,  hs + 1, 70, wallH, 2, this.wallMat, true, true);
    this._addSolidBox(-hs - 1, wallH / 2, 0, 2, wallH, 70, this.wallMat, true, true);
    this._addSolidBox( hs + 1, wallH / 2, 0, 2, wallH, 70, this.wallMat, true, true);

    // Neon trim strips along perimeter walls + floodlight towers
    const stripGeoH = new THREE.BoxGeometry(66, 0.16, 0.18);
    const stripGeoV = new THREE.BoxGeometry(0.18, 0.16, 66);
    [-1, 1].forEach(s => {
      const m1 = new THREE.Mesh(stripGeoH, this.cyanNeonMat);
      m1.position.set(0, 5.6, s * (hs - 0.05));
      this.scene.add(m1);

      const m2 = new THREE.Mesh(stripGeoV, this.cyanNeonMat);
      m2.position.set(s * (hs - 0.05), 5.6, 0);
      this.scene.add(m2);
    });

    // Corner Floodlight Towers + Volumetric Light Cones
    const coneGeo = new THREE.ConeGeometry(7.5, 16, 20, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x66dcff,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    [[-32, -32], [32, -32], [-32, 32], [32, 32]].forEach(([cx, cz]) => {
      this._addSolidBox(cx, 6.5, cz, 2.4, 13, 2.4, this.darkMetalMat, true, true);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), this.cyanNeonMat);
      lamp.position.set(cx * 0.94, 12.6, cz * 0.94);
      this.scene.add(lamp);

      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(cx * 0.78, 5.2, cz * 0.78);
      cone.lookAt(cx * 0.4, 0, cz * 0.4);
      cone.rotateX(Math.PI / 2);
      this.scene.add(cone);
    });

    // 3. Central Aether Reactor Spire & Protective Blast Shields
    // Base octagonal pedestal
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 1.1, 8), this.darkMetalMat);
    ped.position.set(0, 0.55, 0);
    ped.receiveShadow = true;
    ped.castShadow = true;
    this.scene.add(ped);
    this.worldMeshes.push(ped);
    this.colliders.push({ minX: -3.6, maxX: 3.6, minY: 0, maxY: 1.1, minZ: -3.6, maxZ: 3.6 });

    // Central core column collider (prevents walking inside core)
    const corePillar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.55, 8.5, 12), this.darkMetalMat);
    corePillar.position.set(0, 4.25, 0);
    corePillar.castShadow = true;
    this.scene.add(corePillar);
    this.worldMeshes.push(corePillar);
    this.colliders.push({ minX: -1.35, maxX: 1.35, minY: 0, maxY: 8.5, minZ: -1.35, maxZ: 1.35 });

    // Glowing levitating Aether Core + 3 Gyroscopic Rings
    this.reactorCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 2),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x00f0ff,
        emissiveIntensity: 3.5,
        roughness: 0.1
      })
    );
    this.reactorCore.position.set(0, 5.2, 0);
    this.scene.add(this.reactorCore);

    const ringRadii = [2.1, 2.75, 3.4];
    ringRadii.forEach((r, idx) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.09, 12, 48),
        idx === 1 ? this.amberNeonMat : this.cyanNeonMat
      );
      ring.position.set(0, 5.2, 0);
      this.scene.add(ring);
      this.reactorRings.push(ring);
    });

    // 4 Tactical Cover Shields around Central Spire
    [
      [0, -7.2, 4.4, 2.1, 0.8],
      [0,  7.2, 4.4, 2.1, 0.8],
      [-7.2, 0, 0.8, 2.1, 4.4],
      [ 7.2, 0, 0.8, 2.1, 4.4]
    ].forEach(([bx, bz, bw, bh, bd]) => {
      this._addSolidBox(bx, bh / 2, bz, bw, bh, bd, this.wallMat, true, true);
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(bw + 0.06, 0.12, bd + 0.06),
        this.cyanNeonMat
      );
      neon.position.set(bx, bh - 0.25, bz);
      this.scene.add(neon);
    });

    // 4. Elevated Tactical Platforms (North & South Overlooks at y = 3.0m) + Smooth Ramps!
    const platH = 3.0;
    // North Overlook Platform (z = -22, x in [-10, 10], z in [-26, -18])
    this._buildElevatedPlatform(0, -22, 18, platH, 7.5, 'north');
    // South Overlook Platform (z = +22, x in [-10, 10], z in [18, 26])
    this._buildElevatedPlatform(0,  22, 18, platH, 7.5, 'south');

    // 5. East & West Industrial Sci-Fi Containers & Pillars (Mid-level cover + Jumpable!)
    const coverConfigs = [
      // West Yard
      { x: -18, z: -8,  w: 3.4, h: 2.8, d: 6.8, accent: this.amberNeonMat },
      { x: -18, z:  8,  w: 3.4, h: 2.8, d: 6.8, accent: this.cyanNeonMat },
      { x: -11, z:  0,  w: 2.2, h: 4.4, d: 2.2, accent: this.crimsonNeonMat },
      // East Yard
      { x:  18, z: -8,  w: 3.4, h: 2.8, d: 6.8, accent: this.cyanNeonMat },
      { x:  18, z:  8,  w: 3.4, h: 2.8, d: 6.8, accent: this.amberNeonMat },
      { x:  11, z:  0,  w: 2.2, h: 4.4, d: 2.2, accent: this.crimsonNeonMat },
      // Diagonal Cover Crates (chest-high cover for ADS gunfights)
      { x: -11, z: -12, w: 3.0, h: 1.55, d: 1.6, accent: this.hazardMat },
      { x:  11, z: -12, w: 3.0, h: 1.55, d: 1.6, accent: this.hazardMat },
      { x: -11, z:  12, w: 3.0, h: 1.55, d: 1.6, accent: this.hazardMat },
      { x:  11, z:  12, w: 3.0, h: 1.55, d: 1.6, accent: this.hazardMat }
    ];

    coverConfigs.forEach(c => {
      this._addSolidBox(c.x, c.h / 2, c.z, c.w, c.h, c.d, this.wallMat, true, true);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(c.w + 0.08, 0.14, c.d + 0.08),
        c.accent
      );
      trim.position.set(c.x, c.h - 0.18, c.z);
      this.scene.add(trim);
    });

    // Enemy Spawn Points distributed cleanly around arena edges & flanks
    this.spawnPoints = [
      { x: -27, y: 0, z: -26 },
      { x:  27, y: 0, z: -26 },
      { x: -27, y: 0, z:  26 },
      { x:  27, y: 0, z:  26 },
      { x: -28, y: 0, z:   0 },
      { x:  28, y: 0, z:   0 },
      { x:   0, y: 3.0, z: -22 },
      { x:   0, y: 3.0, z:  22 }
    ];
  }

  _buildElevatedPlatform(cx, cz, width, height, depth, side) {
    const THREE = this.THREE;

    // Solid deck slab (supported by pillars so it looks architecturally grounded)
    this._addSolidBox(cx, height - 0.3, cz, width, 0.6, depth, this.wallMat, false, true);
    // Walkable top surface collider
    this.colliders.push({
      minX: cx - width / 2,
      maxX: cx + width / 2,
      minY: 0,
      maxY: height,
      minZ: cz - depth / 2,
      maxZ: cz + depth / 2
    });

    // Support columns underneath
    [-width * 0.42, 0, width * 0.42].forEach(ox => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.1, height - 0.6, depth * 0.8), this.darkMetalMat);
      col.position.set(cx + ox, (height - 0.6) / 2, cz);
      col.castShadow = true;
      col.receiveShadow = true;
      this.scene.add(col);
      this.worldMeshes.push(col);
    });

    // Hazard edge trim + tactical half-walls on overlook edge facing center
    const frontZ = side === 'north' ? cz + depth / 2 - 0.25 : cz - depth / 2 + 0.25;
    const edgeStrip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.55), this.hazardMat);
    edgeStrip.position.set(cx, height + 0.02, frontZ);
    this.scene.add(edgeStrip);

    // Two waist-high battlements with a firing gap in the middle
    [-5.2, 5.2].forEach(bx => {
      this._addSolidBox(cx + bx, height + 0.65, frontZ, 4.6, 1.3, 0.5, this.darkMetalMat, true, true);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.1, 0.55), this.cyanNeonMat);
      glow.position.set(cx + bx, height + 1.25, frontZ);
      this.scene.add(glow);
    });

    // Side ramps on BOTH left (x = cx - width/2 - rampLen/2) and right (x = cx + width/2 + rampLen/2)
    const rampLen = 7.5;
    const rampW = 3.8;
    const slopeAngle = Math.atan2(height, rampLen);
    const diagLen = Math.hypot(rampLen, height);

    // Left Ramp (ascends from -X toward +X onto platform)
    const leftRampX = cx - width / 2 - rampLen / 2;
    const leftRampMesh = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.45, rampW), this.wallMat);
    leftRampMesh.position.set(leftRampX, height / 2 - 0.15, cz);
    leftRampMesh.rotation.z = slopeAngle;
    leftRampMesh.castShadow = true;
    leftRampMesh.receiveShadow = true;
    this.scene.add(leftRampMesh);
    this.worldMeshes.push(leftRampMesh);

    this.ramps.push({
      minX: cx - width / 2 - rampLen,
      maxX: cx - width / 2 + 0.2,
      minZ: cz - rampW / 2,
      maxZ: cz + rampW / 2,
      dir: 'posX', // height goes 0 -> height as X increases
      height
    });

    // Right Ramp (ascends from +X toward -X onto platform)
    const rightRampX = cx + width / 2 + rampLen / 2;
    const rightRampMesh = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.45, rampW), this.wallMat);
    rightRampMesh.position.set(rightRampX, height / 2 - 0.15, cz);
    rightRampMesh.rotation.z = -slopeAngle;
    rightRampMesh.castShadow = true;
    rightRampMesh.receiveShadow = true;
    this.scene.add(rightRampMesh);
    this.worldMeshes.push(rightRampMesh);

    this.ramps.push({
      minX: cx + width / 2 - 0.2,
      maxX: cx + width / 2 + rampLen,
      minZ: cz - rampW / 2,
      maxZ: cz + rampW / 2,
      dir: 'negX', // height goes 0 -> height as X decreases
      height
    });
  }

  _buildJumpPadsAndPickups() {
    const THREE = this.THREE;

    // 4 Kinetic Corner Jump Pads
    const padCoords = [
      [-25, -16],
      [ 25, -16],
      [-25,  16],
      [ 25,  16]
    ];

    padCoords.forEach(([px, pz]) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.24, 24), this.darkMetalMat);
      base.position.set(px, 0.12, pz);
      base.receiveShadow = true;
      this.scene.add(base);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.25, 0.11, 10, 32),
        this.cyanNeonMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, 0.26, pz);
      this.scene.add(ring);

      const inner = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.85, 24),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
      );
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(px, 0.26, pz);
      this.scene.add(inner);

      this.jumpPads.push({ x: px, z: pz, radius: 1.65, boostY: 16.5, ring, inner });
    });

    // 4 Respawning Holographic Supply Stations
    const podSpecs = [
      { x: -14, y: 0, z:  0,   type: 'health',    color: 0x00ff9d, label: 'NANO-CAN' },
      { x:  14, y: 0, z:  0,   type: 'shield',    color: 0x00f0ff, label: 'KALKAN HÜCRESİ' },
      { x:   0, y: 3.0, z: -22, type: 'ammo',      color: 0xffae00, label: 'CEPHANE & BOMBA' },
      { x:   0, y: 3.0, z:  22, type: 'overdrive', color: 0xb84dff, label: 'KRONOS ENERJİSİ' }
    ];

    podSpecs.forEach(spec => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.2, 16), this.darkMetalMat);
      pad.position.set(spec.x, spec.y + 0.1, spec.z);
      this.scene.add(pad);

      const holoMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 2.5,
        roughness: 0.15,
        metalness: 0.3
      });

      const iconGroup = new THREE.Group();
      iconGroup.position.set(spec.x, spec.y + 1.15, spec.z);

      if (spec.type === 'health') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.24, 0.24), holoMat);
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), holoMat);
        iconGroup.add(b1, b2);
      } else if (spec.type === 'shield') {
        const oct = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), holoMat);
        iconGroup.add(oct);
      } else if (spec.type === 'ammo') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 0.42), holoMat);
        iconGroup.add(box);
      } else {
        const tor = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.08, 48, 8), holoMat);
        iconGroup.add(tor);
      }

      this.scene.add(iconGroup);
      this.supplyPods.push({
        ...spec,
        iconGroup,
        active: true,
        cooldown: 0,
        respawnTime: 16
      });
    });
  }

  _buildRain(count) {
    const THREE = this.THREE;
    if (this.rainSystem) {
      this.scene.remove(this.rainSystem);
      this.rainSystem.geometry.dispose();
      this.rainSystem.material.dispose();
    }
    this.rainCount = count;
    if (count <= 0) {
      this.rainSystem = null;
      return;
    }

    const positions = new Float32Array(count * 6); // 2 vertices per rain streak
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 76;
      const y = Math.random() * 34;
      const z = (Math.random() - 0.5) * 76;
      const idx = i * 6;
      positions[idx]     = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x - 0.12;
      positions[idx + 4] = y - 0.95;
      positions[idx + 5] = z - 0.08;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x8ccdff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    this.rainSystem = new THREE.LineSegments(geo, mat);
    this.scene.add(this.rainSystem);
  }

  setQuality(preset) {
    if (preset === 'ultra') {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(2048, 2048);
      this._buildRain(2400);
    } else if (preset === 'high') {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
      this._buildRain(1200);
    } else {
      this.dirLight.castShadow = false;
      this._buildRain(400);
    }
    if (this.dirLight.shadow.map) {
      this.dirLight.shadow.map.dispose();
      this.dirLight.shadow.map = null;
    }
  }

  _initLightPool() {
    const THREE = this.THREE;
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0x00f0ff, 0, 14, 1.8);
      pl.position.set(0, -50, 0);
      this.scene.add(pl);
      this.dynamicLights.push({ light: pl, timer: 0, maxTime: 0.1, peakIntensity: 0 });
    }
  }

  spawnDynamicFlash(pos, colorHex, intensity = 5.0, distance = 14, duration = 0.14) {
    const slot = this.dynamicLights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.dynamicLights.length;
    slot.light.color.setHex(colorHex);
    slot.light.position.copy(pos);
    slot.light.distance = distance;
    slot.light.intensity = intensity;
    slot.peakIntensity = intensity;
    slot.timer = duration;
    slot.maxTime = duration;
  }

  // Computes highest walkable ramp surface at (x, z)
  getRampHeight(x, z) {
    let best = -1;
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        let t = 0;
        if (r.dir === 'posX') {
          t = (x - r.minX) / (r.maxX - r.minX);
        } else if (r.dir === 'negX') {
          t = (r.maxX - x) / (r.maxX - r.minX);
        }
        const h = Math.max(0, Math.min(r.height, t * r.height));
        if (h > best) best = h;
      }
    }
    return best;
  }

  /**
   * Resolves 3D capsule/cylinder-vs-AABB + Ramps + Arena Bounds collision for the player.
   * Mutates `pos` and `vel`, returns `{ grounded, hitJumpPad }`.
   */
  resolveEntityPhysics(pos, vel, radius, stepHeight = 0.65) {
    let grounded = false;
    let hitJumpPad = false;

    // 1. Clamp inside outer arena walls cleanly
    const lim = this.arenaHalfSize - radius;
    if (pos.x < -lim) { pos.x = -lim; vel.x = 0; }
    if (pos.x >  lim) { pos.x =  lim; vel.x = 0; }
    if (pos.z < -lim) { pos.z = -lim; vel.z = 0; }
    if (pos.z >  lim) { pos.z =  lim; vel.z = 0; }

    // 2. Determine floor / ramp support height
    let supportY = 0;
    const rampY = this.getRampHeight(pos.x, pos.z);
    if (rampY > supportY) supportY = rampY;

    // 3. Check AABB colliders (horizontal push-out OR step-up/stand-on-top)
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        // Check if feet are above or within stepHeight of top of box (e.g. walking from ramp onto platform!)
        if (pos.y >= b.maxY - stepHeight && vel.y <= 2.5) {
          if (b.maxY > supportY) {
            supportY = b.maxY;
          }
        } else if (pos.y + 1.75 > b.minY && pos.y < b.maxY) {
          // Horizontal push out
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            pos.x += (dx / dist) * overlap;
            pos.z += (dz / dist) * overlap;
          } else {
            // Inside box center fallback: push along shallowest axis
            const penLeft = Math.abs(pos.x - b.minX);
            const penRight = Math.abs(b.maxX - pos.x);
            const penBack = Math.abs(pos.z - b.minZ);
            const penFront = Math.abs(b.maxZ - pos.z);
            const m = Math.min(penLeft, penRight, penBack, penFront);
            if (m === penLeft) pos.x = b.minX - radius;
            else if (m === penRight) pos.x = b.maxX + radius;
            else if (m === penBack) pos.z = b.minZ - radius;
            else pos.z = b.maxZ + radius;
          }
        }
      }
    }

    // Snap/land onto supportY
    if (pos.y <= supportY + 0.08 && vel.y <= 0) {
      pos.y = supportY;
      vel.y = 0;
      grounded = true;
    } else if (pos.y < supportY) {
      pos.y = supportY;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
    }

    // 4. Check Jump Pads
    if (pos.y < 0.9) {
      for (let i = 0; i < this.jumpPads.length; i++) {
        const jp = this.jumpPads[i];
        const dx = pos.x - jp.x;
        const dz = pos.z - jp.z;
        if (dx * dx + dz * dz < jp.radius * jp.radius) {
          vel.y = jp.boostY;
          // Subtle inward nudge toward center for epic aerial arcs
          vel.x += (-jp.x * 0.16);
          vel.z += (-jp.z * 0.16);
          grounded = false;
          hitJumpPad = true;
          break;
        }
      }
    }

    return { grounded, hitJumpPad };
  }

  update(dt, elapsed, playerPos, onPickupCallback) {
    if (this.skyMat) {
      this.skyMat.uniforms.uTime.value = elapsed;
    }

    // Animate Central Aether Reactor
    if (this.reactorCore) {
      this.reactorCore.position.y = 5.2 + Math.sin(elapsed * 2.4) * 0.25;
      this.reactorCore.rotation.y += dt * 1.1;
      this.reactorCore.rotation.x += dt * 0.6;
    }
    if (this.reactorLight) {
      this.reactorLight.intensity = 5.0 + Math.sin(elapsed * 4.5) * 1.1;
    }
    this.reactorRings.forEach((ring, idx) => {
      ring.rotation.x += dt * (0.7 + idx * 0.35) * (idx % 2 === 0 ? 1 : -1);
      ring.rotation.y += dt * (0.9 - idx * 0.2);
    });

    // Animate Jump Pads
    this.jumpPads.forEach((jp, idx) => {
      jp.inner.rotation.z = elapsed * 2.5 + idx;
      const pulse = 0.92 + Math.sin(elapsed * 5 + idx) * 0.08;
      jp.ring.scale.set(pulse, pulse, 1);
    });

    // Update Respawning Supply Pods & Check Player Pickup
    for (let i = 0; i < this.supplyPods.length; i++) {
      const pod = this.supplyPods[i];
      if (pod.active) {
        pod.iconGroup.visible = true;
        pod.iconGroup.rotation.y += dt * 2.1;
        pod.iconGroup.position.y = pod.y + 1.15 + Math.sin(elapsed * 3.2 + i) * 0.16;

        if (playerPos) {
          const dx = playerPos.x - pod.x;
          const dy = (playerPos.y + 0.9) - (pod.y + 1.0);
          const dz = playerPos.z - pod.z;
          if (dx * dx + dy * dy + dz * dz < 2.2 * 2.2) {
            const consumed = onPickupCallback ? onPickupCallback(pod) : false;
            if (consumed) {
              pod.active = false;
              pod.cooldown = pod.respawnTime;
              pod.iconGroup.visible = false;
            }
          }
        }
      } else {
        pod.cooldown -= dt;
        if (pod.cooldown <= 0) {
          pod.active = true;
        }
      }
    }

    // Update Rain Streaks
    if (this.rainSystem) {
      const attr = this.rainSystem.geometry.attributes.position;
      const arr = attr.array;
      const fall = 32 * dt;
      const windX = -3.6 * dt;
      const windZ = -2.4 * dt;

      for (let i = 0; i < this.rainCount; i++) {
        const idx = i * 6;
        arr[idx]     += windX;
        arr[idx + 1] -= fall;
        arr[idx + 2] += windZ;
        arr[idx + 3] += windX;
        arr[idx + 4] -= fall;
        arr[idx + 5] += windZ;

        if (arr[idx + 1] < 0) {
          const rx = (playerPos ? playerPos.x : 0) + (Math.random() - 0.5) * 68;
          const rz = (playerPos ? playerPos.z : 0) + (Math.random() - 0.5) * 68;
          const ry = 28 + Math.random() * 8;
          arr[idx]     = rx;
          arr[idx + 1] = ry;
          arr[idx + 2] = rz;
          arr[idx + 3] = rx - 0.12;
          arr[idx + 4] = ry - 0.95;
          arr[idx + 5] = rz - 0.08;
        }
      }
      attr.needsUpdate = true;
    }

    // Update Dynamic Lights Pool
    for (let i = 0; i < this.dynamicLights.length; i++) {
      const slot = this.dynamicLights[i];
      if (slot.timer > 0) {
        slot.timer -= dt;
        const t = Math.max(0, slot.timer / slot.maxTime);
        slot.light.intensity = slot.peakIntensity * t;
      } else {
        slot.light.intensity = 0;
      }
    }
  }
}

window.ArenaWorld = ArenaWorld;
