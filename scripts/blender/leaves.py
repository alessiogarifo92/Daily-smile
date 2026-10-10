"""Leaf sprites for the bouquet's foliage (the collar over the paper and the leaves on the stems).

Each leaf is seen from above at three-quarters light, base at the bottom centre of a square
image and tip at the top edge: the 2D view rotates it around the base and scales it to length.

Run: python scripts/blender/leaves.py OUT_DIR [--size N] [--samples N]
"""
import math
import random
import sys

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh

from common import hex_linear, setup_scene, smoothstep

# Variants: (width / length, how much the halves fold up along the midrib, tip curl, seed).
VARIANTS = [(0.30, 0.22, 0.06, 1), (0.26, 0.3, 0.12, 2), (0.34, 0.18, 0.02, 3), (0.22, 0.26, 0.16, 4)]
LENGTH = 1.0


def leaf(width, fold, curl, seed):
    rng = random.Random(seed)
    NV, NU = 28, 12
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    wobble = rng.uniform(-0.04, 0.04)
    grid = []
    for j in range(NV + 1):
        v = j / NV
        # Ovate blade: widest a third of the way up, rounded base, long pointed tip.
        w = width * LENGTH * math.sin(math.pi * v ** 0.75) ** 1.2 * (1 - 0.15 * smoothstep(0.7, 1.0, v))
        y = LENGTH * v
        z = -curl * smoothstep(0.55, 1.0, v) ** 2 + 0.02 * math.sin(math.pi * v)
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            x = u * w + wobble * math.sin(math.pi * v) * LENGTH
            # The two halves rise a little from the midrib, with a soft wave at the margin.
            dz = fold * abs(u) * w + 0.006 * math.sin(v * 22 + u * 3) * abs(u)
            row.append(bm.verts.new((x, y, z + dz)))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            for loop, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                loop[uv].uv = (ii / NU, jj / NV)
    mesh = bpy.data.meshes.new('leaf')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('leaf', mesh)
    bpy.context.collection.objects.link(obj)
    sol = obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.006
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    return obj


def leaf_material():
    """Green blade, lighter along the midrib and side veins, a little glossy."""
    mat = bpy.data.materials.new('leaf')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    uvmap = nt.nodes.new('ShaderNodeUVMap')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uvmap.outputs['UV'], sep.inputs[0])
    # Distance from the midrib (u = 0.5) and herringbone side veins.
    mid = nt.nodes.new('ShaderNodeMath')
    mid.operation = 'SUBTRACT'
    mid.inputs[1].default_value = 0.5
    nt.links.new(sep.outputs['X'], mid.inputs[0])
    absu = nt.nodes.new('ShaderNodeMath')
    absu.operation = 'ABSOLUTE'
    nt.links.new(mid.outputs[0], absu.inputs[0])
    rib = nt.nodes.new('ShaderNodeMath')
    rib.operation = 'LESS_THAN'
    rib.inputs[1].default_value = 0.02
    nt.links.new(absu.outputs[0], rib.inputs[0])
    slant = nt.nodes.new('ShaderNodeMath')
    slant.operation = 'MULTIPLY_ADD'
    slant.inputs[1].default_value = -0.6
    nt.links.new(absu.outputs[0], slant.inputs[0])
    nt.links.new(sep.outputs['Y'], slant.inputs[2])
    wave = nt.nodes.new('ShaderNodeMath')
    wave.operation = 'SINE'
    scale = nt.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = 2 * math.pi * 9
    nt.links.new(slant.outputs[0], scale.inputs[0])
    nt.links.new(scale.outputs[0], wave.inputs[0])
    vein = nt.nodes.new('ShaderNodeMath')
    vein.operation = 'GREATER_THAN'
    vein.inputs[1].default_value = 0.97
    nt.links.new(wave.outputs[0], vein.inputs[0])
    veins = nt.nodes.new('ShaderNodeMath')
    veins.operation = 'MAXIMUM'
    nt.links.new(rib.outputs[0], veins.inputs[0])
    nt.links.new(vein.outputs[0], veins.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = hex_linear('#3F7F45')
    mix.inputs[7].default_value = hex_linear('#7DB27A')
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    fac.inputs[1].default_value = 0.3
    nt.links.new(veins.outputs[0], fac.inputs[0])
    nt.links.new(fac.outputs[0], mix.inputs['Factor'])
    # Uneven tone, a little darker towards the margin.
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 5.0
    tone = nt.nodes.new('ShaderNodeMix')
    tone.data_type = 'RGBA'
    tone.blend_type = 'MULTIPLY'
    tone.inputs['Factor'].default_value = 0.25
    nt.links.new(mix.outputs[2], tone.inputs[6])
    nt.links.new(noise.outputs['Color'], tone.inputs[7])
    edge = nt.nodes.new('ShaderNodeMix')
    edge.data_type = 'RGBA'
    edge.blend_type = 'MULTIPLY'
    edge.inputs[7].default_value = (0.7, 0.75, 0.7, 1)
    nt.links.new(absu.outputs[0], edge.inputs['Factor'])
    nt.links.new(tone.outputs[2], edge.inputs[6])
    nt.links.new(edge.outputs[2], bsdf.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    bump.invert = True
    nt.links.new(veins.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    bsdf.inputs['Subsurface Weight'].default_value = 0.1
    bsdf.inputs['Subsurface Radius'].default_value = (0.02, 0.05, 0.02)
    bsdf.inputs['Subsurface Scale'].default_value = 0.02
    return mat


def main():
    args = sys.argv[1:]
    out = args[0]
    opts = {'--size': '256', '--samples': '64'}
    i = 1
    while i < len(args):
        opts[args[i]] = args[i + 1]
        i += 2
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(int(opts['--size']), int(opts['--samples']))
    bpy.context.scene.view_settings.exposure = -0.4
    # Straight down on the leaf, framing it exactly: base at the bottom edge, tip at the top.
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = LENGTH * 1.02
    cam.location = (0, LENGTH / 2, 4)
    cam.rotation_euler = (0, 0, 0)
    mat = leaf_material()
    for n, (width, fold, curl, seed) in enumerate(VARIANTS, start=1):
        obj = leaf(width, fold, curl, seed)
        obj.data.materials.append(mat)
        bpy.context.scene.render.filepath = f'{out}/leaf-{n}.webp'
        bpy.ops.render.render(write_still=True)
        print('wrote', bpy.context.scene.render.filepath, flush=True)
        bpy.data.objects.remove(obj)


main()
