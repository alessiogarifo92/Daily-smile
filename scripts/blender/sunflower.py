"""Procedural sunflower for the flower sprites: a flat seed disc with Fibonacci florets, two rows
of long ray petals and green bracts behind.

Run: python scripts/blender/sunflower.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh
from mathutils import Matrix

from common import green_material, hex_linear, petal_material, run, smoothstep

DISC = 0.44  # seed disc radius
GOLDEN = math.radians(137.508)


def ray(bm, uv_layer, az, length, width, tilt, r0, z0, rng, pointed=0.8):
    """One long ray petal from under the disc rim, rising by `tilt` and drooping at the tip."""
    NV, NU = 20, 10
    az += rng.uniform(-0.04, 0.04)
    tilt += rng.uniform(-0.06, 0.06)
    droop = rng.uniform(0.15, 0.4)
    twist = rng.uniform(-0.25, 0.25)
    length *= rng.uniform(0.92, 1.06)
    d = (math.cos(az), math.sin(az))
    t = (-d[1], d[0])
    grid = []
    rad, hgt = r0, z0
    for j in range(NV + 1):
        v = j / NV
        if j:
            a = tilt - droop * smoothstep(0.5, 1.0, v)
            rad += math.cos(a) * length / NV
            hgt += math.sin(a) * length / NV
        # Narrow at the base, widest a third of the way, then tapering to a point.
        w = width * min(1.0, 0.3 + v / 0.25) ** 0.5 * (1 - smoothstep(0.45, 1.0, v) ** 1.8 * pointed)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            # Edges curl up a little and the centre carries a shallow groove along the petal.
            lift = 0.18 * width * u * u + 0.02 * width * (1 - abs(u)) * math.sin(math.pi * v)
            side = u * w
            lift += twist * side * v
            row.append(bm.verts.new((d[0] * rad + t[0] * side, d[1] * rad + t[1] * side, hgt + lift)))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def mesh_object(name, bm, thickness=0.01, subsurf=2):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if thickness:
        sol = obj.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = thickness
        sol.offset = 0
    if subsurf:
        sub = obj.modifiers.new('smooth', 'SUBSURF')
        sub.levels = sub.render_levels = subsurf
    return obj


def build_sunflower(color_hex):
    rng = random.Random(5)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 21
    for k in range(n):  # back row: longer, nearly flat
        ray(bm, uv, k * 2 * math.pi / n, 0.6, 0.15, math.radians(6), DISC * 0.82, -0.01, rng)
    for k in range(n):  # front row, between the back ones: shorter, a little raised
        ray(bm, uv, (k + 0.5) * 2 * math.pi / n, 0.54, 0.14, math.radians(16), DISC * 0.86, 0.015, rng)
    obj = mesh_object('sunflower', bm)
    # Matte ray petals, deeper towards the disc, with fine lengthwise veins; no sheen, it washed out the reds.
    obj.data.materials.append(petal_material(color_hex, deep=0.6, ramp_pos=0.35, roughness=0.7, sheen=0.0, veins_scale=22.0))
    return obj


def plain(name, hex_, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_linear(hex_)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def disc_height(r):
    """Gently domed seed disc."""
    return 0.05 * (1 - (r / DISC) ** 2)


def build_disc():
    """Dark brown seed disc covered in florets on the Fibonacci spiral, paler towards the rim."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=48, ring_count=16, location=(0, 0, 0.0))
    base = bpy.context.object
    base.scale = (DISC * 1.02, DISC * 1.02, 0.05)
    base.data.materials.append(plain('disc', '#1E1008', 0.8))
    bpy.ops.object.shade_smooth()

    n = 640
    spacing = DISC * math.sqrt(math.pi / n)
    rings = {'inner': bmesh.new(), 'outer': bmesh.new()}
    for i in range(n):
        r = DISC * 0.98 * math.sqrt((i + 0.5) / n)
        a = i * GOLDEN
        rim = r > DISC * 0.72
        size = spacing * (0.5 if rim else 0.42) * (0.75 + 0.25 * r / DISC)
        m = Matrix.Translation((r * math.cos(a), r * math.sin(a), disc_height(r) + size * 0.25)) @ Matrix.Diagonal((size, size, size * 0.8, 1))
        bmesh.ops.create_icosphere(rings['outer' if rim else 'inner'], subdivisions=1, radius=1, matrix=m)
    inner = mesh_object('florets', rings['inner'], thickness=0, subsurf=0)
    inner.data.materials.append(plain('seeds', '#22130A', 0.7))
    outer = mesh_object('florets-rim', rings['outer'], thickness=0, subsurf=0)
    outer.data.materials.append(plain('florets', '#4A2C12', 0.75))
    for o in (inner, outer):
        for p in o.data.polygons:
            p.use_smooth = True


def build_greens():
    """Seed disc, green bracts and the back of the head, and a thick stem."""
    build_disc()
    green = green_material()
    rng = random.Random(9)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 16
    for k in range(n):
        ray(bm, uv, (k + 0.25) * 2 * math.pi / n, 0.3, 0.09, math.radians(-12), DISC * 0.7, -0.07, rng, pointed=1.0)
    bracts = mesh_object('bracts', bm)
    bracts.data.materials.append(green)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=40, ring_count=16, location=(0, 0, -0.07))
    back = bpy.context.object
    back.scale = (DISC * 0.95, DISC * 0.95, 0.065)
    back.data.materials.append(green)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.8, location=(0, 0, -0.5))
    bpy.context.object.data.materials.append(green)
    bpy.ops.object.shade_smooth()


run('girasole', build_sunflower, build_greens, target=(0, 0, 0.05), exposure=-0.3)
