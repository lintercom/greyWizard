import { mkdirSync, writeFileSync } from 'node:fs';
import { groundHeightAt, terrainColorAt, riverCenterZ, VILLAGE_POS } from '../src/game/terrain';
import { WORLD_KIT } from '../src/game/worldKit';
import { WORLD_DECOR_PLACEMENTS } from '../src/game/worldPlacements';
import { COTTAGE_SPECS } from '../src/game/collisionSystem';

const vertices: number[][]=[], colors: number[][]=[], faces: number[][]=[];
const segments=160, size=216;
for(let z=0;z<=segments;z++) for(let x=0;x<=segments;x++) {
  const wx=x/segments*size-size/2,wz=z/segments*size-size/2;
  vertices.push([wx,groundHeightAt(wx,wz),wz]);colors.push(terrainColorAt(wx,wz));
  if(x<segments&&z<segments){const i=z*(segments+1)+x;faces.push([i,i+segments+1,i+1],[i+1,i+segments+1,i+segments+2]);}
}
const riverVertices:number[][]=[],riverFaces:number[][]=[];
for(let i=0;i<=96;i++){
  const x=-50+i/96*104,z=riverCenterZ(x);
  riverVertices.push([x,-.32,z-4.5],[x,-.32,z+4.5]);
  if(i<96){const j=i*2;riverFaces.push([j,j+1,j+3,j+2]);}
}
const placements=[...WORLD_KIT.placements.map(p=>({...p,y:groundHeightAt(p.x,p.z)})),
  ...COTTAGE_SPECS.map((c,i)=>({id:`liska_house_${i}`,asset:'cottage',x:VILLAGE_POS.x+c.dx,z:VILLAGE_POS.z+c.dz,y:groundHeightAt(VILLAGE_POS.x,VILLAGE_POS.z),rotation:c.rot}))];
const trees=[...WORLD_DECOR_PLACEMENTS.pineTransforms.map(t=>({...t,oak:false})),...WORLD_DECOR_PLACEMENTS.oakTransforms.map(t=>({...t,oak:true}))];
mkdirSync('art/world',{recursive:true});
writeFileSync('art/world/world-snapshot.json',JSON.stringify({vertices,colors,faces,riverVertices,riverFaces,placements,trees}));
console.log(`Exported ${vertices.length} terrain vertices, ${placements.length} structures, ${trees.length} trees.`);
