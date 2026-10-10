"""Procedural lavender for the flower sprites: a slender spike of small florets in whorls, dense
at the top and spaced out lower down, each floret a ribbed calyx with a little two-lipped corolla.

Lavender never wears the user's palette: it is rendered in its own natural shades
(NATURAL_COLORS in shared/flowers.ts, ids in web/src/sprites.ts).

Run: python scripts/blender/lavender.py OUT_DIR [shade ...] [--angles a,b] [--size N] [--samples N]
"""
import math
import random

import bpy  # before bmesh: bpy makes the bmesh module available
import bmesh
from mathutils import Matrix, Vector

from common import hex_linear, run

SHADES = {'chiara': '#9D86D1', 'media': '#8E7CC3', 'scura': '#7E6BB5'}
GOLDEN = math.radians(137.508)
# The sprite is centred on the head position the app gives (web/src/sprites.ts, sizeFor 1.5):
# the spike runs from a little below it to near the top of the frame, like the 3D model.
TOP = 1.04
STEM_R = 0.02


def floret_material(name, color_hex, value=1.0, grey=0.0, sheen=0.15):
    """Small, matte, slightly hairy floret: tone variation from noise, soft subsurface."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    base = hex_linear(color_hex)
    g = sum(base[:3]) / 3
    col = tuple((c * (1 - grey) + g * grey) * value for c in base[:3]) + (1.0,)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 40.0
    noise.inputs['Detail'].default_value = 2.0
    vary = nt.nodes.new('ShaderNodeMix')
    vary.data_type = 'RGBA'
    vary.blend_type = 'MULTIPLY'
    vary.inputs['Factor'].default_value = 0.2
    vary.inputs[6].default_value = col
    nt.links.new(noise.outputs['Color'], vary.inputs[7])
    nt.links.new(vary.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.65
    bsdf.inputs['Subsurface Weight'].default_value = 0.25
    bsdf.inputs['Subsurface Radius'].default_value = (0.05, 0.02, 0.05)
    bsdf.inputs['Subsurface Scale'].default_value = 0.02
    bsdf.inputs['Sheen Weight'].default_value = sheen
    bsdf.inputs['Sheen Roughness'].default_value = 0.5
    bsdf.inputs['Specular IOR Level'].default_value = 0.3
    return mat


def mesh_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def blob(bm, center, direction, radii, spin=0.0, subdivisions=2):
    """Ellipsoid with radii (x, y, along direction) centred at `center`, its long axis on `direction`."""
    rot = Vector(direction).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    m = Matrix.Translation(center) @ rot @ Matrix.Rotation(spin, 4, 'Z') @ Matrix.Diagonal((*radii, 1))
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1, matrix=m)


def whorls():
    """Heights of the whorls from the top down: packed together near the tip, gaps opening below."""
    zs, z, gap = [], TOP - 0.06, 0.075
    while z > -0.42:
        zs.append(z)
        z -= gap
        gap *= 1.16
    return zs


def build_lavender(color_hex):
    rng = random.Random(11)
    bm, corollas = bmesh.new(), bmesh.new()
    zs = whorls()
    for k, z in enumerate(zs):
        t = k / (len(zs) - 1)  # 0 at the tip, 1 at the lowest whorl
        n = 5 + round(t * 4)
        spin = k * GOLDEN
        for i in range(n):
            a = spin + i * 2 * math.pi / n + rng.uniform(-0.2, 0.2)
            tilt = math.radians(rng.uniform(28, 42) + t * 12)
            d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
            base = Vector((math.cos(a) * STEM_R, math.sin(a) * STEM_R, z + rng.uniform(-0.012, 0.012)))
            length = rng.uniform(0.07, 0.085) * (1.0 - 0.25 * (1 - t))
            blob(bm, base + d * length, d, (0.03, 0.03, length), spin=a)
            # Corolla: a flared upper lip and a smaller lower one at the mouth of the calyx;
            # buds near the tip stay closed.
            tip = base + d * length * 1.9
            if t > 0.15 and rng.random() < 0.8:
                out = Vector((math.cos(a), math.sin(a), 0.25)).normalized()
                blob(corollas, tip + out * 0.012 + Vector((0, 0, 0.012)), d.lerp(Vector((0, 0, 1)), 0.4), (0.046, 0.036, 0.024), spin=a)
                blob(corollas, tip + out * 0.036 - Vector((0, 0, 0.008)), out, (0.032, 0.026, 0.019), spin=a)
            else:
                blob(corollas, tip - d * 0.01, d, (0.02, 0.02, 0.03), spin=a)
    # A few closed buds crowning the spike.
    for i in range(4):
        a = i * 2 * math.pi / 4 + 0.4
        d = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1)).normalized()
        blob(bm, Vector((0, 0, TOP - 0.03)) + d * 0.03, d, (0.02, 0.02, 0.045), spin=a)
    blob(bm, Vector((0, 0, TOP + 0.02)), (0, 0, 1), (0.018, 0.018, 0.04))

    # One object, two materials: append the corollas to the calyces with material index 1.
    for f in corollas.faces:
        f.material_index = 1
    tmp = bpy.data.meshes.new('tmp')
    corollas.to_mesh(tmp)
    corollas.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    head = mesh_object('lavender', bm)
    # Calyces carry most of the colour: the same purple, a touch greyer and deeper (they are hairy);
    # the corollas are the clear bright shade.
    head.data.materials.append(floret_material('calyx', color_hex, value=0.95, grey=0.1, sheen=0.25))
    head.data.materials.append(floret_material('corolla', color_hex, value=1.05, sheen=0.1))
    return head


def build_greens():
    """Thin grey-green stem running up through the spike."""
    stem = bpy.data.materials.new('stem')
    stem.use_nodes = True
    bsdf = stem.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_linear('#6B8A5A')
    bsdf.inputs['Roughness'].default_value = 0.7
    bpy.ops.mesh.primitive_cylinder_add(radius=STEM_R, depth=TOP + 1.4, vertices=12, location=(0, 0, (TOP - 1.4) / 2))
    bpy.context.object.data.materials.append(stem)
    bpy.ops.object.shade_smooth()


run('lavanda', build_lavender, build_greens, target=(0, 0, 0), exposure=0.1, colors=SHADES)
