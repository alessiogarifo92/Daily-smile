"""Procedural daisy for the flower sprites: a flat ray of thin petals around a domed golden disc.

Run: python scripts/blender/daisy.py OUT_DIR [colour ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import green_material, hex_linear, petal_material, run, smoothstep

DISC = 0.29  # disc radius; petals start just under its rim
LENGTH = 0.84  # petal length


def ray(bm, uv_layer, az, rng, length, width, lift):
    """One strap-shaped ray petal: narrow base, parallel sides, blunt notched tip, a soft central groove."""
    NV, NU = 16, 6
    length *= rng.uniform(0.92, 1.06)
    az += rng.uniform(-0.04, 0.04)
    # Rises a little out of the disc, then lies almost flat and droops towards the tip.
    rise = lift + rng.uniform(-0.03, 0.03)
    droop = 0.12 + rng.uniform(-0.05, 0.06)
    twist = rng.uniform(-0.25, 0.25)
    ca, sa = math.cos(az), math.sin(az)
    grid = []
    for j in range(NV + 1):
        v = j / NV
        s = DISC * 0.82 + length * v
        z = 0.03 + rise * math.sin(math.pi / 2 * min(1.0, v / 0.35)) - droop * smoothstep(0.35, 1.0, v) ** 1.6
        # Narrow claw at the base, nearly parallel sides, rounded tip.
        w = width * (0.45 + 0.55 * smoothstep(0.0, 0.25, v)) * (1 - 0.6 * smoothstep(0.86, 1.0, v) ** 2)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            # Shallow groove along the middle, edges a touch higher; a tiny twist along the petal.
            dz = 0.012 * (u * u - 0.4) * (1 - 0.5 * v) + twist * u * w * v * 0.3
            # Two-lobed tip: the middle stops a little short of the edges.
            ds = -0.018 * (1 - abs(u)) ** 2 * smoothstep(0.92, 1.0, v)
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


def build_daisy(color_hex):
    rng = random.Random(5)
    mesh = bpy.data.meshes.new('daisy')
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    # Two overlapping rows of rays, the upper one a little shorter and offset by half a step.
    n = 22
    for k in range(n):
        ray(bm, uv, 2 * math.pi * k / n, rng, LENGTH, 0.075, 0.07)
    for k in range(n):
        ray(bm, uv, 2 * math.pi * (k + 0.5) / n, rng, LENGTH * 0.94, 0.07, 0.1)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('daisy', mesh)
    bpy.context.collection.objects.link(obj)
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.008
    sol.offset = 0
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    # Thin matte rays, barely darker at the base, fine veins along their length.
    obj.data.materials.append(petal_material(color_hex, deep=0.8, ramp_pos=0.3, roughness=0.6, sheen=0.15, veins_scale=22.0))
    return obj


def disc_material():
    """Golden yellow florets, a little greener in the middle, with a bumpy floret texture."""
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
    ramp.color_ramp.elements[0].color = hex_linear('#C98E10')
    ramp.color_ramp.elements[1].color = hex_linear('#E9B52A')
    ramp.color_ramp.elements[1].position = 0.6
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    cells = nt.nodes.new('ShaderNodeTexVoronoi')
    cells.inputs['Scale'].default_value = 90.0
    nt.links.new(coords.outputs['Object'], cells.inputs['Vector'])
    shade = nt.nodes.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['Factor'].default_value = 0.35
    nt.links.new(ramp.outputs['Color'], shade.inputs[6])
    nt.links.new(cells.outputs['Distance'], shade.inputs[7])
    nt.links.new(shade.outputs[2], bsdf.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    nt.links.new(cells.outputs['Distance'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.7
    return mat


def build_greens():
    """Domed disc, green bracts under the head and a stem; the same for every colour."""
    green = green_material()
    bpy.ops.mesh.primitive_uv_sphere_add(radius=DISC, segments=48, ring_count=24, location=(0, 0, 0.02))
    disc = bpy.context.object
    disc.scale = (1, 1, 0.5)
    disc.data.materials.append(disc_material())
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.9, location=(0, 0, -0.45))
    bpy.context.object.data.materials.append(green)
    bpy.ops.object.shade_smooth()
    # Involucre: a shallow green cup of small bracts under the rays.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=DISC * 0.95, location=(0, 0, -0.03))
    cup = bpy.context.object
    cup.scale = (1, 1, 0.35)
    cup.data.materials.append(green)
    bpy.ops.object.shade_smooth()


# Open, flat rays catch the light like rose petals: the rose's exposure measures ΔE 1.6-10.3 in e2e/colors.spec.ts.
run('margherita', build_daisy, build_greens, target=(0, 0, 0.0), exposure=-0.5)
