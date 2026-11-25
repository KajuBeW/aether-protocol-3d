/**
 * AETHER PROTOCOL - Core Game Engine, Post-Processing (UnrealBloom + ACES Filmic),
 * Exo-Suit Movement Physics, Wave Director, Tactical Radar & Armory Upgrades
 */
class AetherGame {
  constructor(libs) {
    this.THREE = libs.THREE;
    this.EffectComposer = libs.EffectComposer;
    this.RenderPass = libs.RenderPass;
    this.UnrealBloomPass = libs.UnrealBloomPass;
    this.OutputPass = libs.OutputPass;
    this.RoomEnvironment = libs.RoomEnvironment;

    this.state = 'MENU'; // MENU | PLAYING | PAUSED | SHOP | GAMEOVER
    this.quality = 'ultra';
    this.mouseSensitivity = 1.0;

    // Renderer & Scene Setup
    this._initRenderer();
    this.sound = new SoundEngine();
    this.textures = TextureFactory.createAll(this.THREE, this.renderer.capabilities.getMaxAnisotropy());
    this.world = new ArenaWorld(this.THREE, this.scene, this.textures);
    this.enemies = new EnemyManager(this.THREE, this.scene, this.world, this.sound);
    this.weapons = new WeaponSystem(this.THREE, this.camera, this.scene, this.world, this.sound, this.textures);
    this.weapons.rig.visible = false; // Hidden during cinematic main menu orbit

    this.enemies.onEnemyKilled = (enemy, wasCrit) => this._handleEnemyKilled(enemy, wasCrit);

    // Input State
    this.keys = {};
    this.mouseDownLeft = false;
    this._wasPointerLocked = false;
    this._lastMouseX = null;
    this._lastMouseY = null;
    this._normMouseX = 0;
    this._normMouseY = 0;
    this._mouseInsideWindow = false;
    this._lastMoveTime = -1;
    this._camEuler = new this.THREE.Euler(0, 0, 0, 'YXZ');

    // Player Exo-Suit State
    this.player = {
      pos: new this.THREE.Vector3(0, 0, 16),
      vel: new this.THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      grounded: true,
      jumpsRemaining: 2,
      isSliding: false,
      slideTimer: 0,
      slideDir: new this.THREE.Vector3(),
      dashEnergy: 100,      // 33 per dash/slide -> 3 charges
      dashRegenRate: 24,
      overdriveEnergy: 100,
      overdriveActive: false,
      hp: 150,
      maxHp: 150,
      shield: 150,
      maxShield: 150,
      shieldRegenDelay: 0,
      grenades: 3,
      maxGrenades: 4,
      grenadeRegenTimer: 0,
      turretCharges: 1,
      turretLevel: 1,
      footstepTimer: 0,
      invulnTimer: 4.0
    };

    // Match & Progression State
    this.wave = 1;
    this.waveSpawnQueue = [];
    this.waveSpawnTimer = 0;
    this.betweenWavesTimer = 0;
    this.score = 0;
    this.credits = 100;
    this.totalKills = 0;
    this.totalCrits = 0;
    this.combo = 0;
    this.comboTimer = 0;

    // Camera Shake & Hitmarker Timers
    this.shakeIntensity = 0;
    this.hitmarkerTimer = 0;
    this.damageArcTimer = 0;
    this.lastDamageOrigin = null;

    // FPS Counter
    this.fpsFrames = 0;
    this.fpsAccum = 0;

    // Upgrades Catalog
    this._initUpgrades();
    this._bindUI();
    this._bindInputs();

    this.clock = new this.THREE.Clock();
    this.elapsed = 0;

    // Hide loading screen & enter live 3D menu
    const loaderFill = document.getElementById('loader-bar-fill');
    if (loaderFill) loaderFill.style.width = '100%';
    setTimeout(() => {
      const ls = document.getElementById('loading-screen');
      if (ls) ls.classList.add('hidden');
    }, 280);

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _initRenderer() {
    const THREE = this.THREE;
    const container = document.getElementById('game-canvas-container');

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.outline = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Realistic PBR Metallic Reflections via PMREM RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new this.RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 320);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Post-Processing Pipeline (RenderPass -> UnrealBloomPass -> OutputPass)
    this.composer = new this.EffectComposer(this.renderer);
    this.renderPass = new this.RenderPass(this.scene, this.camera);
    this.bloomPass = new this.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.52, // strength
      0.38, // radius
      0.82  // threshold (only bright emissive cores, tracers, neon & explosions bloom!)
    );
    this.outputPass = new this.OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  applyQualityPreset(preset) {
    this.quality = preset;
    if (preset === 'ultra') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.bloomPass.enabled = true;
    } else if (preset === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.bloomPass.enabled = true;
    } else {
      this.renderer.setPixelRatio(1);
      this.bloomPass.enabled = false;
    }
    this.world.setQuality(preset);
    this._onResize();
  }

  _initUpgrades() {
    this.upgrades = [
      {
        id: 'dmg',
        title: 'PLAZMA ÇEKİRDEK MODÜLÜ',
        desc: 'Tüm silahların ve taretlerin verdiği hasarı kalıcı olarak +%20 artırır.',
        level: 0,
        maxLevel: 6,
        baseCost: 85,
        apply: () => { this.weapons.damageMultiplier += 0.2; }
      },
      {
        id: 'shield',
        title: 'AETHER KALKAN JENERATÖRÜ',
        desc: 'Maksimum kalkan kapasitesini +35 artırır ve kalkanı anında doldurur.',
        level: 0,
        maxLevel: 5,
        baseCost: 75,
        apply: () => {
          this.player.maxShield += 35;
          this.player.shield = this.player.maxShield;
        }
      },
      {
        id: 'armor',
        title: 'NANO-TİTANYUM ZIRH',
        desc: 'Maksimum sağlığı +30 artırır ve tüm hasarlı zırhı tamir eder.',
        level: 0,
        maxLevel: 5,
        baseCost: 70,
        apply: () => {
          this.player.maxHp += 30;
          this.player.hp = this.player.maxHp;
        }
      },
      {
        id: 'firerate',
        title: 'HIZLI SOĞUTMA & ŞARJÖR',
        desc: 'Atış hızını ve şarjör değiştirme hızını +%16 iyileştirir.',
        level: 0,
        maxLevel: 5,
        baseCost: 95,
        apply: () => { this.weapons.fireRateMultiplier += 0.16; }
      },
      {
        id: 'exo',
        title: 'KRONOS & İTİCİ REAKTÖRÜ',
        desc: 'Atılma (Dash) dolumunu +%25 hızlandırır ve Zaman Yavaşlatmayı doldurur.',
        level: 0,
        maxLevel: 4,
        baseCost: 80,
        apply: () => {
          this.player.dashRegenRate += 6;
          this.player.overdriveEnergy = 100;
        }
      },
      {
        id: 'turret',
        title: 'OTONOM LAZER TARET [T]',
        desc: '+2 Otonom Lazer Taret kurulum hakkı verir ve taret hasarını güçlendirir.',
        level: 0,
        maxLevel: 8,
        baseCost: 90,
        apply: () => {
          this.player.turretCharges += 2;
          this.player.turretLevel += 1;
        }
      }
    ];
  }

  _bindUI() {
    this.dom = {
      hud: document.getElementById('hud'),
      fxOverlay: document.getElementById('fx-overlay'),
      dmgIndicator: document.getElementById('damage-indicator'),
      floatingTexts: document.getElementById('floating-texts'),
      crosshairWrap: document.getElementById('crosshair-wrap'),
      chTop: document.querySelector('.ch-top'),
      chBottom: document.querySelector('.ch-bottom'),
      chLeft: document.querySelector('.ch-left'),
      chRight: document.querySelector('.ch-right'),
      hitmarker: document.getElementById('hitmarker'),
      radarCanvas: document.getElementById('radar-canvas'),
      fpsCounter: document.getElementById('fps-counter'),
      statWave: document.getElementById('stat-wave'),
      statEnemies: document.getElementById('stat-enemies'),
      statScore: document.getElementById('stat-score'),
      statCredits: document.getElementById('stat-credits'),
      bossBar: document.getElementById('boss-bar-container'),
      bossName: document.getElementById('boss-name'),
      bossHpText: document.getElementById('boss-hp-text'),
      bossHpFill: document.getElementById('boss-hp-fill'),
      comboBox: document.getElementById('combo-box'),
      comboMult: document.getElementById('combo-mult'),
      killfeed: document.getElementById('killfeed'),
      waveBanner: document.getElementById('wave-banner'),
      waveBannerTitle: document.getElementById('wave-banner-title'),
      waveBannerSub: document.getElementById('wave-banner-sub'),
      shieldVal: document.getElementById('shield-val'),
      shieldFill: document.getElementById('shield-fill'),
      hpVal: document.getElementById('hp-val'),
      hpFill: document.getElementById('hp-fill'),
      dashVal: document.getElementById('dash-val'),
      dashFill: document.getElementById('dash-fill'),
      overdriveVal: document.getElementById('overdrive-val'),
      overdriveFill: document.getElementById('overdrive-fill'),
      grenadeCount: document.getElementById('grenade-count'),
      turretCount: document.getElementById('turret-count'),
      shopChip: document.getElementById('shop-chip'),
      weaponName: document.getElementById('weapon-name'),
      ammoMag: document.getElementById('ammo-mag'),
      reloadHint: document.getElementById('reload-hint'),
      wSlots: [
        document.getElementById('w-slot-0'),
        document.getElementById('w-slot-1'),
        document.getElementById('w-slot-2')
      ],
      mainMenu: document.getElementById('main-menu'),
      pauseMenu: document.getElementById('pause-menu'),
      shopModal: document.getElementById('shop-modal'),
      shopCredits: document.getElementById('shop-credits'),
      shopGrid: document.getElementById('shop-grid'),
      gameoverModal: document.getElementById('gameover-modal')
    };

    this.radarCtx = this.dom.radarCanvas.getContext('2d');

    // Main Menu Controls — request Pointer Lock FIRST before audio buffer init so user gesture never expires!
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this._safeRequestPointerLock();
      this.sound.init();
      this.startNewMatch();
    });

    document.querySelectorAll('.q-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyQualityPreset(btn.dataset.quality);
      });
    });

    const sensSlider = document.getElementById('sens-slider');
    const sensVal = document.getElementById('sens-val');
    sensSlider.addEventListener('input', e => {
      this.mouseSensitivity = parseFloat(e.target.value);
      sensVal.textContent = this.mouseSensitivity.toFixed(1) + 'x';
    });

    const volSlider = document.getElementById('vol-slider');
    const volVal = document.getElementById('vol-val');
    volSlider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      volVal.textContent = Math.round(v * 100) + '%';
      this.sound.setVolume(v);
    });

    // Pause Menu Buttons
    document.getElementById('btn-resume').addEventListener('click', () => {
      this._safeRequestPointerLock();
      this.resumeGameplay();
    });
    document.getElementById('btn-open-shop-pause').addEventListener('click', () => {
      this.openShop();
    });
    document.getElementById('btn-restart-pause').addEventListener('click', () => {
      this._safeRequestPointerLock();
      this.startNewMatch();
    });

    // Shop Close Button
    document.getElementById('btn-close-shop').addEventListener('click', () => {
      this._safeRequestPointerLock();
      this.resumeGameplay();
    });

    // Game Over Play Again
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this._safeRequestPointerLock();
      this.startNewMatch();
    });
  }

  _bindInputs() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;

      if (this.state === 'PLAYING') {
        if (e.code === 'Digit1') this.weapons.switchWeapon(0);
        if (e.code === 'Digit2') this.weapons.switchWeapon(1);
        if (e.code === 'Digit3') this.weapons.switchWeapon(2);
        if (e.code === 'KeyR') this.weapons.startReload();
        if (e.code === 'Space') this._triggerJump();
        if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'KeyQ') this._triggerDashOrSlide();
        if (e.code === 'KeyF' || e.code === 'KeyE') this._toggleOverdrive();
        if (e.code === 'KeyG') this._triggerGrenade();
        if (e.code === 'KeyT') this._triggerTurret();
        if (e.code === 'KeyB' || e.code === 'Tab') {
          e.preventDefault();
          this.openShop();
        }
        if (e.code === 'KeyP' || (e.code === 'Escape' && !this._isPointerLocked())) {
          e.preventDefault();
          this.pauseGameplay();
        }
      } else if (this.state === 'PAUSED') {
        if (e.code === 'KeyP') {
          e.preventDefault();
          this.resumeGameplay();
        }
      } else if (this.state === 'SHOP') {
        if (e.code === 'KeyB' || e.code === 'Escape' || e.code === 'Tab') {
          e.preventDefault();
          this.resumeGameplay();
        }
      }
    });

    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousedown', e => {
      if (this.state !== 'PLAYING') return;
      if (!this._isPointerLocked()) {
        this._safeRequestPointerLock();
      }
      if (e.button === 0) {
        this.mouseDownLeft = true;
        this._fireCurrentWeapon();
      } else if (e.button === 2) {
        this.weapons.isAds = true;
      }
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'PLAYING' && !this._isPointerLocked()) {
        this._safeRequestPointerLock();
      }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.weapons.isAds = false;
    });

    window.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('wheel', e => {
      if (this.state !== 'PLAYING') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = (this.weapons.currentIndex + dir + this.weapons.weapons.length) % this.weapons.weapons.length;
      this.weapons.switchWeapon(next);
    });

    const handleAimMove = e => {
      if (this.state !== 'PLAYING') {
        this._lastMouseX = null;
        this._lastMouseY = null;
        return;
      }

      // Deduplicate if both pointermove and mousemove fire for the same OS event timestamp
      if (e.timeStamp && Math.abs(e.timeStamp - this._lastMoveTime) < 0.05 && e.type === 'mousemove') {
        return;
      }
      this._lastMoveTime = e.timeStamp || 0;
      this._mouseInsideWindow = true;

      const locked = this._isPointerLocked();
      let dx = 0;
      let dy = 0;

      if (locked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else {
        // Track normalized screen coords (-1 .. +1) for smooth continuous 360 edge-turning
        if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
          this._normMouseX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
          this._normMouseY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;

          if (this._lastMouseX !== null && this._lastMouseY !== null) {
            dx = (e.clientX - this._lastMouseX) * 2.8;
            dy = (e.clientY - this._lastMouseY) * 2.4;
          } else if (typeof e.movementX === 'number') {
            dx = e.movementX * 2.8;
            dy = (e.movementY || 0) * 2.4;
          }
          this._lastMouseX = e.clientX;
          this._lastMouseY = e.clientY;
        }
      }

      if (dx === 0 && dy === 0) return;

      const adsFactor = this.weapons.isAds ? 0.55 : 1.0;
      const sens = 0.0022 * this.mouseSensitivity * adsFactor;
      this.player.yaw -= dx * sens;
      this.player.pitch = Math.max(-1.46, Math.min(1.46, this.player.pitch - dy * sens));
      this.weapons.addMouseSway(dx, dy);
    };

    document.addEventListener('pointermove', handleAimMove, { passive: true });
    document.addEventListener('mousemove', handleAimMove, { passive: true });
    document.addEventListener('mouseleave', () => {
      this._mouseInsideWindow = false;
      this._lastMouseX = null;
      this._lastMouseY = null;
    });

    document.addEventListener('pointerlockchange', () => {
      const isLocked = this._isPointerLocked();
      if (isLocked) {
        this._wasPointerLocked = true;
      } else {
        this.mouseDownLeft = false;
        this.weapons.isAds = false;
        // Only open pause menu when exiting an ALREADY active pointer lock (pressing ESC)
        if (this._wasPointerLocked && this.state === 'PLAYING') {
          this._wasPointerLocked = false;
          this.pauseGameplay();
        }
        this._wasPointerLocked = false;
      }
    });
  }

  _isPointerLocked() {
    const lockedEl = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
    return !!lockedEl;
  }

  _safeRequestPointerLock() {
    const el = this.renderer.domElement;
    try {
      el.focus({ preventScroll: true });
    } catch (_) {}

    const req = el.requestPointerLock || el.mozRequestPointerLock || el.webkitRequestPointerLock;
    if (!req) return;
    try {
      const res = req.call(el);
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          // Try document.body fallback if canvas pointer lock was declined
          try {
            const bReq = document.body.requestPointerLock;
            if (bReq) {
              const bRes = bReq.call(document.body);
              if (bRes && typeof bRes.catch === 'function') bRes.catch(() => {});
            }
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  startNewMatch() {
    this.sound.init();
    this.enemies.clearAll();

    // Reset Upgrades & Weapon Multipliers
    this._initUpgrades();
    this.weapons.damageMultiplier = 1.0;
    this.weapons.fireRateMultiplier = 1.0;
    this.weapons.reset();
    this.weapons.rig.visible = true;

    // Reset Player with strong Exo-Shields & 4s Spawn Grace Protection
    Object.assign(this.player, {
      pos: new this.THREE.Vector3(0, 0, 16),
      vel: new this.THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      roll: 0,
      grounded: true,
      jumpsRemaining: 2,
      isSliding: false,
      slideTimer: 0,
      dashEnergy: 100,
      dashRegenRate: 24,
      overdriveEnergy: 100,
      overdriveActive: false,
      hp: 150,
      maxHp: 150,
      shield: 150,
      maxShield: 150,
      shieldRegenDelay: 0,
      grenades: 3,
      turretCharges: 1,
      turretLevel: 1,
      invulnTimer: 4.0
    });

    this.betweenWavesTimer = 0;
    this.sound.setOverdriveAudio(false);
    this.wave = 1;
    this.score = 0;
    this.credits = 100;
    this.totalKills = 0;
    this.totalCrits = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.dom.killfeed.innerHTML = '';

    this._startWave(1);
    this.resumeGameplay();
  }

  pauseGameplay() {
    this.state = 'PAUSED';
    this._wasPointerLocked = false;
    this.player.overdriveActive = false;
    this.sound.setOverdriveAudio(false);
    this.dom.pauseMenu.classList.add('active');
    this.dom.shopModal.classList.remove('active');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  openShop() {
    this.state = 'SHOP';
    this._wasPointerLocked = false;
    this.player.overdriveActive = false;
    this.sound.setOverdriveAudio(false);
    this.dom.pauseMenu.classList.remove('active');
    this.dom.mainMenu.classList.remove('active');
    this._renderShopCards();
    this.dom.shopModal.classList.add('active');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resumeGameplay() {
    this.state = 'PLAYING';
    this._lastMouseX = null;
    this._lastMouseY = null;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 1.5);
    this.dom.mainMenu.classList.remove('active');
    this.dom.pauseMenu.classList.remove('active');
    this.dom.shopModal.classList.remove('active');
    this.dom.gameoverModal.classList.remove('active');
    this.dom.hud.classList.add('visible');
    this.weapons.rig.visible = true;

    this._safeRequestPointerLock();
  }

  _renderShopCards() {
    this.dom.shopCredits.textContent = `${this.credits} ₵`;
    this.dom.shopGrid.innerHTML = '';

    this.upgrades.forEach(u => {
      const cost = Math.round(u.baseCost * Math.pow(1.38, u.level));
      const isMax = u.level >= u.maxLevel;
      const canAfford = !isMax && this.credits >= cost;

      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div>
          <div class="up-lvl">SEVİYE ${u.level} / ${u.maxLevel}</div>
          <div class="up-title">${u.title}</div>
          <p class="up-desc" style="margin-top:6px">${u.desc}</p>
        </div>
        <button class="buy-btn" ${canAfford ? '' : 'disabled'}>
          ${isMax ? 'MAKSİMUM SEVİYE' : `SATIN AL // ${cost} ₵`}
        </button>
      `;

      const btn = card.querySelector('.buy-btn');
      btn.addEventListener('click', () => {
        if (this.credits >= cost && u.level < u.maxLevel) {
          this.credits -= cost;
          u.level++;
          u.apply();
          this.sound.playPickup();
          this._renderShopCards();
          this._updateHUD();
        }
      });

      this.dom.shopGrid.appendChild(card);
    });
  }

  _startWave(waveNum) {
    this.wave = waveNum;
    const isBossWave = waveNum % 4 === 0;
    const queue = [];

    if (isBossWave) {
      queue.push('boss');
      const escorts = 3 + waveNum;
      for (let i = 0; i < escorts; i++) {
        queue.push(i % 2 === 0 ? 'drone' : 'vanguard');
      }
    } else {
      const total = 3 + waveNum * 2;
      for (let i = 0; i < total; i++) {
        const r = Math.random();
        if (waveNum >= 3 && r < 0.18) queue.push('bulwark');
        else if (waveNum >= 2 && r < 0.42) queue.push('strider');
        else if (r < 0.65) queue.push('drone');
        else queue.push('vanguard');
      }
    }

    this.waveSpawnQueue = queue;
    this.waveSpawnTimer = 1.8;

    this.sound.playWaveHorn(isBossWave);
    this._showBanner(
      isBossWave ? `DALGA ${waveNum} // OMEGA ALARMI` : `DALGA ${waveNum} BAŞLADI`,
      isBossWave ? 'ZIRHLI SİBER TİTAN TESPİT EDİLDİ' : `${queue.length} DÜŞMAN BİRİMİ YAKLAŞIYOR`
    );
  }

  _showBanner(title, subtitle) {
    this.dom.waveBannerTitle.textContent = title;
    this.dom.waveBannerSub.textContent = subtitle;
    this.dom.waveBanner.classList.add('show');
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      this.dom.waveBanner.classList.remove('show');
    }, 3200);
  }

  _triggerJump() {
    if (this.player.jumpsRemaining <= 0) return;
    const isDouble = !this.player.grounded;
    this.player.vel.y = isDouble ? 11.8 : 10.6;
    this.player.grounded = false;
    this.player.jumpsRemaining--;
    this.player.isSliding = false;
    this.sound.playJump(isDouble);
  }

  _triggerDashOrSlide() {
    if (this.player.dashEnergy < 33) return;
    this.player.dashEnergy -= 33;
    this.sound.playDash();

    const forward = new this.THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = new this.THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    const move = new this.THREE.Vector3();

    if (this.keys['KeyW']) move.add(forward);
    if (this.keys['KeyS']) move.sub(forward);
    if (this.keys['KeyD']) move.add(right);
    if (this.keys['KeyA']) move.sub(right);
    if (move.lengthSq() < 0.01) move.copy(forward);
    move.normalize();

    if (this.player.grounded) {
      this.player.isSliding = true;
      this.player.slideTimer = 0.52;
      this.player.slideDir.copy(move);
      this.player.vel.x = move.x * 21;
      this.player.vel.z = move.z * 21;
    } else {
      // Mid-air Exo-Thruster Dash!
      this.player.vel.x = move.x * 19.5;
      this.player.vel.z = move.z * 19.5;
      this.player.vel.y = Math.max(this.player.vel.y, 2.5);
    }
    this.player.invulnTimer = 0.22; // Brief evasion frames during dash!
  }

  _toggleOverdrive() {
    if (this.player.overdriveActive) {
      this.player.overdriveActive = false;
      this.sound.setOverdriveAudio(false);
    } else if (this.player.overdriveEnergy >= 20) {
      this.player.overdriveActive = true;
      this.sound.setOverdriveAudio(true);
    }
  }

  _triggerGrenade() {
    if (this.player.grenades <= 0) return;
    this.player.grenades--;
    this.weapons.throwGrenade();
  }

  _triggerTurret() {
    if (this.player.turretCharges <= 0) return;
    this.player.turretCharges--;
    this.sound.playPickup();
    this.weapons.deployTurret(this.player.pos, this.player.yaw, this.player.turretLevel);
  }

  _fireCurrentWeapon() {
    const kick = this.weapons.tryFire(this.enemies, (dmg, isCrit, hitPos) => {
      this._showHitmarker(isCrit);
      this._spawnFloatingDamage(dmg, isCrit, hitPos);
    });

    if (kick) {
      this.player.pitch = Math.min(1.46, this.player.pitch + kick.pitchKick);
      this.player.yaw += kick.yawKick;
      this.shakeIntensity = Math.min(0.06, this.shakeIntensity + kick.pitchKick * 0.45);
    }
  }

  _showHitmarker(isCrit) {
    this.hitmarkerTimer = 0.11;
    this.dom.hitmarker.classList.add('active');
    if (isCrit) this.dom.hitmarker.classList.add('crit');
    else this.dom.hitmarker.classList.remove('crit');
  }

  _spawnFloatingDamage(dmg, isCrit, worldPoint) {
    const projected = worldPoint.clone().project(this.camera);
    if (projected.z > 1) return;

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 24;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight + (Math.random() - 0.5) * 18;

    const el = document.createElement('div');
    el.className = 'dmg-pop' + (isCrit ? ' crit' : '');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = isCrit ? `${dmg}!` : `${dmg}`;
    this.dom.floatingTexts.appendChild(el);
    setTimeout(() => el.remove(), 720);
  }

  _handleEnemyKilled(enemy, wasCrit) {
    this.totalKills++;
    if (wasCrit) this.totalCrits++;

    // Combo Multiplier
    this.combo++;
    this.comboTimer = 5.2;
    const mult = Math.min(4.0, 1 + (this.combo - 1) * 0.25);

    const earnedCredits = Math.round(enemy.credits * (wasCrit ? 1.25 : 1.0) * Math.min(2.2, mult));
    const earnedScore = Math.round(enemy.score * mult);
    this.credits += earnedCredits;
    this.score += earnedScore;

    // Refill Overdrive energy & Exo-Shield Siphon on kills!
    this.player.overdriveEnergy = Math.min(100, this.player.overdriveEnergy + (wasCrit ? 18 : 10));
    this.player.shield = Math.min(this.player.maxShield, this.player.shield + (wasCrit ? 22 : 14));

    // Killfeed Entry
    const item = document.createElement('div');
    item.className = 'kill-item' + (wasCrit ? ' crit' : '');
    item.textContent = `${enemy.name} ${wasCrit ? '[KRİTİK]' : ''} +${earnedCredits}₵`;
    this.dom.killfeed.prepend(item);
    while (this.dom.killfeed.children.length > 4) {
      this.dom.killfeed.lastElementChild.remove();
    }
    setTimeout(() => { if (item.parentNode) item.remove(); }, 3600);
  }

  _handlePlayerDamaged(amount, originVec) {
    if (this.player.invulnTimer > 0 || this.state !== 'PLAYING') return;

    this.player.shieldRegenDelay = 2.8;
    let remaining = amount;
    let absorbedByShield = false;

    if (this.player.shield > 0) {
      absorbedByShield = true;
      const sDmg = Math.min(this.player.shield, remaining);
      this.player.shield -= sDmg;
      remaining -= sDmg;
    }
    if (remaining > 0) {
      this.player.hp = Math.max(0, this.player.hp - remaining);
    }

    this.sound.playPlayerHit(absorbedByShield && remaining === 0);
    this.shakeIntensity = Math.min(0.14, this.shakeIntensity + 0.065);

    // Screen Vignette Flash
    this.dom.fxOverlay.classList.remove('damage-flash', 'shield-flash');
    void this.dom.fxOverlay.offsetWidth;
    this.dom.fxOverlay.classList.add(remaining > 0 ? 'damage-flash' : 'shield-flash');
    clearTimeout(this._flashClearTimer);
    this._flashClearTimer = setTimeout(() => {
      this.dom.fxOverlay.classList.remove('damage-flash', 'shield-flash');
    }, 220);

    // Directional Damage Indicator
    if (originVec) {
      this.lastDamageOrigin = originVec.clone();
      this.damageArcTimer = 0.85;
    }

    if (this.player.hp <= 0) {
      this._triggerGameOver();
    }
  }

  _handleSupplyPickup(pod) {
    if (pod.type === 'health') {
      if (this.player.hp >= this.player.maxHp) return false;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
    } else if (pod.type === 'shield') {
      if (this.player.shield >= this.player.maxShield) return false;
      this.player.shield = Math.min(this.player.maxShield, this.player.shield + 65);
    } else if (pod.type === 'ammo') {
      this.player.grenades = Math.min(this.player.maxGrenades, this.player.grenades + 2);
      this.weapons.weapons.forEach(w => { w.mag = w.magSize; });
      this.weapons._updateGunScreen();
    } else if (pod.type === 'overdrive') {
      this.player.overdriveEnergy = 100;
      this.player.dashEnergy = 100;
    }
    this.sound.playPickup();
    return true;
  }

  _triggerGameOver() {
    this.state = 'GAMEOVER';
    this.player.overdriveActive = false;
    this.sound.setOverdriveAudio(false);
    if (document.pointerLockElement) document.exitPointerLock();

    document.getElementById('go-wave').textContent = this.wave;
    document.getElementById('go-kills').textContent = this.totalKills;
    document.getElementById('go-crits').textContent = this.totalCrits;
    document.getElementById('go-score').textContent = this.score.toLocaleString('tr-TR');
    this.dom.gameoverModal.classList.add('active');
  }

  _updatePlayer(realDt) {
    const p = this.player;
    if (p.invulnTimer > 0) p.invulnTimer -= realDt;

    // Regenerate Dash, Grenade, and Shield
    p.dashEnergy = Math.min(100, p.dashEnergy + p.dashRegenRate * realDt);

    p.grenadeRegenTimer += realDt;
    if (p.grenadeRegenTimer >= 18) {
      p.grenadeRegenTimer = 0;
      if (p.grenades < p.maxGrenades) p.grenades++;
    }

    if (p.shieldRegenDelay > 0) {
      p.shieldRegenDelay -= realDt;
    } else if (p.shield < p.maxShield) {
      p.shield = Math.min(p.maxShield, p.shield + 26 * realDt);
    }

    // Overdrive Drain
    if (p.overdriveActive) {
      p.overdriveEnergy -= 20 * realDt;
      if (p.overdriveEnergy <= 0) {
        p.overdriveEnergy = 0;
        p.overdriveActive = false;
        this.sound.setOverdriveAudio(false);
      }
    } else {
      p.overdriveEnergy = Math.min(100, p.overdriveEnergy + 2.5 * realDt);
    }

    // Horizontal Movement Input
    const forward = new this.THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new this.THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const wishDir = new this.THREE.Vector3();

    if (this.keys['KeyW']) wishDir.add(forward);
    if (this.keys['KeyS']) wishDir.sub(forward);
    if (this.keys['KeyD']) wishDir.add(right);
    if (this.keys['KeyA']) wishDir.sub(right);
    if (wishDir.lengthSq() > 0) wishDir.normalize();

    const sprinting = this.keys['ShiftLeft'] && !this.weapons.isAds && !p.isSliding && this.keys['KeyW'];
    const targetSpeed = this.weapons.isAds ? 5.8 : (sprinting ? 12.8 : 8.8);

    if (p.isSliding) {
      p.slideTimer -= realDt;
      p.vel.x *= Math.pow(0.28, realDt);
      p.vel.z *= Math.pow(0.28, realDt);
      if (p.slideTimer <= 0 || !p.grounded) {
        p.isSliding = false;
      }
    } else {
      const accel = p.grounded ? 14.0 : 5.5;
      p.vel.x += (wishDir.x * targetSpeed - p.vel.x) * Math.min(1, realDt * accel);
      p.vel.z += (wishDir.z * targetSpeed - p.vel.z) * Math.min(1, realDt * accel);
    }

    // Gravity
    p.vel.y -= 28.0 * realDt;

    // Integrate & Resolve Arena Collision + Ramps + Jump Pads
    p.pos.x += p.vel.x * realDt;
    p.pos.y += p.vel.y * realDt;
    p.pos.z += p.vel.z * realDt;

    const col = this.world.resolveEntityPhysics(p.pos, p.vel, 0.55, 0.72);
    p.grounded = col.grounded;
    if (col.grounded) {
      p.jumpsRemaining = 2;
    }
    if (col.hitJumpPad) {
      p.jumpsRemaining = 1;
      this.sound.playDash();
    }

    // Footsteps
    const horizSpeed = Math.hypot(p.vel.x, p.vel.z);
    if (p.grounded && !p.isSliding && horizSpeed > 2.2) {
      p.footstepTimer -= realDt;
      if (p.footstepTimer <= 0) {
        p.footstepTimer = sprinting ? 0.29 : 0.42;
        this.sound.playFootstep(sprinting);
      }
    }

    // Camera Height (Crouch/Slide smooth blend), FOV Kick, Strafe Roll & Screen Shake
    const targetEyeH = p.isSliding ? 0.92 : 1.72;
    this._currentEyeH = this._currentEyeH === undefined ? 1.72 : this._currentEyeH;
    this._currentEyeH += (targetEyeH - this._currentEyeH) * Math.min(1, realDt * 14);

    this.shakeIntensity = Math.max(0, this.shakeIntensity - realDt * 0.42);
    const sx = (Math.random() - 0.5) * this.shakeIntensity;
    const sy = (Math.random() - 0.5) * this.shakeIntensity;

    this.camera.position.set(p.pos.x + sx, p.pos.y + this._currentEyeH + sy, p.pos.z);

    // Optional Keyboard Arrow Look + Continuous 360° Edge-Panning when Pointer Lock is inactive
    const keyTurnSpeed = 2.4 * this.mouseSensitivity * (this.weapons.isAds ? 0.6 : 1.0);
    if (this.keys['ArrowLeft'])  p.yaw += keyTurnSpeed * realDt;
    if (this.keys['ArrowRight']) p.yaw -= keyTurnSpeed * realDt;
    if (this.keys['ArrowUp'])    p.pitch = Math.min(1.46, p.pitch + keyTurnSpeed * 0.75 * realDt);
    if (this.keys['ArrowDown'])  p.pitch = Math.max(-1.46, p.pitch - keyTurnSpeed * 0.75 * realDt);

    if (!this._isPointerLocked() && this._mouseInsideWindow) {
      const edgeThreshold = 0.60;
      if (Math.abs(this._normMouseX) > edgeThreshold) {
        const edgeStrength = (Math.abs(this._normMouseX) - edgeThreshold) / (1 - edgeThreshold);
        p.yaw -= Math.sign(this._normMouseX) * edgeStrength * 2.9 * this.mouseSensitivity * realDt;
      }
    }

    // Subtle tactical strafe/slide camera roll
    let targetRoll = 0;
    if (p.isSliding) targetRoll = -0.065;
    else if (this.keys['KeyA']) targetRoll = 0.018;
    else if (this.keys['KeyD']) targetRoll = -0.018;
    p.roll += (targetRoll - p.roll) * Math.min(1, realDt * 10);

    this._camEuler.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.camera.quaternion.setFromEuler(this._camEuler);

    // Dynamic FOV (ADS zoom vs Sprint boost vs Base 75)
    const targetFov = this.weapons.isAds
      ? this.weapons.current.adsFov
      : (sprinting ? 83 : (p.isSliding ? 85 : 75));
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, realDt * 12);
      this.camera.updateProjectionMatrix();
    }

    // Full-Auto Weapon Hold Trigger
    if (this.mouseDownLeft && this.weapons.current.auto) {
      this._fireCurrentWeapon();
    }

    return horizSpeed;
  }

  _updateWaveDirector(worldDt) {
    const maxSimultaneous = Math.min(14, 3 + this.wave * 2);
    if (this.waveSpawnQueue.length > 0) {
      this.waveSpawnTimer -= worldDt;
      if (this.waveSpawnTimer <= 0 && this.enemies.enemies.length < maxSimultaneous) {
        const nextType = this.waveSpawnQueue.shift();
        this.waveSpawnTimer = nextType === 'boss' ? 2.2 : Math.max(0.85, 2.1 - this.wave * 0.08);

        // Deterministically pick among the 4 spawn points farthest from the player (never right behind!)
        const sortedPts = [...this.world.spawnPoints].sort((a, b) => {
          const da = (a.x - this.player.pos.x) ** 2 + (a.z - this.player.pos.z) ** 2;
          const db = (b.x - this.player.pos.x) ** 2 + (b.z - this.player.pos.z) ** 2;
          return db - da;
        });
        const chosen = sortedPts[Math.floor(Math.random() * Math.min(4, sortedPts.length))];
        this.enemies.spawnEnemy(
          nextType,
          this.wave,
          new this.THREE.Vector3(chosen.x, chosen.y, chosen.z)
        );
      }
    } else if (this.enemies.enemies.length === 0) {
      // Wave Cleared! Short breather so player can open Armory [B] or prepare
      if (this.betweenWavesTimer <= 0) {
        this.betweenWavesTimer = 4.8;
        this.credits += 50 + this.wave * 15;
        this._showBanner(
          `DALGA ${this.wave} TEMİZLENDİ!`,
          `[B] CEPHANELİK İLE GELİŞTİRME YAPABİLİRSİN`
        );
        this.sound.playPickup();
      } else {
        this.betweenWavesTimer -= worldDt;
        if (this.betweenWavesTimer <= 0) {
          this._startWave(this.wave + 1);
        }
      }
    }
  }

  _drawRadar() {
    const ctx = this.radarCtx;
    const size = this.dom.radarCanvas.width;
    const half = size / 2;
    const scale = (half - 10) / 34; // Maps 34m arena half-size to radar circle

    ctx.clearRect(0, 0, size, size);

    // Concentric range rings & crosshair axes
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
    ctx.lineWidth = 1;
    [0.35, 0.7, 1.0].forEach(r => {
      ctx.beginPath();
      ctx.arc(half, half, (half - 8) * r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Vision cone pointing Up (-Y on canvas)
    ctx.fillStyle = 'rgba(0, 240, 255, 0.09)';
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.arc(half, half, half - 8, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fill();

    const cosY = Math.cos(-this.player.yaw);
    const sinY = Math.sin(-this.player.yaw);

    const toRadar = (wx, wz) => {
      const dx = wx - this.player.pos.x;
      const dz = wz - this.player.pos.z;
      // Rotate relative to player yaw so forward (-Z) points UP on radar
      const rx = dx * cosY - dz * sinY;
      const rz = dx * sinY + dz * cosY;
      return {
        x: half + rx * scale,
        y: half + rz * scale
      };
    };

    // Active Supply Pods (Green/Cyan diamonds)
    this.world.supplyPods.forEach(pod => {
      if (!pod.active) return;
      const pt = toRadar(pod.x, pod.z);
      if (Math.hypot(pt.x - half, pt.y - half) < half - 6) {
        ctx.fillStyle = '#00ff9d';
        ctx.fillRect(pt.x - 2.5, pt.y - 2.5, 5, 5);
      }
    });

    // Allied Turrets
    this.weapons.turrets.forEach(t => {
      const pt = toRadar(t.group.position.x, t.group.position.z);
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Enemies (Red blips, Boss = Larger Pulsing Gold/Red Blip)
    this.enemies.enemies.forEach(e => {
      const pt = toRadar(e.group.position.x, e.group.position.z);
      const dist = Math.hypot(pt.x - half, pt.y - half);
      const clampedX = dist > half - 7 ? half + ((pt.x - half) / dist) * (half - 7) : pt.x;
      const clampedY = dist > half - 7 ? half + ((pt.y - half) / dist) * (half - 7) : pt.y;

      ctx.fillStyle = e.type === 'boss' ? '#ffae00' : '#ff2a55';
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, e.type === 'boss' ? 5.5 : 3.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Player Center Arrow
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(half, half - 5);
    ctx.lineTo(half + 4, half + 4);
    ctx.lineTo(half - 4, half + 4);
    ctx.closePath();
    ctx.fill();
  }

  _updateHUD(realDt = 0.016) {
    const p = this.player;
    const w = this.weapons.current;

    // Top Center Stats
    this.dom.statWave.textContent = this.wave;
    this.dom.statEnemies.textContent = this.enemies.enemies.length + this.waveSpawnQueue.length;
    this.dom.statScore.textContent = this.score.toLocaleString('tr-TR');
    this.dom.statCredits.textContent = `${this.credits} ₵`;

    // Highlight Armory chip when player has enough credits for upgrades
    if (this.credits >= 75) this.dom.shopChip.classList.add('highlight');
    else this.dom.shopChip.classList.remove('highlight');

    // Boss Health Bar
    const boss = this.enemies.getActiveBoss();
    if (boss) {
      this.dom.bossBar.classList.add('active');
      this.dom.bossName.textContent = boss.name;
      this.dom.bossHpText.textContent = `${Math.max(0, boss.hp)} / ${boss.maxHp}`;
      this.dom.bossHpFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else {
      this.dom.bossBar.classList.remove('active');
    }

    // Combo Box
    if (this.combo >= 2 && this.comboTimer > 0) {
      this.dom.comboBox.classList.add('active');
      const mult = Math.min(4.0, 1 + (this.combo - 1) * 0.25);
      this.dom.comboMult.textContent = `x${mult.toFixed(2)} (${this.combo})`;
    } else {
      this.dom.comboBox.classList.remove('active');
    }

    // Vitals & Ability Bars
    this.dom.shieldVal.textContent = Math.round(p.shield);
    this.dom.shieldFill.style.width = `${(p.shield / p.maxShield) * 100}%`;
    this.dom.hpVal.textContent = Math.round(p.hp);
    this.dom.hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;

    this.dom.dashVal.textContent = `${Math.floor(p.dashEnergy / 33)}/3`;
    this.dom.dashFill.style.width = `${p.dashEnergy}%`;
    this.dom.overdriveVal.textContent = `${Math.round(p.overdriveEnergy)}%`;
    this.dom.overdriveFill.style.width = `${p.overdriveEnergy}%`;

    this.dom.grenadeCount.textContent = p.grenades;
    this.dom.turretCount.textContent = p.turretCharges;

    // Screen Overlays (Overdrive & Low Health)
    this.dom.fxOverlay.classList.toggle('overdrive-active', p.overdriveActive);
    this.dom.fxOverlay.classList.toggle('low-health', p.hp > 0 && p.hp <= 30);

    // Weapon & Ammo Panel
    this.dom.weaponName.textContent = w.name;
    this.dom.weaponName.style.color = w.colorCss;
    this.dom.ammoMag.textContent = String(w.mag).padStart(2, '0');
    this.dom.ammoMag.style.color = w.mag <= Math.ceil(w.magSize * 0.25) ? '#ff2a55' : '#ffffff';

    this.dom.wSlots.forEach((slotEl, idx) => {
      slotEl.classList.toggle('active', idx === this.weapons.currentIndex);
    });

    this.dom.reloadHint.style.display = (this.weapons.isReloading || w.mag === 0) ? 'block' : 'none';
    this.dom.reloadHint.textContent = this.weapons.isReloading ? 'ŞARJÖR DEĞİŞTİRİLİYOR...' : '[R] ŞARJÖR DEĞİŞTİR';

    // Dynamic Crosshair Spread & Hide during ADS (since 3D Holo Optic takes center!)
    this.dom.crosshairWrap.style.opacity = this.weapons.adsBlend > 0.65 ? '0.08' : '1';
    const gap = Math.round(4 + this.weapons.recoilZ * 95 + (w.id === 'shotgun' ? 8 : 0));
    this.dom.chTop.style.transform = `translateY(${-gap}px)`;
    this.dom.chBottom.style.transform = `translateY(${gap}px)`;
    this.dom.chLeft.style.transform = `translateX(${-gap}px)`;
    this.dom.chRight.style.transform = `translateX(${gap}px)`;

    // Hitmarker decay
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= realDt;
      if (this.hitmarkerTimer <= 0) {
        this.dom.hitmarker.classList.remove('active', 'crit');
      }
    }

    // Directional Damage Arc rotation
    if (this.damageArcTimer > 0 && this.lastDamageOrigin) {
      this.damageArcTimer -= realDt;
      const dx = this.lastDamageOrigin.x - p.pos.x;
      const dz = this.lastDamageOrigin.z - p.pos.z;
      const worldAngle = Math.atan2(dx, -dz);
      const relAngle = worldAngle + p.yaw;
      this.dom.dmgIndicator.style.opacity = Math.min(1, this.damageArcTimer * 1.4);
      this.dom.dmgIndicator.style.transform = `rotate(${relAngle}rad)`;
    } else {
      this.dom.dmgIndicator.style.opacity = '0';
    }
  }

  _animate() {
    requestAnimationFrame(this._animate);

    const realDt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += realDt;

    // FPS Counter update
    this.fpsFrames++;
    this.fpsAccum += realDt;
    if (this.fpsAccum >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.dom.fpsCounter.textContent = `${fps} FPS // ${this.quality.toUpperCase()}`;
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.state === 'MENU') {
      // Live 3D Cinematic Orbit around the Rain-Lit Aether Reactor Spire!
      const camAngle = this.elapsed * 0.16;
      this.camera.position.set(Math.cos(camAngle) * 24, 9.5 + Math.sin(this.elapsed * 0.4) * 1.5, Math.sin(camAngle) * 24);
      this.camera.lookAt(0, 4.2, 0);
      this.world.update(realDt, this.elapsed, null, null);
    } else if (this.state === 'PLAYING') {
      const timeScale = this.player.overdriveActive ? 0.32 : 1.0;
      const worldDt = realDt * timeScale;

      if (this.comboTimer > 0) {
        this.comboTimer -= realDt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      const moveSpeed = this._updatePlayer(realDt);
      this._updateWaveDirector(worldDt);

      this.world.update(worldDt, this.elapsed, this.player.pos, pod => this._handleSupplyPickup(pod));

      this.weapons.update(
        realDt,
        worldDt,
        moveSpeed,
        this.player.grounded,
        this.player.isSliding,
        this.enemies,
        (dmg, isCrit, pt) => {
          this._showHitmarker(isCrit);
          this._spawnFloatingDamage(dmg, isCrit, pt);
        }
      );

      this.enemies.update(
        worldDt,
        this.elapsed,
        this.player.pos,
        this.camera.position,
        (dmg, origin) => this._handlePlayerDamaged(dmg, origin)
      );

      this.sound.updateCombatPulse(realDt, this.enemies.enemies.length, this.player.overdriveActive);
      this._drawRadar();
      this._updateHUD(realDt);
    }

    this.composer.render();
  }
}

window.AetherGame = AetherGame;
