"""Shared Blender setup for the flower sprites: colours, views, lights, materials, render loop.

Each flower script (rose.py, tulip.py, ...) builds its head and calls run(). Needs Blender as a
Python module (pip install bpy, Python 3.13).
"""
import math
import sys

import bpy
from mathutils import Vector

COLORS = {
    'corallo': '#FF7A59', 'sole': '#FFC845', 'magenta': '#E0457B', 'cipria': '#F2B8C2', 'rosso': '#C0283C',
    'lilla': '#A88BEB', 'pesca': '#F8B98B', 'panna': '#FFF6E5', 'azzurro': '#7FB5F0',
}
# Camera elevation (degrees above the horizon) per view name; web/src/sprites.ts picks among them.
ANGLES = {'front': 18, 'three-quarter': 45, 'top': 78}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def petal_material(color_hex, deep=0.45, ramp_pos=0.55, roughness=0.55, sheen=0.12, veins_scale=9.0):
    """Petal shader: darker towards the base (UV v = 0), tone variation, fine veins, soft subsurface."""
    mat = bpy.data.materials.new('petal')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    base = hex_linear(color_hex)
    deep_c = tuple(c * deep for c in base[:3]) + (1.0,)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = deep_c
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].color = base
    ramp.color_ramp.elements[1].position = ramp_pos
    tex = nt.nodes.new('ShaderNodeUVMap')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tex.outputs['UV'], sep.inputs[0])
    nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
    # Subtle tone variation and fine veins running along each petal.
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 3.0
    vary = nt.nodes.new('ShaderNodeMix')
    vary.data_type = 'RGBA'
    vary.blend_type = 'MULTIPLY'
    vary.inputs['Factor'].default_value = 0.18
    nt.links.new(ramp.outputs['Color'], vary.inputs[6])
    nt.links.new(noise.outputs['Color'], vary.inputs[7])
    nt.links.new(vary.outputs[2], bsdf.inputs['Base Color'])
    veins = nt.nodes.new('ShaderNodeTexWave')
    veins.wave_type = 'BANDS'
    veins.bands_direction = 'X'
    veins.inputs['Scale'].default_value = veins_scale
    veins.inputs['Distortion'].default_value = 3.0
    nt.links.new(tex.outputs['UV'], veins.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    nt.links.new(veins.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Subsurface Weight'].default_value = 0.2
    bsdf.inputs['Subsurface Radius'].default_value = (0.05, 0.02, 0.02)
    bsdf.inputs['Subsurface Scale'].default_value = 0.05
    bsdf.inputs['Sheen Weight'].default_value = sheen
    bsdf.inputs['Sheen Roughness'].default_value = 0.4
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    return mat


def green_material():
    green = bpy.data.materials.new('green')
    green.use_nodes = True
    g = green.node_tree.nodes['Principled BSDF']
    g.inputs['Base Color'].default_value = hex_linear('#3E7A4A')
    g.inputs['Roughness'].default_value = 0.6
    return green


def setup_scene(size, samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = -0.5
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 82
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.9, 0.92, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    sc.world = world

    def area(name, loc, energy, size_):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = size_
        o = bpy.data.objects.new(name, light)
        o.location = loc
        direction = Vector((0, 0, 0.35)) - Vector(loc)
        o.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(o)

    area('key', (2.2, -2.0, 3.0), 170, 2.5)
    area('fill', (-2.5, -1.0, 1.5), 55, 3.0)
    area('rim', (0.0, 2.6, 2.2), 110, 2.0)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 85
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, elev_deg, target, dist=5.6):
    e = math.radians(elev_deg)
    t = Vector(target)
    cam.location = t + Vector((0, -math.cos(e) * dist, math.sin(e) * dist))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()


def run(flower, build_head, build_greens, target=(0, 0, 0.3), exposure=-0.5, colors=COLORS):
    """Command line: OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N].

    exposure: stops; tuned per flower so the median petal colour matches the palette
    (e2e/colors.spec.ts measures it).
    colors: name -> hex; the palette by default, a flower's own shades when it has natural colours.
    """
    args = sys.argv[1:]
    out = args[0]
    opts = {'--angles': ','.join(ANGLES), '--size': '512', '--samples': '64'}
    names = []
    i = 1
    while i < len(args):
        if args[i] in opts:
            opts[args[i]] = args[i + 1]
            i += 2
        else:
            names.append(args[i])
            i += 1
    names = names or list(colors)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(int(opts['--size']), int(opts['--samples']))
    bpy.context.scene.view_settings.exposure = exposure
    build_greens()
    for name in names:
        head = build_head(colors[name])
        for angle in opts['--angles'].split(','):
            aim(cam, ANGLES[angle], target)
            bpy.context.scene.render.filepath = f'{out}/{flower}-{name}-{angle}.webp'
            bpy.ops.render.render(write_still=True)
            print('wrote', bpy.context.scene.render.filepath, flush=True)
        bpy.data.objects.remove(head)
