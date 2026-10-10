"""Paper cone and ribbon bow of the bouquet, rendered with the 2D view's own camera.

The scene uses the app's coordinates (web/src/sprites.ts and bouquet3d.ts: y up, camera at
(0, 0.9, 5.4) looking at (0, 0.35, 0), vertical field of view 30°), turned into Blender's z-up.
Square renders: the 2D view draws them centred, as tall as the canvas.

For every paper colour two layers, so the stems can go between them:
  wrap-<hex>-back.webp   the inside of the cone seen through the opening (behind the stems)
  wrap-<hex>-front.webp  the front wall (in front of the stems)
and for every palette colour:
  ribbon-<colour>.webp   the band and bow at the tie point (over the front wall)

Run: python scripts/blender/wrap.py OUT_DIR [--size N] [--samples N] [--only wraps|ribbons]
"""
import math
import sys

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh
from mathutils import Matrix, Vector

from common import COLORS, hex_linear, setup_scene

# shared/flowers.ts WRAPS
WRAPS = ['#F3E6D3', '#E9DCEF', '#DCE8E0', '#F5DCD3']
TOP, BOTTOM, R_TOP, R_BOTTOM = 0.25, -1.15, 0.78, 0.1
TIE_Y = -0.42


def app(x, y, z):
    """App coordinates (y up, camera on +z) to Blender (z up, camera on -y)."""
    return Vector((x, -z, y))


def cone_point(a, k, r_scale=1.0):
    """Pleated cone surface, as buildWrap in bouquet3d.ts. a: azimuth, k: 0 bottom .. 1 top."""
    r = (R_BOTTOM + (R_TOP - R_BOTTOM) * k) * (1 + 0.07 * k * math.sin(a * 9)) * r_scale
    y = BOTTOM + (TOP - BOTTOM) * k + k * k * 0.12 * math.sin(a * 3 + 1)
    return app(r * math.cos(a), y, r * math.sin(a))


def mesh_object(name, bm, thickness=0.0, subsurf=1):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    if thickness:
        sol = obj.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = thickness
        sol.offset = -1
    if subsurf:
        sub = obj.modifiers.new('smooth', 'SUBSURF')
        sub.levels = sub.render_levels = subsurf
    return obj


def cone_half(name, a0, a1):
    """One half of the open cone between azimuths a0 and a1 (app frame), with UVs (u around, v up)."""
    NA, NK = 96, 28
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    grid = [[bm.verts.new(cone_point(a0 + (a1 - a0) * i / NA, j / NK)) for i in range(NA + 1)] for j in range(NK + 1)]
    for j in range(NK):
        for i in range(NA):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv].uv = (ii / NA, jj / NK)
    return mesh_object(name, bm, thickness=0.006)


def paper_material(hex_):
    """Matte paper with a faint fibre grain and soft light passing through it."""
    mat = bpy.data.materials.new('paper')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_linear(hex_)
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Specular IOR Level'].default_value = 0.2
    bsdf.inputs['Subsurface Weight'].default_value = 0.15
    bsdf.inputs['Subsurface Radius'].default_value = (0.05, 0.05, 0.05)
    bsdf.inputs['Subsurface Scale'].default_value = 0.02
    coords = nt.nodes.new('ShaderNodeTexCoord')
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 140.0
    grain.inputs['Detail'].default_value = 6.0
    nt.links.new(coords.outputs['Object'], grain.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.06
    nt.links.new(grain.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def satin(hex_):
    mat = bpy.data.materials.new('ribbon')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_linear(hex_)
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Sheen Weight'].default_value = 0.3
    bsdf.inputs['Specular IOR Level'].default_value = 0.35
    return mat


def strip(bm, uv, centre, half_width, normal_out):
    """A flat ribbon strip along a list of centre points; normal_out(i) gives the width direction."""
    rows = []
    for i, c in enumerate(centre):
        w = normal_out(i) * half_width
        rows.append((bm.verts.new(c - w), bm.verts.new(c + w)))
    for i in range(len(rows) - 1):
        f = bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        for loop, v in zip(f.loops, (0, 0, 1, 1)):
            loop[uv].uv = (0, v)


def build_ribbon():
    """Front half of the band around the cone, a two-loop bow and two tails with V-cut ends."""
    k = (TIE_Y - BOTTOM) / (TOP - BOTTOM)
    tie_r = (R_BOTTOM + (R_TOP - R_BOTTOM) * k) * 1.08
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    # Band: a strip hugging the cone over the half that faces the camera.
    n = 48
    band = [app(tie_r * math.cos(a), TIE_Y, tie_r * math.sin(a)) for a in (math.pi * i / n for i in range(n + 1))]
    strip(bm, uv, band, 0.05, lambda i: Vector((0, 0, 1)))
    knot = app(0, TIE_Y, tie_r + 0.015)
    out = Vector((0, -1, 0))  # towards the camera
    # Loops: each a closed strip leaving the knot, swelling out sideways and coming back.
    for side in (-1, 1):
        pts = []
        for i in range(25):
            t = i / 24 * 2 * math.pi
            x = side * (0.15 + 0.15 * math.cos(t + math.pi))
            y = 0.09 * math.sin(t) + 0.04 * (1 - math.cos(t)) / 2
            pts.append(knot + Vector((x, 0, y)) + out * (0.02 + 0.03 * (1 - math.cos(t)) / 2))
        strip(bm, uv, pts, 0.045, lambda i: Vector((0, 0.6, 0.8)).normalized())
        # Tail: hangs down and outwards, twisting a little; the end is cut in a V.
        tail = []
        for i in range(13):
            t = i / 12
            tail.append(knot + Vector((side * (0.03 + 0.09 * t), 0, -0.3 * t)) + out * (0.02 + 0.02 * math.sin(math.pi * t)))
        strip(bm, uv, tail, 0.045, lambda i: Vector((1, 0, 0.25 * side)).normalized())
    # Knot in the middle.
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1,
                              matrix=Matrix.Translation(knot + out * 0.03) @ Matrix.Diagonal((0.06, 0.04, 0.055, 1)))
    obj = mesh_object('ribbon', bm, thickness=0.006)
    return obj


# Exposure per layer, tuned so the median colour matches the paper / palette hex (ΔE ≤ ~10):
# the inside sits in the cone's shade, the ribbon is nearest the paper light.
EXPOSURE = {'front': -0.2, 'back': -0.9, 'ribbon': -1.0}


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('wrote', path, flush=True)


def main():
    args = sys.argv[1:]
    out = args[0]
    opts = {'--size': '768', '--samples': '64', '--only': ''}
    i = 1
    while i < len(args):
        opts[args[i]] = args[i + 1]
        i += 2
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(int(opts['--size']), int(opts['--samples']))
    sc = bpy.context.scene
    # The 2D view's camera (web/src/sprites.ts): same position, target and vertical field of view.
    cam.location = app(0, 0.9, 5.4)
    cam.rotation_euler = (app(0, 0.35, 0) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(30)
    # The flower lights aim at the heads; the cone sits lower and needs its own soft front light.
    light = bpy.data.lights.new('paper', 'AREA')
    light.energy = 260
    light.size = 3.0
    lamp = bpy.data.objects.new('paper', light)
    lamp.location = app(1.2, 0.6, 3.6)
    lamp.rotation_euler = (app(0, -0.5, 0) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(lamp)

    front = cone_half('front', 0, math.pi)  # app z > 0: facing the camera
    back = cone_half('back', math.pi, 2 * math.pi)
    ribbon = build_ribbon()

    if opts['--only'] != 'ribbons':
        for hex_ in WRAPS:
            mat = paper_material(hex_)
            for o in (front, back):
                o.data.materials.clear()
                o.data.materials.append(mat)
            ribbon.data.materials.clear()
            ribbon.data.materials.append(satin('#B0B0B0'))
            name = hex_.lstrip('#').lower()
            # Back layer: only the far wall shows; the front wall and ribbon still cast their shade.
            back.visible_camera = True
            front.visible_camera = False
            ribbon.visible_camera = False
            sc.view_settings.exposure = EXPOSURE['back']
            render(f'{out}/wrap-{name}-back.webp')
            back.visible_camera = False
            front.visible_camera = True
            sc.view_settings.exposure = EXPOSURE['front']
            render(f'{out}/wrap-{name}-front.webp')

    if opts['--only'] != 'wraps':
        mat = paper_material(WRAPS[0])
        for o in (front, back):
            o.data.materials.clear()
            o.data.materials.append(mat)
            o.visible_camera = False
        ribbon.visible_camera = True
        sc.view_settings.exposure = EXPOSURE['ribbon']
        for name, hex_ in COLORS.items():
            ribbon.data.materials.clear()
            ribbon.data.materials.append(satin(hex_))
            render(f'{out}/ribbon-{name}.webp')


main()
