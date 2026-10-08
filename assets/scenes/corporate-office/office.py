# The corporate office's furniture kit, built in Blender and exported as one glTF.
# Each top-level object is one piece the scene places by name (world.ts, KIT):
#
#   workstation   an agent's desk: origin at the desk's centre on the floor; the
#                 chair is on -z and the screen faces it from +z
#   exec_desk     your desk: origin at the desk's centre; you sit on +z facing -z
#   plant         a potted plant, origin at the pot's base
#   kitchen       12 x 8 m, origin at its centre on the floor; open to +z, its back wall on -z.
#                 A kitchen run and a coffee bar along the back, tables at the front. Empties
#                 carry a "marker" property the scene reads: serve (where the barista stands,
#                 facing their customers), seat (a chair, facing its table) and block (an
#                 area nobody walks through, w x d)
#   lift_core     8 x 4 m, origin at its centre on the floor; the lift doors face +z
#   pod_screen    the partitions of a pod of four desks: a felt spine along x between two
#                 facing pairs and an end panel at each end; origin at the pod's centre.
#                 Its felt material ("felt") is tinted per department by the scene
#   sofa          a three-seat sofa facing +z, origin at its centre on the floor
#   low_table     a coffee table, origin at its centre on the floor
#   ceiling_light a recessed LED panel, 1.2 x 0.6 m, long side on x; origin at the
#                 ceiling's surface, the fitting reaching up into it and its face down
#
#   make models    builds office.blend and frontend/public/scenes/corporate-office/office.glb
#
# Positions below are written in three.js terms (x right, y up, z toward you) and turned
# into Blender's Z-up axes on the way in; the glTF export turns them back.

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GLB = os.path.join(ROOT, "frontend", "public", "scenes", "corporate-office", "office.glb")
BLEND = os.path.join(HERE, "office.blend")
PREVIEW = "--preview" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(ch / 12.92 if ch <= 0.04045 else ((ch + 0.055) / 1.055) ** 2.4 for ch in c)


def material(name, colour, rough=0.6, metal=0.0, glow=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(colour), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if glow:
        bsdf.inputs["Emission Color"].default_value = (*srgb(colour), 1.0)
        bsdf.inputs["Emission Strength"].default_value = glow
    return mat


def screen_material():
    """A screen showing a dark app: a sidebar, a header, panels and lines of text."""
    w, h = 256, 160
    image = bpy.data.images.new("screen_ui", w, h, alpha=False)
    bg, side, panel, line, accent = srgb("#141821"), srgb("#1c2230"), srgb("#222a3a"), srgb("#8e9bb3"), srgb("#5aa9ff")
    px = []
    for y in range(h):
        top = h - 1 - y
        for x in range(w):
            c = bg
            if x < 40:
                c = side
                if 14 < top < 150 and top % 14 < 4 and 8 < x < 32:
                    c = line if top > 28 else accent
            elif top < 16:
                c = panel if x > 48 else side
            elif 54 < x < 150 and 26 < top < 90 or 158 < x < 248 and 26 < top < 90 or 54 < x < 248 and 98 < top < 150:
                c = panel
                inner = (54 < x < 150 and 26 < top < 90 and top % 10 < 3 and 62 < x < 62 + (top * 7) % 70)
                inner |= (158 < x < 248 and 26 < top < 90 and x % 12 < 7 and top > 90 - ((x * 13) % 50))
                inner |= (54 < x < 248 and 98 < top < 150 and top % 9 < 2 and 62 < x < 240)
                if inner:
                    c = accent if 158 < x < 248 else line
            px.extend((*c, 1.0))
    image.pixels = px
    image.pack()
    mat = bpy.data.materials.new("screen")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.15
    return mat


M = {
    "desk_top": material("desk_top", "#ece8e1", 0.45),
    "steel": material("steel", "#2e3136", 0.35, 0.8),
    "alu": material("alu", "#b9bdc2", 0.3, 0.9),
    "bezel": material("bezel", "#16181c", 0.4),
    "screen": screen_material(),
    "screen_dim": material("screen_dim", "#2a3f57", 0.2, glow=0.6),
    "keys": material("keys", "#d9dadc", 0.6),
    "fabric": material("fabric", "#30353d", 0.95),
    "mesh": material("mesh", "#1f2227", 0.8),
    "ceramic": material("ceramic", "#f1eee8", 0.3),
    "walnut": material("walnut", "#5b3d2a", 0.5),
    "leather": material("leather", "#1d1b1a", 0.55),
    "lamp_shade": material("lamp_shade", "#efdcb4", 0.7, glow=0.35),
    "brass": material("brass", "#b8925a", 0.35, 0.9),
    "pot": material("pot", "#d9d3c8", 0.7),
    "soil": material("soil", "#3b2b20", 1.0),
    "leaf": material("leaf", "#3f7a37", 0.7),
    "leaf_light": material("leaf_light", "#5d9a45", 0.7),
    "trunk": material("trunk", "#6b5236", 0.9),
    "oak": material("oak", "#b48a5f", 0.55),
    "stone_dark": material("stone_dark", "#2a2623", 0.35),
    "rug": material("rug", "#4e3a2d", 1.0),
    "chalk": material("chalk", "#1e2124", 0.9),
    "chalk_line": material("chalk_line", "#e9e5dc", 0.9),
    "red": material("red", "#d4473b", 0.4, glow=0.5),
    "green_light": material("green_light", "#6ee28a", 0.4, glow=2.0),
    "core_wall": material("core_wall", "#c9c3b8", 0.8),
    "lift_door": material("lift_door", "#a8adb3", 0.25, 0.9),
    "jar": material("jar", "#c9b48e", 0.5),
    "cup": material("cup", "#f3efe6", 0.4),
    "diffuser": material("diffuser", "#fffaf0", 0.5, glow=6.0),
    "louvre": material("louvre", "#e9ebee", 0.25, 0.85),
    "trim": material("trim", "#f4f4f2", 0.4, 0.3),
    "felt": material("felt", "#9aa0a6", 0.95),
    "upholstery": material("upholstery", "#3b4250", 0.9),
    "tile": material("tile", "#dcd6cc", 0.55),
    "grout": material("grout", "#bdb5a8", 0.9),
    "kitchen_wall": material("kitchen_wall", "#ece6da", 0.85),
    "sage": material("sage", "#8aa58f", 0.6),
    "worktop": material("worktop", "#e6e3dd", 0.3),
    "cabinet": material("cabinet", "#f4f2ed", 0.5),
    "glass_dark": material("glass_dark", "#1b1f24", 0.1),
}


def to_blender(x, y, z):
    return (x, -z, y)


def place(obj, parent, x, y, z, rot_y=0.0):
    obj.location = to_blender(x, y, z)
    obj.rotation_euler = (0, 0, rot_y)
    obj.parent = parent
    for c in obj.users_collection:
        c.objects.unlink(obj)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bevel(obj, width):
    if width > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = width
        mod.segments = 2
        mod.limit_method = "ANGLE"


def box(parent, mat, w, h, d, x, y, z, rot_y=0.0, round_=0.006, name=None):
    """A box w wide (x), h tall (y), d deep (z), centred on x, y, z."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = name or f"{parent.name}_{mat.name}"
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    bevel(obj, min(round_, w / 3, h / 3, d / 3))
    return place(obj, parent, x, y, z, rot_y)


def cyl(parent, mat, r, h, x, y, z, verts=24, r_top=None, name=None):
    """An upright cylinder (or cone, with r_top) centred on x, y, z."""
    if r_top is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r_top, depth=h)
    obj = bpy.context.active_object
    obj.name = name or f"{parent.name}_{mat.name}"
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return place(obj, parent, x, y, z)


def blob(parent, mat, r, x, y, z, squash=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r)
    obj = bpy.context.active_object
    obj.name = f"{parent.name}_{mat.name}"
    obj.scale = (1, 1, squash)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return place(obj, parent, x, y, z)


def piece(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    return root


def monitor(parent, x, z, face, width=0.62):
    """A monitor on a stand; face is +1 when the screen looks toward +z."""
    h = width * 0.58
    box(parent, M["bezel"], width, h, 0.03, x, 1.08, z, round_=0.01)
    # The picture is a plane with the whole image on it, turned to read the right way round.
    bpy.ops.mesh.primitive_plane_add(size=1)
    glass = bpy.context.active_object
    glass.name = f"{parent.name}_screen"
    glass.scale = (width - 0.03, h - 0.03, 1)
    bpy.ops.object.transform_apply(scale=True)
    glass.data.materials.append(M["screen"])
    place(glass, parent, x, 1.08, z + face * 0.0165)
    glass.rotation_euler = (math.radians(90), 0, 0 if face > 0 else math.pi)
    box(parent, M["alu"], 0.05, 0.28, 0.035, x, 0.88, z - face * 0.03)
    box(parent, M["alu"], 0.24, 0.012, 0.18, x, 0.752, z - face * 0.02, round_=0.004)


def task_chair(parent, x, z, back):
    """An office chair; back is the side (+1 or -1 on z) its backrest sits on."""
    box(parent, M["fabric"], 0.5, 0.08, 0.48, x, 0.47, z, round_=0.03)
    box(parent, M["mesh"], 0.46, 0.52, 0.05, x, 0.84, z + back * 0.25, round_=0.03)
    box(parent, M["steel"], 0.06, 0.2, 0.04, x, 0.6, z + back * 0.24)
    for side in (-1, 1):
        box(parent, M["steel"], 0.04, 0.2, 0.04, x + side * 0.26, 0.6, z)
        box(parent, M["mesh"], 0.06, 0.03, 0.26, x + side * 0.26, 0.71, z, round_=0.01)
    cyl(parent, M["steel"], 0.025, 0.32, x, 0.27, z, verts=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(parent, M["steel"], 0.3, 0.03, 0.04, x + math.cos(a) * 0.15, 0.07, z + math.sin(a) * 0.15, rot_y=a)
        cyl(parent, M["bezel"], 0.025, 0.04, x + math.cos(a) * 0.3, 0.025, z + math.sin(a) * 0.3, verts=8)


def workstation():
    p = piece("workstation")
    box(p, M["desk_top"], 1.6, 0.03, 0.8, 0, 0.735, 0, round_=0.01)
    for sx in (-0.74, 0.74):
        box(p, M["steel"], 0.05, 0.72, 0.05, sx, 0.36, -0.32)
        box(p, M["steel"], 0.05, 0.72, 0.05, sx, 0.36, 0.32)
        box(p, M["steel"], 0.05, 0.04, 0.7, sx, 0.7, 0)
    box(p, M["steel"], 1.44, 0.04, 0.04, 0, 0.7, 0.32)
    box(p, M["desk_top"], 1.4, 0.32, 0.02, 0, 0.5, 0.37)
    monitor(p, 0, 0.22, -1)
    box(p, M["keys"], 0.44, 0.02, 0.14, 0, 0.76, -0.12, round_=0.005)
    box(p, M["keys"], 0.06, 0.025, 0.1, 0.33, 0.762, -0.12, round_=0.01)
    cyl(p, M["ceramic"], 0.04, 0.09, 0.6, 0.795, 0.05)
    box(p, M["ceramic"], 0.21, 0.015, 0.28, -0.55, 0.757, -0.05, round_=0.002)
    task_chair(p, 0, -0.75, -1)


def exec_desk():
    p = piece("exec_desk")
    box(p, M["walnut"], 2.6, 0.06, 1.0, 0, 0.75, 0, round_=0.015)
    box(p, M["walnut"], 0.5, 0.72, 0.9, -1.0, 0.36, 0)
    box(p, M["walnut"], 0.5, 0.72, 0.9, 1.0, 0.36, 0)
    box(p, M["walnut"], 1.5, 0.45, 0.04, 0, 0.5, -0.42)
    for dx in (-1.0, 1.0):
        for dy in (0.18, 0.42, 0.62):
            box(p, M["brass"], 0.12, 0.015, 0.015, dx, dy, 0.46, round_=0.003)
    # One screen off to the left, so the view across the desk to your door stays clear.
    monitor(p, -0.9, -0.25, 1, width=0.66)
    box(p, M["keys"], 0.44, 0.02, 0.14, -0.75, 0.79, 0.12, round_=0.005)
    # Lamp.
    cyl(p, M["brass"], 0.09, 0.02, 1.05, 0.79, -0.25)
    cyl(p, M["brass"], 0.012, 0.42, 1.05, 1.0, -0.25, verts=10)
    cyl(p, M["lamp_shade"], 0.16, 0.18, 1.05, 1.27, -0.25, r_top=0.1)
    # Phone, with its green light.
    box(p, M["bezel"], 0.22, 0.05, 0.2, 0.62, 0.805, -0.1, round_=0.01)
    box(p, M["leather"], 0.24, 0.04, 0.07, 0.62, 0.85, -0.16, round_=0.015)
    box(p, M["green_light"], 0.02, 0.01, 0.02, 0.7, 0.835, -0.03, round_=0)
    cyl(p, M["ceramic"], 0.045, 0.1, 0.35, 0.83, 0.2)
    # Executive chair: high leather back, on your side.
    box(p, M["leather"], 0.58, 0.1, 0.55, 0, 0.5, 1.2, round_=0.04)
    box(p, M["leather"], 0.56, 0.75, 0.08, 0, 0.98, 1.47, round_=0.04)
    for side in (-1, 1):
        box(p, M["leather"], 0.08, 0.06, 0.4, side * 0.31, 0.72, 1.22, round_=0.02)
        box(p, M["alu"], 0.03, 0.2, 0.03, side * 0.31, 0.62, 1.22)
    cyl(p, M["alu"], 0.03, 0.34, 0, 0.28, 1.2, verts=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(p, M["alu"], 0.34, 0.03, 0.045, math.cos(a) * 0.17, 0.07, 1.2 + math.sin(a) * 0.17, rot_y=a)


def plant():
    p = piece("plant")
    cyl(p, M["pot"], 0.22, 0.42, 0, 0.21, 0, r_top=0.25, verts=28)
    cyl(p, M["soil"], 0.23, 0.02, 0, 0.41, 0)
    cyl(p, M["trunk"], 0.025, 0.7, 0, 0.75, 0, verts=8)
    for k, (dx, dy, dz, r) in enumerate([(0, 1.15, 0, 0.32), (0.17, 0.95, 0.08, 0.24), (-0.16, 1.0, -0.06, 0.25), (0.05, 0.8, -0.18, 0.2), (-0.08, 1.35, 0.1, 0.2)]):
        blob(p, M["leaf" if k % 2 else "leaf_light"], r, dx, dy, dz, squash=0.85)


def marker(parent, kind, x, z, rot_y=0.0, w=0.0, d=0.0):
    """An empty the scene reads by its "marker" property; merge() keeps it."""
    obj = bpy.data.objects.new(f"{parent.name}_{kind}", None)
    bpy.context.scene.collection.objects.link(obj)
    obj["marker"] = kind
    if w:
        obj["w"], obj["d"] = w, d
    return place(obj, parent, x, 0, z, rot_y)


def coffee_counter(p, cx, cz):
    """The coffee bar: an oak counter facing +z at cz with the machine on it, a back shelf
    of jars 1.6 m behind under a menu board, and two stools out front."""
    box(p, M["oak"], 4.4, 1.0, 0.8, cx, 0.5, cz, round_=0.01)
    for k in range(-5, 6):
        box(p, M["walnut"], 0.04, 0.9, 0.02, cx + k * 0.38, 0.5, cz + 0.4, round_=0)
    box(p, M["stone_dark"], 4.6, 0.06, 1.0, cx, 1.03, cz, round_=0.01)
    box(p, M["alu"], 0.75, 0.5, 0.5, cx - 1.3, 1.31, cz - 0.15, round_=0.03)
    box(p, M["bezel"], 0.6, 0.08, 0.3, cx - 1.3, 1.1, cz + 0.02, round_=0.01)
    box(p, M["red"], 0.06, 0.06, 0.02, cx - 1.05, 1.42, cz + 0.11, round_=0)
    for dx in (-1.45, -1.15):
        cyl(p, M["steel"], 0.025, 0.08, cx + dx, 1.14, cz + 0.08, verts=10)
    cyl(p, M["bezel"], 0.1, 0.38, cx - 0.6, 1.25, cz - 0.1)
    cyl(p, M["alu"], 0.08, 0.14, cx - 0.6, 1.5, cz - 0.1, r_top=0.11)
    for n in range(4):
        cyl(p, M["cup"], 0.045, 0.1, cx + 0.4 + n * 0.3, 1.11, cz + 0.15, r_top=0.055)
    shelf = cz - 1.6
    box(p, M["oak"], 4.4, 1.0, 0.45, cx, 0.5, shelf, round_=0.01)
    box(p, M["stone_dark"], 4.5, 0.04, 0.5, cx, 1.02, shelf)
    for y in (1.55, 1.95):
        box(p, M["oak"], 4.0, 0.04, 0.3, cx, y, shelf - 0.05)
        for n in range(8):
            cyl(p, M["jar"], 0.06, 0.18, cx - 1.7 + n * 0.48, y + 0.11, shelf - 0.05, verts=16)
    box(p, M["chalk"], 2.2, 1.0, 0.05, cx, 2.55, shelf - 0.2, round_=0.01)
    for n, length in enumerate((1.4, 1.1, 1.6, 0.9, 1.3)):
        box(p, M["chalk_line"], length, 0.04, 0.005, cx - 0.85 + length / 2, 2.85 - n * 0.14, shelf - 0.17, round_=0)
    for x in (-0.9, 0.9):
        cyl(p, M["leather"], 0.21, 0.07, cx + x, 0.78, cz + 0.95)
        cyl(p, M["steel"], 0.025, 0.72, cx + x, 0.38, cz + 0.95, verts=12)
        cyl(p, M["steel"], 0.2, 0.02, cx + x, 0.01, cz + 0.95)
        cyl(p, M["steel"], 0.17, 0.02, cx + x, 0.3, cz + 0.95, verts=20)
    marker(p, "serve", cx - 0.4, cz - 0.85)
    marker(p, "block", cx, cz, w=4.6, d=1.0)
    marker(p, "block", cx, shelf, w=4.6, d=0.6)


def dining_chair(p, x, z, facing):
    """A cafe chair; facing is the way someone sitting in it looks (+1 is +z)."""
    back = -facing
    box(p, M["oak"], 0.44, 0.04, 0.42, x, 0.46, z, round_=0.01)
    box(p, M["oak"], 0.44, 0.42, 0.03, x, 0.7, z + back * 0.2, round_=0.01)
    for sx in (-0.19, 0.19):
        for sz in (-0.18, 0.18):
            box(p, M["steel"], 0.03, 0.44, 0.03, x + sx, 0.22, z + sz, round_=0.003)
    marker(p, "seat", x, z, 0.0 if facing > 0 else math.pi)


def dining_table(p, x, z):
    """A table for four: two chairs either side along x."""
    box(p, M["oak"], 1.6, 0.04, 0.85, x, 0.74, z, round_=0.01)
    for sx in (-0.7, 0.7):
        box(p, M["steel"], 0.05, 0.72, 0.05, x + sx, 0.36, z - 0.3)
        box(p, M["steel"], 0.05, 0.72, 0.05, x + sx, 0.36, z + 0.3)
    cyl(p, M["cup"], 0.04, 0.09, x + 0.3, 0.805, z + 0.1, r_top=0.05)
    for sx in (-0.4, 0.4):
        dining_chair(p, x + sx, z - 0.72, 1)
        dining_chair(p, x + sx, z + 0.72, -1)
    marker(p, "block", x, z, w=1.7, d=2.3)


def kitchen():
    p = piece("kitchen")
    w, d = 12, 8
    # Tiled floor, grout lines every metre.
    box(p, M["tile"], w, 0.012, d, 0, 0.008, 0, round_=0)
    for k in range(1, w):
        box(p, M["grout"], 0.02, 0.014, d, -w / 2 + k, 0.008, 0, round_=0)
    for k in range(1, d):
        box(p, M["grout"], w, 0.014, 0.02, 0, 0.008, -d / 2 + k, round_=0)
    # The back wall, with a sage splashback over the run.
    back = -d / 2 + 0.06
    box(p, M["kitchen_wall"], w, 2.8, 0.12, 0, 1.4, back, round_=0.01)
    marker(p, "block", 0, back, w=w, d=0.2)
    run = back + 0.37
    box(p, M["sage"], 5.0, 0.62, 0.02, -1.5, 1.23, back + 0.07, round_=0)
    # Fridge and a tall cupboard at the left end.
    box(p, M["alu"], 0.8, 2.0, 0.62, -5.3, 1.0, run, round_=0.02)
    box(p, M["steel"], 0.03, 0.9, 0.03, -4.98, 1.25, run + 0.33, round_=0.005)
    box(p, M["cabinet"], 0.8, 2.2, 0.62, -4.45, 1.1, run, round_=0.01)
    box(p, M["steel"], 0.03, 0.4, 0.03, -4.15, 1.1, run + 0.33, round_=0.005)
    # Base units under a pale stone worktop, a door every 60 cm.
    box(p, M["cabinet"], 5.0, 0.86, 0.6, -1.5, 0.45, run, round_=0.01)
    box(p, M["worktop"], 5.04, 0.04, 0.64, -1.5, 0.9, run, round_=0.005)
    for k in range(8):
        x = -3.7 + k * 0.6 + 0.3
        box(p, M["steel"], 0.16, 0.02, 0.02, x, 0.78, run + 0.31, round_=0.003)
        box(p, M["grout"], 0.008, 0.8, 0.005, x + 0.3, 0.45, run + 0.302, round_=0)
    # Sink and tap, kettle, microwave.
    box(p, M["steel"], 0.6, 0.02, 0.42, -2.6, 0.915, run, round_=0.005)
    cyl(p, M["steel"], 0.015, 0.3, -2.6, 1.07, run - 0.22, verts=10)
    box(p, M["steel"], 0.02, 0.02, 0.16, -2.6, 1.21, run - 0.15, round_=0.005)
    cyl(p, M["bezel"], 0.08, 0.22, -1.5, 1.03, run - 0.05)
    box(p, M["cabinet"], 0.5, 0.3, 0.38, -0.4, 1.07, run - 0.05, round_=0.02)
    box(p, M["glass_dark"], 0.32, 0.2, 0.01, -0.46, 1.07, run + 0.145, round_=0)
    # Wall cupboards over the run.
    box(p, M["cabinet"], 5.0, 0.7, 0.35, -1.5, 2.0, back + 0.24, round_=0.01)
    for k in range(8):
        box(p, M["steel"], 0.16, 0.02, 0.02, -3.7 + k * 0.6 + 0.3, 1.7, back + 0.42, round_=0.003)
    marker(p, "block", -2.25, run, w=7.5, d=0.7)
    # The coffee bar on the right, its shelf against the back wall.
    coffee_counter(p, 3.4, back + 1.9)
    # Tables at the front.
    for x in (-4.0, -1.2):
        dining_table(p, x, 1.9)
    # A plant in each front corner.
    for x in (-5.5, 5.5):
        pot = piece(f"kitchen_plant_{'l' if x < 0 else 'r'}")
        pot.parent = p
        pot.location = to_blender(x, 0, d / 2 - 0.5)
        plant_parts(pot)


def plant_parts(parent):
    cyl(parent, M["pot"], 0.2, 0.38, 0, 0.19, 0, r_top=0.23, verts=28)
    cyl(parent, M["soil"], 0.21, 0.02, 0, 0.37, 0)
    for k, (dx, dy, dz, r) in enumerate([(0, 0.75, 0, 0.3), (0.15, 0.6, 0.08, 0.22), (-0.14, 0.62, -0.06, 0.22)]):
        blob(parent, M["leaf" if k % 2 else "leaf_light"], r, dx, dy, dz, squash=0.85)


def lift_core():
    p = piece("lift_core")
    box(p, M["core_wall"], 8, 3.3, 4, 0, 1.65, 0, round_=0.02)
    for x in (-1.6, 1.6):
        box(p, M["steel"], 1.5, 2.45, 0.06, x, 1.225, 2.0, round_=0.005)
        box(p, M["lift_door"], 0.6, 2.25, 0.03, x - 0.305, 1.125, 2.04, round_=0.002)
        box(p, M["lift_door"], 0.6, 2.25, 0.03, x + 0.305, 1.125, 2.04, round_=0.002)
        box(p, M["bezel"], 0.4, 0.08, 0.02, x, 2.55, 2.03, round_=0)
        box(p, M["green_light"], 0.12, 0.03, 0.01, x, 2.55, 2.045, round_=0)
    box(p, M["alu"], 0.08, 0.2, 0.02, 0, 1.15, 2.02, round_=0.005)
    box(p, M["bezel"], 1.0, 0.6, 0.02, 0, 1.75, 2.02, round_=0.005)


def merge():
    """Joins each piece's parts into one mesh per material, so a piece costs a few draw calls."""
    for root in [o for o in bpy.data.objects if o.parent is None and o.type == "EMPTY"]:
        parts = [o for o in root.children_recursive if o.type == "MESH"]
        bpy.ops.object.select_all(action="DESELECT")
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.convert(target="MESH")
        by_material = {}
        for o in parts:
            by_material.setdefault(o.data.materials[0].name, []).append(o)
        for name, group in by_material.items():
            bpy.ops.object.select_all(action="DESELECT")
            for o in group:
                o.select_set(True)
            bpy.context.view_layer.objects.active = group[0]
            if len(group) > 1:
                bpy.ops.object.join()
            joined = bpy.context.view_layer.objects.active
            matrix = joined.matrix_world.copy()
            joined.parent = root
            joined.matrix_world = matrix
            joined.name = f"{root.name}_{name}"
        for o in list(root.children_recursive):
            if o.type == "EMPTY" and "marker" not in o:
                bpy.data.objects.remove(o)


def ceiling_light():
    """A recessed troffer: a white trim flush with the ceiling, a bright diffuser set up
    inside it, and a grid of polished louvres in front of the diffuser."""
    p = piece("ceiling_light")
    w, d = 1.2, 0.6
    # Trim: four strips round the opening, flush with the ceiling.
    box(p, M["trim"], w + 0.06, 0.012, 0.04, 0, -0.006, -d / 2, round_=0.003)
    box(p, M["trim"], w + 0.06, 0.012, 0.04, 0, -0.006, d / 2, round_=0.003)
    box(p, M["trim"], 0.04, 0.012, d, -w / 2, -0.006, 0, round_=0.003)
    box(p, M["trim"], 0.04, 0.012, d, w / 2, -0.006, 0, round_=0.003)
    # Diffuser recessed 6 cm, and the louvre grid hanging just below it.
    box(p, M["diffuser"], w - 0.02, 0.005, d - 0.02, 0, 0.06, 0, round_=0)
    for k in range(-2, 3):
        box(p, M["louvre"], 0.012, 0.05, d - 0.02, k * (w / 5), 0.032, 0, round_=0)
    box(p, M["louvre"], w - 0.02, 0.05, 0.012, 0, 0.032, 0, round_=0)
    for side in (-1, 1):
        box(p, M["louvre"], w - 0.02, 0.06, 0.01, 0, 0.03, side * (d / 2 - 0.01), round_=0)
        box(p, M["louvre"], 0.01, 0.06, d - 0.02, side * (w / 2 - 0.01), 0.03, 0, round_=0)


def pod_screen():
    """Partitions for four desks, two facing two: a spine with a dark top rail, and end panels."""
    p = piece("pod_screen")
    box(p, M["felt"], 3.3, 1.2, 0.05, 0, 0.6, 0, round_=0.015)
    box(p, M["steel"], 3.32, 0.03, 0.07, 0, 1.215, 0, round_=0.005)
    for side in (-1, 1):
        box(p, M["felt"], 0.05, 1.05, 1.9, side * 1.66, 0.525, 0, round_=0.015)
        box(p, M["steel"], 0.07, 0.03, 1.92, side * 1.66, 1.065, 0, round_=0.005)
        for z in (-0.85, 0.85):
            box(p, M["steel"], 0.06, 0.04, 0.06, side * 1.66, 0.02, z, round_=0.005)


def sofa():
    p = piece("sofa")
    box(p, M["upholstery"], 2.2, 0.42, 0.85, 0, 0.21, 0, round_=0.06)
    box(p, M["upholstery"], 2.2, 0.48, 0.22, 0, 0.62, -0.32, round_=0.06)
    for side in (-1, 1):
        box(p, M["upholstery"], 0.22, 0.62, 0.85, side * 1.0, 0.31, 0, round_=0.05)
    for x in (-0.68, 0, 0.68):
        box(p, M["upholstery"], 0.62, 0.1, 0.6, x, 0.47, 0.06, round_=0.04)


def low_table():
    p = piece("low_table")
    box(p, M["walnut"], 1.1, 0.04, 0.6, 0, 0.4, 0, round_=0.01)
    for sx in (-0.48, 0.48):
        for sz in (-0.24, 0.24):
            box(p, M["steel"], 0.04, 0.38, 0.04, sx, 0.19, sz, round_=0.005)


workstation()
exec_desk()
plant()
kitchen()
lift_core()
ceiling_light()
pod_screen()
sofa()
low_table()
merge()

os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=False, export_apply=True, export_yup=True, export_extras=True)
print(f"office: {len([o for o in bpy.data.objects if o.parent is None])} pieces -> {GLB}")


def preview():
    """Lays the kit out on a floor and renders it, for a look before it goes in the app."""
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(material("floor", "#bdb6a8", 0.9))
    pieces = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == "EMPTY"}
    layout = {"workstation": (-3, 0, 0), "exec_desk": (2, 0, 0.4), "plant": (4.2, 0, -1), "kitchen": (0, 0, -10), "lift_core": (12, 0, -3)}
    pieces["ceiling_light"].location = to_blender(-15, 2.0, 0)
    for name, (x, y, z) in layout.items():
        pieces[name].location = to_blender(x, y, z)
    for k in range(3):
        for j in range(2):
            ws = pieces["workstation"].copy()
            scene.collection.objects.link(ws)
            for child in list(pieces["workstation"].children):
                c = child.copy()
                c.parent = ws
                scene.collection.objects.link(c)
            ws.location = to_blender(-8 - j * 2.2, 0, -1 + k * 2.2)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#cfe2f2"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), 0, math.radians(30))
    scene.collection.objects.link(sun)
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.view_settings.view_transform = "AgX"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector

    out = os.path.join(HERE, "previews")
    os.makedirs(out, exist_ok=True)
    shots = {
        "office-overview": (to_blender(6, 9, 10), to_blender(-1, 0, -2), 55),
        "office-your-desk": (to_blender(2, 1.2, 1.55), to_blender(2, 0.95, -1), 70),
        "office-workstations": (to_blender(-5, 1.7, 4), to_blender(-9, 0.7, 0), 50),
        "office-kitchen": (to_blender(7, 7, -1), to_blender(0, 0.6, -10.5), 60),
        "office-ceiling-light": (to_blender(-14.6, 0.5, -0.4), to_blender(-15, 2.0, 0), 45),
    }
    for name, (eye, look, lens) in shots.items():
        cam.location = eye
        cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        cam.data.angle = math.radians(lens)
        scene.render.filepath = os.path.join(out, f"{name}.png")
        bpy.ops.render.render(write_still=True)


if PREVIEW:
    preview()
