"""Procedural tulip for the flower sprites: six tepals in two whorls forming a goblet.

Run: python scripts/blender/tulip.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, petal_material, run, smoothstep

LENGTH = 1.5  # tepal length = head height


def tepal(bm, uv_layer, az, outer, rng):
    """One tepal hugging the flower axis; outer ones a little wider, with tips that flare."""
    NV, NU = 22, 16
    wrap = math.radians(150 if outer else 140)
    scale = 1.0 if outer else 0.93
    lean = rng.uniform(-0.03, 0.03)
    grid = []
    for j in range(NV + 1):
        v = j / NV
        # Rounded base, then nearly straight sides up to the tip: a cup, not an egg.
        radius = scale * (0.06 + 0.44 * math.sin(math.pi / 2 * min(1.0, v / 0.45)) ** 0.8 - 0.05 * smoothstep(0.45, 1.0, v))
        if outer:
            radius += 0.08 * smoothstep(0.8, 1.0, v) ** 1.5
        radius += lean * v
        width = math.sin(math.pi / 2 * min(1.0, 0.15 + v / 0.35)) ** 0.5 * (1 - 0.55 * smoothstep(0.82, 1.0, v) ** 1.5)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            ang = az + u * width * wrap / 2
            # Pointed, rounded tip: the edges fall away from the centre line near the top.
            z = LENGTH * v - 0.26 * u * u * smoothstep(0.7, 1.0, v) * LENGTH * 0.5
            r = radius * (1 + 0.04 * u * u)  # edges sit a touch outside the centre line
            row.append(bm.verts.new((r * math.cos(ang), r * math.sin(ang), z)))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def build_tulip(color_hex):
    rng = random.Random(11)
    mesh = bpy.data.meshes.new('tulip')
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    for k in range(3):
        tepal(bm, uv, math.radians(120 * k), True, rng)
        tepal(bm, uv, math.radians(120 * k + 60), False, rng)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('tulip', mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (0, 0, -0.05)
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.012
    sol.offset = 0
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    # Tulips are satiny: glossier than roses, lighter base, fine veins along the tepal.
    obj.data.materials.append(petal_material(color_hex, deep=0.62, ramp_pos=0.45, roughness=0.38, sheen=0.05, veins_scale=16.0))
    return obj


def build_heart():
    """Pale pistil and six dark stamens inside the cup (seen in the top view)."""
    pale = bpy.data.materials.new('pistil')
    pale.diffuse_color = (0.72, 0.78, 0.45, 1)
    pale.use_nodes = True
    pale.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.62, 0.28, 1)
    dark = bpy.data.materials.new('anther')
    dark.use_nodes = True
    dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.04, 0.03, 0.03, 1)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.55, location=(0, 0, 0.27))
    bpy.context.object.data.materials.append(pale)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0, 0.56))
    bpy.context.object.scale = (1, 1, 0.6)
    bpy.context.object.data.materials.append(pale)
    bpy.ops.object.shade_smooth()
    for k in range(6):
        a = math.radians(60 * k + 30)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(0.17 * math.cos(a), 0.17 * math.sin(a), 0.5))
        bpy.context.object.scale = (0.6, 0.6, 1.8)
        bpy.context.object.data.materials.append(dark)
        bpy.ops.object.shade_smooth()


def build_greens():
    """A thick stem under the head."""
    green = green_material()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.9, location=(0, 0, -0.45))
    bpy.context.object.data.materials.append(green)
    bpy.ops.object.shade_smooth()
    build_heart()


# The cup's upright sides catch less light than open rose petals: a brighter exposure.
run('tulipano', build_tulip, build_greens, target=(0, 0, 0.7), exposure=-0.05)
