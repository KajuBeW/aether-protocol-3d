/**
 * AETHER PROTOCOL - Articulated 3D Robotic Enemies, Weakspot Hitboxes,
 * Tactical AI (Aerial Drones, Bipedal Androids, Blade Rushers, Heavy Mechs & Omega Boss)
 */
class EnemyManager {
  constructor(THREE, scene, world, sound) {
    this.THREE = THREE;
    this.scene = scene;
    this.world = world;
    this.sound = sound;

    this.enemies = [];
    this.projectiles = [];
    this.shrapnel = [];
    this.nextId = 1;
    this.onEnemyKilled = null; // (enemy, wasCrit) => void
    this.losRaycaster = new THREE.Raycaster();

    // Shared Base Materials
    this.armorDark = new THREE.MeshStandardMaterial({
      color: 0x1e2533,
      metalness: 0.82,
      roughness: 0.3
    });
    this.armorPlate = new THREE.MeshStandardMaterial({
      color: 0x364359,
      metalness: 0.78,
      roughness: 0.34
    });
    this.bossArmor = new THREE.MeshStandardMaterial({
      color: 0x2b1938,
      metalness: 0.88,
      roughness: 0.22
    });
  }

  clearAll() {
    this.enemies.forEach(e => this.scene.remove(e.group));
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.shrapnel.forEach(s => this.scene.remove(s.mesh));
    this.enemies = [];
    this.projectiles = [];
    this.shrapnel = [];
  }

  getActiveBoss() {
    return this.enemies.find(e => e.type === 'boss') || null;
  }

  getHitboxMeshes() {
    const list = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const hitboxes = this.enemies[i].hitboxes;
      for (let j = 0; j < hitboxes.length; j++) {
        list.push(hitboxes[j]);
      }
    }
    return list;
  }

  findClosestEnemy(origin, maxRange = 40) {
    let best = null;
    let bestDistSq = maxRange * maxRange;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dSq = origin.distanceToSquared(e.group.position);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = e;
      }
    }
    return best;
  }

  spawnEnemy(type, waveNum, spawnPos) {
    const THREE = this.THREE;
    const id = this.nextId++;
    const group = new THREE.Group();
    group.position.copy(spawnPos);

    const hpScale = 1 + (waveNum - 1) * 0.16;
    const hitboxes = [];
    const registerHitbox = (mesh, isWeakspot = false) => {
      mesh.userData.enemyId = id;
      mesh.userData.isWeakspot = isWeakspot;
      mesh.castShadow = true;
      hitboxes.push(mesh);
      return mesh;
    };

    const weakMat = new THREE.MeshStandardMaterial({
      color: 0xff2a55,
      emissive: 0xff1e42,
      emissiveIntensity: 3.2,
      roughness: 0.15
    });

    const flashMat = this.armorPlate.clone();

    let stats = {};
    const animParts = {};

    if (type === 'drone') {
      // WASP-X Aerial Scout Drone
      const hull = registerHitbox(new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), flashMat), false);
      hull.scale.set(1.15, 0.78, 1.25);

      // Glowing Central Optical Sensor (CRIT WEAKSPOT!)
      const eye = registerHitbox(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), weakMat), true);
      eye.position.set(0, -0.04, 0.54);

      // Dual Side Turbine Rotors
      const rotorL = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 8, 20), this.armorDark);
      rotorL.rotation.x = Math.PI / 2;
      rotorL.position.set(-0.78, 0.12, 0);
      const rotorR = rotorL.clone();
      rotorR.position.x = 0.78;

      const wingBar = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.22), this.armorDark), false);
      wingBar.position.set(0, 0.1, 0);

      group.add(hull, eye, rotorL, rotorR, wingBar);
      group.position.y = Math.max(2.8, spawnPos.y + 2.8);

      stats = {
        name: 'WASP-X DRONE',
        maxHp: Math.round(58 * hpScale),
        speed: 6.6,
        preferredDist: 15,
        fireInterval: 2.15,
        damage: 7,
        credits: 30,
        score: 120,
        aimHeight: 0,
        flying: true,
        baseHoverY: 3.0 + Math.random() * 1.4
      };
    } else if (type === 'strider') {
      // STRIDER Cyber-Blade Melee Hunter
      const torso = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.48), flashMat), false);
      torso.position.y = 1.15;
      torso.rotation.x = 0.25;

      const head = registerHitbox(new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), weakMat), true);
      head.position.set(0, 1.68, 0.16);

      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xffae00,
        emissive: 0xff7b00,
        emissiveIntensity: 3.0
      });
      const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.95), bladeMat);
      bladeL.position.set(-0.46, 1.1, 0.42);
      const bladeR = bladeL.clone();
      bladeR.position.x = 0.46;

      const legL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.22), this.armorDark), false);
      legL.position.set(-0.22, 0.45, 0);
      const legR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.22), this.armorDark), false);
      legR.position.set(0.22, 0.45, 0);

      animParts.legL = legL;
      animParts.legR = legR;
      animParts.bladeL = bladeL;
      animParts.bladeR = bladeR;

      group.add(torso, head, bladeL, bladeR, legL, legR);

      stats = {
        name: 'STRIDER İZCİ',
        maxHp: Math.round(85 * hpScale),
        speed: 9.8,
        preferredDist: 1.9,
        fireInterval: 0.85,
        damage: 18,
        credits: 35,
        score: 150,
        aimHeight: 1.25,
        flying: false,
        melee: true
      };
    } else if (type === 'bulwark') {
      // BULWARK Heavy Armored Mech
      const torso = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.32, 0.96), flashMat), false);
      torso.position.y = 1.65;

      // Glowing Chest Reactor Core + Head Sensor (CRIT WEAKSPOTS!)
      const core = registerHitbox(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16), weakMat), true);
      core.rotation.x = Math.PI / 2;
      core.position.set(0, 1.68, 0.48);

      const head = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.48), weakMat), true);
      head.position.set(0, 2.48, 0.08);

      const podL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.68), this.armorDark), false);
      podL.position.set(-0.95, 2.05, 0);
      const podR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.68), this.armorDark), false);
      podR.position.set(0.95, 2.05, 0);

      const legL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.48), this.armorDark), false);
      legL.position.set(-0.42, 0.52, 0);
      const legR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.48), this.armorDark), false);
      legR.position.set(0.42, 0.52, 0);

      animParts.legL = legL;
      animParts.legR = legR;
      group.add(torso, core, head, podL, podR, legL, legR);

      stats = {
        name: 'BULWARK YIKICI',
        maxHp: Math.round(255 * hpScale),
        speed: 3.9,
        preferredDist: 17,
        fireInterval: 2.1,
        damage: 22,
        credits: 75,
        score: 320,
        aimHeight: 1.75,
        flying: false
      };
    } else if (type === 'boss') {
      // OMEGA COLOSSUS - Multi-Phase Cyber Titan
      const bossFlash = this.bossArmor.clone();
      const torso = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 1.65), bossFlash), false);
      torso.position.y = 2.7;

      const bossCoreMat = new THREE.MeshStandardMaterial({
        color: 0xffd000,
        emissive: 0xff7700,
        emissiveIntensity: 3.8
      });
      const core = registerHitbox(new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), bossCoreMat), true);
      core.position.set(0, 2.75, 0.88);

      const visor = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.68), weakMat), true);
      visor.position.set(0, 4.08, 0.2);

      const armL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.7, 0.9), this.armorDark), false);
      armL.position.set(-1.62, 2.55, 0.25);
      const armR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.7, 0.9), this.armorDark), false);
      armR.position.set(1.62, 2.55, 0.25);

      const legL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.65, 0.78), this.armorDark), false);
      legL.position.set(-0.68, 0.82, 0);
      const legR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.65, 0.78), this.armorDark), false);
      legR.position.set(0.68, 0.82, 0);

      // Orbiting Protective Aegis Plates
      const shieldRing = new THREE.Group();
      shieldRing.position.set(0, 2.75, 0);
      for (let s = 0; s < 3; s++) {
        const ang = (s / 3) * Math.PI * 2;
        const plate = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.16), this.armorPlate), false);
        plate.position.set(Math.cos(ang) * 2.25, 0, Math.sin(ang) * 2.25);
        plate.lookAt(0, 2.75, 0);
        shieldRing.add(plate);
      }

      animParts.legL = legL;
      animParts.legR = legR;
      animParts.shieldRing = shieldRing;
      animParts.flashMat = bossFlash;

      group.add(torso, core, visor, armL, armR, legL, legR, shieldRing);

      stats = {
        name: 'OMEGA COLOSSUS // SİBER TİTAN',
        maxHp: Math.round(1050 * hpScale),
        speed: 3.4,
        preferredDist: 16,
        fireInterval: 1.45,
        damage: 20,
        credits: 280,
        score: 1500,
        aimHeight: 2.8,
        flying: false
      };
    } else {
      // Default: VANGUARD Bipedal Tactical Android
      const torso = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.95, 0.48), flashMat), false);
      torso.position.y = 1.38;

      // Head + Glowing Red Visor (CRIT WEAKSPOT!)
      const head = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.42), weakMat), true);
      head.position.set(0, 2.08, 0.04);

      const gunArm = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.82), this.armorDark), false);
      gunArm.position.set(0.54, 1.42, 0.32);
      const leftArm = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), this.armorDark), false);
      leftArm.position.set(-0.52, 1.32, 0);

      const legL = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.3), this.armorDark), false);
      legL.position.set(-0.22, 0.45, 0);
      const legR = registerHitbox(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.3), this.armorDark), false);
      legR.position.set(0.22, 0.45, 0);

      animParts.legL = legL;
      animParts.legR = legR;
      group.add(torso, head, gunArm, leftArm, legL, legR);

      stats = {
        name: 'VANGUARD ANDROİD',
        maxHp: Math.round(95 * hpScale),
        speed: 5.2,
        preferredDist: 14,
        fireInterval: 2.05,
        damage: 9,
        credits: 42,
        score: 180,
        aimHeight: 1.55,
        flying: false
      };
    }

    // Floating World-Space Health Bar above Enemy
    const barHeight = type === 'boss' ? 4.9 : (type === 'bulwark' ? 3.05 : (type === 'drone' ? 0.95 : 2.55));
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x090e17, side: THREE.DoubleSide })
    );
    hpBg.position.set(0, barHeight, 0);
    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xff2a55, side: THREE.DoubleSide })
    );
    hpFill.position.set(0, barHeight, 0.01);
    hpBg.visible = false;
    hpFill.visible = false;
    group.add(hpBg, hpFill);

    this.scene.add(group);

    this.enemies.push({
      id,
      type,
      ...stats,
      hp: stats.maxHp,
      group,
      hitboxes,
      flashMat: animParts.flashMat || flashMat,
      flashTimer: 0,
      animParts,
      hpBg,
      hpFill,
      vel: new THREE.Vector3(),
      strafeSeed: Math.random() * 100,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      fireTimer: 2.0 + Math.random() * 1.2,
      walkCycle: Math.random() * 6,
      bossAttackPhase: 0
    });
  }

  _hasLineOfSight(origin, targetPos) {
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist < 1.0) return true;
    dir.divideScalar(dist);
    this.losRaycaster.set(origin, dir);
    this.losRaycaster.far = dist - 0.6;
    const hits = this.losRaycaster.intersectObjects(this.world.worldMeshes, false);
    return hits.length === 0;
  }

  damageEnemy(id, amount, isCrit, knockDir, hitPoint) {
    const idx = this.enemies.findIndex(e => e.id === id);
    if (idx === -1) return false;

    const e = this.enemies[idx];
    e.hp -= amount;
    e.flashTimer = 0.09;
    e.flashMat.emissive.setHex(isCrit ? 0xffaa00 : 0x00c8ff);
    e.flashMat.emissiveIntensity = 1.6;

    // Knockback impulse (lighter enemies pushed further)
    const kbScale = e.type === 'boss' ? 0.3 : (e.type === 'bulwark' ? 1.2 : 3.8);
    if (knockDir) {
      e.vel.x += knockDir.x * kbScale;
      e.vel.z += knockDir.z * kbScale;
    }

    if (e.type !== 'boss') {
      e.hpBg.visible = true;
      e.hpFill.visible = true;
      const ratio = Math.max(0.01, e.hp / e.maxHp);
      e.hpFill.scale.x = ratio;
    }

    if (e.hp <= 0) {
      this._destroyEnemy(idx, isCrit);
      return true;
    }
    return false;
  }

  applyExplosionDamage(center, radius, maxDamage, onHitCallback) {
    const THREE = this.THREE;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const eCenter = e.group.position.clone().add(new THREE.Vector3(0, e.aimHeight, 0));
      const dist = center.distanceTo(eCenter);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius) * 0.65;
        const dmg = Math.round(maxDamage * falloff);
        const push = eCenter.clone().sub(center).normalize();
        if (onHitCallback) onHitCallback(dmg, false, eCenter);
        this.damageEnemy(e.id, dmg, false, push.multiplyScalar(2.4), eCenter);
      }
    }
  }

  _destroyEnemy(index, wasCrit) {
    const THREE = this.THREE;
    const e = this.enemies[index];
    const center = e.group.position.clone().add(new THREE.Vector3(0, e.aimHeight, 0));

    this.sound.playExplosion(e.type === 'boss' ? 1.7 : (e.type === 'bulwark' ? 1.15 : 0.72));
    this.world.spawnDynamicFlash(
      center,
      e.type === 'boss' ? 0xffae00 : 0xff2a55,
      e.type === 'boss' ? 12 : 6,
      16,
      0.28
    );

    // Metallic shrapnel & glowing core shards
    const count = e.type === 'boss' ? 28 : 11;
    for (let i = 0; i < count; i++) {
      const isGlow = i % 3 === 0;
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, 0.26),
        isGlow
          ? new THREE.MeshBasicMaterial({ color: wasCrit ? 0xffd000 : 0xff2a55 })
          : this.armorDark
      );
      shard.position.copy(center);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        3 + Math.random() * 9,
        (Math.random() - 0.5) * 14
      );
      this.scene.add(shard);
      this.shrapnel.push({ mesh: shard, vel, life: 0.9 + Math.random() * 0.6 });
    }

    this.scene.remove(e.group);
    this.enemies.splice(index, 1);

    if (this.onEnemyKilled) {
      this.onEnemyKilled(e, wasCrit);
    }
  }

  _fireEnemyProjectile(origin, targetPos, damage, speed, colorHex = 0xff2a55, scale = 0.16) {
    const THREE = this.THREE;
    const dir = targetPos.clone().sub(origin).normalize();

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(scale, 10, 10),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.sound.playEnemyLaser();
    this.projectiles.push({
      mesh,
      vel: dir.multiplyScalar(speed),
      damage,
      life: 4.5,
      origin: origin.clone()
    });
  }

  update(worldDt, elapsed, playerPos, cameraPos, onPlayerDamaged) {
    const THREE = this.THREE;

    // 1. Update Enemy AI, Movement & Attacks
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Hit-flash recovery
      if (e.flashTimer > 0) {
        e.flashTimer -= worldDt;
        if (e.flashTimer <= 0) {
          e.flashMat.emissive.setHex(0x000000);
          e.flashMat.emissiveIntensity = 0;
        }
      }

      // Billboard floating HP bar toward player camera
      if (e.hpBg.visible) {
        e.hpBg.lookAt(cameraPos);
        e.hpFill.lookAt(cameraPos);
      }

      const toPlayer = new THREE.Vector3(
        playerPos.x - e.group.position.x,
        0,
        playerPos.z - e.group.position.z
      );
      const horizDist = toPlayer.length();
      const dirToPlayer = horizDist > 0.001 ? toPlayer.clone().divideScalar(horizDist) : new THREE.Vector3(0, 0, 1);
      const perp = new THREE.Vector3(-dirToPlayer.z * e.strafeDir, 0, dirToPlayer.x * e.strafeDir);

      // Face player smoothly
      const targetYaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      e.group.rotation.y = targetYaw;

      // Desired tactical velocity
      let moveVec = new THREE.Vector3();
      if (e.melee) {
        // Zig-zag sprint right at player!
        const zig = Math.sin(elapsed * 5.0 + e.strafeSeed) * 0.45;
        moveVec.addScaledVector(dirToPlayer, 1.0).addScaledVector(perp, zig).normalize();
      } else {
        if (horizDist > e.preferredDist + 2.5) {
          moveVec.addScaledVector(dirToPlayer, 0.85).addScaledVector(perp, 0.5).normalize();
        } else if (horizDist < e.preferredDist - 3.0) {
          moveVec.addScaledVector(dirToPlayer, -0.65).addScaledVector(perp, 0.75).normalize();
        } else {
          moveVec.copy(perp);
        }
      }

      // Soft separation from nearby enemies so they flank instead of stacking!
      for (let j = 0; j < this.enemies.length; j++) {
        if (i === j) continue;
        const other = this.enemies[j];
        const dx = e.group.position.x - other.group.position.x;
        const dz = e.group.position.z - other.group.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 4.5 && dSq > 0.001) {
          const push = 1.6 / Math.sqrt(dSq);
          moveVec.x += dx * push;
          moveVec.z += dz * push;
        }
      }

      // Blend knockback decay + desired movement
      e.vel.x += (moveVec.x * e.speed - e.vel.x) * Math.min(1, worldDt * 6);
      e.vel.z += (moveVec.z * e.speed - e.vel.z) * Math.min(1, worldDt * 6);

      if (e.flying) {
        e.group.position.x += e.vel.x * worldDt;
        e.group.position.z += e.vel.z * worldDt;
        const targetY = Math.max(e.baseHoverY, playerPos.y + 2.2) + Math.sin(elapsed * 3.0 + e.strafeSeed) * 0.45;
        e.group.position.y += (targetY - e.group.position.y) * Math.min(1, worldDt * 3.5);
        const lim = this.world.arenaHalfSize - 1.2;
        e.group.position.x = Math.max(-lim, Math.min(lim, e.group.position.x));
        e.group.position.z = Math.max(-lim, Math.min(lim, e.group.position.z));
      } else {
        e.vel.y -= 26 * worldDt;
        e.group.position.x += e.vel.x * worldDt;
        e.group.position.y += e.vel.y * worldDt;
        e.group.position.z += e.vel.z * worldDt;
        this.world.resolveEntityPhysics(e.group.position, e.vel, e.type === 'boss' ? 1.45 : 0.65, 0.85);
      }

      // Procedural leg & boss shield animations
      if (e.animParts.legL && e.animParts.legR) {
        e.walkCycle += worldDt * e.speed * 1.45;
        const swing = Math.sin(e.walkCycle) * 0.48;
        e.animParts.legL.rotation.x = swing;
        e.animParts.legR.rotation.x = -swing;
      }
      if (e.animParts.shieldRing) {
        e.animParts.shieldRing.rotation.y += worldDt * 1.55;
      }

      // Attack Logic
      e.fireTimer -= worldDt;
      if (e.fireTimer <= 0) {
        if (e.melee) {
          const verticalDiff = Math.abs(playerPos.y - e.group.position.y);
          if (horizDist < 2.75 && verticalDiff < 2.1) {
            e.fireTimer = e.fireInterval;
            if (onPlayerDamaged) onPlayerDamaged(e.damage, e.group.position);
          } else {
            e.fireTimer = 0.15;
          }
        } else if (e.type === 'boss') {
          e.fireTimer = e.fireInterval;
          e.bossAttackPhase = (e.bossAttackPhase + 1) % 3;
          const muzzle = e.group.position.clone().add(new THREE.Vector3(0, 2.8, 0));
          const pTarget = playerPos.clone().add(new THREE.Vector3(0, 1.35, 0));

          if (e.bossAttackPhase === 0) {
            // 5-way fan plasma volley!
            for (let k = -2; k <= 2; k++) {
              const spreadTarget = pTarget.clone().add(new THREE.Vector3(perp.x * k * 2.4, (Math.random() - 0.5), perp.z * k * 2.4));
              this._fireEnemyProjectile(muzzle, spreadTarget, e.damage, 24, 0xff9900, 0.24);
            }
          } else {
            // Rapid twin heavy bolts
            this._fireEnemyProjectile(muzzle.clone().addScaledVector(perp, -1.3), pTarget, e.damage, 28, 0xff2a55, 0.24);
            this._fireEnemyProjectile(muzzle.clone().addScaledVector(perp,  1.3), pTarget, e.damage, 28, 0xff2a55, 0.24);
          }
        } else {
          e.fireTimer = e.fireInterval + Math.random() * 0.55;
          if (horizDist < 46) {
            const muzzle = e.group.position.clone().add(new THREE.Vector3(0, e.aimHeight, 0));
            const pChest = playerPos.clone().add(new THREE.Vector3(0, 1.35, 0));
            if (this._hasLineOfSight(muzzle, pChest)) {
              const aimTarget = pChest.add(new THREE.Vector3(
                (Math.random() - 0.5) * 1.1,
                (Math.random() - 0.5) * 0.45,
                (Math.random() - 0.5) * 1.1
              ));
              const projSpeed = e.type === 'bulwark' ? 16 : 18.5;
              const projScale = e.type === 'bulwark' ? 0.26 : 0.18;
              this._fireEnemyProjectile(muzzle, aimTarget, e.damage, projSpeed, 0xff2a55, projScale);
            } else {
              e.fireTimer = 0.45; // Reposition around cover before re-checking LOS
            }
          }
        }
      }
    }

    // 2. Update Enemy Plasma Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= worldDt;
      p.mesh.position.addScaledVector(p.vel, worldDt);

      let remove = p.life <= 0 || p.mesh.position.y < 0.05 ||
        Math.abs(p.mesh.position.x) > this.world.arenaHalfSize ||
        Math.abs(p.mesh.position.z) > this.world.arenaHalfSize;

      // Check collision with arena cover boxes
      if (!remove) {
        const cols = this.world.colliders;
        for (let c = 0; c < cols.length; c++) {
          const b = cols[c];
          if (
            p.mesh.position.x >= b.minX && p.mesh.position.x <= b.maxX &&
            p.mesh.position.y >= b.minY && p.mesh.position.y <= b.maxY &&
            p.mesh.position.z >= b.minZ && p.mesh.position.z <= b.maxZ
          ) {
            remove = true;
            break;
          }
        }
      }

      // Check hit against Player capsule
      if (!remove) {
        const dx = p.mesh.position.x - playerPos.x;
        const dz = p.mesh.position.z - playerPos.z;
        const dy = p.mesh.position.y - (playerPos.y + 1.05);
        if (dx * dx + dz * dz < 0.52 * 0.52 && Math.abs(dy) < 0.95) {
          remove = true;
          if (onPlayerDamaged) onPlayerDamaged(p.damage, p.origin);
        }
      }

      if (remove) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // 3. Update Debris Shrapnel
    for (let i = this.shrapnel.length - 1; i >= 0; i--) {
      const s = this.shrapnel[i];
      s.life -= worldDt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.shrapnel.splice(i, 1);
      } else {
        s.vel.y -= 24 * worldDt;
        s.mesh.position.addScaledVector(s.vel, worldDt);
        s.mesh.rotation.x += 7 * worldDt;
        s.mesh.rotation.y += 5 * worldDt;
        if (s.mesh.position.y < 0.1) {
          s.mesh.position.y = 0.1;
          s.vel.y *= -0.4;
          s.vel.x *= 0.72;
          s.vel.z *= 0.72;
        }
      }
    }
  }
}

window.EnemyManager = EnemyManager;
