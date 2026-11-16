"""Create the low-poly Líska well. Run with Blender in background mode."""
import bpy
import math
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / 'public' / 'assets' / 'world'
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = 0.85
    node.inputs['Metallic'].default_value = metallic
    return mat

stone = material('Warm grey stone', (0.32, 0.34, 0.32))
wood = material('Weathered oak', (0.22, 0.12, 0.065))
roof = material('Old shingles', (0.26, 0.18, 0.13))
water = material('Water in the well', (0.16, 0.33, 0.34))

def cube(name, location, scale, mat, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=(0, rotation, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj

# Blender uses Z up; glTF export converts it to Y up for the game.
for row in range(3):
    for i in range(10):
        angle = 2 * math.pi * (i + 0.5 * (row % 2)) / 10
        x, y = 0.72 * math.cos(angle), 0.72 * math.sin(angle)
        obj = cube('Stone', (x, y, 0.16 + row * 0.28), (0.48, 0.25, 0.27), stone)
        obj.rotation_euler.z = angle + math.pi / 2

bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.56, depth=0.02, location=(0, 0, 0.55))
bpy.context.object.name = 'Water'
bpy.context.object.data.materials.append(water)
for x in (-0.78, 0.78):
    cube('Oak post', (x, 0, 1.23), (0.13, 0.14, 2.3), wood)
cube('Ridge', (0, 0, 2.32), (1.96, 0.12, 0.12), wood)
for side in (-1, 1):
    board = cube('Roof', (0, side * 0.43, 2.10), (1.95, 1.0, 0.10), roof)
    board.rotation_euler.x = side * math.radians(27)
cube('Crossbeam', (0, 0, 1.56), (1.65, 0.1, 0.1), wood)

# Merge by material so the game does not draw every stone as a separate mesh.
for mat in (stone, wood, roof, water):
    matching = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and mat in obj.data.materials.values()]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in matching:
        obj.select_set(True)
    if matching:
        bpy.context.view_layer.objects.active = matching[0]
        bpy.ops.object.join()
        matching[0].name = 'Well - ' + mat.name

bpy.ops.wm.save_as_mainfile(filepath=str(output / 'liska_well.blend'))
bpy.ops.export_scene.gltf(filepath=str(output / 'liska_well.glb'), export_format='GLB')
