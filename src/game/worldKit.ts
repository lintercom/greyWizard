import data from './worldKit.json';

export type KitAsset = keyof typeof data.assets;
export const WORLD_KIT = data;
// Avoid procedural trees, boulders and ground cover inside authored architecture.
export function nearWorldStructure(x: number, z: number, margin = 1): boolean {
  return data.placements.some((p) => {
    const boxes = data.assets[p.asset as KitAsset].boxes;
    const radius = Math.max(...boxes.map((b) => Math.hypot(b[0], b[2]) + Math.hypot(b[3], b[5])));
    return Math.hypot(x - p.x, z - p.z) < radius + margin;
  });
}
