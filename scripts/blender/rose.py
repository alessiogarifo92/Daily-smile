"""Spike #14 prototype: procedural rose rendered with Cycles, one WebP sprite per colour x angle.

Needs Blender as a Python module (pip install bpy, Python 3.13). Not used by the app yet.
Run: python scripts/blender/rose.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random
import sys

import bpy
import bmesh
from mathutils import Vector

COLORS = {
    'corallo': '#FF7A59', 'sole': '#FFC845', 'magenta': '#E0457B', 'cipria': '#F2B8C2', 'rosso': '#C0283C',
    'lilla': '#A88BEB', 'pesca': '#F8B98B', 'panna': '#FFF6E5', 'azzurro': '#7FB5F0',
}
# Camera elevation (degrees above the horizon) per angle name.
ANGLES = {'front': 18, 'three-quarter': 45, 'top': 78}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def petal(bm, uv_layer, az, t, rng):
    """One petal on the flower dome. t: 0 innermost .. 1 outermost."""
    NV, NU = 18, 14
    length = 0.62 + 0.42 * t ** 0.9
    # Angular width of the petal around the flower axis: inner petals wrap, outer ones spread.
    wrap = math.radians(235 - 115 * t)
    open0 = 0.03 + 0.62 * t ** 1.8  # lean away from the axis at the base
    open1 = 0.08 + 0.32 * t  # extra opening towards the tip
    curl = 1.0 * smoothstep(0.3, 1.0, t)  # outer petals roll back at the tip
    r0 = 0.03 + 0.10 * t
    jitter = rng.uniform(-0.06, 0.06)

    # Centre line in the (radial, height) plane.
    pts = [(r0, -0.1 * t)]
    rad, hgt = r0, -0.1 * t
    for j in range(1, NV + 1):
        v = j / NV
        a = open0 + open1 * v * v + curl * smoothstep(0.7, 1.0, v) ** 1.4 + jitter
        ds = length / NV
        rad += math.sin(a) * ds
        hgt += math.cos(a) * ds
        pts.append((rad, hgt))

    grid = []
    for j, (rad, hgt) in enumerate(pts):
        v = j / NV
        # Width profile: narrow claw at the base, widest past the middle, rounded tip.
        w = math.sin(math.pi * min(1.0, 0.08 + 0.92 * v) * 0.92) ** 0.7 * (1 - 0.35 * v ** 6)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            ang = az + u * w * wrap / 2
            r = max(rad, 0.02)
            # Margins roll outward near the tip on open petals; a slight notch-free wave.
            roll = (0.16 * t + 0.02) * abs(u) ** 2.5 * smoothstep(0.55, 1.0, v)
            wave = 0.012 * math.sin(u * 5 + az * 3) * v
            rr = r + roll + wave
            z = hgt - 0.05 * u * u * v * t
            row.append(bm.verts.new((rr * math.cos(ang), rr * math.sin(ang), z)))
        grid.append(row)

    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def build_rose(color_hex):
    rng = random.Random(7)
    mesh = bpy.data.meshes.new('rose')
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 30
    golden = math.radians(137.508)
    for k in range(n):
        petal(bm, uv, k * golden, k / (n - 1), rng)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('rose', mesh)
    bpy.context.collection.objects.link(obj)
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.008
    sol.offset = 0
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 2

    mat = bpy.data.materials.new('petal')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    base = hex_linear(color_hex)
    deep = tuple(c * 0.45 for c in base[:3]) + (1.0,)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = deep
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].color = base
    ramp.color_ramp.elements[1].position = 0.55
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
    veins.inputs['Scale'].default_value = 9.0
    veins.inputs['Distortion'].default_value = 3.0
    nt.links.new(tex.outputs['UV'], veins.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    nt.links.new(veins.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Subsurface Weight'].default_value = 0.2
    bsdf.inputs['Subsurface Radius'].default_value = (0.05, 0.02, 0.02)
    bsdf.inputs['Subsurface Scale'].default_value = 0.05
    bsdf.inputs['Sheen Weight'].default_value = 0.12
    bsdf.inputs['Sheen Roughness'].default_value = 0.4
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    obj.data.materials.append(mat)
    return obj


def build_greens():
    """Five sepals and a short stem stub under the head."""
    green = bpy.data.materials.new('green')
    green.use_nodes = True
    g = green.node_tree.nodes['Principled BSDF']
    g.inputs['Base Color'].default_value = hex_linear('#3E7A4A')
    g.inputs['Roughness'].default_value = 0.6
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.6, location=(0, 0, -0.3))
    stem = bpy.context.object
    stem.data.materials.append(green)
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0))
        s = bpy.context.object
        s.scale = (0.22, 0.05, 0.012)
        s.location = (0.15 * math.cos(a), 0.15 * math.sin(a), 0.02)
        s.rotation_euler = (0, math.radians(25), a)
        s.data.materials.append(green)
        bpy.ops.object.shade_smooth()


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


def aim(cam, elev_deg, dist=5.6, target=(0, 0, 0.3)):
    e = math.radians(elev_deg)
    t = Vector(target)
    cam.location = t + Vector((0, -math.cos(e) * dist, math.sin(e) * dist))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()


def main():
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
    names = names or list(COLORS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(int(opts['--size']), int(opts['--samples']))
    build_greens()
    for name in names:
        rose = build_rose(COLORS[name])
        for angle in opts['--angles'].split(','):
            aim(cam, ANGLES[angle])
            bpy.context.scene.render.filepath = f'{out}/rosa-{name}-{angle}.webp'
            bpy.ops.render.render(write_still=True)
            print('wrote', bpy.context.scene.render.filepath, flush=True)
        bpy.data.objects.remove(rose)


main()
