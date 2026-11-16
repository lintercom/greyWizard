import * as THREE from 'three';

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

export function getSharedRadialShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTex) return sharedShadowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(6, 9, 12, 0.78)');
  grad.addColorStop(0.5, 'rgba(6, 9, 12, 0.36)');
  grad.addColorStop(1, 'rgba(6, 9, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedShadowTex = tex;
  return tex;
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  return getSharedRadialShadowTexture();
}

export function createStoneTextures(maxAniso = 4): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Dark recessed mortar base
  cCtx.fillStyle = '#3b4046';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#303030';
  bCtx.fillRect(0, 0, size, size);

  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = size / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = 74 + Math.floor(hash2d(c + r * 7, r) * 34);
      const warm = Math.floor(hash2d(r, c) * 12);
      cCtx.fillStyle = `rgb(${shade + warm}, ${shade + 4}, ${shade - 3})`;
      cCtx.fillRect(bx + 2.5, by + 2.5, colW - 5, rowH - 5);

      // Subtle bevel edge highlight on upper stone lip
      cCtx.fillStyle = 'rgba(205, 212, 218, 0.12)';
      cCtx.fillRect(bx + 3, by + 3, colW - 6, 3);

      const bShade = 148 + Math.floor(hash2d(c * 3, r * 5) * 76);
      bCtx.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
      bCtx.fillRect(bx + 2.5, by + 2.5, colW - 5, rowH - 5);
    }
  }

  // Granite grit & mossy weathering specks
  for (let i = 0; i < 640; i++) {
    const x = hash2d(i, 1.3) * size;
    const y = hash2d(i, 9.7) * size;
    const r = 1 + hash2d(i, 4.1) * 3.2;
    cCtx.fillStyle =
      i % 4 === 0
        ? 'rgba(54, 74, 46, 0.34)'
        : i % 3 === 0
          ? 'rgba(26, 30, 34, 0.28)'
          : 'rgba(130, 136, 140, 0.16)';
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();

    const bv = i % 2 === 0 ? 110 : 210;
    bCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.24)`;
    bCtx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

export function createGroundDetailTexture(maxAniso = 4): THREE.CanvasTexture {
  return createGroundDetailTextures(maxAniso).map;
}

export function createGroundDetailTextures(maxAniso = 4): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#cfcfcb';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Subtle organic earth & blade tufts
  for (let i = 0; i < 3400; i++) {
    const x = hash2d(i, 0.7) * size;
    const y = hash2d(i, 3.1) * size;
    const v = 166 + Math.floor(hash2d(i, 8.9) * 58);
    const w = 1 + (i % 3);
    const h = 1 + ((i + 1) % 3);
    ctx.fillStyle = i % 7 === 0 ? `rgb(${v - 18}, ${v - 10}, ${v - 22})` : `rgb(${v}, ${v + 4}, ${v - 4})`;
    ctx.fillRect(x, y, w, h);

    const bv = 90 + Math.floor(hash2d(i, 5.4) * 110);
    bCtx.fillStyle = `rgb(${bv}, ${bv}, ${bv})`;
    bCtx.fillRect(x, y, w, h);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(54, 54);
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(54, 54);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

export function createWoodTexture(maxAniso = 4): THREE.CanvasTexture {
  return createWoodTextures(maxAniso).map;
}

export function createWoodTextures(maxAniso = 4): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#4f3825';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#7c7c7c';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = 56 + Math.floor(hash2d(y, 2.3) * 34);
    ctx.fillStyle = `rgb(${shade + 18}, ${shade}, ${Math.max(18, shade - 20)})`;
    ctx.fillRect(0, y, size, 2);

    const bs = 90 + Math.floor(hash2d(y, 6.1) * 90);
    bCtx.fillStyle = `rgb(${bs}, ${bs}, ${bs})`;
    bCtx.fillRect(0, y, size, 2);
  }

  // Plank seams
  for (let p = 32; p < size; p += 32) {
    ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
    ctx.fillRect(0, p, size, 2);
    bCtx.fillStyle = '#242424';
    bCtx.fillRect(0, p, size, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

export function createBarkTexture(maxAniso = 4): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3b2b1e';
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 3) {
    const shade = 44 + Math.floor(hash2d(x, 1.7) * 28);
    ctx.fillStyle = `rgb(${shade + 14}, ${shade}, ${Math.max(14, shade - 14)})`;
    ctx.fillRect(x, 0, 2, size);
  }
  for (let i = 0; i < 180; i++) {
    const x = hash2d(i, 3.3) * size;
    const y = hash2d(i, 7.9) * size;
    ctx.fillStyle = 'rgba(22, 16, 12, 0.35)';
    ctx.fillRect(x, y, 2, 6 + (i % 8));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}
