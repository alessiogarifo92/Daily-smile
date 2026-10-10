"""Procedural rose for the flower sprites (spike #14): 30 spiral petals, rendered with Cycles.

Run: python scripts/blender/rose.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, petal_material, run, smoothstep


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

    obj.data.materials.append(petal_material(color_hex))
    return obj


def build_greens():
    """Five sepals and a short stem stub under the head."""
    green = green_material()
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


run('rosa', build_rose, build_greens)
