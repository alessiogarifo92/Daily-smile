"""Procedural gerbera for the flower sprites: two rows of broad ray petals with notched tips, a ring
of short fringe florets, a dark disc with a greenish eye, green bracts behind and a stem.

Run: python scripts/blender/gerbera.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, hex_linear, petal_material, run, smoothstep

DISC = 0.17  # dark central disc radius
FRINGE = 0.25  # outer radius of the fringe florets; the rays start just under it
LENGTH = 0.8  # ray petal length


def ray(bm, uv_layer, az, rng, length, width, rise, r0, z0, notch=0.012, teeth=3):
    """One broad ray petal: narrow base, wide parallel body, rounded tip with small notches."""
    NV, NU = 18, 12
    length *= rng.uniform(0.94, 1.05)
    az += rng.uniform(-0.03, 0.03)
    rise += rng.uniform(-0.02, 0.02)
    droop = 0.1 + rng.uniform(-0.04, 0.05)
    twist = rng.uniform(-0.2, 0.2)
    ca, sa = math.cos(az), math.sin(az)
    grid = []
    for j in range(NV + 1):
        v = j / NV
        s = r0 + length * v
        z = z0 + rise * math.sin(math.pi / 2 * min(1.0, v / 0.3)) - droop * smoothstep(0.35, 1.0, v) ** 1.6
        # Narrow at the base, broad strap from a quarter on, rounded at the tip.
        w = width * (0.4 + 0.6 * smoothstep(0.0, 0.28, v)) * (1 - 0.45 * smoothstep(0.84, 1.0, v) ** 2)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            # Soft central groove and edges a touch higher; a little twist along the petal.
            dz = 0.014 * (u * u - 0.4) * (1 - 0.5 * v) + twist * u * w * v * 0.25
            # Notched tip: `teeth` lobes, the dips stopping a little short.
            dips = 0.5 - 0.5 * math.cos(math.pi * teeth * (u + 1))
            ds = -notch * (1 - dips) * smoothstep(0.9, 1.0, v) * (1 - 0.6 * abs(u))
            t = u * w
            x, y = (s + ds) * ca - t * sa, (s + ds) * sa + t * ca
            row.append(bm.verts.new((x, y, z + dz)))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv_layer].uv = (ii / NU, jj / NV)


def mesh_object(name, bm, thickness=0.008, subsurf=2):
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


def build_gerbera(color_hex):
    rng = random.Random(7)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    # Two rows of broad rays, the upper one shorter and offset by half a step.
    n = 20
    for k in range(n):
        ray(bm, uv, 2 * math.pi * k / n, rng, LENGTH, 0.115, 0.05, FRINGE * 0.85, 0.0)
    for k in range(n):
        ray(bm, uv, 2 * math.pi * (k + 0.5) / n, rng, LENGTH * 0.86, 0.1, 0.09, FRINGE * 0.8, 0.02)
    # Fringe: a ring of short, narrow florets standing up around the disc, the same colour.
    m = 64
    for k in range(m):
        ray(bm, uv, 2 * math.pi * (k + 0.3) / m, rng, 0.11, 0.015, 0.12, DISC * 0.92, 0.03, notch=0.004, teeth=2)
    obj = mesh_object('gerbera', bm)
    # Broad satiny rays, a little darker at the base, fine veins along their length.
    obj.data.materials.append(petal_material(color_hex, deep=0.7, ramp_pos=0.3, roughness=0.6, sheen=0.1, veins_scale=26.0))
    return obj


def disc_material():
    """Near-black brown disc with a greenish eye and a bumpy floret texture."""
    mat = bpy.data.materials.new('disc')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    coords = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / DISC, 1 / DISC, 1 / DISC)
    nt.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], grad.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = hex_linear('#1A1008')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].color = hex_linear('#4A5A22')
    ramp.color_ramp.elements[1].position = 0.65
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    cells = nt.nodes.new('ShaderNodeTexVoronoi')
    cells.inputs['Scale'].default_value = 120.0
    nt.links.new(coords.outputs['Object'], cells.inputs['Vector'])
    shade = nt.nodes.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['Factor'].default_value = 0.4
    nt.links.new(ramp.outputs['Color'], shade.inputs[6])
    nt.links.new(cells.outputs['Distance'], shade.inputs[7])
    nt.links.new(shade.outputs[2], bsdf.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    nt.links.new(cells.outputs['Distance'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.75
    return mat


def build_greens():
    """Dark disc, green bracts and cup under the head, and a stem; the same for every colour."""
    green = green_material()
    bpy.ops.mesh.primitive_uv_sphere_add(radius=DISC, segments=48, ring_count=24, location=(0, 0, 0.03))
    disc = bpy.context.object
    disc.scale = (1, 1, 0.4)
    disc.data.materials.append(disc_material())
    bpy.ops.object.shade_smooth()
    # Involucre: narrow pointed green bracts just under the rays, over a shallow cup.
    rng = random.Random(11)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 18
    for k in range(n):
        ray(bm, uv, 2 * math.pi * (k + 0.25) / n, rng, 0.26, 0.04, -0.1, FRINGE * 0.6, -0.04, notch=0.0)
    bracts = mesh_object('bracts', bm)
    bracts.data.materials.append(green)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=FRINGE, location=(0, 0, -0.05))
    cup = bpy.context.object
    cup.scale = (1, 1, 0.35)
    cup.data.materials.append(green)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.9, location=(0, 0, -0.5))
    bpy.context.object.data.materials.append(green)
    bpy.ops.object.shade_smooth()


run('gerbera', build_gerbera, build_greens, target=(0, 0, 0.0), exposure=-0.5)
