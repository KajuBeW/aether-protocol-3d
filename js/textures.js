/**
 * AETHER PROTOCOL - Procedural High-Resolution PBR Texture Generator
 * Generates Albedo, Roughness (wet rain puddles vs porous concrete), Bump/Height,
 * Brushed Gunmetal, Hazard Trim, and Radial Particle Sprites on HTML5 Canvas.
 */
class TextureFactory {
  static createAll(THREE, maxAnisotropy = 8) {
    const wrapRepeat = (tex, rx, ry) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
      tex.anisotropy = maxAnisotropy;
      tex.needsUpdate = true;
      return tex;
    };

    // 1. Wet Rain-Slicked Cyber Asphalt & Puddle Maps (1024x1024)
    const size = 1024;
    const albCanvas = document.createElement('canvas');
    const roughCanvas = document.createElement('canvas');
    const bumpCanvas = document.createElement('canvas');
    albCanvas.width = roughCanvas.width = bumpCanvas.width = size;
    albCanvas.height = roughCanvas.height = bumpCanvas.height = size;

    const aCtx = albCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');

    // Base dark wet slate concrete
    aCtx.fillStyle = '#19202b';
    aCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#b8b8b8'; // ~0.72 roughness default
    rCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    // Fine aggregate noise
    for (let i = 0; i < 28000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const s = 1 + Math.random() * 2.5;
      const v = 22 + Math.floor(Math.random() * 26);
      aCtx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      aCtx.fillRect(x, y, s, s);

      const bv = 100 + Math.floor(Math.random() * 56);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, s, s);
    }

    // Mirror-like rain puddles (very low roughness = sharp neon/sky reflections!)
    for (let p = 0; p < 26; p++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const rad = 45 + Math.random() * 115;

      const rGrad = rCtx.createRadialGradient(px, py, rad * 0.15, px, py, rad);
      rGrad.addColorStop(0, 'rgb(14, 14, 14)');     // roughness ~0.05 (wet puddle!)
      rGrad.addColorStop(0.65, 'rgb(34, 34, 34)');  // damp rim
      rGrad.addColorStop(1, 'rgba(184,184,184,0)');
      rCtx.fillStyle = rGrad;
      rCtx.beginPath();
      rCtx.arc(px, py, rad, 0, Math.PI * 2);
      rCtx.fill();

      const aGrad = aCtx.createRadialGradient(px, py, 0, px, py, rad);
      aGrad.addColorStop(0, 'rgba(8, 12, 20, 0.55)');
      aGrad.addColorStop(1, 'rgba(8, 12, 20, 0)');
      aCtx.fillStyle = aGrad;
      aCtx.beginPath();
      aCtx.arc(px, py, rad, 0, Math.PI * 2);
      aCtx.fill();
    }

    // Architectural concrete tile seams + subtle cyan tech inlays
    const step = 256;
    aCtx.strokeStyle = '#0d1219';
    aCtx.lineWidth = 4;
    bCtx.strokeStyle = '#282828';
    bCtx.lineWidth = 5;
    for (let g = 0; g <= size; g += step) {
      aCtx.beginPath(); aCtx.moveTo(g, 0); aCtx.lineTo(g, size); aCtx.stroke();
      aCtx.beginPath(); aCtx.moveTo(0, g); aCtx.lineTo(size, g); aCtx.stroke();
      bCtx.beginPath(); bCtx.moveTo(g, 0); bCtx.lineTo(g, size); bCtx.stroke();
      bCtx.beginPath(); bCtx.moveTo(0, g); bCtx.lineTo(size, g); bCtx.stroke();
    }

    // Subtle tactical markings on tiles
    aCtx.strokeStyle = 'rgba(0, 210, 255, 0.14)';
    aCtx.lineWidth = 2;
    for (let x = step / 2; x < size; x += step) {
      for (let y = step / 2; y < size; y += step) {
        aCtx.strokeRect(x - 16, y - 16, 32, 32);
      }
    }

    const floorAlbedo = wrapRepeat(new THREE.CanvasTexture(albCanvas), 14, 14);
    floorAlbedo.colorSpace = THREE.SRGBColorSpace;
    const floorRoughness = wrapRepeat(new THREE.CanvasTexture(roughCanvas), 14, 14);
    const floorBump = wrapRepeat(new THREE.CanvasTexture(bumpCanvas), 14, 14);

    // 2. Brushed Sci-Fi Metal Armor / Wall Panel Texture (512x512)
    const mSize = 512;
    const mAlb = document.createElement('canvas');
    const mBump = document.createElement('canvas');
    mAlb.width = mBump.width = mSize;
    mAlb.height = mBump.height = mSize;
    const maCtx = mAlb.getContext('2d');
    const mbCtx = mBump.getContext('2d');

    maCtx.fillStyle = '#2a3342';
    maCtx.fillRect(0, 0, mSize, mSize);
    mbCtx.fillStyle = '#808080';
    mbCtx.fillRect(0, 0, mSize, mSize);

    // Brushed horizontal micro-streaks
    for (let i = 0; i < 2400; i++) {
      const y = Math.random() * mSize;
      const x = Math.random() * mSize;
      const w = 18 + Math.random() * 80;
      const shade = 36 + Math.floor(Math.random() * 24);
      maCtx.fillStyle = `rgba(${shade},${shade + 8},${shade + 18},0.35)`;
      maCtx.fillRect(x, y, w, 1.5);
    }

    // Beveled sci-fi panel grooves & rivets
    maCtx.strokeStyle = '#121822';
    maCtx.lineWidth = 4;
    mbCtx.strokeStyle = '#202020';
    mbCtx.lineWidth = 5;
    maCtx.strokeRect(6, 6, mSize - 12, mSize - 12);
    mbCtx.strokeRect(6, 6, mSize - 12, mSize - 12);

    maCtx.beginPath();
    maCtx.moveTo(0, mSize / 2); maCtx.lineTo(mSize, mSize / 2);
    maCtx.moveTo(mSize / 2, 0); maCtx.lineTo(mSize / 2, mSize);
    maCtx.stroke();
    mbCtx.beginPath();
    mbCtx.moveTo(0, mSize / 2); mbCtx.lineTo(mSize, mSize / 2);
    mbCtx.moveTo(mSize / 2, 0); mbCtx.lineTo(mSize / 2, mSize);
    mbCtx.stroke();

    // Corner rivets
    const rivets = [22, mSize / 2 - 18, mSize / 2 + 18, mSize - 22];
    rivets.forEach(rx => {
      rivets.forEach(ry => {
        maCtx.fillStyle = '#4c5b73';
        maCtx.beginPath(); maCtx.arc(rx, ry, 4, 0, Math.PI * 2); maCtx.fill();
        mbCtx.fillStyle = '#d8d8d8';
        mbCtx.beginPath(); mbCtx.arc(rx, ry, 4, 0, Math.PI * 2); mbCtx.fill();
      });
    });

    const metalAlbedo = wrapRepeat(new THREE.CanvasTexture(mAlb), 2, 2);
    metalAlbedo.colorSpace = THREE.SRGBColorSpace;
    const metalBump = wrapRepeat(new THREE.CanvasTexture(mBump), 2, 2);

    // 3. Industrial Hazard Stripes Texture (256x256)
    const hCanvas = document.createElement('canvas');
    hCanvas.width = hCanvas.height = 256;
    const hCtx = hCanvas.getContext('2d');
    hCtx.fillStyle = '#d99b00';
    hCtx.fillRect(0, 0, 256, 256);
    hCtx.fillStyle = '#15181f';
    for (let i = -256; i < 512; i += 48) {
      hCtx.beginPath();
      hCtx.moveTo(i, 0);
      hCtx.lineTo(i + 24, 0);
      hCtx.lineTo(i - 256 + 24, 256);
      hCtx.lineTo(i - 256, 256);
      hCtx.closePath();
      hCtx.fill();
    }
    // Scratches / grime
    for (let s = 0; s < 700; s++) {
      hCtx.fillStyle = `rgba(20,24,30,${Math.random() * 0.28})`;
      hCtx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    const hazardAlbedo = wrapRepeat(new THREE.CanvasTexture(hCanvas), 4, 1);
    hazardAlbedo.colorSpace = THREE.SRGBColorSpace;

    // 4. Soft Radial Glow Sprite (for muzzle flash, plasma, particles)
    const gCanvas = document.createElement('canvas');
    gCanvas.width = gCanvas.height = 128;
    const gCtx = gCanvas.getContext('2d');
    const grad = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.28, 'rgba(200,245,255,0.82)');
    grad.addColorStop(0.65, 'rgba(0,190,255,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, 128, 128);
    const glowSprite = new THREE.CanvasTexture(gCanvas);

    return {
      floorAlbedo,
      floorRoughness,
      floorBump,
      metalAlbedo,
      metalBump,
      hazardAlbedo,
      glowSprite
    };
  }
}

window.TextureFactory = TextureFactory;
