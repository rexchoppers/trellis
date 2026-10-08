# Metres; Blender is Z-up, the glTF export turns it Y-up for three.js. The street is TOWER_DEPTH below your floor, as in floor.ts.

import math
import os
import random
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
# Import common.py from beside this script without writing __pycache__ into the assets.
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
from common import render_previews, srgb  # noqa: E402
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GLB = os.path.join(ROOT, "frontend", "public", "scenes", "corporate-office", "city.glb")
BLEND = os.path.join(HERE, "city.blend")
PREVIEW = "--preview" in sys.argv

TOWER_DEPTH = 140.0
STREET = -TOWER_DEPTH
BLOCK = 46.0
ROAD = 14.0
PITCH = BLOCK + ROAD
REACH = 6
# Keep clear of your own tower: the floor grows up to about 60 m across.
CLEAR = 62.0
FLOOR_H = 3.6
BAY_W = 3.0
# Fog is solid 320 m out, so blocks past this never show.
CUTOFF = 340.0
# Every camera stays within this many metres of your tower; a wall whose outside faces away from all of them is never built.
SEEN_FROM = 250.0

rand = random.Random(23)

bpy.ops.wm.read_factory_settings(use_empty=True)


# One texture tile is 4 bays across and 4 storeys up (see facade_uv).
def facade_image(name, style, glass, wall, vary):
    size = 256
    image = bpy.data.images.new(name, size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    tile = size // 4
    shade = {}
    for y in range(size):
        storey, fy = divmod(y, tile)
        for x in range(size):
            bay, fx = divmod(x, tile)
            if style == "grid":
                solid = fy < 6 or fx < 2 or fx >= tile - 2
            elif style == "ribbon":
                solid = fy < 26 or (fx < 1)
            elif style == "punched":
                solid = fy < 18 or fy >= tile - 8 or fx < 14 or fx >= tile - 14
            else:  # fins
                solid = fx < 8 or fy < 3
            if solid:
                c = tuple(ch * (0.92 + 0.08 * fy / tile) for ch in wall)
            else:
                key = (storey, bay)
                if key not in shade:
                    shade[key] = 1.0 + (rand.random() - 0.5) * vary
                # Brighter toward the top; the odd blind is down.
                lift = 0.85 + 0.3 * fy / tile
                c = tuple(min(1.0, ch * shade[key] * lift) for ch in glass)
                if (storey * 7 + bay * 13) % 11 == 0 and fy > tile - 14:
                    c = tuple(ch * 1.5 for ch in wall)
            i = (y * size + x) * 4
            px[i : i + 4] = (c[0], c[1], c[2], 1.0)
    image.pixels = px
    image.pack()
    return image


def material(name, image=None, colour=(0.6, 0.6, 0.6), rough=0.8, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if image:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.interpolation = "Linear"
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    return mat


def facade(name, style, glass, wall, vary=0.3, rough=0.5):
    return material(name, facade_image(name, style, srgb(glass), srgb(wall), vary), rough=rough)


GLASS = [
    facade("glass_sky", "grid", "#7c9bb8", "#3a4350", 0.35, 0.3),
    facade("glass_slate", "grid", "#5f7385", "#2c333b", 0.3, 0.3),
    facade("glass_green", "fins", "#6f9093", "#d9dcda", 0.25, 0.35),
    facade("glass_bronze", "grid", "#8b7d6d", "#3b342c", 0.25, 0.35),
    facade("glass_white", "ribbon", "#6e8aa3", "#e4e5e1", 0.3, 0.4),
]
SOLID = [
    facade("stone", "punched", "#56687a", "#cdc6b6", 0.25, 0.85),
    facade("brick", "punched", "#4f5f6e", "#9a6450", 0.25, 0.9),
    facade("concrete", "ribbon", "#5d7184", "#b9bcbb", 0.25, 0.85),
    facade("limestone", "punched", "#607387", "#ddd6c4", 0.2, 0.85),
]
FACADES = GLASS + SOLID
ROOF = material("roof", colour=srgb("#8d9294"), rough=0.95)
PLANT = material("plant", colour=srgb("#c4c8ca"), rough=0.9)
ASPHALT = material("asphalt", colour=srgb("#4f5559"), rough=0.95)
PAVEMENT = material("pavement", colour=srgb("#a7a9a3"), rough=0.95)
PARK = material("park", colour=srgb("#5f8a4e"), rough=1.0)
MARKING = material("marking", colour=srgb("#d9d6c9"), rough=0.9)

# Each material collects its faces in one mesh, so the city is a handful of draw calls.
parts = {}
# Cut parts are still generated, into a mesh that is thrown away, so the random draws and the kept skyline stay the same.
discard = False
scrap = bmesh.new()


def mesh_for(mat):
    if discard:
        return scrap
    if mat.name not in parts:
        parts[mat.name] = (bmesh.new(), mat)
    return parts[mat.name][0]


def facade_uv(bm, face, origin_z):
    uv = bm.loops.layers.uv.verify()
    n = face.normal
    for loop in face.loops:
        co = loop.vert.co
        if abs(n.z) > 0.5:
            loop[uv].uv = (co.x / 8, co.y / 8)
            continue
        # Along the wall, in bays; up the wall, in storeys from the street.
        along = co.x * -n.y + co.y * n.x
        loop[uv].uv = (along / (BAY_W * 4), (co.z - origin_z) / (FLOOR_H * 4))


def unseen(face):
    n, c = face.normal, face.calc_center_median()
    return abs(n.z) < 0.5 and n.x * c.x + n.y * c.y >= SEEN_FROM


def box(mat, cx, cy, z0, w, d, h, roof=ROOF, uv=True):
    for target, faces in ((mat, "walls"), (roof, "top")):
        bm = mesh_for(target)
        x0, x1, y0, y1, z1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0 + h
        v = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        if faces == "walls":
            quads = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        else:
            quads = [(4, 5, 6, 7)]
        for q in quads:
            f = bm.faces.new([v[i] for i in q])
            f.normal_update()
            if unseen(f):
                bm.faces.remove(f)
                continue
            if uv:
                facade_uv(bm, f, STREET)


def prism(mat, cx, cy, z0, radius, h, sides=8, roof=ROOF):
    ring = [(cx + radius * math.cos(2 * math.pi * i / sides + math.pi / sides), cy + radius * math.sin(2 * math.pi * i / sides + math.pi / sides)) for i in range(sides)]
    bm = mesh_for(mat)
    low = [bm.verts.new((x, y, z0)) for x, y in ring]
    high = [bm.verts.new((x, y, z0 + h)) for x, y in ring]
    for i in range(sides):
        j = (i + 1) % sides
        f = bm.faces.new([low[i], low[j], high[j], high[i]])
        f.normal_update()
        if unseen(f):
            bm.faces.remove(f)
            continue
        facade_uv(bm, f, STREET)
    bm = mesh_for(roof)
    top = [bm.verts.new((x, y, z0 + h)) for x, y in ring]
    bm.faces.new(top)


def flat(mat, x0, x1, y0, y1, z):
    bm = mesh_for(mat)
    v = [bm.verts.new(p) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(v)


def rooftop(cx, cy, top, w, d, tall):
    pw, pd = w * rand.uniform(0.3, 0.5), d * rand.uniform(0.3, 0.5)
    box(PLANT, cx + rand.uniform(-1, 1) * (w - pw) / 4, cy + rand.uniform(-1, 1) * (d - pd) / 4, top, pw, pd, rand.uniform(2.5, 4.5), uv=False)
    if rand.random() < 0.5:
        box(PLANT, cx + w * 0.3, cy - d * 0.3, top, 2.5, 2.5, 1.5, uv=False)
    if tall and rand.random() < 0.6:
        box(PLANT, cx, cy, top, 0.6, 0.6, rand.uniform(10, 22), uv=False)


def parapet(cx, cy, top, w, d, mat):
    t = 0.5
    box(mat, cx, cy - d / 2 + t / 2, top, w, t, 1.1, uv=False)
    box(mat, cx, cy + d / 2 - t / 2, top, w, t, 1.1, uv=False)
    box(mat, cx - w / 2 + t / 2, cy, top, t, d - 2 * t, 1.1, uv=False)
    box(mat, cx + w / 2 - t / 2, cy, top, t, d - 2 * t, 1.1, uv=False)


def tower(cx, cy, w, d, top):
    height = top - STREET
    mat = rand.choice(GLASS if height > 90 or rand.random() < 0.3 else SOLID)
    if height > 220:
        box(PLANT, cx, cy, top, 1.2, 1.2, rand.uniform(25, 45), uv=False)
    kind = rand.random()
    tall = top > 20
    if kind < 0.18 and min(w, d) > 18:
        r = min(w, d) / 2 * 0.9
        prism(mat, cx, cy, STREET, r, height, sides=rand.choice((8, 12)))
        rooftop(cx, cy, top, r, r, tall)
    elif kind < 0.5 and height > 60:
        tiers = rand.choice((2, 3))
        z = STREET
        tw, td = w, d
        for t in range(tiers):
            share = height * (0.55 if t == 0 else 0.6) if t < tiers - 1 else top - z
            box(mat, cx, cy, z, tw, td, share)
            z += share
            tw, td = tw * rand.uniform(0.65, 0.8), td * rand.uniform(0.65, 0.8)
        rooftop(cx, cy, top, tw / 0.72, td / 0.72, tall)
    else:
        if rand.random() < 0.4:
            box(rand.choice(FACADES[3:]), cx, cy, STREET, w + 4, d + 4, FLOOR_H * 3)
        box(mat, cx, cy, STREET, w, d, height)
        parapet(cx, cy, top, w, d, PLANT)
        rooftop(cx, cy, top, w, d, tall)


def city():
    global discard
    span = min(REACH * PITCH + PITCH / 2, CUTOFF)
    flat(ASPHALT, -span, span, -span, span, STREET)
    for bi in range(-REACH, REACH + 1):
        for bj in range(-REACH, REACH + 1):
            bx, by = bi * PITCH, bj * PITCH
            if abs(bx) < CLEAR and abs(by) < CLEAR:
                continue
            h = BLOCK / 2
            discard = math.hypot(max(abs(bx) - h, 0), max(abs(by) - h, 0)) > CUTOFF
            box(PAVEMENT, bx, by, STREET, BLOCK, BLOCK, 0.2, roof=PAVEMENT, uv=False)
            flat(MARKING, bx + h + ROAD / 2 - 0.15, bx + h + ROAD / 2 + 0.15, by - h, by + h, STREET + 0.06)
            flat(MARKING, bx - h, bx + h, by + h + ROAD / 2 - 0.15, by + h + ROAD / 2 + 0.15, STREET + 0.06)
            dist = math.hypot(bx, by)
            if rand.random() < 0.08:
                flat(PARK, bx - h + 3, bx + h - 3, by - h + 3, by + h - 3, STREET + 0.25)
                continue
            # Near blocks stay below your floor so they never block bird's eye.
            lots = rand.choice((1, 2, 2, 4))
            cells = {1: [(0, 0, 1, 1)], 2: [(-0.25, 0, 0.5, 1), (0.25, 0, 0.5, 1)] if rand.random() < 0.5 else [(0, -0.25, 1, 0.5), (0, 0.25, 1, 0.5)], 4: [(-0.25, -0.25, 0.5, 0.5), (0.25, -0.25, 0.5, 0.5), (-0.25, 0.25, 0.5, 0.5), (0.25, 0.25, 0.5, 0.5)]}[lots]
            for ox, oy, sw, sd in cells:
                w = BLOCK * sw - rand.uniform(6, 12)
                d = BLOCK * sd - rand.uniform(6, 12)
                roll = rand.random()
                if dist < 140:
                    top = rand.uniform(-115, -20)
                elif dist < 260:
                    top = rand.uniform(-110, -10) if roll < 0.7 else rand.uniform(10, 70)
                else:
                    top = rand.uniform(-100, 0) if roll < 0.5 else rand.uniform(20, 120) if roll < 0.93 else rand.uniform(130, 170)
                tower(bx + ox * BLOCK, by + oy * BLOCK, max(w, 10), max(d, 10), top)


def objects():
    made = []
    for name, (bm, mat) in parts.items():
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        me = bpy.data.meshes.new(f"city_{name}")
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(f"city_{name}", me)
        bpy.context.scene.collection.objects.link(ob)
        made.append(ob)
    return made


def preview():
    """Your tower is not exported, so a stand-in takes its place for the stills."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -TOWER_DEPTH / 2))
    stand = bpy.context.active_object
    stand.scale = (60, 50, TOWER_DEPTH)
    stand.data.materials.append(material("stand_in", colour=srgb("#3d4248")))
    shots = {
        "birds-eye": ((170, -230, 150), (0, 0, -40), 45),
        "from-your-floor": ((0, -24, 1.4), (0, -400, 15), 60),
        "street": ((-150, -330, -120), (0, 0, -40), 50),
    }
    render_previews(shots, "#9cc8ec", 1.0, 4, 50, 35, "Standard", clip_end=2000)
    bpy.data.objects.remove(stand)


city()
made = objects()
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=False, export_apply=True, export_yup=True)
print(f"city: {sum(len(o.data.polygons) for o in made)} faces in {len(made)} meshes -> {GLB}")
if PREVIEW:
    preview()
