import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { MiddleEarthWorld } from './MiddleEarthWorld';
import { groundHeightAt } from '../game/terrain';
import { liveSim } from '../game/store';

const VIEWS = [
  {name:'Líska',x:26,z:14,d:22}, {name:'Jižní stezka',x:2,z:49,d:24},
  {name:'Stříbrný brod',x:-14,z:4,d:22}, {name:'Skřetí tábor',x:-22,z:-14,d:23},
  {name:'Trpasličí doly',x:32,z:-26,d:25}, {name:'Kamenolom',x:-28,z:-28,d:23},
  {name:'Severní pevnost',x:-6,z:-50,d:32}, {name:'Celé údolí',x:0,z:0,d:110},
];
function View({index}:{index:number}) {
  const {camera} = useThree();
  const p=VIEWS[index],y=groundHeightAt(p.x,p.z);
  useEffect(()=>{
    liveSim.playerX=p.x;liveSim.playerZ=p.z;liveSim.playerY=y;
    camera.position.set(p.x+p.d*.65,y+p.d*.55,p.z+p.d);
    camera.lookAt(p.x,y,p.z);
  },[camera,p,y]);
  return <OrbitControls key={index} target={[p.x,y,p.z]} maxPolarAngle={Math.PI*.49} />;
}
/** Development-only art review: does not change or save player progression. */
export default function WorldReview(){
  const [index,setIndex]=useState(0);
  return <main style={{height:'100vh',background:'#1a2229'}}>
    <Canvas shadows dpr={[1,1.5]} camera={{fov:50,far:500}}>
      <Suspense fallback={null}><Physics paused><MiddleEarthWorld isSoftwareGl={false}/></Physics></Suspense>
      <View index={index}/>
    </Canvas>
    <nav style={{position:'absolute',top:16,left:16,right:16,display:'flex',gap:8,flexWrap:'wrap'}}>
      {VIEWS.map((v,i)=><button key={v.name} onClick={()=>setIndex(i)} style={{padding:'10px 16px',color:i===index?'#14201b':'#eae0cc',background:i===index?'#dbb778':'#17251f',border:'1px solid #8b825a',borderRadius:4,cursor:'pointer'}}>{v.name}</button>)}
      <a href="/" style={{padding:10,color:'#fff'}}>Zpět do hry</a>
    </nav>
    <p style={{position:'absolute',bottom:12,left:20,color:'#fff'}}>Prohlídka světa · tažením otáčíš pohled, kolečkem přibližuješ</p>
  </main>;
}
