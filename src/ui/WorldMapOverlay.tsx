import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Flag,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { liveSim, useGameStore } from '../game/store';
import { CHAPTERS, SIDE_QUESTS, SideQuestId, getMainQuestStepDef } from '../game/storyData';
import {
  CAVE_POS,
  FORD_POS,
  ROAD_WAYPOINTS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  WATERFALL_POS,
  WORLD_RADIUS,
  clamp,
  groundHeightAt,
  isWaterAt,
  riverCenterZ,
} from '../game/terrain';
import {
  FOG_GRID_SIZE,
  MAP_CATEGORIES,
  MapMarker,
  MapMarkerCategory,
  PositionedMarker,
  buildWorldMapMarkers,
  clampMapPan,
  computeExplorationPercent,
  filterWorldMapMarkers,
  getForestTreeCoords,
  layoutMapMarkers,
  mapNormToWorld,
  resolveTrackedObjectivePos,
  worldToMapNorm,
} from '../game/worldMapData';

const PARCHMENT_TEX_SIZE = 1024;
const FOG_TEX_SIZE = 288;
const MAP_BASE_SIZE = 860;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 3.6;

let cachedParchmentCanvas: HTMLCanvasElement | null = null;

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Generates and caches the hand-drawn Middle-earth parchment map once from real
 * terrain heightmap, river channel, roads, forest trees, and landmarks.
 */
function getOrBuildParchmentCanvas(): HTMLCanvasElement {
  if (cachedParchmentCanvas) return cachedParchmentCanvas;

  const canvas = document.createElement('canvas');
  canvas.width = PARCHMENT_TEX_SIZE;
  canvas.height = PARCHMENT_TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const size = PARCHMENT_TEX_SIZE;
  const half = size / 2;

  // 1. Pixel-accurate Parchment Base + Topographic Hillshading + Contour Isolines
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Pre-sample height grid on a 256x256 mesh for ultra-fast smooth bilinear elevation & contours
  const sampleRes = 256;
  const heights = new Float32Array((sampleRes + 1) * (sampleRes + 1));
  const waters = new Uint8Array((sampleRes + 1) * (sampleRes + 1));
  for (let sy = 0; sy <= sampleRes; sy++) {
    const v = sy / sampleRes;
    const wz = v * (WORLD_RADIUS * 2) - WORLD_RADIUS;
    for (let sx = 0; sx <= sampleRes; sx++) {
      const u = sx / sampleRes;
      const wx = u * (WORLD_RADIUS * 2) - WORLD_RADIUS;
      const idx = sy * (sampleRes + 1) + sx;
      heights[idx] = groundHeightAt(wx, wz);
      waters[idx] = isWaterAt(wx, wz) ? 1 : 0;
    }
  }

  const sampleH = (u: number, v: number): number => {
    const gx = clamp(u * sampleRes, 0, sampleRes - 1e-4);
    const gy = clamp(v * sampleRes, 0, sampleRes - 1e-4);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const stride = sampleRes + 1;
    const h00 = heights[y0 * stride + x0];
    const h10 = heights[y0 * stride + x0 + 1];
    const h01 = heights[(y0 + 1) * stride + x0];
    const h11 = heights[(y0 + 1) * stride + x0 + 1];
    const top = h00 + (h10 - h00) * fx;
    const bot = h01 + (h11 - h01) * fx;
    return top + (bot - top) * fy;
  };

  const contourLevels = [0.6, 2.0, 3.6, 5.4, 7.4, 10.5, 14.5];

  for (let py = 0; py < size; py++) {
    const v = py / size;
    const dyNorm = (py - half) / half;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const dxNorm = (px - half) / half;
      const radialNorm = Math.hypot(dxNorm, dyNorm);

      const h = sampleH(u, v);
      const hDx = sampleH(u + 1 / sampleRes, v) - sampleH(u - 1 / sampleRes, v);
      const hDz = sampleH(u, v + 1 / sampleRes) - sampleH(u, v - 1 / sampleRes);

      // NW directional relief shading
      const shade = clamp((-hDx * 0.65 - hDz * 0.65) * 0.55, -0.18, 0.16);
      const grain = (hash2D(px * 0.65, py * 0.65) - 0.5) * 9 + (hash2D(px * 0.14, py * 0.14) - 0.5) * 6;

      // Subtle edge aging vignette on parchment
      const edgeBurn = Math.pow(clamp(radialNorm * 0.92, 0, 1.25), 2.3) * 28;
      // Elevation tint: higher northern slopes slightly warmer stone-ochre
      const elevTint = clamp(h / 18, 0, 1);

      let r = 232 - edgeBurn + shade * 60 + grain - elevTint * 16;
      let g = 215 - edgeBurn * 1.08 + shade * 52 + grain - elevTint * 20;
      let b = 178 - edgeBurn * 1.22 + shade * 42 + grain - elevTint * 24;

      // Subtle green meadow wash in mid-valley lowlands
      if (h > 0.0 && h < 3.4) {
        const meadow = (1 - Math.abs(h - 1.5) / 1.9) * 0.45;
        r -= meadow * 14;
        g -= meadow * 3;
        b -= meadow * 16;
      }

      // Contour isolines
      let onContour = false;
      for (let c = 0; c < contourLevels.length; c++) {
        const lvl = contourLevels[c];
        const diff = Math.abs(h - lvl);
        if (diff < 0.095) {
          onContour = true;
          break;
        }
      }
      if (onContour) {
        r = r * 0.78 + 94 * 0.22;
        g = g * 0.78 + 70 * 0.22;
        b = b * 0.78 + 48 * 0.22;
      }

      const outIdx = (py * size + px) * 4;
      data[outIdx] = clamp(Math.round(r), 0, 255);
      data[outIdx + 1] = clamp(Math.round(g), 0, 255);
      data[outIdx + 2] = clamp(Math.round(b), 0, 255);
      data[outIdx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Helper to map world (x, z) -> canvas pixels
  const toPx = (wx: number, wz: number) => {
    const { u, v } = worldToMapNorm(wx, wz);
    return { x: u * size, y: v * size };
  };

  // 2. Cartographic Lat/Lon Ink Grid (faint aged sepia lines)
  ctx.save();
  ctx.strokeStyle = 'rgba(92, 68, 43, 0.14)';
  ctx.lineWidth = 1;
  const gridStep = size / 8;
  for (let i = 1; i < 8; i++) {
    const p = i * gridStep;
    ctx.beginPath();
    ctx.moveTo(p, 26);
    ctx.lineTo(p, size - 26);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(26, p);
    ctx.lineTo(size - 26, p);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Winding River Channel + Banks + Silver Ford + Western Waterfall
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer river bank shadow
  ctx.beginPath();
  for (let wx = -46; wx <= 55; wx += 1.2) {
    const p = toPx(wx, riverCenterZ(wx));
    if (wx === -46) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(66, 86, 88, 0.48)';
  ctx.lineWidth = 22;
  ctx.stroke();

  // Main slate-blue river ink fill
  ctx.strokeStyle = '#6b94a3';
  ctx.lineWidth = 15;
  ctx.stroke();

  // Inner water highlight thread
  ctx.strokeStyle = 'rgba(205, 226, 232, 0.55)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Shallow crossing stones at Stříbrný brod
  const fordP = toPx(FORD_POS.x, FORD_POS.z);
  ctx.fillStyle = '#c9b38c';
  ctx.strokeStyle = '#5c4630';
  ctx.lineWidth = 1.2;
  for (let s = -2; s <= 2; s++) {
    ctx.beginPath();
    ctx.ellipse(fordP.x + s * 4.5, fordP.y + ((s % 2) * 3 - 1.5), 2.8, 2.0, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Waterfall cascade ripples at WATERFALL_POS
  const wfP = toPx(WATERFALL_POS.x, WATERFALL_POS.z);
  ctx.strokeStyle = '#3f6775';
  ctx.lineWidth = 1.6;
  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.arc(wfP.x + 8, wfP.y, r * 6, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Main Traveler's Road (dashed cartographic track)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ROAD_WAYPOINTS.forEach((wp, idx) => {
    const p = toPx(wp.x, wp.z);
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = 'rgba(218, 198, 159, 0.75)';
  ctx.lineWidth = 9;
  ctx.stroke();

  ctx.strokeStyle = '#6f5134';
  ctx.lineWidth = 2.6;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Secondary branch trail from trail junction toward Osada Líska
  const branchStart = toPx(ROAD_WAYPOINTS[3].x, ROAD_WAYPOINTS[3].z);
  const villageP = toPx(VILLAGE_POS.x, VILLAGE_POS.z);
  ctx.beginPath();
  ctx.moveTo(branchStart.x, branchStart.y);
  ctx.quadraticCurveTo(
    (branchStart.x + villageP.x) * 0.5 + 14,
    (branchStart.y + villageP.y) * 0.5 + 16,
    villageP.x,
    villageP.y,
  );
  ctx.strokeStyle = 'rgba(111, 81, 52, 0.55)';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.restore();

  // 5. Hand-Drawn Pine Clusters (matching 3D world trees)
  const trees = getForestTreeCoords();
  ctx.save();
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const p = toPx(t.x, t.z);
    const sc = 4.2 * t.scale;
    // Soft canopy base wash
    ctx.fillStyle = 'rgba(72, 98, 56, 0.25)';
    ctx.beginPath();
    ctx.arc(p.x, p.y + 1, sc * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // Classic Tolkien-style miniature pine triangle + trunk
    ctx.fillStyle = '#4c653e';
    ctx.strokeStyle = '#2f3d24';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - sc * 1.45);
    ctx.lineTo(p.x + sc * 0.85, p.y + sc * 0.35);
    ctx.lineTo(p.x - sc * 0.85, p.y + sc * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p.x, p.y + sc * 0.35);
    ctx.lineTo(p.x, p.y + sc * 0.8);
    ctx.strokeStyle = '#5b422a';
    ctx.stroke();
  }
  ctx.restore();

  // 6. Hand-Drawn Misty Mountain Ridge Peaks along northern/outer rim
  ctx.save();
  const drawMountainPeak = (cx: number, cy: number, w: number, h: number) => {
    // Sunlit west slope
    ctx.fillStyle = '#cab794';
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx - w * 0.55, cy);
    ctx.lineTo(cx - w * 0.05, cy + h * 0.08);
    ctx.closePath();
    ctx.fill();

    // Shaded east slope
    ctx.fillStyle = '#978262';
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w * 0.55, cy);
    ctx.lineTo(cx - w * 0.05, cy + h * 0.08);
    ctx.closePath();
    ctx.fill();

    // Ink ridge outline
    ctx.strokeStyle = '#493725';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.55, cy);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx + w * 0.55, cy);
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx - w * 0.05, cy + h * 0.08);
    ctx.stroke();
  };

  // Northern range & outer cliffs (keep center title banner clear)
  for (let i = 0; i < 24; i++) {
    const wx = -82 + i * 7.1 + (hash2D(i, 3) - 0.5) * 3;
    const wz = -74 + Math.abs(wx) * 0.14 + (hash2D(i, 9) - 0.5) * 6;
    if (Math.hypot(wx - WATCHTOWER_POS.x, wz - WATCHTOWER_POS.z) < 16) continue;
    const p = toPx(wx, wz);
    if (p.y < 86 && Math.abs(p.x - size / 2) < 235) continue;
    drawMountainPeak(p.x, p.y, 26 + hash2D(i, 5) * 14, 18 + hash2D(i, 7) * 14);
  }
  // Western waterfall cliffs & eastern mine cliffs
  for (let i = 0; i < 8; i++) {
    const pW = toPx(-74 + (hash2D(i, 12) - 0.5) * 8, -42 + i * 11);
    drawMountainPeak(pW.x, pW.y, 22, 16);
    const pE = toPx(72 + (hash2D(i, 19) - 0.5) * 8, -48 + i * 10);
    drawMountainPeak(pE.x, pE.y, 22, 16);
  }
  ctx.restore();

  // 7. Subtle Miniature Architectural Ink Sketches (Village cottages, Cave arch, Watchtower)
  ctx.save();
  ctx.strokeStyle = '#4c3825';
  ctx.fillStyle = '#bca179';
  ctx.lineWidth = 1.3;
  // Osada Líska miniature cottages
  const cottageOffsets = [
    { dx: -14, dy: 8 },
    { dx: 12, dy: -6 },
    { dx: -4, dy: -14 },
  ];
  cottageOffsets.forEach((off) => {
    const cx = villageP.x + off.dx;
    const cy = villageP.y + off.dy;
    ctx.fillRect(cx - 5, cy - 3, 10, 7);
    ctx.strokeRect(cx - 5, cy - 3, 10, 7);
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 3);
    ctx.lineTo(cx, cy - 8);
    ctx.lineTo(cx + 6, cy - 3);
    ctx.closePath();
    ctx.fillStyle = '#8b5d3b';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bca179';
  });

  // Old Dwarven Mines arch sketch
  const caveP = toPx(CAVE_POS.x, CAVE_POS.z);
  ctx.fillStyle = '#3b3027';
  ctx.beginPath();
  ctx.arc(caveP.x, caveP.y + 3, 7, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mountain Fortress battlement sketch
  const towerP = toPx(WATCHTOWER_POS.x, WATCHTOWER_POS.z);
  ctx.fillStyle = '#8b8071';
  ctx.fillRect(towerP.x - 8, towerP.y - 7, 16, 13);
  ctx.strokeRect(towerP.x - 8, towerP.y - 7, 16, 13);
  ctx.restore();

  // 8. Parchment Cartouche Border & Compass Rose (South-West corner)
  ctx.save();
  ctx.strokeStyle = '#4e3925';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.lineWidth = 1;
  ctx.strokeRect(21, 21, size - 42, size - 42);

  // Regional Calligraphic Title Banner (Top-Center inside border)
  ctx.fillStyle = 'rgba(72, 52, 33, 0.85)';
  ctx.font = '600 18px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('PODHŮŘÍ MLŽNÝCH HOR · ÚDOLÍ LÍSKY', size / 2, 48);

  // Compass Rose in Bottom-Left Corner
  const rx = 88;
  const ry = size - 88;
  ctx.strokeStyle = '#533d28';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(rx, ry, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rx, ry, 22, 0, Math.PI * 2);
  ctx.stroke();

  // 4-point star
  const starPts = [
    { dx: 0, dy: -32, label: 'S' },
    { dx: 32, dy: 0, label: 'V' },
    { dx: 0, dy: 32, label: 'J' },
    { dx: -32, dy: 0, label: 'Z' },
  ];
  ctx.font = '700 13px Cinzel, Georgia, serif';
  ctx.textBaseline = 'middle';
  starPts.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + pt.dx * 0.72, ry + pt.dy * 0.72);
    ctx.strokeStyle = idx === 0 ? '#8c3b20' : '#533d28';
    ctx.lineWidth = idx === 0 ? 2.2 : 1.4;
    ctx.stroke();

    ctx.fillStyle = idx === 0 ? '#8c3b20' : '#4a3623';
    ctx.fillText(pt.label, rx + pt.dx * 1.25, ry + pt.dy * 1.25);
  });

  // Scale Bar in Bottom-Right Corner (40 meters)
  const pxPerMeter = size / (WORLD_RADIUS * 2);
  const scaleLen = 40 * pxPerMeter;
  const sx = size - 48 - scaleLen;
  const sy = size - 48;
  ctx.strokeStyle = '#4e3925';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 5);
  ctx.lineTo(sx, sy);
  ctx.lineTo(sx + scaleLen, sy);
  ctx.lineTo(sx + scaleLen, sy - 5);
  ctx.stroke();
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#4e3925';
  ctx.fillText('40 m', sx + scaleLen / 2, sy - 11);
  ctx.restore();

  cachedParchmentCanvas = canvas;
  return canvas;
}

function MarkerIcon({ category, size = 14 }: { category: MapMarkerCategory; size?: number }) {
  const s = size;
  if (category === 'main_quest') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.6 6.8L21.5 12l-6.9 3.2L12 22l-2.6-6.8L2.5 12l6.9-3.2L12 2z" />
      </svg>
    );
  }
  if (category === 'side_quest') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 3l8 9-8 9-8-9 8-9z" fill="currentColor" fillOpacity="0.22" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (category === 'settlement') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z" fill="currentColor" fillOpacity="0.2" />
      </svg>
    );
  }
  if (category === 'cave') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 19l6-12 4 6 3-4 5 10H3z" />
        <path d="M10 19a2.5 2.5 0 015 0" fill="currentColor" />
      </svg>
    );
  }
  if (category === 'enemy_camp') {
    return <Swords size={s} strokeWidth={2.1} />;
  }
  if (category === 'service') {
    return <Sparkles size={s} strokeWidth={2.1} />;
  }
  if (category === 'npc') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3.5" fill="currentColor" fillOpacity="0.25" />
        <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      </svg>
    );
  }
  if (category === 'waypoint') {
    return <Flag size={s} strokeWidth={2.2} />;
  }
  return <Compass size={s} strokeWidth={2.1} />;
}

export function WorldMapOverlay() {
  const phase = useGameStore((s) => s.phase);
  const worldMapOpen = useGameStore((s) => s.worldMapOpen);
  const toggleWorldMap = useGameStore((s) => s.toggleWorldMap);
  const mainStep = useGameStore((s) => s.mainStep);
  const flags = useGameStore((s) => s.flags);
  const sideQuests = useGameStore((s) => s.sideQuests);
  const discoveredLocations = useGameStore((s) => s.discoveredLocations);
  const fogGrid = useGameStore((s) => s.fogGrid);
  const customWaypoint = useGameStore((s) => s.customWaypoint);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const trackedQuest = useGameStore((s) => s.trackedQuest);
  const setTrackedQuest = useGameStore((s) => s.setTrackedQuest);
  const mapFilters = useGameStore((s) => s.mapFilters);
  const mapPresets = useGameStore((s) => s.mapPresets);
  const setMapFilterCategory = useGameStore((s) => s.setMapFilterCategory);
  const setAllMapFilters = useGameStore((s) => s.setAllMapFilters);
  const resetMapFilters = useGameStore((s) => s.resetMapFilters);
  const setMapPresets = useGameStore((s) => s.setMapPresets);
  const currentRegionName = useGameStore((s) => s.currentRegionName);

  const viewportRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [viewportSize, setViewportSize] = useState({ w: 800, h: 740 });
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [followGandalf, setFollowGandalf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origPanX: number; origPanY: number; moved: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    moved: false,
  });

  // Measure map viewport container whenever open or resized
  useEffect(() => {
    if (!worldMapOpen || !viewportRef.current) return;
    const el = viewportRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldMapOpen]);

  // Fit initial zoom cleanly when opening the map
  useEffect(() => {
    if (!worldMapOpen) return;
    setSelectedMarkerId(null);
    setHoveredMarkerId(null);
    setSearchQuery('');
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const fit = clamp(Math.min(rect.width, rect.height) / MAP_BASE_SIZE * 0.96, MIN_ZOOM, 1.35);
      setZoom(Number(fit.toFixed(2)));
      setPan({ x: 0, y: 0 });
    }
  }, [worldMapOpen]);

  // Draw cached parchment canvas onto visible canvas once when open
  useEffect(() => {
    if (!worldMapOpen || !baseCanvasRef.current) return;
    const src = getOrBuildParchmentCanvas();
    const dst = baseCanvasRef.current;
    if (dst.width !== PARCHMENT_TEX_SIZE) dst.width = PARCHMENT_TEX_SIZE;
    if (dst.height !== PARCHMENT_TEX_SIZE) dst.height = PARCHMENT_TEX_SIZE;
    const ctx = dst.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, dst.width, dst.height);
      ctx.drawImage(src, 0, 0);
    }
  }, [worldMapOpen]);

  // Redraw Fog-of-War overlay canvas only when fogGrid changes
  useEffect(() => {
    if (!worldMapOpen || !fogCanvasRef.current) return;
    const canvas = fogCanvasRef.current;
    if (canvas.width !== FOG_TEX_SIZE) canvas.width = FOG_TEX_SIZE;
    if (canvas.height !== FOG_TEX_SIZE) canvas.height = FOG_TEX_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, FOG_TEX_SIZE, FOG_TEX_SIZE);
    ctx.fillStyle = 'rgba(26, 21, 16, 0.56)';
    ctx.fillRect(0, 0, FOG_TEX_SIZE, FOG_TEX_SIZE);

    // Cut out explored cells with soft radial gradients for organic feathered mist edges
    ctx.globalCompositeOperation = 'destination-out';
    const cellPx = FOG_TEX_SIZE / FOG_GRID_SIZE;
    for (let row = 0; row < FOG_GRID_SIZE; row++) {
      for (let col = 0; col < FOG_GRID_SIZE; col++) {
        if (fogGrid[row * FOG_GRID_SIZE + col] === 1) {
          const cx = (col + 0.5) * cellPx;
          const cy = (row + 0.5) * cellPx;
          const rad = cellPx * 1.42;
          const grad = ctx.createRadialGradient(cx, cy, cellPx * 0.35, cx, cy, rad);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [worldMapOpen, fogGrid]);

  // Build live world markers from authoritative world/story state
  const allMarkers = useMemo(() => {
    if (!worldMapOpen) return [];
    const aliveByGroup: Record<'patrol' | 'village' | 'cave' | 'quarry' | 'watchtower', number> = {
      patrol: 0,
      village: 0,
      cave: 0,
      quarry: 0,
      watchtower: 0,
    };
    for (const e of liveSim.enemies) {
      if (!e.dead && e.group !== 'reinforcement') {
        aliveByGroup[e.group] += 1;
      }
    }
    const incompleteStoryTargets = liveSim.storyInteractables
      .filter((o) => !o.done)
      .map((o) => ({ id: o.id, kind: o.kind, x: o.x, z: o.z }));

    return buildWorldMapMarkers({
      mainStep,
      flags,
      sideQuests,
      discoveredLocations,
      fogGrid,
      customWaypoint,
      trackedQuest,
      enemiesAliveByGroup: aliveByGroup,
      incompleteStoryTargets,
    });
  }, [worldMapOpen, mainStep, flags, sideQuests, discoveredLocations, fogGrid, customWaypoint, trackedQuest]);

  const filteredMarkers = useMemo(
    () => filterWorldMapMarkers(allMarkers, mapFilters, mapPresets, zoom, searchQuery),
    [allMarkers, mapFilters, mapPresets, zoom, searchQuery],
  );

  const mapPixelSize = MAP_BASE_SIZE * zoom;
  const playerNorm = worldToMapNorm(liveSim.playerX, liveSim.playerZ);
  const playerMapPx = { x: playerNorm.u * mapPixelSize, y: playerNorm.v * mapPixelSize };

  const positionedMarkers: PositionedMarker[] = useMemo(() => {
    const laidOut = layoutMapMarkers(filteredMarkers, mapPixelSize, selectedMarkerId, playerMapPx);
    const originX = viewportSize.w / 2 + pan.x - mapPixelSize / 2;
    const originY = viewportSize.h / 2 + pan.y - mapPixelSize / 2;
    return laidOut.map((m) => ({
      ...m,
      screenX: originX + m.screenX,
      screenY: originY + m.screenY,
    }));
  }, [filteredMarkers, mapPixelSize, selectedMarkerId, playerMapPx.x, playerMapPx.y, viewportSize.w, viewportSize.h, pan.x, pan.y]);

  const explorationPercent = useMemo(() => computeExplorationPercent(fogGrid), [fogGrid]);

  const categoryCounts = useMemo(() => {
    const counts: Record<MapMarkerCategory, number> = {
      main_quest: 0,
      side_quest: 0,
      settlement: 0,
      npc: 0,
      service: 0,
      cave: 0,
      landmark: 0,
      enemy_camp: 0,
      waypoint: 0,
    };
    for (const m of allMarkers) counts[m.category] += 1;
    return counts;
  }, [allMarkers]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allMarkers.filter(
      (m) => m.revealed && `${m.title} ${m.subtitle}`.toLowerCase().includes(q),
    );
  }, [allMarkers, searchQuery]);

  const selectedMarker = useMemo(
    () => allMarkers.find((m) => m.id === selectedMarkerId) ?? null,
    [allMarkers, selectedMarkerId],
  );

  // Center map smoothly onto a world (x, z) coordinate at targetZoom
  const centerOnWorldPos = useCallback(
    (wx: number, wz: number, targetZoom?: number) => {
      const nextZoom = clamp(targetZoom ?? zoom, MIN_ZOOM, MAX_ZOOM);
      const { u, v } = worldToMapNorm(wx, wz);
      const nextSize = MAP_BASE_SIZE * nextZoom;
      const desiredPanX = -(u - 0.5) * nextSize;
      const desiredPanY = -(v - 0.5) * nextSize;
      const clamped = clampMapPan(desiredPanX, desiredPanY, nextZoom, viewportSize.w, viewportSize.h, MAP_BASE_SIZE);
      setZoom(nextZoom);
      setPan(clamped);
    },
    [zoom, viewportSize.w, viewportSize.h],
  );

  const recenterOnGandalf = useCallback(() => {
    centerOnWorldPos(liveSim.playerX, liveSim.playerZ, Math.max(zoom, 1.35));
  }, [centerOnWorldPos, zoom]);

  const focusOnTrackedObjective = useCallback(() => {
    const incomplete = liveSim.storyInteractables
      .filter((o) => !o.done)
      .map((o) => ({ id: o.id, kind: o.kind, x: o.x, z: o.z }));
    const target = resolveTrackedObjectivePos(trackedQuest, mainStep, sideQuests, incomplete);
    if (target) {
      setFollowGandalf(false);
      centerOnWorldPos(target.x, target.z, Math.max(zoom, 1.45));
      const questMarkerId = trackedQuest.kind === 'side' ? `sq_${trackedQuest.id}` : 'quest_main_active';
      setSelectedMarkerId(questMarkerId);
    }
  }, [trackedQuest, mainStep, sideQuests, centerOnWorldPos, zoom]);

  // If followGandalf mode is toggled on, keep view centered on Gandalf
  useEffect(() => {
    if (!worldMapOpen || !followGandalf) return;
    recenterOnGandalf();
  }, [worldMapOpen, followGandalf, recenterOnGandalf]);

  // Keyboard shortcuts while World Map is open: R = recenter Gandalf, F = focus quest, +/- = zoom
  useEffect(() => {
    if (!worldMapOpen || phase !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (typing) return;

      if (e.code === 'KeyR') {
        e.preventDefault();
        recenterOnGandalf();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        focusOnTrackedObjective();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        const nextZoom = clamp(Number((zoom + 0.25).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
        setZoom(nextZoom);
        setPan((p) => clampMapPan(p.x, p.y, nextZoom, viewportSize.w, viewportSize.h, MAP_BASE_SIZE));
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        const nextZoom = clamp(Number((zoom - 0.25).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
        setZoom(nextZoom);
        setPan((p) => clampMapPan(p.x, p.y, nextZoom, viewportSize.w, viewportSize.h, MAP_BASE_SIZE));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [worldMapOpen, phase, recenterOnGandalf, focusOnTrackedObjective, zoom, viewportSize.w, viewportSize.h]);

  if (phase !== 'playing' || !worldMapOpen) return null;

  // Player screen coordinates & clockwise heading angle
  const mapOriginX = viewportSize.w / 2 + pan.x - mapPixelSize / 2;
  const mapOriginY = viewportSize.h / 2 + pan.y - mapPixelSize / 2;
  const playerScreenX = mapOriginX + playerMapPx.x;
  const playerScreenY = mapOriginY + playerMapPx.y;
  const playerFwdX = Math.sin(liveSim.playerYaw);
  const playerFwdZ = Math.cos(liveSim.playerYaw);
  const playerDeg = (Math.atan2(playerFwdX, -playerFwdZ) * 180) / Math.PI;

  const adjustZoomAtPoint = (nextZoomRaw: number, clientX?: number, clientY?: number) => {
    const nextZoom = clamp(Number(nextZoomRaw.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    if (!viewportRef.current) {
      setZoom(nextZoom);
      return;
    }
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const my = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    const u = 0.5 + (mx - rect.width / 2 - pan.x) / (MAP_BASE_SIZE * zoom);
    const v = 0.5 + (my - rect.height / 2 - pan.y) / (MAP_BASE_SIZE * zoom);
    const desiredPanX = mx - rect.width / 2 - (u - 0.5) * MAP_BASE_SIZE * nextZoom;
    const desiredPanY = my - rect.height / 2 - (v - 0.5) * MAP_BASE_SIZE * nextZoom;
    setZoom(nextZoom);
    setPan(clampMapPan(desiredPanX, desiredPanY, nextZoom, rect.width, rect.height, MAP_BASE_SIZE));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.16 : 0.86;
    adjustZoomAtPoint(zoom * factor, e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setFollowGandalf(false);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    setPan(
      clampMapPan(
        dragRef.current.origPanX + dx,
        dragRef.current.origPanY + dy,
        zoom,
        viewportSize.w,
        viewportSize.h,
        MAP_BASE_SIZE,
      ),
    );
  };

  const handleMouseUp = () => {
    dragRef.current.active = false;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const u = 0.5 + (mx - rect.width / 2 - pan.x) / mapPixelSize;
    const v = 0.5 + (my - rect.height / 2 - pan.y) / mapPixelSize;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const worldPos = mapNormToWorld(u, v);
    if (Math.hypot(worldPos.x, worldPos.z) > WORLD_RADIUS) return;
    setCustomWaypoint(worldPos);
    setSelectedMarkerId('custom_waypoint');
  };

  const selectAndCenterMarker = (m: MapMarker) => {
    setSelectedMarkerId(m.id);
    setFollowGandalf(false);
    centerOnWorldPos(m.x, m.z, Math.max(zoom, 1.45));
  };

  const hoveredMarker = hoveredMarkerId ? allMarkers.find((m) => m.id === hoveredMarkerId) ?? null : null;

  const mainStepDef = getMainQuestStepDef(mainStep);
  const mainChapter = CHAPTERS[mainStepDef.chapter];
  const activeOrAvailableSides = (Object.keys(SIDE_QUESTS) as SideQuestId[]).filter(
    (id) => sideQuests[id].status === 'active' || sideQuests[id].status === 'available',
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#12100d] text-[#efe5d0] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Interaktivní mapa světa"
    >
      {/* Top Header Strip */}
      <header className="h-13 shrink-0 px-4 md:px-6 border-b border-[#c89d54]/30 bg-[#17130f] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Compass className="w-5 h-5 text-[#e3be76] shrink-0" />
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="font-display text-lg text-[#f6ecd4] whitespace-nowrap">Mapa Středozemě</h1>
            <span className="hidden md:inline text-xs text-[#cbb896] truncate">
              Podhůří Mlžných hor · Aktuální oblast: <strong className="text-[#f3dca6] font-medium">{currentRegionName}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded border border-[#c89d54]/30 bg-[#201a13] text-xs whitespace-nowrap">
            <span className="text-[#cbb896]">Prozkoumáno údolí:</span>
            <span className="font-mono-num font-semibold text-[#f3dca6]">{explorationPercent} %</span>
          </div>
          <button
            type="button"
            onClick={() => toggleWorldMap(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#c89d54]/40 bg-[#231c14] hover:bg-[#31261b] text-xs font-medium text-[#f5ebd4] cursor-pointer whitespace-nowrap transition-colors"
          >
            <X className="w-3.5 h-3.5 text-[#e3be76]" />
            <span>Zavřít [M / Esc]</span>
          </button>
        </div>
      </header>

      {/* Main 3-Zone Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* LEFT SIDEBAR: Search, Exploration, Presets & Category Filters */}
        <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-[#c89d54]/25 bg-[#181410] flex flex-col min-h-0 max-h-60 lg:max-h-none">
          <div className="p-3.5 space-y-3 overflow-y-auto flex-1">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#b8a382] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && searchResults.length > 0) {
                    e.preventDefault();
                    setSearchIndex((i) => (i + 1) % searchResults.length);
                  } else if (e.key === 'ArrowUp' && searchResults.length > 0) {
                    e.preventDefault();
                    setSearchIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
                  } else if (e.key === 'Enter' && searchResults.length > 0) {
                    e.preventDefault();
                    const picked = searchResults[searchIndex] ?? searchResults[0];
                    if (picked) selectAndCenterMarker(picked);
                  }
                }}
                placeholder="Hledat místo, NPC nebo úkol…"
                className="w-full pl-8 pr-7 py-1.5 rounded border border-[#c89d54]/30 bg-[#110e0b] text-xs text-[#f5ebd4] placeholder:text-[#8d7d65] focus:outline-none focus:border-[#e3be76]"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Vymazat hledání"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a89474] hover:text-[#f5ebd4] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Live Search Results */}
            {searchQuery.trim() && (
              <div className="rounded border border-[#c89d54]/25 bg-[#120f0c] divide-y divide-white/5 max-h-40 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-[#9b8a70]">Žádné známé místo neodpovídá dotazu.</p>
                ) : (
                  searchResults.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectAndCenterMarker(m)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                        idx === searchIndex ? 'bg-[#2e2418] text-[#f6e3ba]' : 'hover:bg-[#221b13] text-[#e5d9bf]'
                      }`}
                    >
                      <p className="font-medium truncate">{m.title}</p>
                      <p className="text-[10px] text-[#a9977a] truncate">{m.subtitle}</p>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#cbb896]">Rychlé filtry</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'onlyAvailableQuests' as const, label: 'Dostupné úkoly' },
                  { key: 'onlyActiveObjectives' as const, label: 'Aktivní cíle' },
                  { key: 'onlyDiscovered' as const, label: 'Jen objevené' },
                ].map((p) => {
                  const active = mapPresets[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setMapPresets({ [p.key]: !active })}
                      className={`px-2 py-1 rounded border text-[11px] whitespace-nowrap cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#c89d54] text-[#17120c] border-[#f2d08e] font-semibold'
                          : 'bg-[#201a13] text-[#d9ccb2] border-[#c89d54]/25 hover:bg-[#2a2219]'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Toggles */}
            <div className="space-y-2 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#cbb896]">Značky na mapě</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAllMapFilters(true)}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-[#c89d54]/25 bg-[#201a13] hover:bg-[#2b231a] text-[#e8dcc2] cursor-pointer whitespace-nowrap"
                  >
                    Vše
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllMapFilters(false)}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-[#c89d54]/25 bg-[#201a13] hover:bg-[#2b231a] text-[#e8dcc2] cursor-pointer whitespace-nowrap"
                  >
                    Nic
                  </button>
                  <button
                    type="button"
                    onClick={() => resetMapFilters()}
                    title="Obnovit výchozí filtry"
                    className="p-1 rounded border border-[#c89d54]/25 bg-[#201a13] hover:bg-[#2b231a] text-[#e8dcc2] cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                {MAP_CATEGORIES.map((cat) => {
                  const enabled = mapFilters[cat.id];
                  const count = categoryCounts[cat.id];
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setMapFilterCategory(cat.id, !enabled)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                        enabled
                          ? 'bg-[#211b14] border-[#c89d54]/30 text-[#f2e8d2] hover:bg-[#2a2219]'
                          : 'bg-[#14110d] border-white/5 text-[#877863] hover:bg-[#1b1712]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center shrink-0 border border-black/30"
                          style={{ backgroundColor: enabled ? cat.color : '#2d261e', color: '#fdf6e7' }}
                        >
                          <MarkerIcon category={cat.id} size={12} />
                        </span>
                        <span className="truncate">{cat.label}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-num text-[11px] text-[#baa684]">{count}</span>
                        {enabled ? <Eye className="w-3.5 h-3.5 text-[#e3be76]" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER: Interactive Parchment Map Canvas + Vector Markers */}
        <section
          ref={viewportRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
          className="relative flex-1 min-h-0 overflow-hidden bg-[#1e1913] cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, #292219 0%, #191510 75%, #110e0b 100%)',
          }}
        >
          {/* Scaled Parchment Base + Fog Canvas */}
          <div
            className="absolute top-0 left-0 pointer-events-none shadow-[0_18px_55px_rgba(0,0,0,0.72)] border border-[#73593a]"
            style={{
              width: `${mapPixelSize}px`,
              height: `${mapPixelSize}px`,
              transform: `translate3d(${mapOriginX}px, ${mapOriginY}px, 0)`,
            }}
          >
            <canvas ref={baseCanvasRef} className="w-full h-full block" />
            <canvas ref={fogCanvasRef} className="absolute inset-0 w-full h-full block pointer-events-none" />
          </div>

          {/* Crisp Screen-Space Marker Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {positionedMarkers.map((m) => {
              const catMeta = MAP_CATEGORIES.find((c) => c.id === m.category);
              const isSelected = selectedMarkerId === m.id;
              const bgColor = m.status === 'cleared' ? '#4d473e' : (catMeta?.color ?? '#8f5920');
              return (
                <div
                  key={m.id}
                  className="absolute pointer-events-auto"
                  style={{
                    left: `${m.screenX}px`,
                    top: `${m.screenY}px`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isSelected ? 30 : m.category === 'main_quest' ? 25 : 15,
                  }}
                >
                  <button
                    type="button"
                    aria-label={m.title}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHoveredMarkerId(m.id)}
                    onMouseLeave={() => setHoveredMarkerId((prev) => (prev === m.id ? null : prev))}
                    onContextMenu={(e) => {
                      if (m.category === 'waypoint') {
                        e.preventDefault();
                        e.stopPropagation();
                        setCustomWaypoint(null);
                        if (selectedMarkerId === 'custom_waypoint') setSelectedMarkerId(null);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarkerId(m.id);
                    }}
                    className={`relative flex items-center justify-center rounded-full border-2 shadow-[0_3px_10px_rgba(0,0,0,0.55)] cursor-pointer transition-transform ${
                      isSelected
                        ? 'w-8 h-8 scale-110 border-[#fff3d2] ring-2 ring-[#e3be76]/80'
                        : m.category === 'main_quest' || m.category === 'waypoint'
                          ? 'w-7 h-7 hover:scale-110 border-[#fdf3dc]'
                          : 'w-6 h-6 hover:scale-110 border-[#241b12]'
                    }`}
                    style={{ backgroundColor: bgColor, color: '#fdf8eb' }}
                  >
                    <MarkerIcon category={m.category} size={isSelected ? 15 : 13} />
                  </button>

                  {m.showLabel && (
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap pointer-events-none shadow-sm border ${
                        m.labelPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                      } ${
                        isSelected
                          ? 'bg-[#1a140d] text-[#f9ebc7] border-[#e3be76]/60'
                          : 'bg-[#f4e8cd]/92 text-[#2d2115] border-[#785e3f]/40'
                      }`}
                    >
                      {m.title}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Always-Visible Directional Gandalf Player Marker */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${playerScreenX}px`,
                top: `${playerScreenY}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 40,
              }}
              title="Gandalf Šedý (aktuální poloha)"
            >
              <div className="relative flex items-center justify-center w-9 h-9">
                <div className="absolute inset-0 rounded-full border border-[#1a2e40]/45 bg-[#60a5fa]/20" />
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  style={{ transform: `rotate(${playerDeg}deg)` }}
                  className="drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]"
                >
                  <path
                    d="M12 2L19 20L12 16L5 20L12 2Z"
                    fill="#f8e8be"
                    stroke="#1c2733"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="block text-center -mt-0.5 px-1.5 py-0.2 rounded bg-[#18212b] text-[#f5e7c4] border border-[#e3be76]/55 text-[10px] font-semibold whitespace-nowrap shadow">
                Gandalf
              </span>
            </div>
          </div>

          {/* Hover Tooltip (when hovering a marker not currently selected) */}
          {hoveredMarker && hoveredMarker.id !== selectedMarkerId && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded border border-[#c89d54]/50 bg-[#17130f]/95 text-center shadow-lg">
              <p className="text-xs font-semibold text-[#f5e9ce]">{hoveredMarker.title}</p>
              <p className="text-[11px] text-[#cbb896]">{hoveredMarker.subtitle}</p>
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR: Selected Marker Details OR Active Quest Tracker */}
        <aside className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-[#c89d54]/25 bg-[#181410] p-4 flex flex-col justify-between gap-4 overflow-y-auto max-h-64 lg:max-h-none">
          {selectedMarker ? (
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/10">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#e3be76]">
                    {MAP_CATEGORIES.find((c) => c.id === selectedMarker.category)?.label}
                  </p>
                  <h2 className="font-display text-lg text-[#f7edd6] leading-snug">{selectedMarker.title}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Zavřít detail"
                  onClick={() => setSelectedMarkerId(null)}
                  className="p-1 rounded text-[#a9977a] hover:text-[#f5ebd4] hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`px-2 py-0.5 rounded border font-medium ${
                    selectedMarker.status === 'cleared' || selectedMarker.status === 'completed'
                      ? 'bg-emerald-950/70 border-emerald-400/40 text-emerald-200'
                      : selectedMarker.status === 'active' || selectedMarker.status === 'available'
                        ? 'bg-amber-950/70 border-amber-400/45 text-amber-200'
                        : selectedMarker.discovered
                          ? 'bg-[#262017] border-[#c89d54]/40 text-[#f0dfb9]'
                          : 'bg-[#1f1c18] border-white/10 text-[#a5967e]'
                  }`}
                >
                  {selectedMarker.status === 'cleared'
                    ? 'Vyčištěno'
                    : selectedMarker.status === 'completed'
                      ? 'Dokončeno'
                      : selectedMarker.status === 'active'
                        ? 'Aktivní cíl'
                        : selectedMarker.status === 'available'
                          ? 'Dostupný úkol'
                          : selectedMarker.discovered
                            ? 'Objeveno'
                            : 'Neprozkoumáno'}
                </span>
                <span className="font-mono-num text-[#cbb896]">
                  Vzdálenost: {Math.round(Math.hypot(selectedMarker.x - liveSim.playerX, selectedMarker.z - liveSim.playerZ))} m
                </span>
              </div>

              <p className="text-xs text-[#dfd3b9] leading-relaxed">{selectedMarker.description}</p>

              {selectedMarker.questHint && (
                <div className="p-2.5 rounded border border-[#c89d54]/25 bg-[#120f0c]">
                  <p className="text-[10px] uppercase tracking-wider text-[#e3be76] mb-0.5">Úkolová stopa</p>
                  <p className="text-xs text-[#f2e8d2]">{selectedMarker.questHint}</p>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-white/10">
                {selectedMarker.trackTarget && (
                  <button
                    type="button"
                    onClick={() => setTrackedQuest(selectedMarker.trackTarget!)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      selectedMarker.isTracked
                        ? 'bg-emerald-950/70 border-emerald-400/45 text-emerald-200'
                        : 'bg-[#c89d54] hover:bg-[#dbb064] text-[#15110b] border-[#f4d392]/60'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>{selectedMarker.isTracked ? 'Aktuálně sledováno na kompasu' : 'Sledovat na kompasu'}</span>
                  </button>
                )}

                {selectedMarker.canSetWaypoint && (
                  <button
                    type="button"
                    onClick={() => setCustomWaypoint({ x: selectedMarker.x, z: selectedMarker.z })}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-[#c89d54]/35 bg-[#221c15] hover:bg-[#2d241a] text-xs font-medium text-[#f2e8d2] cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#5bb6d4]" />
                    <span>Umístit vlastní značku sem</span>
                  </button>
                )}

                {selectedMarker.category === 'waypoint' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomWaypoint(null);
                      setSelectedMarkerId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-red-400/40 bg-red-950/60 hover:bg-red-900/70 text-xs font-medium text-red-100 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Odstranit vlastní značku</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => centerOnWorldPos(selectedMarker.x, selectedMarker.z, Math.max(zoom, 1.5))}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded border border-white/10 bg-[#14110d] hover:bg-[#1f1a13] text-xs text-[#d7c8ab] cursor-pointer whitespace-nowrap transition-colors"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>Vystředit mapu</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="pb-2 border-b border-white/10">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#e3be76]">Sledování výpravy</p>
                <h2 className="font-display text-base text-[#f7edd6]">Aktivní cíle v údolí</h2>
              </div>

              {/* Main Quest Card */}
              <div className="p-3 rounded border border-[#c89d54]/30 bg-[#120f0c] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#e3be76]">
                    Hlavní úkol · Kap. {mainChapter.roman}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTrackedQuest({ kind: 'main' });
                      const mainM = allMarkers.find((m) => m.id === 'quest_main_active');
                      if (mainM) selectAndCenterMarker(mainM);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer whitespace-nowrap ${
                      trackedQuest.kind === 'main'
                        ? 'bg-[#c89d54] text-[#15110b] border-[#f4d392] font-semibold'
                        : 'bg-[#211b14] text-[#dfd3b9] border-[#c89d54]/30 hover:bg-[#2c2319]'
                    }`}
                  >
                    {trackedQuest.kind === 'main' ? 'Sledováno' : 'Sledovat'}
                  </button>
                </div>
                <p className="text-xs font-semibold text-[#f5ebd4]">{mainStepDef.title}</p>
                <p className="text-[11px] text-[#cbb896] leading-snug">{mainStepDef.objective}</p>
              </div>

              {/* Side Quests Selector */}
              {activeOrAvailableSides.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#8bcbe0]">Vedlejší úkoly</p>
                  {activeOrAvailableSides.map((sqId) => {
                    const def = SIDE_QUESTS[sqId];
                    const st = sideQuests[sqId];
                    const isTracked = trackedQuest.kind === 'side' && trackedQuest.id === sqId;
                    return (
                      <div key={sqId} className="p-2.5 rounded border border-[#24728a]/40 bg-[#111518] space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#e9f2f6] truncate">{def.title}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setTrackedQuest({ kind: 'side', id: sqId });
                              const m = allMarkers.find((mk) => mk.id === `sq_${sqId}`);
                              if (m) selectAndCenterMarker(m);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] border shrink-0 cursor-pointer whitespace-nowrap ${
                              isTracked
                                ? 'bg-[#2d83a1] text-white border-sky-300/60 font-semibold'
                                : 'bg-[#192229] text-sky-200 border-[#2d83a1]/45 hover:bg-[#22303b]'
                            }`}
                          >
                            {isTracked ? 'Sledováno' : 'Sledovat'}
                          </button>
                        </div>
                        <p className="text-[10px] text-[#9cb5c2]">
                          {st.status === 'available'
                            ? `Dostupný · ${def.giver}`
                            : `Postup: ${st.progress}/${def.requiredCount}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-[#a9977a] leading-relaxed pt-1">
                Kliknutím na libovolnou značku na mapě zobrazíš její podrobnosti. Dvojklikem na prázdné místo mapy umístíš vlastní navigační značku.
              </p>
            </div>
          )}

          {/* Custom Waypoint Quick Box */}
          <div className="p-2.5 rounded border border-[#24728a]/35 bg-[#121619] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[#72c3de]">Vlastní značka</p>
              <p className="text-[11px] text-[#d4e1e6] truncate font-mono-num">
                {customWaypoint
                  ? `${Math.round(Math.hypot(customWaypoint.x - liveSim.playerX, customWaypoint.z - liveSim.playerZ))} m od tebe`
                  : 'Dvojklikem umístíš'}
              </p>
            </div>
            {customWaypoint && (
              <button
                type="button"
                title="Odebrat vlastní značku"
                onClick={() => setCustomWaypoint(null)}
                className="p-1.5 rounded border border-red-400/35 bg-red-950/60 hover:bg-red-900/70 text-red-200 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Controls Bar */}
      <footer className="h-12 shrink-0 px-4 md:px-6 border-t border-[#c89d54]/30 bg-[#17130f] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-[#c89d54]/30 bg-[#120f0c] overflow-hidden">
            <button
              type="button"
              aria-label="Oddálit mapu"
              onClick={() => adjustZoomAtPoint(zoom - 0.25)}
              className="px-2 py-1.5 hover:bg-[#272017] text-[#e8dcc2] cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2.5 font-mono-num text-[11px] text-[#f3dca6] whitespace-nowrap">
              {Math.round(zoom * 100)} %
            </span>
            <button
              type="button"
              aria-label="Přiblížit mapu"
              onClick={() => adjustZoomAtPoint(zoom + 0.25)}
              className="px-2 py-1.5 hover:bg-[#272017] text-[#e8dcc2] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={recenterOnGandalf}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#c89d54]/30 bg-[#201a13] hover:bg-[#2b231a] text-[#f2e8d2] cursor-pointer whitespace-nowrap transition-colors"
          >
            <LocateFixed className="w-3.5 h-3.5 text-[#e3be76]" />
            <span>[R] Na Gandalfa</span>
          </button>

          <button
            type="button"
            onClick={focusOnTrackedObjective}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#c89d54]/30 bg-[#201a13] hover:bg-[#2b231a] text-[#f2e8d2] cursor-pointer whitespace-nowrap transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#e3be76]" />
            <span>[F] Na cíl úkolu</span>
          </button>

          <button
            type="button"
            onClick={() => setFollowGandalf((v) => !v)}
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer whitespace-nowrap transition-colors ${
              followGandalf
                ? 'bg-[#c89d54] text-[#15110b] border-[#f4d392] font-semibold'
                : 'bg-[#201a13] text-[#d7c8ab] border-[#c89d54]/25 hover:bg-[#2b231a]'
            }`}
          >
            <span>Sledovat polohu</span>
          </button>
        </div>

        <p className="hidden xl:block text-[11px] text-[#b4a284] whitespace-nowrap">
          Kolečko: Přiblížení · Levé tažení: Posun · Dvojklik: Vlastní značka · Pravý klik na značku: Smazat
        </p>
      </footer>
    </div>
  );
}
