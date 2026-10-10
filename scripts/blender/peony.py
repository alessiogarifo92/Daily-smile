"""Procedural double peony for the flower sprites: a few broad cupped guard petals around a full,
rounded mass of ruffled petals, green sepals and a stem stub.

Run: python scripts/blender/peony.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, petal_material, run, smoothstep

GOLDEN = math.radians(137.508)


def petal(bm, uv_layer, az, length, width, r0, z0, lean0, lean1, ruffle, rng, jitter=1.0, max_wrap=3.4):
    """One rounded petal rising from (r0, z0) at azimuth az.

    lean0/lean1: angle from the flower axis at the base and at the tip (radians); lean1 < lean0
    turns the tip back in towards the centre, which is what closes the cup.
    width: half width at the widest point; the cross-section follows a circle around the axis, so
    every petal is cupped around the centre. ruffle: amplitude of the wavy margin.
    jitter: how irregular the petal is compared to its neighbours.
    """
    NV, NU = 18, 16
    az += rng.uniform(-0.08, 0.08) * jitter
    length *= 1 + rng.uniform(-0.1, 0.08) * jitter
    width *= 1 + rng.uniform(-0.15, 0.15) * jitter
    lean0 += rng.uniform(-0.08, 0.08) * jitter
    lean1 += rng.uniform(-0.12, 0.12) * jitter
    phase = rng.uniform(0, 2 * math.pi)
    freq = rng.uniform(5.0, 8.0)

    pts = [(r0, z0)]
    rad, hgt = r0, z0
    for j in range(1, NV + 1):
        v = j / NV
        a = lean0 + (lean1 - lean0) * smoothstep(0.0, 1.0, v)
        rad += math.sin(a) * length / NV
        hgt += math.cos(a) * length / NV
        pts.append((rad, hgt))

    grid = []
    for j, (rad, hgt) in enumerate(pts):
        v = j / NV
        # Obovate: narrow claw at the base, widest two thirds up, round tip.
        claw = 0.22 + 0.78 * smoothstep(0.0, 0.55, v)
        tip = math.sqrt(max(0.0, 1 - (max(0.0, v - 0.62) / 0.4) ** 2))
        w = width * claw * max(tip, 0.18 if j < NV else 0.0)
        r = max(rad, 0.04)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            ang = max(-max_wrap / 2, min(max_wrap / 2, u * w / r))
            # Ruffled margin: waves grow towards the rim of the petal, in and out and up and down.
            edge = smoothstep(0.35, 1.0, v) * (0.35 + 0.65 * abs(u))
            wave = ruffle * edge * math.sin(freq * u + phase + 4.0 * v)
            crinkle = 0.4 * ruffle * edge * math.sin(2.3 * freq * u - phase)
            rr = r + wave
            z = hgt + crinkle - 0.04 * u * u * v * length
            row.append(bm.verts.new((rr * math.cos(az + ang), rr * math.sin(az + ang), z)))
        grid.append(row)

    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def build_peony(color_hex):
    rng = random.Random(11)
    mesh = bpy.data.meshes.new('peony')
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    # Outer guard petals: broad, open bowls.
    for k in range(6):
        petal(bm, uv, k * math.pi / 3, 1.05, 0.48, 0.13, -0.1, math.radians(42), math.radians(64), 0.03, rng)
    for k in range(7):
        petal(bm, uv, (k + 0.5) * 2 * math.pi / 7, 0.95, 0.42, 0.11, -0.06, math.radians(28), math.radians(38), 0.035, rng)
    # Inner mass: many ruffled petals, the inner ones short and turning in to form a rounded crown.
    n = 90
    for k in range(n):
        t = k / (n - 1)  # 0 centre .. 1 edge of the crown
        petal(
            bm, uv, k * GOLDEN,
            length=0.4 + 0.44 * t,
            width=0.16 + 0.15 * t,
            r0=0.02 + 0.22 * t,
            z0=0.1 - 0.06 * t,
            lean0=math.radians(8 + 30 * t),
            lean1=math.radians(-40 + 45 * t),
            ruffle=0.045,
            rng=rng,
            jitter=2.2,
        )
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('peony', mesh)
    bpy.context.collection.objects.link(obj)
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.008
    sol.offset = 0
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1

    obj.data.materials.append(petal_material(color_hex, deep=0.6, ramp_pos=0.4))
    return obj


def build_greens():
    """Five broad sepals cupping the head from below and a short stem stub."""
    green = green_material()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.7, location=(0, 0, -0.38))
    stem = bpy.context.object
    stem.data.materials.append(green)
    bpy.ops.object.shade_smooth()
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.4
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0))
        s = bpy.context.object
        s.scale = (0.24, 0.09, 0.015)
        s.location = (0.16 * math.cos(a), 0.16 * math.sin(a), -0.08)
        s.rotation_euler = (0, math.radians(35), a)
        s.data.materials.append(green)
        bpy.ops.object.shade_smooth()


run('peonia', build_peony, build_greens, target=(0, 0, 0.3), exposure=0.1)
