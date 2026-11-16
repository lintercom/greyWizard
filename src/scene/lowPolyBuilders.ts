import * as THREE from 'three';

export function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Ensures geometry is non-indexed and has crisp per-triangle flat normals.
 */
export function toFlatFaceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  flat.computeVertexNormals();
  return flat;
}

/**
 * Paints vertical + normal-facing stylized color variation onto a flat-shaded geometry.
 */
export function applyFacetVertexColors(
  geo: THREE.BufferGeometry,
  bottomHex: number,
  topHex: number,
  sunHex?: number,
  jitterAmount = 0.04,
  seed = 1,
): THREE.BufferGeometry {
  const flat = toFlatFaceted(geo);
  flat.computeBoundingBox();
  const bb = flat.boundingBox!;
  const minY = bb.min.y;
  const spanY = Math.max(0.001, bb.max.y - minY);

  const pos = flat.attributes.position;
  const norm = flat.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  const cBot = new THREE.Color(bottomHex);
  const cTop = new THREE.Color(topHex);
  const cSun = sunHex !== undefined ? new THREE.Color(sunHex) : null;
  const tmp = new THREE.Color();

  // Assign per-face color (every 3 vertices form a triangle) so facets stay crisp
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const ny = (norm.getY(i) + norm.getY(i + 1) + norm.getY(i + 2)) / 3;
    const t = THREE.MathUtils.clamp((cy - minY) / spanY, 0, 1);

    tmp.copy(cBot).lerp(cTop, t);
    if (cSun && ny > 0.25) {
      tmp.lerp(cSun, (ny - 0.25) * 0.42);
    }
    const j = (seededRand(i * 3.17 + seed) - 0.5) * jitterAmount;
    tmp.offsetHSL(j * 0.15, j * 0.25, j);

    for (let k = 0; k < 3; k++) {
      const idx = (i + k) * 3;
      colors[idx] = tmp.r;
      colors[idx + 1] = tmp.g;
      colors[idx + 2] = tmp.b;
    }
  }

  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

/**
 * Merges multiple non-indexed BufferGeometries (all sharing position/normal/color attributes)
 * into one crisp draw-call-friendly low-poly mesh.
 */
export function mergeFacetedGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  const flats = geos.map((g) => toFlatFaceted(g));
  for (const g of flats) {
    totalVerts += g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const hasColors = flats.every((g) => Boolean(g.attributes.color));
  const colors = hasColors ? new Float32Array(totalVerts * 3) : null;

  let offset = 0;
  for (const g of flats) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    positions.set(p.array as Float32Array, offset * 3);
    normals.set(n.array as Float32Array, offset * 3);
    if (colors && c) {
      colors.set(c.array as Float32Array, offset * 3);
    }
    offset += p.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates an asymmetric 4-tier sculpted conifer crown with notched bough lobes,
 * natural downward branch droop, and sun-lit top vs deep forest-green underside facets.
 */
export function makeStylizedPineCrownGeo(seed = 11): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = [
    { r: 1.92, h: 2.05, y: 2.15, ox: 0.1, oz: -0.06, segs: 8, lobes: 4, bot: 0x1a3822, top: 0x2e5831, sun: 0x45753f },
    { r: 1.56, h: 1.95, y: 3.18, ox: -0.11, oz: 0.08, segs: 8, lobes: 4, bot: 0x1f4227, top: 0x366436, sun: 0x4f8245 },
    { r: 1.18, h: 1.85, y: 4.18, ox: 0.07, oz: 0.06, segs: 7, lobes: 3, bot: 0x264e2c, top: 0x41723e, sun: 0x5c904d },
    { r: 0.78, h: 1.65, y: 5.1, ox: -0.04, oz: -0.04, segs: 6, lobes: 3, bot: 0x2e5b33, top: 0x4c8046, sun: 0x6aa056 },
  ];

  tiers.forEach((tier, tIdx) => {
    const cone = new THREE.ConeGeometry(tier.r, tier.h, tier.segs, 2);
    const pos = cone.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.08) {
        const ang = Math.atan2(z, x);
        const k = Math.round(ang * 20) + Math.round(y * 10) * 13 + seed + tIdx * 37;
        // Strong scalloped bough notches so silhouette reads as irregular pine branches, not a uniform cone
        const scallop = 0.78 + 0.28 * Math.cos(ang * tier.lobes + tIdx * 1.3);
        const jitter = 0.88 + seededRand(k) * 0.28;
        const radialMod = scallop * jitter;
        const droop = y < 0 ? -0.22 - 0.16 * seededRand(k + 5) : 0;
        pos.setXYZ(i, x * radialMod, y + droop, z * radialMod);
      }
    }
    cone.rotateY(tIdx * 0.72 + seededRand(seed + tIdx) * 0.45);
    cone.rotateX((seededRand(seed * 2 + tIdx) - 0.5) * 0.08);
    cone.rotateZ((seededRand(seed * 3 + tIdx) - 0.5) * 0.1);
    cone.translate(tier.ox, tier.y, tier.oz);
    parts.push(applyFacetVertexColors(cone, tier.bot, tier.top, tier.sun, 0.055, seed + tIdx * 19));
  });

  return mergeFacetedGeometries(parts);
}

/**
 * Low-poly meadow wildflower & heather cluster (foliage blades + faceted blossom heads).
 */
export function makeWildflowerTuftGeo(seed = 83): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stems = [
    { x: 0, z: 0, h: 0.34, rotZ: 0.08, flowerHex: 0xeab308 },
    { x: -0.11, z: 0.08, h: 0.27, rotZ: -0.18, flowerHex: 0xfacc15 },
    { x: 0.1, z: -0.07, h: 0.3, rotZ: 0.22, flowerHex: 0xc084fc },
  ];
  stems.forEach((s, idx) => {
    const leaf = new THREE.ConeGeometry(0.055, s.h, 4);
    leaf.translate(0, s.h * 0.5, 0);
    leaf.rotateZ(s.rotZ);
    leaf.translate(s.x, 0, s.z);
    parts.push(applyFacetVertexColors(leaf, 0x3b6131, 0x5d8842, undefined, 0.04, seed + idx));

    const bud = new THREE.OctahedronGeometry(0.055, 0);
    bud.translate(s.x - Math.sin(s.rotZ) * s.h * 0.9, s.h * 0.96, s.z);
    parts.push(applyFacetVertexColors(bud, s.flowerHex, 0xfef08a, undefined, 0.04, seed + idx + 11));
  });
  return mergeFacetedGeometries(parts);
}

/**
 * Creates a sculpted low-poly pine/oak trunk with root flare and bark vertex shading.
 */
export function makeSculptedTrunkGeo(topR = 0.13, botR = 0.34, height = 3.1, seed = 7): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(topR, botR, height, 6, 3);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const normY = (y + height * 0.5) / height;
    // Root flare at bottom
    if (normY < 0.25) {
      const flare = 1 + (0.25 - normY) * 1.45;
      const ang = Math.atan2(z, x);
      const rootRib = 0.88 + Math.abs(Math.sin(ang * 3 + seed)) * 0.32;
      pos.setX(i, x * flare * rootRib);
      pos.setZ(i, z * flare * rootRib);
    } else if (normY > 0.35) {
      // Subtle organic bend
      pos.setX(i, x + Math.sin(normY * Math.PI) * 0.09);
    }
  }
  trunk.translate(0, height * 0.5, 0);
  return applyFacetVertexColors(trunk, 0x3b291c, 0x624630, 0x76573d, 0.04, seed);
}

/**
 * Broadleaf low-poly valley oak/hazel crown (clustered faceted polyhedral puffs).
 */
export function makeBroadleafCrownGeo(seed = 31): THREE.BufferGeometry {
  const puffs = [
    { r: 1.42, x: 0.0, y: 3.35, z: 0.0, sx: 1.15, sy: 0.88, sz: 1.05 },
    { r: 1.08, x: -0.92, y: 2.95, z: 0.42, sx: 1.0, sy: 0.85, sz: 0.95 },
    { r: 1.02, x: 0.88, y: 3.05, z: -0.35, sx: 1.0, sy: 0.82, sz: 1.0 },
    { r: 0.9, x: 0.12, y: 4.1, z: 0.28, sx: 1.05, sy: 0.82, sz: 0.95 },
  ];

  const parts = puffs.map((p, idx) => {
    const ico = new THREE.IcosahedronGeometry(p.r, 1);
    const pos = ico.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const k = Math.round((vx * 4 + vy * 7 + vz * 5) * 10) + seed + idx * 23;
      const n = 0.84 + seededRand(k) * 0.3;
      pos.setXYZ(i, vx * n * p.sx, vy * n * p.sy, vz * n * p.sz);
    }
    ico.translate(p.x, p.y, p.z);
    return applyFacetVertexColors(ico, 0x2f502a, 0x54823d, 0x7aa34a, 0.06, seed + idx * 17);
  });

  return mergeFacetedGeometries(parts);
}

/**
 * Low-poly shrub / bush cluster with organic faceted puffs.
 */
export function makeLowPolyBushGeo(seed = 53): THREE.BufferGeometry {
  const blobs = [
    { r: 0.48, x: 0, y: 0.3, z: 0, sy: 0.78 },
    { r: 0.36, x: -0.28, y: 0.22, z: 0.16, sy: 0.72 },
    { r: 0.34, x: 0.26, y: 0.24, z: -0.14, sy: 0.75 },
  ];
  const parts = blobs.map((b, idx) => {
    const d = new THREE.DodecahedronGeometry(b.r, 0);
    d.scale(1, b.sy, 1);
    d.rotateY(idx * 1.1 + seed);
    d.translate(b.x, b.y, b.z);
    return applyFacetVertexColors(d, 0x2c4b27, 0x4f7c3c, 0x6d9949, 0.06, seed + idx);
  });
  return mergeFacetedGeometries(parts);
}

/**
 * Chiseled angular low-poly boulder with flat planes & mossy top hints.
 */
export function makeChiseledRockGeo(seed = 17): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.92, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const k = Math.round(vx * 13) * 31 + Math.round(vy * 13) * 17 + Math.round(vz * 13) * 53 + seed;
    const n = 0.76 + seededRand(k) * 0.42;
    // Flatten bottom slightly so rocks sit naturally in ground
    const yFlatten = vy < -0.25 ? vy * 0.65 : vy * 0.88;
    pos.setXYZ(i, vx * n, yFlatten * n, vz * n);
  }
  return applyFacetVertexColors(geo, 0x464d54, 0x6f777e, 0x7b8473, 0.05, seed);
}

/**
 * Diamond cross-section faceted medieval/elven sword blade (for Glamdring & Edran).
 */
export function makeDiamondBladeGeo(length = 0.92, width = 0.056, thickness = 0.022): THREE.BufferGeometry {
  const hw = width * 0.5;
  const ht = thickness * 0.5;
  const shoulderY = length * 0.82;

  // 4-point diamond cross-section at base (y=0), shoulder (y=shoulderY, tapered), and tip (y=length)
  const baseF = [0, 0, ht];
  const baseB = [0, 0, -ht];
  const baseL = [-hw, 0, 0];
  const baseR = [hw, 0, 0];

  const shW = hw * 0.72;
  const shT = ht * 0.72;
  const shF = [0, shoulderY, shT];
  const shB = [0, shoulderY, -shT];
  const shL = [-shW, shoulderY, 0];
  const shR = [shW, shoulderY, 0];

  const tip = [0, length, 0];

  const tris: number[] = [];
  const pushTri = (a: number[], b: number[], c: number[]) => {
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const pushQuad = (a: number[], b: number[], c: number[], d: number[]) => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  // Lower fuller bevel faces
  pushQuad(baseL, baseF, shF, shL);
  pushQuad(baseF, baseR, shR, shF);
  pushQuad(baseR, baseB, shB, shR);
  pushQuad(baseB, baseL, shL, shB);

  // Tip point faces
  pushTri(shL, shF, tip);
  pushTri(shF, shR, tip);
  pushTri(shR, shB, tip);
  pushTri(shB, shL, tip);

  // Base cap
  pushTri(baseL, baseB, baseF);
  pushTri(baseF, baseB, baseR);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Faceted curved wooden wagon wheel with spokes and iron rim segments.
 */
export function makeSpokedWheelGeo(radius = 0.45, width = 0.09): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const rim = new THREE.TorusGeometry(radius, width * 0.42, 5, 10);
  parts.push(applyFacetVertexColors(rim, 0x3b2819, 0x4f3622, undefined, 0.03, 1));

  const hub = new THREE.CylinderGeometry(0.1, 0.1, width * 1.4, 6);
  hub.rotateX(Math.PI / 2);
  parts.push(applyFacetVertexColors(hub, 0x43484f, 0x626870, undefined, 0.02, 2));

  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.BoxGeometry(0.045, radius * 1.84, 0.045);
    spoke.rotateZ((i / 6) * Math.PI);
    parts.push(applyFacetVertexColors(spoke, 0x523924, 0x6d4e33, undefined, 0.02, 3 + i));
  }

  return mergeFacetedGeometries(parts);
}
