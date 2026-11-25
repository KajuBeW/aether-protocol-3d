/**
 * AETHER PROTOCOL - Articulated 3D Weapon Viewmodel, Live Digital Gun Screen,
 * Holographic ADS Sight, Recoil/Sway Physics, Ballistics, Grenades & Auto-Turrets
 */
class WeaponSystem {
  constructor(THREE, camera, scene, world, sound, textures) {
    this.THREE = THREE;
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.sound = sound;
    this.textures = textures;

    this.damageMultiplier = 1.0;
    this.fireRateMultiplier = 1.0;

    this.weapons = [
      {
        id: 'ar',
        name: 'VORTEX AR-9',
        slotLabel: '1: AR-9',
        magSize: 32,
        mag: 32,
        reserve: Infinity, // Infinite tactical reserve, reload-based pacing
        fireInterval: 0.092,
        reloadTime: 1.35,
        damage: 24,
        critMult: 2.1,
        pellets: 1,
        spreadHip: 0.016,
        spreadAds: 0.0025,
        recoilKickZ: 0.055,
        recoilPitch: 0.018,
        adsFov: 58,
        color: 0x00f0ff,
        colorCss: '#00f0ff',
        auto: true,
        pierce: false
      },
      {
        id: 'shotgun',
        name: 'TITAN SG-4',
        slotLabel: '2: SG-4',
        magSize: 8,
        mag: 8,
        reserve: Infinity,
        fireInterval: 0.62,
        reloadTime: 1.65,
        damage: 19, // x10 pellets = 190 close-range burst!
        critMult: 1.75,
        pellets: 10,
        spreadHip: 0.068,
        spreadAds: 0.038,
        recoilKickZ: 0.135,
        recoilPitch: 0.052,
        adsFov: 64,
        color: 0xffae00,
        colorCss: '#ffae00',
        auto: false,
        pierce: false
      },
      {
        id: 'railgun',
        name: 'HYPERION LANCE',
        slotLabel: '3: RAIL',
        magSize: 5,
        mag: 5,
        reserve: Infinity,
        fireInterval: 0.88,
        reloadTime: 1.75,
        damage: 118,
        critMult: 2.75, // Devastating headshot / core pierce!
        pellets: 1,
        spreadHip: 0.022,
        spreadAds: 0.0003,
        recoilKickZ: 0.16,
        recoilPitch: 0.062,
        adsFov: 40,
        color: 0xc850ff,
        colorCss: '#c850ff',
        auto: false,
        pierce: true
      }
    ];

    this.currentIndex = 0;
    this.cooldown = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAds = false;
    this.adsBlend = 0;

    // Procedural viewmodel springs
    this.swayX = 0;
    this.swayY = 0;
    this.recoilZ = 0;
    this.recoilRotX = 0;
    this.bobPhase = 0;
    this.equipOffset = 0;

    // Active FX lists
    this.tracers = [];
    this.particles = [];
    this.casings = [];
    this.shockwaves = [];
    this.grenades = [];
    this.turrets = [];

    this.raycaster = new THREE.Raycaster();
    this._buildViewmodel();
    this._applyWeaponVisuals();
  }

  get current() {
    return this.weapons[this.currentIndex];
  }

  reset() {
    this.grenades.forEach(g => this.scene.remove(g.mesh));
    this.turrets.forEach(t => this.scene.remove(t.group));
    this.grenades = [];
    this.turrets = [];
    this.isReloading = false;
    this.isAds = false;
    this.adsBlend = 0;
    this.cooldown = 0;
    this.recoilZ = 0;
    this.recoilRotX = 0;
    this.weapons.forEach(w => { w.mag = w.magSize; });
    this.currentIndex = 0;
    this._applyWeaponVisuals();
  }

  _buildViewmodel() {
    const THREE = this.THREE;

    this.rig = new THREE.Group();
    this.gunGroup = new THREE.Group();
    this.rig.add(this.gunGroup);
    this.camera.add(this.rig);

    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x222a36,
      metalness: 0.88,
      roughness: 0.26
    });
    const darkGrip = new THREE.MeshStandardMaterial({
      color: 0x11151d,
      metalness: 0.35,
      roughness: 0.72
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x93a8c4,
      metalness: 0.95,
      roughness: 0.16
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.6,
      roughness: 0.2
    });

    // Main Receiver Body
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.105, 0.44), gunMetal);
    receiver.position.set(0, 0, -0.04);
    this.gunGroup.add(receiver);

    // Upper Picatinny / Tech Rail
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.022, 0.38), darkGrip);
    topRail.position.set(0, 0.062, -0.04);
    this.gunGroup.add(topRail);

    // Ergonomic Pistol Grip & Trigger Guard
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.13, 0.075), darkGrip);
    grip.position.set(0, -0.095, 0.09);
    grip.rotation.x = 0.28;
    this.gunGroup.add(grip);

    // Magazine
    this.magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.085), darkGrip);
    this.magMesh.position.set(0, -0.105, -0.08);
    this.magMesh.rotation.x = -0.14;
    this.gunGroup.add(this.magMesh);

    // Glowing Energy Strips along Receiver Sides
    [-0.043, 0.043].forEach(sx => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.014, 0.32), this.accentMat);
      strip.position.set(sx, 0.015, -0.06);
      this.gunGroup.add(strip);
    });

    // Holographic Reflex Optic Housing (Aligned so lens center is at y = +0.108)
    const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.018, 0.09), darkGrip);
    opticBase.position.set(0, 0.08, -0.02);
    this.gunGroup.add(opticBase);

    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.048, 0.07), gunMetal);
    frameL.position.set(-0.026, 0.108, -0.02);
    const frameR = frameL.clone();
    frameR.position.x = 0.026;
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.007, 0.07), gunMetal);
    frameTop.position.set(0, 0.132, -0.02);
    this.gunGroup.add(frameL, frameR, frameTop);

    // Translucent Holo Lens + Glowing Reticle Ring
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    });
    this.holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.04), lensMat);
    this.holoLens.position.set(0, 0.108, -0.02);
    this.gunGroup.add(this.holoLens);

    this.holoReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.0045, 0.0068, 20),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, depthWrite: false })
    );
    this.holoReticle.position.set(0, 0.108, -0.021);
    this.gunGroup.add(this.holoReticle);

    // Live CanvasTexture Digital Ammo Readout Screen on Rear of Receiver!
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 128;
    this.screenCanvas.height = 64;
    this.screenCtx = this.screenCanvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.058, 0.03),
      new THREE.MeshBasicMaterial({ map: this.screenTex })
    );
    screenMesh.position.set(0, 0.038, 0.182);
    this.gunGroup.add(screenMesh);

    // Weapon-specific Front Barrel Assemblies
    // 1. AR-9 Barrel
    this.arAttachment = new THREE.Group();
    const arShroud = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.078, 0.28), gunMetal);
    arShroud.position.set(0, 0.002, -0.36);
    const arBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 12), chromeMat);
    arBarrel.rotation.x = Math.PI / 2;
    arBarrel.position.set(0, 0.008, -0.54);
    this.arAttachment.add(arShroud, arBarrel);
    this.gunGroup.add(this.arAttachment);

    // 2. Shotgun Dual-Tube Heavy Assembly
    this.sgAttachment = new THREE.Group();
    const sgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 12), gunMetal);
    sgUpper.rotation.x = Math.PI / 2;
    sgUpper.position.set(0, 0.018, -0.42);
    const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.055, 0.24), darkGrip);
    sgPump.position.set(0, -0.028, -0.38);
    const sgHeat = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.014, 0.2), this.accentMat);
    sgHeat.position.set(0, 0.032, -0.38);
    this.sgAttachment.add(sgUpper, sgPump, sgHeat);
    this.gunGroup.add(this.sgAttachment);

    // 3. Railgun Split Magnetic Rails Assembly
    this.railAttachment = new THREE.Group();
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.036, 0.56), gunMetal);
    railL.position.set(-0.028, 0.008, -0.48);
    const railR = railL.clone();
    railR.position.x = 0.028;
    const railCore = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.52, 10), this.accentMat);
    railCore.rotation.x = Math.PI / 2;
    railCore.position.set(0, 0.008, -0.46);
    this.railAttachment.add(railL, railR, railCore);
    this.gunGroup.add(this.railAttachment);

    // Muzzle Point & Additive Muzzle Flash Sprite
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.01, -0.68);
    this.gunGroup.add(this.muzzlePoint);

    this.muzzleFlashMat = new THREE.SpriteMaterial({
      map: this.textures.glowSprite,
      color: 0x00f0ff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.muzzleSprite = new THREE.Sprite(this.muzzleFlashMat);
    this.muzzleSprite.scale.set(0.32, 0.32, 1);
    this.muzzlePoint.add(this.muzzleSprite);

    // Default hipfire rig offset
    this.rig.position.set(0.23, -0.21, -0.38);
  }

  _updateGunScreen() {
    const ctx = this.screenCtx;
    const w = this.current;
    ctx.fillStyle = '#060c16';
    ctx.fillRect(0, 0, 128, 64);

    ctx.strokeStyle = w.colorCss;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 122, 58);

    ctx.fillStyle = w.colorCss;
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.isReloading ? 'YÜKLENİYOR' : w.id.toUpperCase(), 64, 19);

    ctx.fillStyle = w.mag <= Math.ceil(w.magSize * 0.25) ? '#ff2a55' : '#ffffff';
    ctx.font = 'bold 30px Orbitron, monospace';
    ctx.fillText(String(w.mag).padStart(2, '0'), 64, 51);

    this.screenTex.needsUpdate = true;
  }

  _applyWeaponVisuals() {
    const w = this.current;
    this.accentMat.color.setHex(w.color);
    this.accentMat.emissive.setHex(w.color);
    this.holoReticle.material.color.setHex(w.color);
    this.holoLens.material.color.setHex(w.color);
    this.muzzleFlashMat.color.setHex(w.color);

    this.arAttachment.visible = w.id === 'ar';
    this.sgAttachment.visible = w.id === 'shotgun';
    this.railAttachment.visible = w.id === 'railgun';

    this.muzzlePoint.position.z = w.id === 'railgun' ? -0.76 : (w.id === 'ar' ? -0.66 : -0.62);
    this._updateGunScreen();
  }

  switchWeapon(index) {
    if (index < 0 || index >= this.weapons.length || index === this.currentIndex) return;
    this.isReloading = false;
    this.currentIndex = index;
    this.equipOffset = -0.18;
    this.cooldown = 0.18;
    this._applyWeaponVisuals();
  }

  startReload() {
    const w = this.current;
    if (this.isReloading || w.mag >= w.magSize) return;
    this.isReloading = true;
    this.reloadTimer = w.reloadTime / this.fireRateMultiplier;
    this.sound.playReload();
    this._updateGunScreen();
  }

  addMouseSway(dx, dy) {
    this.swayX = Math.max(-0.045, Math.min(0.045, this.swayX - dx * 0.00018));
    this.swayY = Math.max(-0.045, Math.min(0.045, this.swayY + dy * 0.00018));
  }

  /**
   * Fires current weapon, performs raycast against world + enemy hitboxes,
   * spawns tracers, muzzle flash, shell casings, impact sparks, and returns camera recoil kick.
   */
  tryFire(enemyManager, onHitFeedback) {
    const THREE = this.THREE;
    const w = this.current;

    if (this.isReloading || this.cooldown > 0) return null;
    if (w.mag <= 0) {
      this.startReload();
      return null;
    }

    w.mag--;
    this.cooldown = w.fireInterval / this.fireRateMultiplier;
    this._updateGunScreen();

    // Audio & Muzzle Flash
    this.sound.playWeaponFire(w.id);
    this.muzzleFlashMat.opacity = 0.95;
    const flashScale = w.id === 'shotgun' ? 0.52 : (w.id === 'railgun' ? 0.45 : 0.3);
    this.muzzleSprite.scale.set(flashScale, flashScale, 1);

    const muzzleWorld = new THREE.Vector3();
    this.muzzlePoint.getWorldPosition(muzzleWorld);
    this.world.spawnDynamicFlash(muzzleWorld, w.color, w.id === 'shotgun' ? 6.5 : 4.2, 13, 0.08);

    // Eject physical shell casing for AR & Shotgun
    if (w.id !== 'railgun') {
      this._spawnShellCasing(muzzleWorld, w.id === 'shotgun' ? 0xd9381e : 0xd4af37);
    }

    // Viewmodel recoil kick
    this.recoilZ = Math.min(0.22, this.recoilZ + w.recoilKickZ * (this.isAds ? 0.65 : 1.0));
    this.recoilRotX = Math.min(0.25, this.recoilRotX + w.recoilPitch * (this.isAds ? 0.6 : 1.0));

    // Raycast pellets
    const spread = this.isAds ? w.spreadAds : w.spreadHip;
    const hitMeshes = enemyManager.getHitboxMeshes();
    let anyHit = false;
    let anyCrit = false;

    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    for (let p = 0; p < w.pellets; p++) {
      const rx = (Math.random() - 0.5) * 2 * spread;
      const ry = (Math.random() - 0.5) * 2 * spread;
      const dir = camForward.clone()
        .addScaledVector(camRight, rx)
        .addScaledVector(camUp, ry)
        .normalize();

      this.raycaster.set(camPos, dir);
      this.raycaster.far = 130;

      // 1. Check solid world geometry distance first
      const worldHits = this.raycaster.intersectObjects(this.world.worldMeshes, false);
      const maxDist = worldHits.length > 0 ? worldHits[0].distance : 120;
      let endPoint = worldHits.length > 0
        ? worldHits[0].point.clone()
        : camPos.clone().addScaledVector(dir, 120);

      // 2. Check enemy hitboxes closer than wall
      const enemyHits = this.raycaster.intersectObjects(hitMeshes, false);
      const hitEnemyIds = new Set();

      for (let h = 0; h < enemyHits.length; h++) {
        const eh = enemyHits[h];
        if (eh.distance > maxDist) break;

        const eId = eh.object.userData.enemyId;
        if (hitEnemyIds.has(eId)) continue; // Avoid hitting multiple parts of same robot with 1 ray
        hitEnemyIds.add(eId);

        const isCrit = !!eh.object.userData.isWeakspot;
        const rawDmg = w.damage * this.damageMultiplier * (isCrit ? w.critMult : 1.0);
        const finalDmg = Math.round(rawDmg);

        enemyManager.damageEnemy(eId, finalDmg, isCrit, dir, eh.point);
        this.spawnImpactSparks(eh.point, isCrit ? 0xffd700 : w.color, isCrit ? 14 : 7);

        anyHit = true;
        if (isCrit) anyCrit = true;

        if (onHitFeedback) {
          onHitFeedback(finalDmg, isCrit, eh.point);
        }

        if (!w.pierce) {
          endPoint = eh.point.clone();
          break;
        }
      }

      // If no enemy stopped the ray and it hit a wall, spawn concrete/metal wall sparks
      if ((hitEnemyIds.size === 0 || w.pierce) && worldHits.length > 0) {
        this.spawnImpactSparks(worldHits[0].point, w.color, w.id === 'shotgun' ? 3 : 6);
      }

      // Visual plasma tracer / piercing rail beam
      this._spawnTracer(muzzleWorld, endPoint, w.color, w.id === 'railgun' ? 0.045 : 0.013, w.id === 'railgun' ? 0.32 : 0.075);
    }

    if (anyHit) {
      this.sound.playHitmarker(anyCrit);
    }

    const pitchKick = w.recoilPitch * (this.isAds ? 0.55 : 0.9);
    const yawKick = (Math.random() - 0.5) * pitchKick * 0.45;
    return { pitchKick, yawKick };
  }

  _spawnTracer(start, end, colorHex, radius, duration) {
    const THREE = this.THREE;
    const dist = start.distanceTo(end);
    if (dist < 0.3) return;

    const geo = new THREE.CylinderGeometry(radius, radius, dist, 6, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).lerp(end, 0.5);
    mesh.lookAt(end);
    this.scene.add(mesh);
    this.tracers.push({ mesh, timer: duration, maxTime: duration });
  }

  _spawnShellCasing(origin, colorHex) {
    const THREE = this.THREE;
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6),
      new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.85, roughness: 0.25 })
    );
    mesh.position.copy(origin).addScaledVector(camRight, 0.14);
    this.scene.add(mesh);

    const vel = camRight.multiplyScalar(2.4 + Math.random() * 1.4)
      .addScaledVector(camUp, 1.8 + Math.random() * 1.0);
    this.casings.push({ mesh, vel, life: 1.4 });
  }

  spawnImpactSparks(point, colorHex, count = 8) {
    const THREE = this.THREE;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.045, 0.12),
        new THREE.MeshBasicMaterial({ color: colorHex })
      );
      mesh.position.copy(point);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        1.5 + Math.random() * 6.5,
        (Math.random() - 0.5) * 9
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 0.28 + Math.random() * 0.24 });
    }
  }

  spawnExplosionFX(center, colorHex = 0x00f0ff, radius = 6.5) {
    const THREE = this.THREE;
    this.sound.playExplosion(radius / 5.5);
    this.world.spawnDynamicFlash(center, colorHex, 10.0, radius * 3.0, 0.38);

    // Expanding plasma shockwave sphere + ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.14, 10, 32),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(center);
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, timer: 0.42, maxTime: 0.42, targetScale: radius * 1.35 });

    this.spawnImpactSparks(center, colorHex, 24);
    this.spawnImpactSparks(center, 0xffaa00, 14);
  }

  throwGrenade() {
    const THREE = this.THREE;
    const start = new THREE.Vector3();
    this.camera.getWorldPosition(start);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 14),
      new THREE.MeshStandardMaterial({
        color: 0x1e2836,
        emissive: 0xff3b00,
        emissiveIntensity: 3.0,
        metalness: 0.8,
        roughness: 0.25
      })
    );
    mesh.position.copy(start).addScaledVector(dir, 0.7);
    this.scene.add(mesh);

    const vel = dir.multiplyScalar(21).add(new THREE.Vector3(0, 4.8, 0));
    this.grenades.push({ mesh, vel, fuse: 1.55 });
  }

  deployTurret(playerPos, forwardYaw, turretLevel = 1) {
    const THREE = this.THREE;
    const tx = playerPos.x - Math.sin(forwardYaw) * 2.2;
    const tz = playerPos.z - Math.cos(forwardYaw) * 2.2;
    const ty = Math.max(0, this.world.getRampHeight(tx, tz));

    const group = new THREE.Group();
    group.position.set(tx, ty, tz);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.65, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x1c2636, metalness: 0.85, roughness: 0.3 })
    );
    base.position.y = 0.175;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.75, 10),
      new THREE.MeshStandardMaterial({ color: 0x32425a, metalness: 0.8, roughness: 0.3 })
    );
    stem.position.y = 0.65;

    const head = new THREE.Group();
    head.position.y = 1.08;
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.28, 0.56),
      new THREE.MeshStandardMaterial({ color: 0x203044, metalness: 0.85, roughness: 0.25 })
    );
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x00ff9d, emissive: 0x00ff9d, emissiveIntensity: 3.0 })
    );
    eye.position.z = 0.29;
    head.add(pod, eye);

    group.add(base, stem, head);
    this.scene.add(group);

    this.turrets.push({
      group,
      head,
      life: 24 + turretLevel * 4,
      fireCooldown: 0.2,
      damage: 14 + turretLevel * 6
    });
  }

  update(realDt, worldDt, moveSpeed, isGrounded, isSliding, enemyManager, onExplosionHit) {
    const THREE = this.THREE;
    const w = this.current;

    if (this.cooldown > 0) this.cooldown -= realDt;

    // Reload progression
    if (this.isReloading) {
      this.reloadTimer -= realDt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        w.mag = w.magSize;
        this._updateGunScreen();
      }
    }

    // Muzzle flash quick decay
    if (this.muzzleFlashMat.opacity > 0) {
      this.muzzleFlashMat.opacity = Math.max(0, this.muzzleFlashMat.opacity - realDt * 18);
    }

    // Smooth ADS interpolation: aligns holo lens (y = +0.108) directly to camera center (0, -0.108, -0.26)
    const targetAds = (this.isAds && !this.isReloading) ? 1 : 0;
    this.adsBlend += (targetAds - this.adsBlend) * Math.min(1, realDt * 14);

    // Sway & recoil recovery
    this.swayX += (0 - this.swayX) * Math.min(1, realDt * 10);
    this.swayY += (0 - this.swayY) * Math.min(1, realDt * 10);
    this.recoilZ += (0 - this.recoilZ) * Math.min(1, realDt * 14);
    this.recoilRotX += (0 - this.recoilRotX) * Math.min(1, realDt * 12);
    this.equipOffset += (0 - this.equipOffset) * Math.min(1, realDt * 12);

    // Movement figure-8 bobbing
    let bobX = 0;
    let bobY = 0;
    if (isGrounded && moveSpeed > 0.5 && !isSliding) {
      this.bobPhase += realDt * (moveSpeed > 10 ? 13.5 : 9.2);
      const bobAmp = (1 - this.adsBlend * 0.82) * (moveSpeed > 10 ? 0.014 : 0.008);
      bobX = Math.cos(this.bobPhase * 0.5) * bobAmp;
      bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp;
    }

    const hipX = 0.23, hipY = -0.21, hipZ = -0.38;
    const adsX = 0.0,  adsY = -0.108, adsZ = -0.25;

    this.rig.position.x = THREE.MathUtils.lerp(hipX, adsX, this.adsBlend) + this.swayX + bobX;
    this.rig.position.y = THREE.MathUtils.lerp(hipY, adsY, this.adsBlend) + this.swayY - bobY + this.equipOffset;
    this.rig.position.z = THREE.MathUtils.lerp(hipZ, adsZ, this.adsBlend) + this.recoilZ;

    // Reload & slide tilt on gunGroup
    let reloadTiltX = 0;
    let reloadTiltZ = 0;
    if (this.isReloading) {
      const total = w.reloadTime / this.fireRateMultiplier;
      const p = 1 - this.reloadTimer / total;
      const wave = Math.sin(p * Math.PI);
      reloadTiltX = -wave * 0.55;
      reloadTiltZ = wave * 0.42;
    }

    const slideRoll = isSliding ? -0.24 * (1 - this.adsBlend) : 0;
    this.gunGroup.rotation.set(
      this.recoilRotX + reloadTiltX,
      this.swayX * 1.6,
      reloadTiltZ + slideRoll
    );

    // Update Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.timer -= realDt;
      if (tr.timer <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mesh.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        tr.mesh.material.opacity = tr.timer / tr.maxTime;
      }
    }

    // Update Sparks
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= worldDt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        pt.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else {
        pt.vel.y -= 18 * worldDt;
        pt.mesh.position.addScaledVector(pt.vel, worldDt);
        if (pt.mesh.position.y < 0.04) {
          pt.mesh.position.y = 0.04;
          pt.vel.y *= -0.45;
        }
        pt.mesh.lookAt(pt.mesh.position.clone().add(pt.vel));
      }
    }

    // Update Casings
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const cs = this.casings[i];
      cs.life -= worldDt;
      if (cs.life <= 0) {
        this.scene.remove(cs.mesh);
        cs.mesh.geometry.dispose();
        cs.mesh.material.dispose();
        this.casings.splice(i, 1);
      } else {
        cs.vel.y -= 20 * worldDt;
        cs.mesh.position.addScaledVector(cs.vel, worldDt);
        cs.mesh.rotation.x += 12 * worldDt;
        cs.mesh.rotation.z += 9 * worldDt;
        if (cs.mesh.position.y < 0.03) {
          cs.mesh.position.y = 0.03;
          cs.vel.y *= -0.35;
          cs.vel.x *= 0.7;
          cs.vel.z *= 0.7;
        }
      }
    }

    // Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.timer -= worldDt;
      if (sw.timer <= 0) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const progress = 1 - sw.timer / sw.maxTime;
        const sc = 1 + progress * sw.targetScale;
        sw.mesh.scale.set(sc, sc, 1);
        sw.mesh.material.opacity = (1 - progress) * 0.9;
      }
    }

    // Update Thrown Plasma Grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= worldDt;
      g.vel.y -= 22 * worldDt;
      g.mesh.position.addScaledVector(g.vel, worldDt);

      const floorY = Math.max(0, this.world.getRampHeight(g.mesh.position.x, g.mesh.position.z)) + 0.16;
      if (g.mesh.position.y < floorY) {
        g.mesh.position.y = floorY;
        g.vel.y *= -0.52;
        g.vel.x *= 0.76;
        g.vel.z *= 0.76;
      }
      const lim = this.world.arenaHalfSize - 0.3;
      if (Math.abs(g.mesh.position.x) > lim) g.vel.x *= -0.6;
      if (Math.abs(g.mesh.position.z) > lim) g.vel.z *= -0.6;

      if (g.fuse <= 0) {
        const boomPos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
        this.grenades.splice(i, 1);

        this.spawnExplosionFX(boomPos, 0xff5500, 8.5);
        enemyManager.applyExplosionDamage(boomPos, 8.8, 210 * this.damageMultiplier, onExplosionHit);
      }
    }

    // Update Allied Auto-Turrets
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.life -= worldDt;
      if (t.life <= 0) {
        this.scene.remove(t.group);
        this.turrets.splice(i, 1);
        continue;
      }

      t.fireCooldown -= worldDt;
      const target = enemyManager.findClosestEnemy(t.group.position, 28);
      if (target) {
        const aimPos = target.group.position.clone().add(new THREE.Vector3(0, target.aimHeight, 0));
        t.head.lookAt(aimPos);

        if (t.fireCooldown <= 0) {
          t.fireCooldown = 0.24;
          const muzzle = t.group.position.clone().add(new THREE.Vector3(0, 1.08, 0));
          const dir = aimPos.clone().sub(muzzle).normalize();
          this._spawnTracer(muzzle, aimPos, 0x00ff9d, 0.015, 0.08);
          enemyManager.damageEnemy(target.id, Math.round(t.damage * this.damageMultiplier), false, dir, aimPos);
        }
      } else {
        t.head.rotation.y += worldDt * 1.4;
      }
    }
  }
}

window.WeaponSystem = WeaponSystem;
