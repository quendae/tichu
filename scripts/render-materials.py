"""Run in Blender 5.x: blender --background --python scripts/render-materials.py.

Creates a separate scene; does not clear the user's existing scene.
Set TICHU_ASSET_ROOT to the repository root when run through Blender MCP.
"""
import bpy
import math
import os
from pathlib import Path

ROOT = Path(os.environ.get('TICHU_ASSET_ROOT', Path(__file__).resolve().parents[1]))
OUT = ROOT / 'assets' / 'blender'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Tichu material studio')
bpy.context.window.scene = scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.world = bpy.data.worlds.new('Tichu soft studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .25, .22, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
scene.view_settings.view_transform = 'AgX'

def material(name, color, roughness, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return m

wood = material('Tichu / dark walnut lacquer', (.09, .028, .012), .24)
n, l = wood.node_tree.nodes, wood.node_tree.links
p = n.get('Principled BSDF')
p.inputs['Coat Weight'].default_value = .55
p.inputs['Coat Roughness'].default_value = .18
coord = n.new('ShaderNodeTexCoord')
mapping = n.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
mapping.inputs[1].default_value = (1.3, 36, 4)
l.new(coord.outputs['Generated'], mapping.inputs[0])
noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3
noise.inputs['Detail'].default_value = 4
l.new(mapping.outputs['Vector'], noise.inputs['Vector'])
ramp = n.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = .18
ramp.color_ramp.elements[0].color = (.018, .005, .002, 1)
ramp.color_ramp.elements[1].position = .82
ramp.color_ramp.elements[1].color = (.23, .075, .024, 1)
l.new(noise.outputs['Fac'], ramp.inputs[0]); l.new(ramp.outputs[0], p.inputs['Base Color'])
bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .14
bump.inputs['Distance'].default_value = .025
l.new(noise.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs[0], p.inputs['Normal'])

felt = material('Tichu / tea green felt', (.025, .105, .060), .93)
n, l = felt.node_tree.nodes, felt.node_tree.links
p = n.get('Principled BSDF'); p.inputs['Sheen Weight'].default_value = .3
noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 420
noise.inputs['Detail'].default_value = 2
ramp = n.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (.012, .043, .024, 1)
ramp.color_ramp.elements[1].color = (.038, .14, .078, 1)
l.new(noise.outputs['Fac'], ramp.inputs[0]); l.new(ramp.outputs[0], p.inputs['Base Color'])
bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .35
bump.inputs['Distance'].default_value = .014
l.new(noise.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs[0], p.inputs['Normal'])
brass = material('Tichu / aged brass', (.55, .31, .085), .32, .8)
jade = material('Tichu / jade lacquer', (.012, .048, .031), .58)
jade.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .08

def cube(name, scale, mat, z=0):
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, z))
    obj = bpy.context.object; obj.name = name; obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj

surface = cube('Material swatch', (5, 5, .1), wood)
bpy.ops.object.camera_add(location=(0, 0, 12))
camera = bpy.context.object; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 9.5
camera.rotation_euler = (0, 0, 0); scene.camera = camera
for name, loc, energy, size in [('Warm softbox', (-3, 3, 7), 650, 7), ('Fill', (4, -1, 6), 260, 5)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    light = bpy.context.object; light.name = name; light.data.energy = energy; light.data.shape = 'DISK'; light.data.size = size

def render(name, width, height):
    scene.render.resolution_x = width; scene.render.resolution_y = height
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)

def curve(name, points, radius, mat, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'
    data.bevel_depth = radius; data.bevel_resolution = 3; data.resolution_u = 16
    spline = data.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for bp, point in zip(spline.bezier_points, points):
        bp.co = point; bp.handle_left_type = 'AUTO'; bp.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); data.materials.append(mat)
    return obj

def build_medallion():
    surface.data.materials[0] = jade
    camera.data.ortho_scale = 7.4
    for radius, depth in [(2.7, .045), (2.5, .018)]:
        curve('Brass circular inlay', [(radius*math.cos(i*math.tau/64), radius*math.sin(i*math.tau/64), .13) for i in range(64)], depth, brass, True)
    curve('Coiled dragon', [(1,1.7,.18),(.25,1.65,.18),(-.6,1,.18),(-.4,.3,.18),(.7,-.05,.18),(1,-.8,.18),(.25,-1.25,.18),(-.9,-1.1,.18),(-1.25,-1.6,.18),(-.8,-2,.18)], .15, brass)
    # Carved muzzle, horns, whiskers and claws share the card's central safe field.
    for name, points, radius in [
        ('Muzzle', [(1,1.7,.18),(1.4,1.6,.18),(1.6,1.35,.18),(1.15,1.3,.18)], .095),
        ('Horn L', [(.6,1.75,.18),(.4,2.1,.18),(.15,2.2,.18)], .045),
        ('Horn R', [(1,1.8,.18),(1.1,2.1,.18),(1.4,2.2,.18)], .045),
        ('Whisker', [(1.4,1.45,.2),(1.9,1.1,.2),(1.7,.6,.2)], .025),
        ('Foreleg', [(-.4,.65,.18),(-1.25,.7,.18),(-1.6,1,.18)], .07),
        ('Claw', [(-1.65,1.3,.18),(-1.6,1,.18),(-1.9,.85,.18)], .035),
        ('Hindleg', [(.6,-.95,.18),(1.5,-1.15,.18),(1.75,-.85,.18)], .07),
        ('Hindclaw', [(1.65,-.55,.18),(1.75,-.85,.18),(2,-.9,.18)], .035),
    ]: curve(name, points, radius, brass)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.065, location=(1.07,1.68,.31))
    bpy.context.object.name = 'Dragon eye'; bpy.context.object.data.materials.append(jade)
    for i in range(16):
        a = i*math.tau/16
        curve('Rim engraving', [(2.55*math.cos(a),2.55*math.sin(a),.15),(2.64*math.cos(a),2.64*math.sin(a),.15)], .02, brass)

if __name__ == '__main__':
    render('walnut-lacquer', 1024, 1024)
    surface.data.materials[0] = felt
    render('tea-felt', 1024, 1024)
    build_medallion()
    render('dragon-medallion', 768, 768)
    # Save only this authored scene, leaving the user's existing project untouched.
    bpy.data.libraries.write(str(OUT / 'tichu-material-studio.blend'), {scene}, fake_user=True)
