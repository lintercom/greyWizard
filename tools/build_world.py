"""Rebuild original low-poly world assets with local Blender (no downloads).
Input: worldKit.json + world-snapshot.json exported by export_world.ts.
Outputs: GLBs, editable world.blend, and review renders.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parent.parent
out = root / 'public/assets/world/kit'
source = root / 'art/world'
out.mkdir(parents=True, exist_ok=True)
source.mkdir(parents=True, exist_ok=True)
random.seed(73)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0

def mat(name, rgb, rough=0.9, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*rgb, 1)
    n.inputs['Roughness'].default_value = rough
    if emission:
        n.inputs['Emission Color'].default_value = (*rgb, 1)
        n.inputs['Emission Strength'].default_value = emission
    return m

stone = mat('Slate stone', (.25,.29,.31))
edge = mat('Stone edges', (.39,.42,.40))
moss = mat('Moss', (.16,.23,.10))
oak = mat('Oak', (.18,.095,.042))
grain = mat('Oak end grain', (.31,.19,.08))
plaster = mat('Warm lime plaster', (.66,.54,.36))
shingle = mat('Weathered chestnut shingles', (.24,.11,.055))
iron = mat('Dark iron', (.075,.09,.10), .65)
gold = mat('Dwarven brass', (.48,.30,.09), .5)
cloth = mat('Faded canvas', (.32,.28,.17))
red = mat('Wine red banner', (.26,.045,.035))
light = mat('Amber glass', (.95,.49,.10), .45, .4)

# All helper coordinates use the game's Y-up convention. Convert only here.
def pos(p): return (p[0], -p[2], p[1])
def box(name, p, dims, material, yaw=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p))
    o = bpy.context.object
    o.name = name
    o.dimensions = (dims[0],dims[2],dims[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler.z = yaw
    o.data.materials.append(material)
    return o

def mesh(name, verts, faces, material):
    d = bpy.data.meshes.new(name)
    d.from_pydata([pos(v) for v in verts], [], faces)
    d.update()
    o = bpy.data.objects.new(name,d)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o

def beam(a,b,width, material=oak):
    av,bv=Vector(pos(a)),Vector(pos(b))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(av+bv)/2)
    o=bpy.context.object
    o.dimensions=(width,width,(bv-av).length)
    o.rotation_euler=(bv-av).to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    return o

def block_wall(w,h,d):
    # Foundation below zero absorbs small terrain variation.
    box('buried foundation',(0,-.4,0),(w,.8,d),stone)
    rows=round(h/.45)
    for row in range(rows):
        count=max(1,round(w/.85))
        for i in range(count):
            x=-w/2+(i+.5)*w/count
            box('masonry',(x,(row+.5)*h/rows,0),(w/count-.035,h/rows-.025,d),edge if random.random()<.2 else stone)

def roof(w,d,eave,ridge):
    mesh('roof', [(-w/2,eave,-d/2),(w/2,eave,-d/2),(0,ridge,-d/2),(-w/2,eave,d/2),(w/2,eave,d/2),(0,ridge,d/2)],
        [(0,3,5,2),(2,5,4,1),(0,2,1),(3,4,5),(0,1,4,3)],shingle)
    for z in (-d/2,d/2):
        beam((-w/2,eave,z),(0,ridge,z),.13,grain)
        beam((0,ridge,z),(w/2,eave,z),.13,grain)
    beam((0,ridge,-d/2),(0,ridge,d/2),.18,oak)
    for side in (-1,1):
        for t in (.22,.45,.68,.9):
            x=side*w/2*t
            y=ridge+(eave-ridge)*t+.025
            beam((x,y,-d/2),(x,y,d/2),.045,grain)

def cottage():
    box('foundation',(0,-.08,0),(4.25,.8,5.05),stone)
    box('lime walls',(0,1.25,0),(3.9,1.9,4.65),plaster)
    roof(4.65,5.5,2.26,3.45)
    for x in (-1.96,1.96):
        for z in (-2.33,2.33): box('corner post',(x,1.3,z),(.17,2.05,.18),oak)
        for z in (-1.2,0,1.2): box('side frame',(x,1.35,z),(.14,1.9,.14),oak)
    for z in (-2.35,2.35):
        box('beam',(0,2.13,z),(4.05,.18,.14),oak)
        box('sill',(0,.45,z),(4.05,.16,.14),oak)
    for i in range(5): box('door planks',(-.82+(i-2)*.16,1.12,2.345),(.15,1.4,.09),oak)
    for y in (.65,1.55): box('door hinge',(-.82,y,2.405),(.78,.055,.035),iron)
    for x,z,yaw in ((.85,2.37,0),(1.98,0,math.pi/2)):
        box('window',(x,1.38,z),(.72,.7,.08),light,yaw)
        box('window cross',(x,1.38,z+.05),(.05,.74,.05),oak,yaw)
        box('window transom',(x,1.38,z+.05),(.76,.05,.05),oak,yaw)
    for x in (.35,1.35): box('shutter',(x,1.38,2.43),(.22,.8,.08),grain)
    box('chimney',(-1.2,2.55,-1.65),(.62,2.35,.65),stone)
    box('chimney cap',(-1.2,3.78,-1.65),(.8,.15,.82),edge)
    box('doorstep',(-.8,.12,2.61),(1.25,.24,.38),edge)

def waystone():
    box('plinth',(0,-.15,0),(.95,.6,.85),stone)
    box('standing stone',(0,1,0),(.7,2,.58),edge)
    mesh('cap',[(-.35,2,-.29),(.35,2,-.29),(.35,2,.29),(-.35,2,.29),(0,2.45,0)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],stone)
    for y in (.65,1,1.35):
        beam((-.17,y,.301),(0,y+.15,.301),.035,gold)
        beam((0,y+.15,.301),(.17,y,.301),.035,gold)
    box('moss',(0,.12,.32),(.72,.17,.18),moss)

def shelter():
    for x in (-1.4,1.4):
        for z in (-1.1,1.1): box('post',(x,1.1,z),(.18,2.6,.18),oak)
    for y in (.4,.8,1.2): box('back boards',(0,y,-1.1),(2.9,.3,.13),grain)
    roof(3.2,2.7,2.15,2.85)
    box('bedroll',(0,.12,-.6),(1.7,.18,.65),cloth)

def cairn():
    for i in range(4):
        box('stacked stone',(0,.12+i*.27,0),(1.3-i*.18,.27,1.1-i*.15),edge,i*.4)
    box('moss',(0,.1,.35),(.6,.15,.4),moss)

def palisade():
    for i in range(9):
        x=(i-4)*.43
        h=1.8+random.random()*.5
        box('stake',(x,h/2-.2,0),(.32,h+.4,.3),oak)
        mesh('point',[(x-.16,h, -.15),(x+.16,h,-.15),(x+.16,h,.15),(x-.16,h,.15),(x,h+.3,0)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],grain)
    for y in (.5,1.2): box('cross brace',(0,y,.2),(4,.14,.15),grain)

def cargo():
    for x,y,z,s in ((-.5,.5,0,1),(.55,.4,.15,.8),(-.4,1.2,0,.55)):
        box('crate',(x,y,z),(s,s,s),oak)
        for k in (-.4,.4): box('iron band',(x+k*s,y,z),(s*.07,s*1.02,s*1.02),iron)
        beam((x-s*.42,y-s*.42,z+s*.51),(x+s*.42,y+s*.42,z+s*.51),.09,grain)

def derrick():
    for x in (-1.6,1.6):
        box('crane post',(x,1.8,0),(.32,4.1,.35),oak)
        beam((x,.3,0),(x*.55,3.8,0),.18,grain)
    box('crane beam',(0,4,0),(3.8,.3,.45),oak)
    beam((0,3.8,0),(0,1.8,0),.045,iron)
    box('hanging stone',(0,1.6,0),(.9,.4,.65),edge)

def dwarf_pillar():
    box('base',(0,.1,0),(1.7,.7,1.7),stone)
    box('shaft',(0,2.5,0),(1.1,4.4,1.1),stone)
    for y in (.5,1,4.2,4.7): box('collar',(0,y,0),(1.45,.2,1.45),edge)
    mesh('crown',[(-.7,4.8,-.7),(.7,4.8,-.7),(.7,4.8,.7),(-.7,4.8,.7),(0,5.3,0)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],gold)
    for y in (1.7,2.4,3.1):
        beam((-.3,y,.565),(0,y+.3,.565),.045,gold)
        beam((0,y+.3,.565),(.3,y,.565),.045,gold)

def ruin_wall():
    block_wall(5,3.2,1.2)
    for x,h in ((-2,.65),(-.8,.5),(1.2,.8),(2,.45)):
        box('broken parapet',(x,3.2+h/2,0),(.65,h,1.15),edge)
    for x in (-1.7,1.7): box('buttress',(x,1.1,.65),(.5,2.6,.6),stone)

def watchtower():
    block_wall(3.2,6.5,3.2)
    for y in (.2,3.1,6.5): box('belt course',(0,y,0),(3.4,.2,3.4),edge)
    for x in (-1.35,0,1.35):
        for z in (-1.35,1.35): box('battlement',(x,7, z),(.65,.85,.65),stone)
    box('arrow slit',(0,4.8,1.61),(.16,1,.025),iron)
    box('banner',(1,4.8,1.64),(.55,1.5,.03),red)

builders={k:v for k,v in locals().copy().items() if k in ('cottage','waystone','shelter','cairn','palisade','cargo','derrick','dwarf_pillar','ruin_wall','watchtower')}
assets={}
for name,build in builders.items():
    before=set(bpy.data.objects)
    build()
    created=[o for o in bpy.data.objects if o not in before]
    bpy.ops.object.select_all(action='DESELECT')
    for o in created:o.select_set(True)
    bpy.context.view_layer.objects.active=created[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.name=name
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True)
    assets[name]=obj
    obj.hide_render=True
    obj.hide_set(True)

# Assemble an editable authoring scene from the exact runtime height samples.
snapshot=json.loads((source/'world-snapshot.json').read_text())
layout=json.loads((root/'src/game/worldKit.json').read_text())
terrainmat=mat('Terrain',(.25,.34,.15))
terrain=mesh('Runtime terrain',snapshot['vertices'],snapshot['faces'],terrainmat)
attr=terrain.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
for dst,c in zip(attr.data,snapshot['colors']):dst.color=(*c,1)
n=next(n for n in terrainmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
color=terrainmat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
terrainmat.node_tree.links.new(color.outputs['Color'],n.inputs['Base Color'])
watermat=mat('River',(.11,.27,.30),.25)
mesh('River',snapshot['riverVertices'],snapshot['riverFaces'],watermat)
for p in snapshot['placements']:
    obj=assets[p['asset']].copy();obj.data=assets[p['asset']].data
    bpy.context.collection.objects.link(obj)
    obj.name=p['id'];obj.location=pos([p['x'],p['y'],p['z']]);obj.rotation_euler.z=p['rotation']
    obj.hide_render=False;obj.hide_set(False)

# Lightweight canopy proxies show actual runtime forest placement in the review scene.
leaf=mat('Pine foliage',(.08,.18,.095));bark=mat('Trunk',(.16,.095,.045));oakleaf=mat('Oak foliage',(.24,.34,.08))
for t in snapshot['trees']:
    s=t['scale']
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=1.5*s,radius2=0,depth=4*s,location=pos([t['x'],t['y']+3*s,t['z']]))
    bpy.context.object.data.materials.append(oakleaf if t['oak'] else leaf)
    box('trunk',(t['x'],t['y']+s,t['z']),(.25*s,2*s,.25*s),bark)

scene=bpy.context.scene
scene.world.color=(.35,.40,.45)
bpy.ops.object.light_add(type='SUN', location=(0,0,60))
bpy.context.object.rotation_euler=(.45,-.4,-.6);bpy.context.object.data.energy=2.2
bpy.ops.object.camera_add()
cam=bpy.context.object;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
def render(name,eye,target,ortho):
    cam.location=pos(eye)
    cam.rotation_euler=(Vector(pos(target))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=ortho
    scene.render.filepath=str(source/(name+'.png'))
    bpy.ops.render.render(write_still=True)

# Save the scene before rendering so a renderer failure never loses editable work.
cam.location=pos([105,140,135]);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=180
bpy.ops.wm.save_as_mainfile(filepath=str(source/'world.blend'))
render('world-overview',[100,135,125],[0,0,0],178)
render('liska-review',[52,32,47],[26,1,14],40)
print('WORLD_BUILD_COMPLETE')
