"""Procedural ranunculus for the flower sprites: a near-spherical bloom of many thin cupped petals
in tight concentric layers around a small dark-green button, with sepals and a stem stub.

Run: python scripts/blender/ranunculus.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, hex_linear, petal_material, run, smoothstep

R_OUT = 0.74  # radius of the outer shell
CENTRE = 0.62  # height of the bloom's centre above the stem top
TOP = CENTRE + R_OUT


def petal(bm, uv_layer, az, t, rng):
    """One cupped petal on a spherical shell. t: 0 innermost .. 1 outermost.

    Every shell touches the top of the bloom, so the inner ones sit nested under the outer ones and
    their rounded lips show as concentric rings from above and as overlapping scales from the side.
    """
    NV, NU = 16, 12
    r = 0.07 + (R_OUT - 0.07) * t ** 0.85
    cz = TOP - r
    # Polar angle from the top: the lip rises towards the centre on the inner petals.
    th1 = math.radians(20 + 62 * t ** 1.3 + rng.uniform(-3, 3))
    th0 = math.radians(150 if t > 0.25 else 100 + 200 * t)
    # Outermost guard petals open a little.
    opening = 0.4 * smoothstep(0.82, 1.0, t)
    wrap = math.radians(150 - 70 * t)
    az += rng.uniform(-0.05, 0.05)
    grid = []
    for j in range(NV + 1):
        v = j / NV
        th = th0 + (th1 - th0) * v
        # Narrow claw at the base, broad rounded lip.
        if v < 0.7:
            w = 0.25 + 0.75 * math.sin(v / 0.7 * math.pi / 2) ** 0.8
        else:
            w = max(0.12, math.sqrt(max(0.0, 1 - ((v - 0.7) / 0.3) ** 2)))
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            phi = az + u * w * wrap / 2
            # Cupped: the middle of the petal bulges out, its margins tuck under the next layer;
            # the lip flares out a touch so each layer reads as a rim.
            rr = r * (1 + 0.022 * (1 - u * u) + 0.03 * smoothstep(0.75, 1.0, v))
            tt = th + opening * smoothstep(0.5, 1.0, v)
            row.append(bm.verts.new((rr * math.sin(tt) * math.cos(phi), rr * math.sin(tt) * math.sin(phi), cz + rr * math.cos(tt))))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def build_ranunculus(color_hex):
    rng = random.Random(11)
    mesh = bpy.data.meshes.new('ranunculus')
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 110
    golden = math.radians(137.508)
    for k in range(n):
        petal(bm, uv, k * golden, k / (n - 1), rng)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('ranunculus', mesh)
    bpy.context.collection.objects.link(obj)
    obj.scale.z = 0.9  # a dome a little wider than tall
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.005
    sol.offset = 0
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    obj.data.materials.append(petal_material(color_hex, deep=0.55, ramp_pos=0.6, sheen=0.0, veins_scale=14.0))
    return obj


def build_greens():
    """Small dark-green button in the middle, five sepals and a stem stub."""
    button = bpy.data.materials.new('button')
    button.use_nodes = True
    b = button.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_linear('#34461F')
    b.inputs['Roughness'].default_value = 0.7
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0, 0, TOP * 0.9 - 0.05))
    bpy.ops.object.shade_smooth()
    bpy.context.object.data.materials.append(button)

    green = green_material()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.6, location=(0, 0, -0.25))
    bpy.context.object.data.materials.append(green)
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.4
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0))
        s = bpy.context.object
        s.scale = (0.2, 0.06, 0.012)
        s.location = (0.17 * math.cos(a), 0.17 * math.sin(a), 0.03)
        s.rotation_euler = (0, math.radians(-35), a)
        s.data.materials.append(green)
        bpy.ops.object.shade_smooth()


run('ranuncolo', build_ranunculus, build_greens, target=(0, 0, 0.45), exposure=-0.25)
