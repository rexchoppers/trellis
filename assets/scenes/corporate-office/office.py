# Kit pieces (kit.ts KitPiece). Origin at the centre on the floor unless noted; +z is toward you.
#   workstation    chair on -z, screen faces it from +z
#   exec_desk      you sit on +z facing -z
#   plant          origin at the pot's base
#   kitchen        12 x 8 m, open to +z, back wall on -z; marker empties: serve, seat, block (w x d)
#   lift_core      8 x 4 m, openings face +z with lit cars behind; "lift_display" and "call_button" painted by the scene
#   lift_door      one door leaf, origin at its bottom centre; the scene slides them
#   stairwell      5.4 x 6.2 m enclosed fire stair, fire door on -z; "exit_sign" painted by the scene; markers block
#   toilets        7.6 x 6.2 m: ladies, gents and accessible WC, doors on -z, no +x wall (stands against the stairwell's -x wall); markers place the moving pieces below; see toilets()
#   wc_door        toilet door leaf (0.9 m opening), origin on its hinge edge, leaf along +x; "wc_sign" on -z painted by the scene
#   wc_door_accessible  the same for the 1.0 m accessible WC opening, with a thumb-turn ("thumb_turn") on +z and indicator ("wc_indicator") on -z
#   cubicle_door   cubicle door leaf, origin on its hinge edge, leaf along +x; "thumb_turn" on +z, "wc_indicator" on -z
#   hand_dryer     origin on the wall at floor height, faces +z; "dryer_light" lit by the scene
#   tap            basin mixer, origin at its base, spout toward +z
#   plant_room     6 x 6.2 m, door on -z, no +x wall (stands against the toilets' -x wall): fire alarm panel, distribution board, cleaning kit; see plant_room()
#   breaker        circuit breaker on a DIN rail, origin on the rail, faces +z; "breaker_lever" moved by the scene
#   server_room    6 x 6.2 m, door and viewing window on -z, no +x wall (stands against the plant room's -x wall); see server_room()
#   server_rack    42U rack, open front toward +z; "rack_top" takes the department's colour
#   server_unit    2U server, origin at the bottom middle of its front, faces +z; "server_led" painted by the scene
#   breakout       12 x 8 m open area: sofas, bean bags, table tennis, table football; markers seat, block
#   printer        floor-standing printer, front toward +z; paper comes out at y 0.75
#   print_room     5 x 7.1 m print room furniture; the scene adds glass walls; see print_room()
#   pod_door       phone pod glass door, origin on its hinge edge, leaf along +x; "pod_glass" made see-through by the scene
#   phone_pods     three phone pods in a row, glass fronts toward -z; markers door_pod, block
#   locker_door    locker door, origin on its hinge edge at its bottom, leaf along +x
#   arrival_hub    9.6 m wall along z, origin at its middle: 18 lockers, parcel lockers and two vending machines on its +x face; markers locker, pane, block
#   feature_planter 6.8 m waist-high oak planter along z with trees and ivy, origin at its middle; markers block
#   feature_board  6.8 m freestanding wall along z in "felt" tinted per department: whiteboard, pinboard, clock and cabinet on +x; markers block
#   feature_gallery 6.8 m freestanding green wall along z: framed prints, picture lights, bench and plant on +x; markers block
#   feature_shelf  6.8 m open oak shelving along z with books and plants, origin at its middle; markers block
#   feature_display 6.8 m open oak shelving along z like feature_shelf, with trophies, photos, games and plants; markers block
#   town_hall      12 x 12 m corner: L of stepped seating along the windows on -z and +x facing a media wall at 45 degrees, whose "hall_screen" the scene paints; markers block
#   pod_screen     felt spine along x between two facing desk pairs; "felt" material is tinted per department
#   sofa           faces +z
#   low_table      coffee table
#   ceiling_light  1.2 x 0.6 m, long side on x; origin at the ceiling surface, face down
#   reception      8.2 x 4 m: angled front counter facing the lifts on -z, "sign_face" name panel on its front, two stations, low credenza on +z; markers seat (the stations), blocks
#   waiting_room   6 x 6 m of seating, back to the windows on -z, door side +z; markers seat, blocks
#   conference_room 9 x 7 m furniture: 12-seat table, screen at -x; door side -z, windows +z; markers seat, blocks
#   meeting_room   5 x 7 m furniture: 6-seat table, screen at +x; markers seat, blocks
#   call_point     UK manual call point at 1.4 m; origin on the wall at floor height, faces +z; "call_face" painted by the scene
#   call_post      call point on a short post, for glass walls; faces +z
#   smoke_detector European combined detector and sounder-beacon; origin at the ceiling surface; "strobe" ring flashed by the scene
#   sign_pillar    post with a framed sign on top, readable from +z and -z; "sign_face" material takes the department's text
# Positions are in three.js terms (x right, y up, z toward you); to_blender converts, the glTF export turns them back.

import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
# Import common.py from beside this script without writing __pycache__ into the assets.
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
from common import render_previews, srgb  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GLB = os.path.join(ROOT, "frontend", "public", "scenes", "corporate-office", "office.glb")
BLEND = os.path.join(HERE, "office.blend")
PREVIEW = "--preview" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)


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
    "sign_face": material("sign_face", "#ffffff", 0.5),
    "rug": material("rug", "#6f655c", 1.0),
    "fire_red": material("fire_red", "#c8102e", 0.45),
    "strobe": material("strobe", "#f2b8b0", 0.15),
    "call_face": material("call_face", "#ffffff", 0.5),
    "lift_display": material("lift_display", "#000000", 0.5),
    "call_button": material("call_button", "#ffffff", 0.5),
    "exit_sign": material("exit_sign", "#ffffff", 0.5),
    "door_grey": material("door_grey", "#8c9095", 0.6),
    "concrete_step": material("concrete_step", "#b9b4ab", 0.9),
    "alu": material("alu", "#b9bdc2", 0.3, 0.9),
    "bezel": material("bezel", "#16181c", 0.4),
    "screen": screen_material(),
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
    "laminate": material("laminate", "#c9d1d6", 0.5),
    "mirror": material("mirror", "#e9edf0", 0.05, 1.0),
    "wc_sign": material("wc_sign", "#ffffff", 0.5),
    "wc_indicator": material("wc_indicator", "#1f8a3b", 0.5),
    "thumb_turn": material("thumb_turn", "#9aa0a6", 0.3, 0.8),
    "flush_plate": material("flush_plate", "#b9bdc2", 0.3, 0.9),
    "tap": material("tap", "#d2d6da", 0.15, 1.0),
    "dryer": material("dryer", "#eceae6", 0.4),
    "dryer_light": material("dryer_light", "#33393f", 0.4),
    "pull_cord": material("pull_cord", "#c8102e", 0.5),
    "alarm_reset": material("alarm_reset", "#2b6cb0", 0.4),
    "alarm_lamp": material("alarm_lamp", "#5a1414", 0.3),
    "epoxy": material("epoxy", "#8d949a", 0.55),
    "panel_body": material("panel_body", "#cfccc4", 0.5),
    "fire_screen": material("fire_screen", "#0e1a12", 0.4),
    "panel_reset": material("panel_reset", "#f2c200", 0.4),
    "board": material("board", "#d6d8da", 0.5),
    "board_chart": material("board_chart", "#ffffff", 0.6),
    "breaker": material("breaker", "#f1f0ec", 0.5),
    "breaker_lever": material("breaker_lever", "#25282d", 0.4),
    "mop_yellow": material("mop_yellow", "#f2c21b", 0.5),
    "vac": material("vac", "#2f6fb0", 0.4),
    "raised_floor": material("raised_floor", "#b3b7bc", 0.5),
    "vent_tile": material("vent_tile", "#80868d", 0.6),
    "tile_line": material("tile_line", "#6e7378", 0.7),
    "crac": material("crac", "#e4e6e8", 0.45),
    "rack_black": material("rack_black", "#1b1d21", 0.5, 0.3),
    "rack_top": material("rack_top", "#3a3f47", 0.5),
    "server_body": material("server_body", "#2a2d33", 0.45, 0.4),
    "server_led": material("server_led", "#15181c", 0.4),
    "gas_sign": material("gas_sign", "#ffffff", 0.5),
    "cable": material("cable", "#2b5d9c", 0.8),
    "tt_green": material("tt_green", "#1f6b4a", 0.5),
    "foos_red": material("foos_red", "#c43a31", 0.5),
    "foos_blue": material("foos_blue", "#2f5fa8", 0.5),
    "bean_orange": material("bean_orange", "#d9822b", 0.9),
    "print_carpet": material("print_carpet", "#4a505a", 1.0),
    "paper": material("paper", "#f7f7f4", 0.8),
    "locker": material("locker", "#5d6b78", 0.45, 0.2),
    "pod_shell": material("pod_shell", "#e8e5df", 0.6),
    "pod_glass": material("pod_glass", "#dcecf5", 0.1),
    "coat_navy": material("coat_navy", "#2c3448", 0.9),
    "coat_camel": material("coat_camel", "#b08a5a", 0.9),
    "hall_carpet": material("hall_carpet", "#5b6773", 1.0),
    "media_wall": material("media_wall", "#2a2d31", 0.7),
    "hall_screen": material("hall_screen", "#0d1117", 0.3),
    "olive": material("olive", "#6f8a6a", 0.75),
    "leaf_dark": material("leaf_dark", "#2f5a2a", 0.6),
    "whiteboard": material("whiteboard", "#f5f6f4", 0.2),
    "cork": material("cork", "#c49866", 0.95),
    "sticky_yellow": material("sticky_yellow", "#ffd84d", 0.8),
    "sticky_pink": material("sticky_pink", "#ff9db5", 0.8),
    "sticky_green": material("sticky_green", "#8fe0a0", 0.8),
    "sticky_blue": material("sticky_blue", "#8cc8ff", 0.8),
    "gallery_paint": material("gallery_paint", "#2f4a3d", 0.85),
    "parcel_body": material("parcel_body", "#3a3f47", 0.5, 0.2),
    "parcel_door": material("parcel_door", "#d5d8dc", 0.45, 0.3),
    "parcel_screen": material("parcel_screen", "#3a8fd6", 0.3, glow=1.2),
    "vend_body": material("vend_body", "#23262c", 0.45, 0.2),
    "vend_light": material("vend_light", "#f4f1e8", 0.5, glow=0.8),
    "vend_red": material("vend_red", "#d9483b", 0.4, glow=1.5),
    "vend_blue": material("vend_blue", "#2f7fd6", 0.4, glow=1.5),
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
    """w (x), h (y), d (z), centred on x, y, z."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = name or f"{parent.name}_{mat.name}"
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    bevel(obj, min(round_, w / 3, h / 3, d / 3))
    return place(obj, parent, x, y, z, rot_y)


def cyl(parent, mat, r, h, x, y, z, verts=24, r_top=None, name=None):
    """Centred on x, y, z; a cone when r_top is set."""
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
    """face: +1 when the screen looks toward +z."""
    h = width * 0.58
    box(parent, M["bezel"], width, h, 0.03, x, 1.08, z, round_=0.01)
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
    """back: the side (+1 or -1 on z) its backrest sits on."""
    box(parent, M["fabric"], 0.5, 0.08, 0.48, x, 0.47, z, round_=0.03)
    box(parent, M["mesh"], 0.46, 0.52, 0.05, x, 0.84, z + back * 0.25, round_=0.03)
    box(parent, M["steel"], 0.06, 0.2, 0.04, x, 0.6, z + back * 0.24)
    for side in (-1, 1):
        box(parent, M["steel"], 0.04, 0.2, 0.04, x + side * 0.26, 0.6, z)
        box(parent, M["mesh"], 0.06, 0.03, 0.26, x + side * 0.26, 0.71, z, round_=0.01)
    cyl(parent, M["steel"], 0.025, 0.32, x, 0.27, z, verts=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(parent, M["steel"], 0.3, 0.03, 0.04, x + math.cos(a) * 0.15, 0.07, z + math.sin(a) * 0.15, rot_y=-a)
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
    cyl(p, M["brass"], 0.09, 0.02, 1.05, 0.79, -0.25)
    cyl(p, M["brass"], 0.012, 0.42, 1.05, 1.0, -0.25, verts=10)
    cyl(p, M["lamp_shade"], 0.16, 0.18, 1.05, 1.27, -0.25, r_top=0.1)
    box(p, M["bezel"], 0.22, 0.05, 0.2, 0.62, 0.805, -0.1, round_=0.01)
    box(p, M["leather"], 0.24, 0.04, 0.07, 0.62, 0.85, -0.16, round_=0.015)
    box(p, M["green_light"], 0.02, 0.01, 0.02, 0.7, 0.835, -0.03, round_=0)
    cyl(p, M["ceramic"], 0.045, 0.1, 0.35, 0.83, 0.2)
    box(p, M["leather"], 0.58, 0.1, 0.55, 0, 0.5, 1.2, round_=0.04)
    box(p, M["leather"], 0.56, 0.75, 0.08, 0, 0.98, 1.47, round_=0.04)
    for side in (-1, 1):
        box(p, M["leather"], 0.08, 0.06, 0.4, side * 0.31, 0.72, 1.22, round_=0.02)
        box(p, M["alu"], 0.03, 0.2, 0.03, side * 0.31, 0.62, 1.22)
    cyl(p, M["alu"], 0.03, 0.34, 0, 0.28, 1.2, verts=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(p, M["alu"], 0.34, 0.03, 0.045, math.cos(a) * 0.17, 0.07, 1.2 + math.sin(a) * 0.17, rot_y=-a)


def plant_parts(parent, r, h, leaves):
    """leaves: (dx, dy, dz, radius) each."""
    cyl(parent, M["pot"], r, h, 0, h / 2, 0, r_top=r + 0.03, verts=28)
    cyl(parent, M["soil"], r + 0.01, 0.02, 0, h - 0.004, 0)
    for k, (dx, dy, dz, size) in enumerate(leaves):
        blob(parent, M["leaf" if k % 2 else "leaf_light"], size, dx, dy, dz, squash=0.85)


def plant():
    p = piece("plant")
    plant_parts(p, 0.22, 0.42, [(0, 1.15, 0, 0.32), (0.17, 0.95, 0.08, 0.24), (-0.16, 1.0, -0.06, 0.25), (0.05, 0.8, -0.18, 0.2), (-0.08, 1.35, 0.1, 0.2)])
    cyl(p, M["trunk"], 0.025, 0.7, 0, 0.75, 0, verts=8)


def marker(parent, kind, x, z, rot_y=0.0, w=0.0, d=0.0, y=0.0, h=0.0):
    """An empty the scene reads by its "marker" property; merge() keeps it."""
    obj = bpy.data.objects.new(f"{parent.name}_{kind}", None)
    bpy.context.scene.collection.objects.link(obj)
    obj["marker"] = kind
    if w:
        obj["w"], obj["d"] = w, d
    if h:
        obj["h"] = h
    return place(obj, parent, x, y, z, rot_y)


def coffee_counter(p, cx, cz):
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
    """facing: the way someone sitting in it looks (+1 is +z)."""
    back = -facing
    box(p, M["oak"], 0.44, 0.04, 0.42, x, 0.46, z, round_=0.01)
    box(p, M["oak"], 0.44, 0.42, 0.03, x, 0.7, z + back * 0.2, round_=0.01)
    for sx in (-0.19, 0.19):
        for sz in (-0.18, 0.18):
            box(p, M["steel"], 0.03, 0.44, 0.03, x + sx, 0.22, z + sz, round_=0.003)
    marker(p, "seat", x, z, 0.0 if facing > 0 else math.pi)


def dining_table(p, x, z):
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
    box(p, M["tile"], w, 0.012, d, 0, 0.008, 0, round_=0)
    for k in range(1, w):
        box(p, M["grout"], 0.02, 0.014, d, -w / 2 + k, 0.008, 0, round_=0)
    for k in range(1, d):
        box(p, M["grout"], w, 0.014, 0.02, 0, 0.008, -d / 2 + k, round_=0)
    back = -d / 2 + 0.06
    box(p, M["kitchen_wall"], w, 2.8, 0.12, 0, 1.4, back, round_=0.01)
    marker(p, "block", 0, back, w=w, d=0.2)
    run = back + 0.37
    box(p, M["sage"], 5.0, 0.62, 0.02, -1.5, 1.23, back + 0.07, round_=0)
    box(p, M["alu"], 0.8, 2.0, 0.62, -5.3, 1.0, run, round_=0.02)
    box(p, M["steel"], 0.03, 0.9, 0.03, -4.98, 1.25, run + 0.33, round_=0.005)
    box(p, M["cabinet"], 0.8, 2.2, 0.62, -4.45, 1.1, run, round_=0.01)
    box(p, M["steel"], 0.03, 0.4, 0.03, -4.15, 1.1, run + 0.33, round_=0.005)
    box(p, M["cabinet"], 5.0, 0.86, 0.6, -1.5, 0.45, run, round_=0.01)
    box(p, M["worktop"], 5.04, 0.04, 0.64, -1.5, 0.9, run, round_=0.005)
    for k in range(8):
        x = -3.7 + k * 0.6 + 0.3
        box(p, M["steel"], 0.16, 0.02, 0.02, x, 0.78, run + 0.31, round_=0.003)
        box(p, M["grout"], 0.008, 0.8, 0.005, x + 0.3, 0.45, run + 0.302, round_=0)
    box(p, M["steel"], 0.6, 0.02, 0.42, -2.6, 0.915, run, round_=0.005)
    cyl(p, M["steel"], 0.015, 0.3, -2.6, 1.07, run - 0.22, verts=10)
    box(p, M["steel"], 0.02, 0.02, 0.16, -2.6, 1.21, run - 0.15, round_=0.005)
    cyl(p, M["bezel"], 0.08, 0.22, -1.5, 1.03, run - 0.05)
    box(p, M["cabinet"], 0.5, 0.3, 0.38, -0.4, 1.07, run - 0.05, round_=0.02)
    box(p, M["glass_dark"], 0.32, 0.2, 0.01, -0.46, 1.07, run + 0.145, round_=0)
    box(p, M["cabinet"], 5.0, 0.7, 0.35, -1.5, 2.0, back + 0.24, round_=0.01)
    for k in range(8):
        box(p, M["steel"], 0.16, 0.02, 0.02, -3.7 + k * 0.6 + 0.3, 1.7, back + 0.42, round_=0.003)
    marker(p, "block", -2.25, run, w=7.5, d=0.7)
    coffee_counter(p, 3.4, back + 1.9)
    for x in (-4.0, -1.2):
        dining_table(p, x, 1.9)
    for x in (-5.5, 5.5):
        pot = piece(f"kitchen_plant_{'l' if x < 0 else 'r'}")
        pot.parent = p
        pot.location = to_blender(x, 0, d / 2 - 0.5)
        plant_parts(pot, 0.2, 0.38, [(0, 0.75, 0, 0.3), (0.15, 0.6, 0.08, 0.22), (-0.14, 0.62, -0.06, 0.22)])


def face_plane(p, mat, w, h, x, y, z, facing, turn=None):
    """A flat face w x h centred at x, y, z, looking toward +z (facing 1) or -z (facing -1); turn instead
    turns it about the vertical from +z (math.pi / 2 looks toward +x)."""
    bpy.ops.mesh.primitive_plane_add(size=1)
    board = bpy.context.active_object
    board.name = f"{p.name}_{mat.name}"
    board.scale = (w, h, 1)
    bpy.ops.object.transform_apply(scale=True)
    board.data.materials.append(mat)
    place(board, p, x, y, z)
    board.rotation_euler = (math.radians(90), 0, turn if turn is not None else 0 if facing > 0 else math.pi)
    return board


def lift_core():
    """Two lifts, doors facing +z. The front wall has an opening per lift with a lit car behind it;
    the door leaves are a separate piece (lift_door) the scene slides into the wall. Each lift has a
    "lift_display" over its doors that the scene paints, and the call panel between them is
    "call_button"."""
    p = piece("lift_core")
    h = 3.3
    # Back, sides, middle partition and roof.
    box(p, M["core_wall"], 8, h, 0.2, 0, h / 2, -1.9, round_=0.01)
    for x in (-3.9, 0, 3.9):
        box(p, M["core_wall"], 0.2, h, 4, x, h / 2, 0, round_=0.01)
    box(p, M["core_wall"], 8, 0.1, 4, 0, h - 0.05, 0, round_=0.01)
    # Front wall in pieces round the two openings (1.2 x 2.25 at x = -1.6 and 1.6).
    for x0, x1 in ((-4, -2.2), (-1.0, 1.0), (2.2, 4)):
        box(p, M["core_wall"], x1 - x0, h, 0.2, (x0 + x1) / 2, h / 2, 1.9, round_=0.01)
    for x in (-1.6, 1.6):
        box(p, M["core_wall"], 1.2, h - 2.25, 0.2, x, 2.25 + (h - 2.25) / 2, 1.9, round_=0)
        # Steel frame round the opening.
        for side in (-1, 1):
            box(p, M["steel"], 0.08, 2.33, 0.26, x + side * 0.635, 1.165, 1.92, round_=0.004)
        box(p, M["steel"], 1.35, 0.08, 0.26, x, 2.285, 1.92, round_=0.004)
        box(p, M["steel"], 1.2, 0.02, 0.3, x, 0.01, 1.9, round_=0)
        # The car: brushed steel walls, a mirror at the back, a lit ceiling and a handrail.
        box(p, M["stone_dark"], 1.6, 0.02, 1.9, x, 0.01, 0.8, round_=0)
        box(p, M["alu"], 1.6, 2.4, 0.03, x, 1.2, -0.17, round_=0)
        box(p, M["glass_dark"], 1.0, 1.4, 0.01, x, 1.35, -0.15, round_=0)
        for side in (-1, 1):
            box(p, M["alu"], 0.03, 2.4, 1.89, x + side * 0.8, 1.2, 0.795, round_=0)
            box(p, M["steel"], 0.03, 0.03, 1.4, x + side * 0.76, 0.95, 0.7, round_=0.006)
        box(p, M["alu"], 1.6, 0.03, 1.9, x, 2.415, 0.8, round_=0)
        box(p, M["diffuser"], 1.3, 0.01, 1.5, x, 2.395, 0.8, round_=0)
        box(p, M["bezel"], 0.42, 0.14, 0.02, x, 2.55, 2.01, round_=0.004)
        face_plane(p, M["lift_display"], 0.38, 0.11, x, 2.55, 2.022, 1)
    # Call panel between the lifts, and a floor directory screen above it.
    box(p, M["alu"], 0.12, 0.26, 0.02, 0, 1.15, 2.01, round_=0.006)
    face_plane(p, M["call_button"], 0.07, 0.2, 0, 1.15, 2.022, 1)
    box(p, M["bezel"], 1.0, 0.6, 0.02, 0, 1.75, 2.01, round_=0.005)


def lift_door():
    """One leaf of a lift door, origin at the bottom centre."""
    p = piece("lift_door")
    box(p, M["lift_door"], 0.68, 2.33, 0.04, 0, 1.165, 0, round_=0.003)
    box(p, M["steel"], 0.01, 2.33, 0.044, 0.34, 1.165, 0, round_=0)


def fire_door():
    """The stairwell's door leaf, origin on its hinge at the stair-side face. It swings into the stair
    (toward +z) when rotated by a negative angle. Push bar on the floor side, closer on the stair side."""
    p = piece("fire_door")
    box(p, M["door_grey"], 0.96, 2.06, 0.05, 0.48, 1.04, -0.025, round_=0.004)
    box(p, M["glass_dark"], 0.16, 0.7, 0.052, 0.23, 1.45, -0.025, round_=0)
    box(p, M["steel"], 0.7, 0.04, 0.05, 0.5, 1.0, -0.085, round_=0.01)
    for x in (0.18, 0.82):
        box(p, M["steel"], 0.04, 0.08, 0.06, x, 1.0, -0.08, round_=0.006)
    box(p, M["steel"], 0.36, 0.06, 0.06, 0.25, 1.95, 0.03, round_=0.008)


def stairwell():
    """An enclosed fire stair, 5.4 x 6.2 m, walls to the ceiling, one fire door on -z near its -x end.
    Inside, two flights rise round a landing to the floor above. The green "exit_sign" over the door is
    painted by the scene. Markers block the walls."""
    p = piece("stairwell")
    w, d, h, t = 5.4, 6.2, 3.3, 0.2
    door_x = -w / 2 + 1.0
    box(p, M["core_wall"], w, h, t, 0, h / 2, d / 2 - t / 2, round_=0.01)
    for side in (-1, 1):
        box(p, M["core_wall"], t, h, d, side * (w / 2 - t / 2), h / 2, 0, round_=0.01)
    # Front wall round the door opening (1.0 x 2.1).
    fz = -d / 2 + t / 2
    left, right = door_x - 0.5, door_x + 0.5
    box(p, M["core_wall"], left + w / 2, h, t, (-w / 2 + left) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], w / 2 - right, h, t, (right + w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], 1.0, h - 2.1, t, door_x, 2.1 + (h - 2.1) / 2, fz, round_=0)
    # The door frame; the leaf is its own piece (fire_door) so the scene can swing it.
    for side in (-1, 1):
        box(p, M["steel"], 0.06, 2.16, 0.24, door_x + side * 0.52, 1.08, fz, round_=0.004)
    box(p, M["steel"], 1.1, 0.06, 0.24, door_x, 2.12, fz, round_=0.004)
    face_plane(p, M["exit_sign"], 0.6, 0.22, door_x, 2.35, fz - 0.142, -1)
    box(p, M["bezel"], 0.64, 0.26, 0.04, door_x, 2.35, fz - 0.12, round_=0.006)
    # Two flights round a landing at the back: up along +x from the front, back down... toward the front
    # rising on the -x side. Eleven steps each, 0.15 high.
    inner_w = w - 2 * t
    flight_w = inner_w / 2 - 0.1
    rise, run, steps = 0.15, 0.28, 11
    start = -d / 2 + t + 1.4
    for k in range(steps):
        y = (k + 1) * rise
        box(p, M["concrete_step"], flight_w, y, run, inner_w / 4 + 0.05, y / 2, start + k * run + run / 2, round_=0)
    landing_z = start + steps * run
    landing_d = d / 2 - t - landing_z
    box(p, M["concrete_step"], inner_w, steps * rise, landing_d, 0, steps * rise / 2, landing_z + landing_d / 2, round_=0)
    for k in range(steps):
        y = steps * rise + (k + 1) * rise
        box(p, M["concrete_step"], flight_w, 0.15, run, -inner_w / 4 - 0.05, y - 0.075, landing_z - (k + 1) * run + run / 2, round_=0)
    # A wall between the flights and handrails on it.
    box(p, M["core_wall"], 0.1, 3.0, steps * run, 0, 1.5, start + steps * run / 2, round_=0)
    for side in (-1, 1):
        box(p, M["steel"], 0.04, 0.04, steps * run, side * 0.09, 1.0 + (0 if side > 0 else steps * rise), start + steps * run / 2, round_=0.01)
    marker(p, "block", 0, d / 2 - t / 2, w=w, d=t)
    for side in (-1, 1):
        marker(p, "block", side * (w / 2 - t / 2), 0, w=t, d=d)
    marker(p, "block", (-w / 2 + left) / 2, fz, w=left + w / 2, d=t)
    marker(p, "block", (right + w / 2) / 2, fz, w=w / 2 - right, d=t)
    marker(p, "block", door_x, fz, w=1.0, d=0.3)


def wc_frame(p, x, width, z, t):
    """The white frame of a door opening width wide at x, in a front wall t thick centred on z."""
    jamb = 0.04
    for side in (-1, 1):
        box(p, M["trim"], jamb, 2.1, t + 0.02, x + side * (width / 2 - jamb / 2), 1.05, z, round_=0.004)
    box(p, M["trim"], width, jamb, t + 0.02, x, 2.1 - jamb / 2, z, round_=0.004)
    return x - width / 2 + jamb + 0.003


def lock_parts(p, x, y, inside, outside):
    """A thumb-turn on the inside face (z = inside) and its VACANT/ENGAGED indicator on the outside face (z = outside)."""
    box(p, M["steel"], 0.05, 0.05, 0.01, x, y, inside + 0.005, round_=0.004)
    box(p, M["thumb_turn"], 0.015, 0.05, 0.02, x, y, inside + 0.02, round_=0.005)
    box(p, M["steel"], 0.09, 0.04, 0.01, x, y, outside - 0.005, round_=0.004)
    face_plane(p, M["wc_indicator"], 0.07, 0.022, x, y, outside - 0.0106, -1)


def wc_door(name, leaf, lock):
    """An oak toilet door leaf, origin on its hinge edge at the floor, centred on z = 0; the leaf runs along +x.
    Levers both sides at the latch, "wc_sign" on the -z face painted by the scene; with lock, a thumb-turn
    on +z and an indicator on -z."""
    p = piece(name)
    box(p, M["oak"], leaf, 2.05, 0.045, leaf / 2, 1.03, 0, round_=0.004)
    rose = leaf - 0.07
    for face in (-1, 1):
        box(p, M["steel"], 0.05, 0.05, 0.02, rose, 1.0, face * 0.0325, round_=0.006)
        box(p, M["steel"], 0.12, 0.02, 0.02, rose - 0.05, 1.0, face * 0.0525, round_=0.008)
    face_plane(p, M["wc_sign"], 0.22, 0.28, leaf / 2, 1.5, -0.0245, -1)
    if lock:
        lock_parts(p, rose, 1.15, 0.0225, -0.0225)


def cubicle_door():
    """A cubicle door leaf 0.6 x 1.85 m, 0.15 m off the floor; origin on its hinge edge at the floor, leaf along +x.
    Thumb-turn on +z (inside the cubicle), indicator on -z."""
    p = piece("cubicle_door")
    box(p, M["laminate"], 0.6, 1.85, 0.03, 0.3, 1.075, 0, round_=0.004)
    lock_parts(p, 0.53, 1.0, 0.015, -0.015)


def hand_dryer():
    """Wall-mounted hand dryer, origin on the wall at floor height, facing +z; "dryer_light" lit by the scene while it runs."""
    p = piece("hand_dryer")
    box(p, M["dryer"], 0.3, 0.6, 0.22, 0, 1.2, 0.11, round_=0.05)
    box(p, M["bezel"], 0.22, 0.03, 0.08, 0, 0.915, 0.13, round_=0.01)
    box(p, M["dryer_light"], 0.08, 0.012, 0.004, 0, 1.4, 0.222, round_=0)


def tap():
    """A basin mixer tap, origin at its base on the counter, spout toward +z; water falls from z 0.14, y 0.189."""
    p = piece("tap")
    cyl(p, M["tap"], 0.025, 0.012, 0, 0.006, 0, verts=20)
    cyl(p, M["tap"], 0.015, 0.21, 0, 0.105, 0, verts=16)
    box(p, M["tap"], 0.022, 0.022, 0.15, 0, 0.2, 0.075, round_=0.008)
    box(p, M["tap"], 0.012, 0.012, 0.06, 0, 0.222, 0.03, round_=0.004)


def block(p, x0, x1, z0, z1):
    marker(p, "block", (x0 + x1) / 2, (z0 + z1) / 2, w=x1 - x0, d=z1 - z0)


def duct(p, xa, xb, back):
    """Boxing 0.25 deep along the back wall at z = back that hides the cisterns, with a shelf on top."""
    box(p, M["laminate"], xb - xa, 1.1, 0.25, (xa + xb) / 2, 0.55, back - 0.125, round_=0.004)
    box(p, M["worktop"], xb - xa, 0.03, 0.25, (xa + xb) / 2, 1.115, back - 0.125, round_=0.004)
    block(p, xa, xb, back - 0.25, back)


def wc_pan(p, x, back, seat=0.42, depth=0.52):
    """A wall-hung pan with its back on z = back, reaching toward -z; lid down."""
    box(p, M["ceramic"], 0.36, 0.32, depth, x, seat - 0.18, back - depth / 2, round_=0.06)
    box(p, M["cabinet"], 0.38, 0.03, depth - 0.04, x, seat - 0.005, back - depth / 2 - 0.01, round_=0.012)
    block(p, x - 0.18, x + 0.18, back - depth, back)


def cubicles(p, xa, xb, count, duct_z):
    """count cubicles 1.5 m deep from xa to xb in front of a duct face at z = duct_z, a pan and flush plate in each.
    Each door is its own piece (cubicle_door) at a "cubicle" marker on its hinge; w is the cubicle's width."""
    front = duct_z - 1.5
    each = (xb - xa) / count
    side = (each - 0.6) / 2 - 0.01
    for k in range(count):
        cx = xa + each * (k + 0.5)
        wc_pan(p, cx, duct_z)
        box(p, M["flush_plate"], 0.22, 0.15, 0.012, cx, 0.95, duct_z - 0.006, round_=0.003)
        for s in (-1, 1):
            box(p, M["laminate"], side, 1.9, 0.03, cx + s * (each / 2 - side / 2), 1.1, front, round_=0.004)
        marker(p, "cubicle", cx - 0.3, front, w=each)
    for k in range(1, count):
        x = xa + each * k
        box(p, M["laminate"], 0.03, 1.9, 1.5, x, 1.1, front + 0.75, round_=0.004)
        box(p, M["steel"], 0.04, 0.15, 0.04, x, 0.075, front, round_=0.004)
        block(p, x - 0.015, x + 0.015, front, duct_z)
    box(p, M["alu"], xb - xa, 0.03, 0.05, (xa + xb) / 2, 2.065, front, round_=0.006)
    return front


def vanity(p, wall_x, facing, za, zb, basins):
    """A stone counter on the wall at x = wall_x reaching toward facing (+1 or -1 on x), from za to zb, with
    vessel basins at the z values in basins, a "tap" marker behind each and a mirror along the wall above."""
    depth = 0.5
    box(p, M["stone_dark"], depth, 0.12, zb - za, wall_x + facing * depth / 2, 0.8, (za + zb) / 2, round_=0.008)
    for z in basins:
        cyl(p, M["ceramic"], 0.15, 0.13, wall_x + facing * 0.28, 0.925, z, r_top=0.19, verts=32)
        cyl(p, M["grout"], 0.165, 0.004, wall_x + facing * 0.28, 0.991, z, verts=32)
        marker(p, "tap", wall_x + facing * 0.06, z, rot_y=facing * math.pi / 2, y=0.86, h=0.993)
    box(p, M["mirror"], 0.01, 0.8, zb - za, wall_x + facing * 0.005, 1.55, (za + zb) / 2, round_=0)
    block(p, min(wall_x, wall_x + facing * depth), max(wall_x, wall_x + facing * depth), za, zb)


def dryer_spot(p, wall_x, facing, z):
    """A "dryer" marker on the wall at x = wall_x, facing +1 or -1 on x; the dryer is its own piece."""
    marker(p, "dryer", wall_x, z, rot_y=facing * math.pi / 2)
    block(p, min(wall_x, wall_x + facing * 0.24), max(wall_x, wall_x + facing * 0.24), z - 0.15, z + 0.15)


def toilets():
    """Ladies, gents and an accessible WC, 7.6 x 6.2 m, walls to the ceiling, a door each on -z. No +x wall:
    it stands against the stairwell's -x wall. The moving parts are their own pieces, placed by the scene at
    markers: door_ladies, door_gents, door_accessible and cubicle (doors, on their hinges), dryer, tap (y is
    the counter, h the water level), cord (the accessible WC's pull cord) and light (ceiling panels).
    "flush_plate", "pull_cord", "alarm_reset" and "alarm_lamp" are found by the scene; blocks mark the rest."""
    p = piece("toilets")
    w, d, h, t, pt = 7.6, 6.2, 3.3, 0.2, 0.1
    x0, x1, z0, z1 = -w / 2 + t, w / 2, -d / 2 + t, d / 2 - t
    box(p, M["tile"], w, 0.02, d, 0, 0.01, 0, round_=0)
    box(p, M["core_wall"], w, h, t, 0, h / 2, d / 2 - t / 2, round_=0.01)
    box(p, M["core_wall"], t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0, round_=0.01)
    block(p, -w / 2, w / 2, z1, d / 2)
    block(p, -w / 2, x0, z0, z1)
    fz = -d / 2 + t / 2
    edge = -w / 2
    for x, width, door in ((-1.3, 0.9, "door_ladies"), (0.6, 0.9, "door_gents"), (2.75, 1.0, "door_accessible")):
        box(p, M["core_wall"], x - width / 2 - edge, h, t, (edge + x - width / 2) / 2, h / 2, fz, round_=0.01)
        block(p, edge, x - width / 2, -d / 2, z0)
        box(p, M["core_wall"], width, h - 2.1, t, x, 2.1 + (h - 2.1) / 2, fz, round_=0)
        marker(p, door, wc_frame(p, x, width, fz, t), fz, w=width)
        edge = x + width / 2
    box(p, M["core_wall"], w / 2 - edge, h, t, (edge + w / 2) / 2, h / 2, fz, round_=0.01)
    block(p, edge, w / 2, -d / 2, z0)
    # Partitions: ladies | gents full depth; the accessible WC takes the front of the gents' side, which wraps behind it.
    box(p, M["core_wall"], pt, h, z1 - z0, -0.45, h / 2, 0, round_=0)
    block(p, -0.5, -0.4, z0, z1)
    box(p, M["core_wall"], pt, h, 2.4, 1.65, h / 2, z0 + 1.2, round_=0)
    block(p, 1.6, 1.7, z0, -0.5)
    box(p, M["core_wall"], x1 - 1.7, h, pt, (1.7 + x1) / 2, h / 2, -0.55, round_=0)
    block(p, 1.7, x1, -0.6, -0.5)
    duct_z = z1 - 0.25
    for x, z in ((-2.05, -1.2), (-2.05, 1.9), (0.6, -1.6), (1.7, 0.8), (2.75, -1.75)):
        marker(p, "light", x, z)

    # Ladies: three cubicles along the back, basins and a dryer on the outside wall.
    duct(p, x0, -0.5, z1)
    cubicles(p, x0, -0.5, 3, duct_z)
    vanity(p, x0, 1, -2.3, -0.3, (-1.8, -0.8))
    dryer_spot(p, x0, 1, 0.3)

    # Gents: two cubicles and two urinals with a screen between, basins on the partition.
    duct(p, -0.4, x1, z1)
    front = cubicles(p, -0.4, 1.6, 2, duct_z)
    box(p, M["laminate"], 0.03, 1.9, 1.5, 1.585, 1.1, front + 0.75, round_=0.004)
    box(p, M["steel"], 0.04, 0.15, 0.04, 1.585, 0.075, front, round_=0.004)
    block(p, 1.57, 1.6, front, duct_z)
    for x in (2.35, 3.15):
        box(p, M["ceramic"], 0.36, 0.62, 0.3, x, 0.66, duct_z - 0.15, round_=0.08)
        box(p, M["alu"], 0.1, 0.1, 0.012, x, 1.03, duct_z - 0.006, round_=0.003)
        block(p, x - 0.18, x + 0.18, duct_z - 0.3, duct_z)
    box(p, M["laminate"], 0.03, 0.8, 0.45, 2.75, 0.95, duct_z - 0.225, round_=0.004)
    block(p, 2.735, 2.765, duct_z - 0.45, duct_z)
    vanity(p, -0.4, 1, -2.2, -0.6, (-1.8, -1.0))
    dryer_spot(p, 1.6, -1, -1.6)

    # Accessible WC to Approved Document M: pan 0.5 m off the side wall with its rails, basin in reach
    # from the seat, the red emergency pull cord with bangles at 0.9 m and 0.1 m, a reset button by the
    # door and an alarm lamp over it outside.
    back = -0.6
    ax = x1 - 0.5
    box(p, M["ceramic"], 0.5, 0.4, 0.18, ax, 0.8, back - 0.09, round_=0.03)
    block(p, ax - 0.25, ax + 0.25, back - 0.18, back)
    wc_pan(p, ax, back - 0.18, seat=0.47, depth=0.57)
    box(p, M["steel"], 0.035, 0.035, 0.6, x1 - 0.06, 0.68, -1.2, round_=0.015)
    for z in (-0.92, -1.48):
        box(p, M["steel"], 0.06, 0.03, 0.03, x1 - 0.03, 0.68, z, round_=0.006)
    cyl(p, M["steel"], 0.0175, 0.6, x1 - 0.06, 1.1, -1.6, verts=12)
    for y in (0.82, 1.38):
        box(p, M["steel"], 0.06, 0.03, 0.03, x1 - 0.03, y, -1.6, round_=0.006)
    box(p, M["steel"], 0.1, 0.25, 0.03, ax - 0.32, 0.72, back - 0.015, round_=0.006)
    box(p, M["steel"], 0.035, 0.035, 0.8, ax - 0.32, 0.72, back - 0.4, round_=0.015)
    box(p, M["ceramic"], 0.38, 0.14, 0.45, x1 - 0.19, 0.78, -1.95, round_=0.04)
    box(p, M["grout"], 0.26, 0.004, 0.3, x1 - 0.2, 0.851, -1.95, round_=0.02)
    block(p, x1 - 0.38, x1, -2.175, -1.725)
    marker(p, "tap", x1 - 0.05, -1.95, rot_y=-math.pi / 2, y=0.85, h=0.853)
    box(p, M["mirror"], 0.01, 0.9, 0.5, x1 - 0.005, 1.4, -1.95, round_=0)
    cord = 2.3
    box(p, M["cabinet"], 0.08, 0.08, 0.04, cord, 2.9, back - 0.02, round_=0.01)
    cyl(p, M["pull_cord"], 0.004, 2.76, cord, 1.48, back - 0.03, verts=6)
    for y in (0.9, 0.1):
        cyl(p, M["pull_cord"], 0.025, 0.012, cord, y, back - 0.03, verts=16)
    marker(p, "cord", cord, back - 0.03)
    box(p, M["cabinet"], 0.04, 0.12, 0.09, 1.72, 0.95, -2.5, round_=0.008)
    box(p, M["alarm_reset"], 0.01, 0.04, 0.04, 1.745, 0.93, -2.5, round_=0.006)
    box(p, M["alarm_lamp"], 0.006, 0.015, 0.015, 1.743, 0.99, -2.5, round_=0)
    box(p, M["cabinet"], 0.16, 0.1, 0.04, 2.75, 2.4, -d / 2 - 0.02, round_=0.01)
    box(p, M["alarm_lamp"], 0.12, 0.06, 0.01, 2.75, 2.4, -d / 2 - 0.044, round_=0.004)


def breaker():
    """A circuit breaker on a DIN rail, origin on the rail, facing +z; the scene moves "breaker_lever" up (on) or down (off)."""
    p = piece("breaker")
    box(p, M["breaker"], 0.036, 0.09, 0.065, 0, 0, 0.0325, round_=0.004)
    box(p, M["breaker_lever"], 0.014, 0.024, 0.02, 0, 0.012, 0.072, round_=0.004)


def plant_room():
    """A plant room, 6 x 6.2 m, walls to the ceiling, its door on -z near the +x end. No +x wall: it stands
    against the toilets' -x wall. The fire alarm panel is beside the distribution board on the -x wall ("fire_screen"
    painted and "panel_reset" pressed by the scene); the board has two "breakers" rows the scene fills (y the
    rail, w its length, rows run toward -z) and "board_chart" beside it; cleaning kit along the back. Markers: door_plant, tap, light, block."""
    p = piece("plant_room")
    w, d, h, t = 6.0, 6.2, 3.3, 0.2
    x0, x1, z0, z1 = -w / 2 + t, w / 2, -d / 2 + t, d / 2 - t
    box(p, M["epoxy"], w, 0.02, d, 0, 0.01, 0, round_=0)
    box(p, M["core_wall"], w, h, t, 0, h / 2, d / 2 - t / 2, round_=0.01)
    box(p, M["core_wall"], t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0, round_=0.01)
    block(p, -w / 2, w / 2, z1, d / 2)
    block(p, -w / 2, x0, z0, z1)
    fz = -d / 2 + t / 2
    door_x, door_w = 1.8, 0.9
    box(p, M["core_wall"], door_x - door_w / 2 + w / 2, h, t, (-w / 2 + door_x - door_w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], w / 2 - door_x - door_w / 2, h, t, (door_x + door_w / 2 + w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], door_w, h - 2.1, t, door_x, 2.1 + (h - 2.1) / 2, fz, round_=0)
    block(p, -w / 2, door_x - door_w / 2, -d / 2, z0)
    block(p, door_x + door_w / 2, w / 2, -d / 2, z0)
    marker(p, "door_plant", wc_frame(p, door_x, door_w, fz, t), fz, w=door_w)
    for z in (-1.0, 1.4):
        marker(p, "light", -0.2, z)

    # Distribution board on the -x wall, its cables in trunking to the ceiling, the circuit chart to its right
    # and the fire alarm panel to its left: a red top, the screen, and the reset button under it.
    bz = -0.6
    pz = 0.3
    box(p, M["panel_body"], 0.09, 0.34, 0.42, x0 + 0.045, 1.5, pz, round_=0.01)
    box(p, M["fire_red"], 0.094, 0.042, 0.424, x0 + 0.047, 1.65, pz, round_=0.004)
    face_plane(p, M["fire_screen"], 0.3, 0.18, x0 + 0.091, 1.5, pz, 1, turn=math.pi / 2)
    box(p, M["panel_reset"], 0.02, 0.03, 0.06, x0 + 0.1, 1.37, pz - 0.11, round_=0.005)
    block(p, x0, x0 + 0.1, pz - 0.21, pz + 0.21)
    box(p, M["board"], 0.14, 0.9, 0.75, x0 + 0.07, 1.45, bz, round_=0.01)
    box(p, M["trim"], 0.1, h - 1.9, 0.15, x0 + 0.05, (1.9 + h) / 2, bz, round_=0.004)
    for y in (1.66, 1.3):
        box(p, M["alu"], 0.01, 0.035, 0.7, x0 + 0.145, y, bz, round_=0.002)
        marker(p, "breakers", x0 + 0.15, bz + 0.33, rot_y=math.pi / 2, y=y, w=0.66)
    block(p, x0, x0 + 0.215, bz - 0.375, bz + 0.375)
    box(p, M["cabinet"], 0.004, 0.44, 0.32, x0 + 0.002, 1.45, -1.3, round_=0)
    face_plane(p, M["board_chart"], 0.3, 0.42, x0 + 0.0045, 1.45, -1.3, 1, turn=math.pi / 2)

    # Cleaner's sink in the back corner, with a mop bucket beside it.
    box(p, M["ceramic"], 0.6, 0.25, 0.45, -2.2, 0.675, z1 - 0.225, round_=0.03)
    box(p, M["grout"], 0.48, 0.004, 0.33, -2.2, 0.801, z1 - 0.23, round_=0.02)
    for sx in (-0.27, 0.27):
        for sz in (0.03, 0.42):
            box(p, M["steel"], 0.03, 0.55, 0.03, -2.2 + sx, 0.275, z1 - sz, round_=0.004)
    marker(p, "tap", -2.2, z1 - 0.04, rot_y=math.pi, y=0.8, h=0.803)
    block(p, -2.5, -1.9, z1 - 0.45, z1)
    box(p, M["mop_yellow"], 0.4, 0.28, 0.3, -1.35, 0.2, 2.25, round_=0.03)
    box(p, M["bezel"], 0.14, 0.16, 0.22, -1.2, 0.42, 2.25, round_=0.02)
    for cx in (-1.5, -1.2):
        for cz in (2.13, 2.37):
            cyl(p, M["bezel"], 0.025, 0.05, cx, 0.025, cz, verts=12)
    cyl(p, M["oak"], 0.012, 1.3, -1.45, 0.95, 2.25, verts=10)
    block(p, -1.55, -1.15, 2.1, 2.4)

    # Racking along the back wall with spare rolls, towels and cleaning products.
    sx0, sx1 = 0.0, 1.8
    sz = z1 - 0.225
    for x in (sx0 + 0.015, sx1 - 0.015):
        for z in (z1 - 0.43, z1 - 0.015):
            box(p, M["steel"], 0.03, 1.8, 0.03, x, 0.9, z, round_=0.004)
    for y in (0.12, 0.62, 1.12, 1.62):
        box(p, M["alu"], sx1 - sx0, 0.02, 0.45, (sx0 + sx1) / 2, y, sz, round_=0.004)
    for x in (0.25, 0.7):
        box(p, M["cabinet"], 0.38, 0.3, 0.38, x, 0.28, sz, round_=0.02)
        box(p, M["cabinet"], 0.38, 0.26, 0.36, x, 1.26, sz, round_=0.02)
    box(p, M["jar"], 0.5, 0.3, 0.4, 1.35, 0.28, sz, round_=0.01)
    box(p, M["jar"], 0.5, 0.26, 0.38, 1.35, 1.76, sz, round_=0.01)
    for k in range(5):
        cyl(p, M["sage" if k % 2 else "upholstery"], 0.045, 0.26, 0.15 + k * 0.12, 0.76, sz - 0.05, verts=16)
    for k in range(3):
        cyl(p, M["fire_red"], 0.035, 0.2, 1.1 + k * 0.1, 1.23, sz + 0.05, verts=12)
    block(p, sx0, sx1, z1 - 0.45, z1)

    # Cleaning trolley in front of the racking, and a vacuum in the corner.
    tx, tz = 1.2, 1.15
    box(p, M["dryer_light"], 0.95, 0.08, 0.48, tx, 0.12, tz, round_=0.02)
    box(p, M["dryer_light"], 0.95, 0.9, 0.04, tx, 0.61, tz + 0.22, round_=0.01)
    box(p, M["dryer_light"], 0.95, 0.04, 0.48, tx, 1.06, tz, round_=0.01)
    cyl(p, M["mop_yellow"], 0.2, 0.6, tx + 0.25, 0.46, tz - 0.02, verts=20)
    cyl(p, M["fire_red"], 0.1, 0.18, tx - 0.3, 0.25, tz, verts=16)
    cyl(p, M["upholstery"], 0.1, 0.18, tx - 0.08, 0.25, tz, verts=16)
    for wx in (tx - 0.42, tx + 0.42):
        for wz in (tz - 0.2, tz + 0.2):
            cyl(p, M["bezel"], 0.04, 0.08, wx, 0.04, wz, verts=12)
    block(p, tx - 0.48, tx + 0.48, tz - 0.25, tz + 0.25)
    cyl(p, M["vac"], 0.17, 0.3, 2.5, 0.17, 2.55, verts=24)
    cyl(p, M["bezel"], 0.172, 0.05, 2.5, 0.345, 2.55, verts=24)
    cyl(p, M["alu"], 0.015, 0.9, 2.5, 0.8, 2.75, verts=10)
    block(p, 2.33, 2.67, 2.38, 2.77)
    # A folded wet floor sign against the wall.
    box(p, M["mop_yellow"], 0.04, 0.62, 0.3, x0 + 0.04, 0.31, 1.0, round_=0.01)


def server_rack():
    """A 42U rack, 0.6 x 2.06 x 1.0 m, origin at the floor in its middle, open front toward +z; "rack_top" takes the
    department's colour. Servers (server_unit) slide in with their fronts at z 0.43, from y 1.85 down in 0.1 m slots."""
    p = piece("server_rack")
    for side in (-1, 1):
        box(p, M["rack_black"], 0.02, 2.0, 1.0, side * 0.29, 1.0, 0, round_=0.004)
        box(p, M["alu"], 0.02, 1.9, 0.02, side * 0.25, 1.0, 0.44, round_=0.003)
    box(p, M["rack_top"], 0.6, 0.04, 1.0, 0, 2.02, 0, round_=0.006)
    box(p, M["rack_black"], 0.6, 0.08, 1.0, 0, 0.04, 0, round_=0.004)
    box(p, M["rack_black"], 0.56, 1.92, 0.02, 0, 1.0, -0.49, round_=0.002)


def server_unit():
    """A 2U server, origin at the bottom middle of its front face, front toward +z; "server_led" painted by the scene."""
    p = piece("server_unit")
    box(p, M["server_body"], 0.48, 0.085, 0.7, 0, 0.0425, -0.35, round_=0.004)
    box(p, M["bezel"], 0.48, 0.085, 0.012, 0, 0.0425, -0.006, round_=0.003)
    for x in (0.04, 0.12, 0.2):
        box(p, M["alu"], 0.07, 0.06, 0.004, x, 0.0425, 0.002, round_=0.002)
    box(p, M["server_led"], 0.12, 0.014, 0.004, -0.15, 0.0425, 0.002, round_=0)


def server_room():
    """A server room, 6 x 6.2 m, walls to the ceiling, a door and a viewing window on -z. No +x wall: it stands
    against the plant room's -x wall. Two "racks" rows the scene fills with server_rack (rows run toward -x from
    the marker, fronts toward -z, w the row's length), a "pane" marker for the window's glass (w wide, d high, y
    its middle), "gas_sign" outside painted by the scene; air-con, gas suppression and cable trays inside.
    Markers: door_server, racks, pane, light, block."""
    p = piece("server_room")
    w, d, h, t = 6.0, 6.2, 3.3, 0.2
    x0, x1, z0, z1 = -w / 2 + t, w / 2, -d / 2 + t, d / 2 - t
    box(p, M["raised_floor"], w, 0.02, d, 0, 0.01, 0, round_=0)
    for k in range(1, 10):
        box(p, M["tile_line"], 0.008, 0.002, z1 - z0, x0 + k * 0.6, 0.0225, 0, round_=0)
        box(p, M["tile_line"], x1 - x0, 0.002, 0.008, (x0 + x1) / 2, 0.0225, z0 + k * 0.6, round_=0)
    for k in range(7):
        box(p, M["vent_tile"], 0.58, 0.002, 0.58, 1.9 - k * 0.6, 0.021, -0.8, round_=0)
    box(p, M["core_wall"], w, h, t, 0, h / 2, d / 2 - t / 2, round_=0.01)
    box(p, M["core_wall"], t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0, round_=0.01)
    block(p, -w / 2, w / 2, z1, d / 2)
    block(p, -w / 2, x0, z0, z1)

    # Front wall: a viewing window (1.8 x 1.2 m) on the left as you face it from the floor, the door on the right.
    fz = -d / 2 + t / 2
    win_x, win_w, sill, head = -1.0, 1.8, 0.9, 2.1
    door_x, door_w = 1.9, 0.9
    box(p, M["core_wall"], win_x - win_w / 2 + w / 2, h, t, (-w / 2 + win_x - win_w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], win_w, sill, t, win_x, sill / 2, fz, round_=0)
    box(p, M["core_wall"], win_w, h - head, t, win_x, head + (h - head) / 2, fz, round_=0)
    box(p, M["core_wall"], door_x - door_w / 2 - (win_x + win_w / 2), h, t, (win_x + win_w / 2 + door_x - door_w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], w / 2 - door_x - door_w / 2, h, t, (door_x + door_w / 2 + w / 2) / 2, h / 2, fz, round_=0.01)
    box(p, M["core_wall"], door_w, h - 2.1, t, door_x, 2.1 + (h - 2.1) / 2, fz, round_=0)
    for y in (sill, head):
        box(p, M["trim"], win_w + 0.04, 0.04, t + 0.02, win_x, y, fz, round_=0.004)
    for side in (-1, 1):
        box(p, M["trim"], 0.04, head - sill, t + 0.02, win_x + side * (win_w / 2), (sill + head) / 2, fz, round_=0.004)
    marker(p, "pane", win_x, fz, w=win_w, d=head - sill, y=(sill + head) / 2)
    block(p, -w / 2, door_x - door_w / 2, -d / 2, z0)
    block(p, door_x + door_w / 2, w / 2, -d / 2, z0)
    marker(p, "door_server", wc_frame(p, door_x, door_w, fz, t), fz, w=door_w)
    # Card reader by the door and the gas warning beside it, outside.
    box(p, M["bezel"], 0.07, 0.11, 0.03, door_x - door_w / 2 - 0.2, 1.1, -d / 2 - 0.015, round_=0.006)
    box(p, M["green_light"], 0.03, 0.008, 0.004, door_x - door_w / 2 - 0.2, 1.14, -d / 2 - 0.031, round_=0)
    face_plane(p, M["gas_sign"], 0.3, 0.2, 2.7, 1.55, -d / 2 - 0.002, -1)
    for x, z in ((0.1, -1.6), (0.1, 0.9)):
        marker(p, "light", x, z)

    # Two rows of racks facing the window, filled by the scene, with cable trays above them.
    for rz in (0.0, 1.75):
        marker(p, "racks", 2.2, rz, rot_y=math.pi, w=4.2)
        box(p, M["alu"], 4.4, 0.02, 0.3, 0.1, 2.6, rz, round_=0.003)
        for side in (-1, 1):
            box(p, M["alu"], 4.4, 0.06, 0.01, 0.1, 2.63, rz + side * 0.15, round_=0.002)
        box(p, M["cable"], 4.3, 0.05, 0.2, 0.1, 2.635, rz, round_=0.02)
        for x in (-1.9, 0.1, 2.1):
            cyl(p, M["steel"], 0.006, h - 2.66, x, (2.66 + h) / 2, rz, verts=6)

    # Air-con unit on the left wall, its grilles toward the room.
    box(p, M["crac"], 0.85, 1.9, 1.8, x0 + 0.425, 0.95, -1.7, round_=0.01)
    for y in (0.45, 1.05):
        box(p, M["bezel"], 0.01, 0.45, 1.6, x0 + 0.851, y, -1.7, round_=0)
    box(p, M["glass_dark"], 0.01, 0.12, 0.2, x0 + 0.852, 1.65, -1.7, round_=0)
    box(p, M["green_light"], 0.004, 0.015, 0.015, x0 + 0.856, 1.65, -1.55, round_=0)
    block(p, x0, x0 + 0.85, -2.6, -0.8)

    # Gas suppression: two red cylinders in the back corner, piped to the ceiling, and the release unit by the door.
    for x in (2.4, 2.72):
        cyl(p, M["fire_red"], 0.13, 1.4, x, 0.7, 2.65, verts=24)
        cyl(p, M["steel"], 0.05, 0.12, x, 1.46, 2.65, verts=12)
        cyl(p, M["steel"], 0.02, h - 1.52, x, (1.52 + h) / 2, 2.65, verts=8)
    box(p, M["steel"], 0.66, 0.04, 0.03, 2.56, 1.0, 2.79 + 0.015, round_=0.004)
    block(p, 2.27, 2.85, 2.52, 2.9)
    box(p, M["mop_yellow"], 0.12, 0.16, 0.05, 2.75, 1.4, z0 + 0.025, round_=0.01)
    box(p, M["fire_red"], 0.04, 0.04, 0.02, 2.75, 1.4, z0 + 0.06, round_=0.006)


def lounge_sofa(p, x, z, facing):
    """A three-seat sofa sitting toward facing (+1 or -1 on z), with a seat marker per cushion."""
    box(p, M["upholstery"], 2.0, 0.42, 0.85, x, 0.21, z, round_=0.06)
    box(p, M["upholstery"], 2.0, 0.48, 0.22, x, 0.62, z - facing * 0.32, round_=0.06)
    for side in (-1, 1):
        box(p, M["upholstery"], 0.2, 0.62, 0.85, x + side * 0.9, 0.31, z, round_=0.05)
    for dx in (-0.55, 0, 0.55):
        box(p, M["upholstery"], 0.55, 0.1, 0.6, x + dx, 0.47, z + facing * 0.06, round_=0.04)
        marker(p, "seat", x + dx, z + facing * 0.1, rot_y=0 if facing > 0 else math.pi)
    block(p, x - 1.0, x + 1.0, z - 0.43, z + 0.43)


def breakout():
    """The breakout area, 12 x 8 m, open on every side: sofas round a low table and bean bags on a rug on the
    left, a table tennis table and a table football table on the right. Markers: seat, block."""
    p = piece("breakout")
    box(p, M["rug"], 5.4, 0.02, 4.4, -2.8, 0.01, 0.2, round_=0)
    lounge_sofa(p, -2.8, -1.3, 1)
    lounge_sofa(p, -2.8, 1.7, -1)
    box(p, M["walnut"], 1.2, 0.04, 0.6, -2.8, 0.4, 0.2, round_=0.01)
    for sx in (-0.52, 0.52):
        for sz in (-0.24, 0.24):
            box(p, M["steel"], 0.04, 0.38, 0.04, -2.8 + sx, 0.19, 0.2 + sz, round_=0.005)
    block(p, -3.4, -2.2, -0.1, 0.5)
    for k, (bx, bz) in enumerate(((-5.0, -0.6), (-5.1, 0.6), (-4.6, 1.6))):
        blob(p, M[("bean_orange", "sage", "foos_blue")[k]], 0.42, bx, 0.24, bz, squash=0.6)
        marker(p, "seat", bx, bz, rot_y=math.pi / 2)
        block(p, bx - 0.4, bx + 0.4, bz - 0.4, bz + 0.4)
    small_plant(p, "breakout_plant", -5.5, 3.4)
    block(p, -5.75, -5.25, 3.15, 3.65)

    # Table tennis: a regulation 2.74 x 1.525 m table, net across the middle, a bat each end.
    tx, tz = 3.0, -1.5
    box(p, M["tt_green"], 2.74, 0.03, 1.525, tx, 0.745, tz, round_=0.004)
    for z in (-0.7525, 0.7525):
        box(p, M["trim"], 2.74, 0.002, 0.02, tx, 0.761, tz + z, round_=0)
    for x in (-1.36, 1.36):
        box(p, M["trim"], 0.02, 0.002, 1.525, tx + x, 0.761, tz, round_=0)
    box(p, M["trim"], 2.74, 0.002, 0.006, tx, 0.761, tz, round_=0)
    box(p, M["bezel"], 0.012, 0.15, 1.7, tx, 0.835, tz, round_=0.002)
    for x in (-1.1, 1.1):
        for z in (-0.6, 0.6):
            box(p, M["steel"], 0.04, 0.73, 0.04, tx + x, 0.365, tz + z, round_=0.006)
    box(p, M["foos_red"], 0.15, 0.012, 0.16, tx - 1.0, 0.766, tz + 0.3, round_=0.02)
    box(p, M["bezel"], 0.15, 0.012, 0.16, tx + 1.05, 0.766, tz - 0.35, round_=0.02)
    block(p, tx - 1.37, tx + 1.37, tz - 0.77, tz + 0.77)

    # Table football: a cabinet with rods across it, red players one way, blue the other.
    fx, fz = 3.0, 2.0
    for z in (-0.355, 0.355):
        box(p, M["oak"], 1.4, 0.2, 0.05, fx, 0.82, fz + z, round_=0.008)
    for x in (-0.675, 0.675):
        box(p, M["oak"], 0.05, 0.2, 0.66, fx + x, 0.82, fz, round_=0.008)
    box(p, M["tt_green"], 1.3, 0.02, 0.66, fx, 0.73, fz, round_=0)
    for x in (-0.6, 0.6):
        for z in (-0.3, 0.3):
            box(p, M["bezel"], 0.06, 0.72, 0.06, fx + x, 0.36, fz + z, round_=0.008)
    for k in range(8):
        x = fx - 0.55 + k * (1.1 / 7)
        box(p, M["steel"], 0.016, 0.016, 1.0, x, 0.88, fz, round_=0.006)
        for side in (-1, 1):
            box(p, M["bezel"], 0.035, 0.035, 0.1, x, 0.88, fz + side * 0.55, round_=0.01)
        players = (1, 2, 3, 5, 5, 3, 2, 1)[k]
        for n in range(players):
            z = fz + (n - (players - 1) / 2) * (0.6 / max(players, 2))
            box(p, M["foos_red" if k in (0, 1, 3, 5) else "foos_blue"], 0.03, 0.12, 0.05, x, 0.82, z, round_=0.008)
    block(p, fx - 0.7, fx + 0.7, fz - 0.6, fz + 0.6)


def printer():
    """A floor-standing office printer, origin at its base in the middle, front toward +z. Paper comes out onto the
    dark tray on its lower body (y 0.754) in the gap under the scanner; the scene slides a sheet out there."""
    p = piece("printer")
    box(p, M["cabinet"], 0.6, 0.75, 0.65, 0, 0.375, 0, round_=0.01)
    for y in (0.2, 0.45):
        box(p, M["bezel"], 0.5, 0.008, 0.004, 0, y, 0.326, round_=0)
    box(p, M["bezel"], 0.5, 0.004, 0.5, 0, 0.752, 0.05, round_=0)
    box(p, M["cabinet"], 0.6, 0.2, 0.25, 0, 0.85, -0.2, round_=0.008)
    box(p, M["cabinet"], 0.6, 0.15, 0.65, 0, 1.025, 0, round_=0.01)
    box(p, M["bezel"], 0.58, 0.01, 0.6, 0, 1.105, 0, round_=0.004)
    box(p, M["glass_dark"], 0.24, 0.02, 0.1, 0.12, 1.115, 0.25, round_=0.004)
    box(p, M["green_light"], 0.012, 0.006, 0.012, -0.05, 1.112, 0.27, round_=0)


def print_room():
    """The print room's furniture, 5 x 7.1 m; the scene puts glass walls round it like a meeting room's, the
    doorway on -z at x 1.2 and the building's windows on +z. The printer ("printer" marker) on the -x side, a
    paper worktop along the back, shelving, a shredder and recycling bins. Markers: printer, block."""
    p = piece("print_room")
    w, d = 5.0, 7.1
    x0, x1, z0, z1 = -2.3, 2.3, -3.35, 3.35
    box(p, M["print_carpet"], w, 0.02, d, 0, 0.01, 0, round_=0)

    marker(p, "printer", x0 + 0.35, 0.2, rot_y=math.pi / 2)
    block(p, x0, x0 + 0.68, -0.1, 0.5)
    # Paper worktop along the back: cupboards under, reams and a guillotine on top.
    box(p, M["cabinet"], 3.0, 0.86, 0.58, 0, 0.43, z1 - 0.29, round_=0.01)
    box(p, M["worktop"], 3.04, 0.04, 0.62, 0, 0.88, z1 - 0.31, round_=0.006)
    for k, x in enumerate((-1.1, -0.8, -0.5)):
        for n in range(3 - k):
            box(p, M["paper"], 0.21, 0.05, 0.3, x, 0.925 + n * 0.05, z1 - 0.3, round_=0.004)
    box(p, M["steel"], 0.45, 0.05, 0.35, 0.6, 0.925, z1 - 0.3, round_=0.01)
    block(p, -1.5, 1.5, z1 - 0.6, z1)
    # Shelving on the right wall with boxed paper and toner.
    for z in (-1.0, 0.4):
        for x in (x1 - 0.42, x1 - 0.02):
            box(p, M["steel"], 0.03, 1.8, 0.03, x, 0.9, z, round_=0.004)
    for y in (0.15, 0.7, 1.25, 1.75):
        box(p, M["alu"], 0.44, 0.02, 1.4, x1 - 0.22, y, -0.3, round_=0.004)
    for y in (0.16, 0.71, 1.26):
        for z in (-0.75, -0.3, 0.15):
            box(p, M["jar"], 0.36, 0.26, 0.38, x1 - 0.22, y + 0.14, z, round_=0.01)
    block(p, x1 - 0.45, x1, -1.0, 0.4)
    # Shredder by the shelving, and paper recycling and general waste by the front.
    box(p, M["bezel"], 0.42, 0.68, 0.34, x1 - 0.35, 0.34, -1.5, round_=0.02)
    box(p, M["steel"], 0.3, 0.01, 0.02, x1 - 0.35, 0.685, -1.55, round_=0)
    block(p, x1 - 0.56, x1 - 0.14, -1.67, -1.33)
    for k, (mat, x) in enumerate((("vac", -1.7), ("bezel", -1.15))):
        box(p, M[mat], 0.45, 0.8, 0.42, x, 0.4, z0 + 0.3, round_=0.03)
        box(p, M["trim" if k == 0 else "steel"], 0.3, 0.012, 0.05, x, 0.805, z0 + 0.3, round_=0.004)
    block(p, -1.95, -0.9, z0, z0 + 0.52)


def pod_door():
    """A phone pod's glass door, 0.8 x 2.05 m, origin on its hinge edge at the floor, leaf along +x; "pod_glass" is
    made see-through by the scene."""
    p = piece("pod_door")
    box(p, M["pod_glass"], 0.76, 1.99, 0.012, 0.4, 1.035, 0, round_=0)
    for x in (0.015, 0.785):
        box(p, M["alu"], 0.03, 2.05, 0.03, x, 1.025, 0, round_=0.004)
    for y in (0.015, 2.035):
        box(p, M["alu"], 0.8, 0.03, 0.03, 0.4, y, 0, round_=0.004)
    box(p, M["steel"], 0.025, 0.5, 0.025, 0.72, 1.05, -0.04, round_=0.008)
    box(p, M["steel"], 0.025, 0.5, 0.025, 0.72, 1.05, 0.04, round_=0.008)


def phone_pods():
    """Three acoustic phone pods in a row, 3.95 x 1.25 m, each 2.3 m tall with a roof, a glass front toward -z
    (a door, door_pod, and a fixed pane) and a shelf desk and stool inside. Markers: door_pod, block."""
    p = piece("phone_pods")
    size, gap, h, t = 1.25, 0.1, 2.3, 0.06
    for k in range(3):
        cx = (k - 1) * (size + gap)
        box(p, M["pod_shell"], size, 0.03, size, cx, 0.015, 0, round_=0)
        box(p, M["pod_shell"], size, t, size, cx, h - t / 2, 0, round_=0.01)
        box(p, M["pod_shell"], size, h, t, cx, h / 2, size / 2 - t / 2, round_=0.01)
        box(p, M["felt"], size - 2 * t, h - 0.2, 0.02, cx, h / 2, size / 2 - t - 0.01, round_=0)
        for side in (-1, 1):
            box(p, M["pod_shell"], t, h, size - t, cx + side * (size / 2 - t / 2), h / 2, -t / 2, round_=0.01)
        block(p, cx - size / 2, cx + size / 2, size / 2 - t, size / 2)
        for side in (-1, 1):
            block(p, cx + side * (size / 2 - t / 2) - t / 2, cx + side * (size / 2 - t / 2) + t / 2, -size / 2, size / 2)
        # The front: a door from the left post, a fixed pane to its right, posts and a head rail.
        fz = -size / 2 + 0.03
        left = cx - size / 2 + t
        box(p, M["alu"], size - 2 * t, 0.12, 0.04, cx, 2.1, fz, round_=0.004)
        pane = size - 2 * t - 0.82
        box(p, M["pod_glass"], pane, 2.04, 0.012, cx + size / 2 - t - pane / 2, 1.04, fz, round_=0)
        box(p, M["alu"], 0.03, 2.04, 0.04, cx + size / 2 - t - pane - 0.015, 1.02, fz, round_=0.004)
        block(p, cx + size / 2 - t - pane - 0.03, cx + size / 2 - t, fz - 0.02, fz + 0.02)
        marker(p, "door_pod", left + 0.005, fz, w=0.8)
        box(p, M["oak"], size - 2 * t, 0.03, 0.35, cx, 1.0, size / 2 - t - 0.2, round_=0.006)
        cyl(p, M["upholstery"], 0.17, 0.05, cx, 0.66, 0.0, verts=20)
        cyl(p, M["steel"], 0.02, 0.62, cx, 0.32, 0.0, verts=10)
        box(p, M["diffuser"], 0.5, 0.01, 0.5, cx, h - t - 0.01, 0, round_=0)


def locker_door():
    """A locker door, 0.58 x 0.86 m, origin on its hinge edge at its bottom, leaf along +x, its face toward +z."""
    p = piece("locker_door")
    box(p, M["locker"], 0.58, 0.86, 0.02, 0.29, 0.43, 0, round_=0.004)
    for y in (0.62, 0.66, 0.70):
        box(p, M["bezel"], 0.3, 0.008, 0.004, 0.29, y, 0.011, round_=0)
    box(p, M["steel"], 0.03, 0.06, 0.02, 0.52, 0.45, 0.018, round_=0.006)


def arrival_hub():
    """A freestanding wall 9.6 m long along z and 2.6 m high, oak slats on its -x face. Along its +x face from -z: 18
    staff lockers (nine wide, two high), a bank of parcel lockers with a lit screen, and a snack and a drinks machine
    behind glass ("pane" markers). Each locker door (locker_door) hangs at a "locker" marker: y its bottom, turned to
    face +x. Origin at the wall's middle on the floor. Markers: locker, pane, block."""
    p = piece("arrival_hub")
    length, height = 9.6, 2.6
    box(p, M["media_wall"], 0.2, height, length, 0, height / 2, 0, round_=0.01)
    for n in range(48):
        box(p, M["oak"], 0.03, height - 0.1, 0.07, -0.115, height / 2, -length / 2 + 0.1 + n * 0.2, round_=0)
    block(p, -0.15, 0.1, -length / 2, length / 2)

    lz = -4.7
    box(p, M["locker"], 0.48, 1.86, 5.4, 0.34, 0.93, lz + 2.7, round_=0.006)
    box(p, M["bezel"], 0.48, 0.08, 5.4, 0.34, 0.04, lz + 2.7, round_=0.004)
    for col in range(9):
        for row in range(2):
            marker(p, "locker", 0.595, lz + 0.6 * (col + 1) - 0.01, rot_y=math.pi / 2, y=0.1 + row * 0.88)
            # The dark inside of the locker, seen when its door is open.
            box(p, M["bezel"], 0.002, 0.8, 0.54, 0.581, 0.1 + row * 0.88 + 0.43, lz + 0.3 + col * 0.6, round_=0)
    block(p, 0.1, 0.6, lz, lz + 5.4)

    # Parcel lockers: three columns of doors, the middle one with the screen.
    pz0, pz1, ph = 0.8, 2.6, 2.0
    box(p, M["parcel_body"], 0.6, ph, pz1 - pz0, 0.4, ph / 2, (pz0 + pz1) / 2, round_=0.01)
    col_w = (pz1 - pz0 - 0.08) / 3
    for c in range(3):
        cz = pz0 + 0.04 + col_w * (c + 0.5)
        bands = [(0.12, 0.56), (0.58, 0.88), (1.46, 1.94)] if c == 1 else [(0.12, 0.42), (0.44, 0.74), (0.76, 1.2), (1.22, 1.66), (1.68, 1.94)]
        for y0, y1 in bands:
            box(p, M["parcel_door"], 0.012, y1 - y0 - 0.02, col_w - 0.03, 0.706, (y0 + y1) / 2, cz, round_=0.003)
            box(p, M["steel"], 0.012, 0.07, 0.02, 0.716, (y0 + y1) / 2, cz + col_w / 2 - 0.07, round_=0.003)
    cz = pz0 + 0.04 + col_w * 1.5
    box(p, M["bezel"], 0.02, 0.5, 0.44, 0.71, 1.17, cz, round_=0.006)
    box(p, M["parcel_screen"], 0.004, 0.38, 0.3, 0.722, 1.2, cz, round_=0)
    block(p, 0.1, 0.72, pz0, pz1)

    # Vending: goods behind glass on the -z side of each machine, keypad on the +z side, lit header on top.
    snacks = ("fire_red", "bean_orange", "foos_blue", "tt_green", "panel_reset")
    drinks = ("foos_blue", "tt_green", "bean_orange", "fire_red", "glass_dark")
    for vz, header, goods, shelves in ((3.2, "vend_blue", snacks, 5), (4.15, "vend_red", drinks, 4)):
        gz = vz - 0.12
        box(p, M["vend_body"], 0.75, 1.83, 0.9, 0.475, 0.915, vz, round_=0.02)
        box(p, M["vend_body"], 0.1, 0.64, 0.9, 0.9, 0.32, vz, round_=0.01)
        box(p, M["vend_body"], 0.1, 0.17, 0.9, 0.9, 1.745, vz, round_=0.01)
        box(p, M["vend_body"], 0.1, 1.02, 0.26, 0.9, 1.15, vz + 0.32, round_=0.006)
        box(p, M["vend_body"], 0.1, 1.02, 0.02, 0.9, 1.15, vz - 0.44, round_=0)
        box(p, M[header], 0.004, 0.13, 0.84, 0.952, 1.745, vz, round_=0)
        box(p, M["vend_light"], 0.004, 1.0, 0.62, 0.852, 1.15, gz, round_=0)
        pitch = 1.0 / shelves
        for s in range(shelves):
            y = 0.68 + s * pitch
            box(p, M["steel"], 0.09, 0.012, 0.62, 0.9, y, gz, round_=0)
            for k in range(6 if shelves == 4 else 5):
                kz = gz - 0.26 + k * (0.52 / (5 if shelves == 4 else 4))
                mat = M[goods[(s + k) % len(goods)]]
                if shelves == 4:
                    cyl(p, mat, 0.03, 0.17, 0.9, y + 0.091, kz, verts=10)
                else:
                    box(p, mat, 0.04, 0.12, 0.09, 0.91, y + 0.07, kz, round_=0.004)
        marker(p, "pane", 0.951, gz, rot_y=math.pi / 2, w=0.62, d=1.0, y=1.15)
        box(p, M["vend_light"], 0.004, 0.08, 0.16, 0.952, 1.42, vz + 0.32, round_=0)
        for row in range(4):
            for c in range(3):
                box(p, M["steel"], 0.006, 0.025, 0.035, 0.953, 1.3 - row * 0.04, vz + 0.27 + c * 0.05, round_=0)
        box(p, M["bezel"], 0.006, 0.07, 0.03, 0.953, 1.05, vz + 0.32, round_=0)
        box(p, M["bezel"], 0.006, 0.18, 0.5, 0.953, 0.32, gz, round_=0.004)
    block(p, 0.1, 0.96, 2.75, 4.6)


def feature_planter():
    """A waist-high oak planter 6.8 m long along z: fig trees, an olive tree, snake plants and low planting, with ivy
    trailing over both sides. Origin at its middle on the floor. Markers: block."""
    p = piece("feature_planter")
    length, height, deep = 6.6, 0.85, 0.5
    rng = random.Random(3)
    box(p, M["bezel"], deep - 0.06, 0.06, length - 0.06, 0, 0.03, 0, round_=0)
    box(p, M["walnut"], deep - 0.04, height - 0.1, length, 0, height / 2 + 0.02, 0, round_=0)
    for side in (-1, 1):
        for n in range(55):
            box(p, M["oak"], 0.03, height - 0.12, 0.09, side * (deep / 2 - 0.02), height / 2 + 0.02, -length / 2 + 0.06 + n * 0.12, round_=0)
        box(p, M["oak"], 0.07, 0.04, length + 0.04, side * (deep / 2 - 0.015), height + 0.02, 0, round_=0.006)
        box(p, M["oak"], deep + 0.04, 0.04, 0.07, 0, height + 0.02, side * (length / 2 - 0.015), round_=0.006)
    box(p, M["soil"], deep - 0.08, 0.02, length - 0.08, 0, height - 0.01, 0, round_=0)
    for z in (-2.5, 2.5):
        cyl(p, M["trunk"], 0.025, 1.25, 0, height + 0.625, z, verts=8)
        for k in range(11):
            a = k * 2.4
            blob(p, M["leaf" if k % 2 else "leaf_light"], 0.11, math.cos(a) * 0.13, 1.2 + k * 0.085, z + math.sin(a) * 0.13, squash=0.7)
        blob(p, M["leaf_light"], 0.1, 0, 2.15, z, squash=0.8)
    cyl(p, M["trunk"], 0.04, 0.85, 0, height + 0.425, 0, verts=10)
    for _ in range(16):
        blob(p, M[rng.choice(("sage", "olive"))], rng.uniform(0.13, 0.19), rng.uniform(-0.22, 0.22), rng.uniform(1.75, 2.1), rng.uniform(-0.45, 0.45), squash=0.75)
    for z in (-1.3, 1.3):
        for k in range(9):
            h = rng.uniform(0.45, 0.8)
            box(p, M["leaf_dark" if k % 2 else "leaf"], 0.012, h, 0.06, rng.uniform(-0.08, 0.08), height + h / 2, z + rng.uniform(-0.12, 0.12), rot_y=rng.uniform(0, math.pi), round_=0)
    for z in (-2.9, -1.9, -0.7, 0.7, 1.9, 2.9):
        for _ in range(3):
            blob(p, M[rng.choice(("leaf", "leaf_light"))], rng.uniform(0.13, 0.18), rng.uniform(-0.1, 0.1), height + 0.1 + rng.uniform(0, 0.08), z + rng.uniform(-0.2, 0.2), squash=0.7)
    for side in (-1, 1):
        for z in (-3.0, -2.2, -1.1, -0.3, 0.6, 1.5, 2.3, 3.0):
            for k in range(rng.randint(3, 6)):
                box(p, M["leaf" if k % 2 else "leaf_light"], 0.02, 0.05, 0.06, side * (deep / 2 + 0.035), height - 0.01 - k * 0.08, z + math.sin(k * 1.3) * 0.04, rot_y=rng.uniform(-0.6, 0.6), round_=0)
    block(p, -0.3, 0.3, -length / 2, length / 2)


def feature_board():
    """A freestanding team wall 6.8 m long along z in acoustic "felt" the scene tints per department, with a whiteboard of
    sticky notes, a pinboard, a clock and a low cabinet on its +x face. Origin at its middle on the floor. Markers: block."""
    p = piece("feature_board")
    length, height, face = 6.6, 2.5, 0.05
    rng = random.Random(5)
    box(p, M["bezel"], 0.12, 0.1, length, 0, 0.05, 0, round_=0)
    box(p, M["felt"], 0.1, height - 0.1, length, 0, height / 2 + 0.05, 0, round_=0.01)
    box(p, M["oak"], 0.14, 0.03, length + 0.04, 0, height + 0.015, 0, round_=0.006)
    box(p, M["alu"], 0.02, 1.15, 3.3, face + 0.01, 1.525, 1.3, round_=0.004)
    box(p, M["whiteboard"], 0.006, 1.05, 3.2, face + 0.023, 1.525, 1.3, round_=0)
    box(p, M["alu"], 0.06, 0.02, 3.2, face + 0.03, 0.95, 1.3, round_=0.003)
    for col in range(3):
        z0 = 2.9 - col * 3.2 / 3
        box(p, M["bezel"], 0.002, 0.025, 0.35, face + 0.027, 1.92, z0 - 0.25, round_=0)
        if col:
            box(p, M["bezel"], 0.002, 0.92, 0.006, face + 0.027, 1.52, z0, round_=0)
        for k in range((7, 4, 6)[col]):
            row, c = divmod(k, 3)
            box(p, M[rng.choice(("sticky_yellow", "sticky_pink", "sticky_green", "sticky_blue"))], 0.004, 0.2, 0.22, face + 0.029, 1.72 - row * 0.25, z0 - 0.21 - c * 0.32, round_=0)
    box(p, M["walnut"], 0.02, 1.1, 1.45, face + 0.01, 1.55, -1.325, round_=0.004)
    box(p, M["cork"], 0.006, 1.04, 1.39, face + 0.023, 1.55, -1.325, round_=0)
    for y, z, h, w in ((1.7, -0.93, 0.55, 0.42), (1.79, -1.42, 0.42, 0.36), (1.3, -1.42, 0.4, 0.36), (1.62, -1.81, 0.68, 0.28)):
        box(p, M["paper"], 0.003, h, w, face + 0.027, y, z, round_=0)
        box(p, M["fire_red"], 0.01, 0.02, 0.02, face + 0.031, y + h / 2 - 0.04, z, round_=0)
    for mat, r, depth, x in (("bezel", 0.17, 0.04, face + 0.02), ("ceramic", 0.15, 0.01, face + 0.042)):
        dial = cyl(p, M[mat], r, depth, x, 1.82, -2.75, verts=32)
        dial.rotation_euler = (0, math.radians(90), 0)
    box(p, M["bezel"], 0.004, 0.11, 0.012, face + 0.049, 1.875, -2.75, round_=0)
    box(p, M["bezel"], 0.004, 0.012, 0.08, face + 0.049, 1.82, -2.79, round_=0)
    box(p, M["oak"], 0.45, 0.7, 0.9, face + 0.225, 0.37, -2.75, round_=0.006)
    box(p, M["walnut"], 0.002, 0.6, 0.004, face + 0.451, 0.38, -2.75, round_=0)
    for z in (-2.71, -2.79):
        box(p, M["steel"], 0.02, 0.12, 0.012, face + 0.46, 0.5, z, round_=0)
    box(p, M["walnut"], 0.47, 0.03, 0.92, face + 0.225, 0.735, -2.75, round_=0.004)
    cyl(p, M["ceramic"], 0.04, 0.1, face + 0.3, 0.8, -2.42, verts=16)
    cyl(p, M["fire_red"], 0.04, 0.1, face + 0.2, 0.8, -2.55, verts=16)
    cyl(p, M["pot"], 0.09, 0.16, face + 0.25, 0.83, -3.0, verts=16)
    for dy, dz, r in ((0.17, 0, 0.13), (0.1, 0.08, 0.1), (0.12, -0.07, 0.1)):
        blob(p, M["leaf" if dz else "leaf_light"], r, face + 0.25, 0.83 + dy, -3.0 + dz, squash=0.8)
    block(p, -0.08, 0.08, -length / 2, length / 2)
    block(p, face, face + 0.47, -3.21, -2.29)


def feature_gallery():
    """A freestanding wall 6.8 m long along z painted deep green, with framed prints under picture lights, a bench and a
    floor plant on its +x face. Origin at its middle on the floor. Markers: block."""
    p = piece("feature_gallery")
    length, height, face = 6.6, 2.5, 0.06
    box(p, M["bezel"], 0.14, 0.1, length, 0, 0.05, 0, round_=0)
    box(p, M["gallery_paint"], 0.12, height - 0.1, length, 0, height / 2 + 0.05, 0, round_=0.01)
    box(p, M["walnut"], 0.16, 0.03, length + 0.04, 0, height + 0.015, 0, round_=0.006)
    # (left, bottom, width, height) as seen from the desks, left at +z; then the print's ground, band and sun.
    frames = (
        (0.55, 1.0, 0.75, 1.0, "paper", "foos_blue", "bean_orange"),
        (1.45, 1.55, 0.55, 0.5, "foos_blue", "paper", None),
        (1.45, 1.0, 0.55, 0.42, "bean_orange", "bezel", None),
        (2.15, 1.05, 1.15, 0.85, "sage", "tt_green", "paper"),
        (3.45, 1.5, 0.5, 0.55, "sage", "fire_red", None),
        (3.45, 1.0, 0.5, 0.38, "coat_navy", "bean_orange", None),
        (4.1, 1.0, 0.9, 1.05, "coat_camel", "walnut", "fire_red"),
        (5.15, 1.5, 0.6, 0.5, "tt_green", "bean_orange", None),
        (5.15, 1.0, 0.6, 0.38, "paper", "foos_blue", None),
    )
    for i, (left, bottom, w, h, ground, band, sun) in enumerate(frames):
        z, y = length / 2 + 0.1 - left - w / 2, bottom + h / 2
        m = min(w, h) * 0.17
        pw, ph = w - 2 * m, h - 2 * m
        box(p, M["oak" if i % 3 == 1 else "bezel"], 0.03, h, w, face + 0.015, y, z, round_=0.003)
        box(p, M["paper"], 0.004, h - 0.07, w - 0.07, face + 0.031, y, z, round_=0)
        box(p, M[ground], 0.003, ph, pw, face + 0.034, y, z, round_=0)
        if sun:
            box(p, M[band], 0.003, ph * 0.35, pw, face + 0.037, bottom + m + ph * 0.175, z, round_=0)
            dot = cyl(p, M[sun], min(pw, ph) * 0.16, 0.003, face + 0.037, bottom + m + ph * 0.66, z + pw * (0.2 if i else -0.2), verts=32)
            dot.rotation_euler = (0, math.radians(90), 0)
            box(p, M["brass"], 0.06, 0.03, 0.3, face + 0.09, bottom + h + 0.085, z, round_=0.005)
            box(p, M["brass"], 0.06, 0.012, 0.012, face + 0.03, bottom + h + 0.085, z, round_=0)
        elif i % 3 == 1:
            box(p, M[band], 0.003, ph * 0.4, pw, face + 0.037, bottom + m + ph * 0.2, z, round_=0)
        else:
            box(p, M[band], 0.003, ph, pw / 2, face + 0.037, y, z - pw / 4, round_=0)
    box(p, M["oak"], 0.4, 0.05, 3.9, face + 0.29, 0.435, -0.05, round_=0.008)
    for z in (1.75, -0.05, -1.8):
        box(p, M["steel"], 0.34, 0.41, 0.04, face + 0.29, 0.205, z, round_=0.004)
    pot = piece("feature_gallery_plant")
    pot.parent = p
    pot.location = to_blender(face + 0.45, 0, -2.85)
    plant_parts(pot, 0.2, 0.42, [(0, 1.15, 0, 0.3), (0.15, 0.95, 0.08, 0.24), (-0.14, 1.0, -0.06, 0.25), (0.05, 0.8, -0.18, 0.2), (-0.08, 1.35, 0.1, 0.2)])
    cyl(pot, M["trunk"], 0.025, 0.7, 0, 0.75, 0, verts=8)
    block(p, -0.08, 0.08, -length / 2, length / 2)
    block(p, face + 0.08, face + 0.5, -2.05, 1.95)
    block(p, face + 0.2, face + 0.7, -3.15, -2.55)


def feature_shelf():
    """Freestanding open oak shelving 6.8 m long along z, 0.4 m deep and 2.3 m high: six bays of five shelves with books,
    small plants and pots, open to both sides. Origin at its middle on the floor. Markers: block."""
    p = piece("feature_shelf")
    length, height, deep, bays = 6.8, 2.3, 0.4, 6
    rng = random.Random(11)
    bay = length / bays
    for n in range(bays + 1):
        box(p, M["oak"], deep, height, 0.03, 0, height / 2, -length / 2 + n * bay, round_=0.004)
    levels = [0.08 + i * 0.44 for i in range(6)]
    for y in levels:
        box(p, M["oak"], deep, 0.03, length, 0, y, 0, round_=0.004)
    books = ("walnut", "sage", "fire_red", "foos_blue", "bean_orange", "paper", "coat_camel", "coat_navy", "tt_green", "upholstery")
    for b in range(bays):
        z0 = -length / 2 + b * bay + 0.03
        for y in levels[:-1]:
            base = y + 0.015
            pick = rng.random()
            if pick < 0.15:
                continue
            if pick < 0.3:
                pz = z0 + rng.uniform(0.25, bay - 0.25)
                cyl(p, M["pot"], 0.08, 0.14, 0, base + 0.07, pz, verts=16)
                blob(p, M[rng.choice(("leaf", "leaf_light"))], 0.12, 0, base + 0.2, pz, squash=0.8)
                continue
            z = z0 + 0.03
            end = z0 + (bay - 0.06) * rng.uniform(0.45, 0.9)
            while z < end:
                w = rng.uniform(0.025, 0.045)
                h = rng.uniform(0.2, 0.32)
                box(p, M[rng.choice(books)], rng.uniform(0.16, 0.22), h, w, rng.uniform(-0.03, 0.03), base + h / 2, z + w / 2, round_=0)
                z += w + 0.004
            if pick > 0.8 and end < z0 + bay - 0.25:
                r = rng.uniform(0.05, 0.08)
                cyl(p, M["ceramic"], r, rng.uniform(0.12, 0.24), 0, base + 0.09, (end + z0 + bay - 0.03) / 2, verts=16)
    block(p, -deep / 2, deep / 2, -length / 2, length / 2)


def feature_display():
    """Freestanding open oak shelving like feature_shelf, holding team things instead of mostly books: trophies, framed
    photos, board games, Lego, plants and vases. Origin at its middle on the floor. Markers: block."""
    p = piece("feature_display")
    length, height, deep, bays = 6.8, 2.3, 0.4, 6
    rng = random.Random(13)
    bay = length / bays
    for n in range(bays + 1):
        box(p, M["oak"], deep, height, 0.03, 0, height / 2, -length / 2 + n * bay, round_=0.004)
    levels = [0.08 + i * 0.44 for i in range(6)]
    for y in levels:
        box(p, M["oak"], deep, 0.03, length, 0, y, 0, round_=0.004)
    books = ("walnut", "sage", "fire_red", "foos_blue", "bean_orange", "paper", "coat_camel", "coat_navy", "tt_green", "upholstery")

    def trophy(base, z, facing):
        box(p, M["bezel"], 0.12, 0.04, 0.12, 0, base + 0.02, z, round_=0.004)
        cyl(p, M["brass"], 0.012, 0.08, 0, base + 0.08, z, verts=10)
        cyl(p, M["brass"], 0.03, 0.12, 0, base + 0.18, z, verts=16, r_top=0.065)

    def photo(base, z, facing):
        box(p, M["bezel"], 0.02, 0.26, 0.2, facing * 0.05, base + 0.13, z, round_=0.003)
        box(p, M[rng.choice(("paper", "sage", "foos_blue"))], 0.004, 0.2, 0.14, facing * 0.061, base + 0.13, z, round_=0)

    def games(base, z, facing):
        for k, mat in enumerate(("fire_red", "foos_blue", "panel_reset")):
            box(p, M[mat], 0.3, 0.055, 0.42 - k * 0.03, 0, base + 0.03 + k * 0.057, z, round_=0.003)

    def plant(base, z, facing):
        cyl(p, M["pot"], 0.075, 0.13, 0, base + 0.065, z, verts=16)
        blob(p, M[rng.choice(("leaf", "leaf_light"))], 0.12, 0, base + 0.2, z, squash=0.8)

    def lego(base, z, facing):
        box(p, M["foos_blue"], 0.16, 0.08, 0.26, 0, base + 0.04, z, round_=0)
        box(p, M["fire_red"], 0.12, 0.08, 0.18, 0, base + 0.12, z, round_=0)
        box(p, M["panel_reset"], 0.08, 0.1, 0.1, 0, base + 0.21, z, round_=0)

    def vase(base, z, facing):
        r, h = rng.uniform(0.05, 0.08), rng.uniform(0.14, 0.26)
        cyl(p, M[rng.choice(("ceramic", "sage", "bean_orange"))], r, h, 0, base + h / 2, z, verts=16)

    things = (trophy, photo, games, plant, lego, vase)
    for b in range(bays):
        z0 = -length / 2 + b * bay + 0.03
        room = bay - 0.06
        for li, y in enumerate(levels[:-1]):
            base = y + 0.015
            facing = 1 if (b + li) % 2 else -1
            pick = rng.random()
            if pick < 0.1:
                continue
            if pick < 0.5:
                z = z0 + 0.03
                end = z0 + room * rng.uniform(0.3, 0.45)
                while z < end:
                    w = rng.uniform(0.025, 0.045)
                    h = rng.uniform(0.2, 0.32)
                    box(p, M[rng.choice(books)], rng.uniform(0.16, 0.22), h, w, rng.uniform(-0.03, 0.03), base + h / 2, z + w / 2, round_=0)
                    z += w + 0.004
                rng.choice(things)(base, (end + z0 + room) / 2, facing)
            else:
                rng.choice(things)(base, z0 + room * 0.28, facing)
                rng.choice(things)(base, z0 + room * 0.75, facing)
    for b in (0, 4):
        plant(levels[-1] + 0.015, -length / 2 + (b + 0.5) * bay, 1)
    block(p, -deep / 2, deep / 2, -length / 2, length / 2)


def chair_stack(p, x, z, count):
    """Stacked upholstered chairs, seats toward -z."""
    for sx in (-0.21, 0.21):
        for sz in (-0.19, 0.19):
            box(p, M["steel"], 0.024, 0.44, 0.024, x + sx, 0.22, z + sz, round_=0)
    for k in range(count):
        box(p, M["upholstery"], 0.46, 0.045, 0.44, x, 0.465 + k * 0.06, z, round_=0.01)
    box(p, M["upholstery"], 0.46, 0.4 + (count - 1) * 0.06, 0.05, x, 0.69 + (count - 1) * 0.03, z + 0.24, round_=0.01)
    block(p, x - 0.3, x + 0.3, z - 0.3, z + 0.32)


def town_hall():
    """The town hall, 12 x 12 m in the floor's corner, open on its two inner sides: three tiers of oak seating with
    cushions in an L along the windows on -z and +x, facing a media wall set at 45 degrees with a big screen
    ("hall_screen", painted by the scene) over a low stage, a lectern and a speaker either side. Spare chairs and
    stools past the ends of the seating. Markers: block."""
    p = piece("town_hall")
    box(p, M["hall_carpet"], 11.65, 0.02, 11.65, 0.025, 0.01, -0.025, round_=0)

    # Seating: 0.4 m risers, 0.9 m treads, each wing 8.8 m from the corner; steps at half the rise up both open ends.
    # The two wings mirror each other across the corner's diagonal.
    bz, bx, x_end, z_end = -5.8, 5.8, -3.0, 3.0
    for k in range(3):
        deep = 0.9 * (3 - k)
        y = 0.2 + 0.4 * k
        box(p, M["oak"], bx - x_end, 0.4, deep, (x_end + bx) / 2, y, bz + deep / 2, round_=0.008)
        box(p, M["oak"], deep, 0.4, z_end - bz - deep, bx - deep / 2, y, (bz + deep + z_end) / 2, round_=0.008)
        run = bx - deep - x_end
        count = int(run // 1.5)
        for n in range(count):
            pad = M["upholstery" if k % 2 == 0 else "sage"]
            along = (run - count * 1.5) / 2 + 0.75 + n * 1.5
            box(p, pad, 1.42, 0.06, 0.5, x_end + along, 0.43 + 0.4 * k, bz + deep - 0.3, round_=0.02)
            box(p, pad, 0.5, 0.06, 1.42, bx - deep + 0.3, 0.43 + 0.4 * k, z_end - along, round_=0.02)
    seat = bz + 2.7
    for j in range(6):
        h = 0.2 * (j + 1)
        box(p, M["oak"], 0.8, h, 0.45, x_end - 0.4, h / 2, seat - 0.45 * j - 0.225, round_=0.006)
        box(p, M["oak"], 0.45, h, 0.8, -seat + 0.45 * j + 0.225, h / 2, z_end + 0.4, round_=0.006)
    # A rail along both windows, 0.9 m over the top tier.
    for x in (x_end - 0.75, -0.2, 2.6):
        box(p, M["steel"], 0.04, 0.9, 0.04, x, 1.65, bz + 0.05, round_=0.004)
        box(p, M["steel"], 0.04, 0.9, 0.04, bx - 0.05, 1.65, -x, round_=0.004)
    box(p, M["steel"], 0.04, 0.9, 0.04, bx - 0.05, 1.65, bz + 0.05, round_=0.004)
    box(p, M["steel"], bx - x_end + 0.8, 0.05, 0.05, (x_end - 0.8 + bx) / 2, 2.1, bz + 0.05, round_=0.006)
    box(p, M["steel"], 0.05, 0.05, z_end + 0.8 - bz, bx - 0.05, 2.1, (bz + z_end + 0.8) / 2, round_=0.006)
    block(p, x_end - 0.8, bx, bz, seat)
    block(p, bx - 2.7, bx, seat, z_end + 0.8)

    # Media wall across the corner: charcoal toward the seats with the screen, oak slats on the back. Laid out
    # along the wall (u) and out from it toward the seats (v).
    cx, cz, turn, r = -2.5, 2.5, -math.pi / 4, math.sqrt(0.5)

    def at(u, v):
        return cx + (u + v) * r, cz + (u - v) * r

    ww, wh = 8.0, 3.1
    x, z = at(0, 0)
    box(p, M["media_wall"], ww, wh, 0.2, x, wh / 2, z, turn, round_=0.01)
    for n in range(40):
        x, z = at(-ww / 2 + 0.1 + n * 0.2, -0.115)
        box(p, M["oak"], 0.07, wh - 0.1, 0.03, x, wh / 2, z, turn, round_=0)
    x, z = at(0, 0.125)
    box(p, M["bezel"], 3.7, 2.12, 0.05, x, 1.95, z, turn, round_=0.01)
    x, z = at(0, 0.152)
    face_plane(p, M["hall_screen"], 3.6, 2.025, x, 1.95, z, -1, turn=3 * math.pi / 4)
    # Stage, lectern with a gooseneck mic, and a speaker on a stand either side.
    x, z = at(0, 1.0)
    box(p, M["print_carpet"], 6.4, 0.2, 1.8, x, 0.1, z, turn, round_=0.01)
    x, z = at(-2.4, 1.15)
    box(p, M["walnut"], 0.6, 1.05, 0.45, x, 0.725, z, turn, round_=0.01)
    box(p, M["bezel"], 0.64, 0.03, 0.5, x, 1.265, z, turn, round_=0.006)
    x, z = at(-2.4, 1.33)
    cyl(p, M["steel"], 0.006, 0.32, x, 1.44, z, verts=8)
    cyl(p, M["bezel"], 0.018, 0.06, x, 1.62, z, verts=12)
    for side in (-1, 1):
        x, z = at(side * 3.8, 1.4)
        cyl(p, M["steel"], 0.28, 0.02, x, 0.01, z, verts=16)
        cyl(p, M["steel"], 0.02, 1.5, x, 0.77, z, verts=8)
        box(p, M["bezel"], 0.34, 0.52, 0.3, x, 1.78, z, turn, round_=0.02)
        x, z = at(side * 3.8, 1.555)
        box(p, M["mesh"], 0.3, 0.48, 0.01, x, 1.78, z, turn, round_=0)
    small_plant(p, "town_hall_plant_a", *at(-ww / 2 - 0.45, 0))
    small_plant(p, "town_hall_plant_b", *at(ww / 2 + 0.45, 0))
    # Blocks are square to the floor, so a run of small ones steps along the wall, stage and stands.
    for n in range(13):
        for v in (0.15, 0.85, 1.55):
            x, z = at(-4.2 + n * 0.7, v)
            block(p, x - 0.5, x + 0.5, z - 0.5, z + 0.5)

    # Spare chairs stacked by the +x windows past the steps, stools by the -z windows past the other steps.
    for z in (4.5, 5.15):
        chair_stack(p, 5.3, z, 6)
    for x in (-4.3, -4.95, -5.6):
        cyl(p, M["oak"], 0.19, 0.44, x, 0.22, -5.45, verts=20)
        cyl(p, M["upholstery"], 0.18, 0.04, x, 0.46, -5.45, verts=20)
    block(p, -5.82, -4.08, -5.67, -5.23)


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
    p = piece("ceiling_light")
    w, d = 1.2, 0.6
    box(p, M["trim"], w + 0.06, 0.012, 0.04, 0, -0.006, -d / 2, round_=0.003)
    box(p, M["trim"], w + 0.06, 0.012, 0.04, 0, -0.006, d / 2, round_=0.003)
    box(p, M["trim"], 0.04, 0.012, d, -w / 2, -0.006, 0, round_=0.003)
    box(p, M["trim"], 0.04, 0.012, d, w / 2, -0.006, 0, round_=0.003)
    box(p, M["diffuser"], w - 0.02, 0.005, d - 0.02, 0, 0.06, 0, round_=0)
    for k in range(-2, 3):
        box(p, M["louvre"], 0.012, 0.05, d - 0.02, k * (w / 5), 0.032, 0, round_=0)
    box(p, M["louvre"], w - 0.02, 0.05, 0.012, 0, 0.032, 0, round_=0)
    for side in (-1, 1):
        box(p, M["louvre"], w - 0.02, 0.06, 0.01, 0, 0.03, side * (d / 2 - 0.01), round_=0)
        box(p, M["louvre"], 0.01, 0.06, d - 0.02, side * (w / 2 - 0.01), 0.03, 0, round_=0)


def pod_screen():
    p = piece("pod_screen")
    box(p, M["felt"], 3.3, 1.2, 0.05, 0, 0.6, 0, round_=0.015)
    box(p, M["steel"], 3.32, 0.03, 0.07, 0, 1.215, 0, round_=0.005)
    for side in (-1, 1):
        box(p, M["felt"], 0.05, 1.05, 1.9, side * 1.66, 0.525, 0, round_=0.015)
        box(p, M["steel"], 0.07, 0.03, 1.92, side * 1.66, 1.065, 0, round_=0.005)
        for z in (-0.85, 0.85):
            box(p, M["steel"], 0.06, 0.04, 0.06, side * 1.66, 0.02, z, round_=0.005)


def sign_pillar():
    p = piece("sign_pillar")
    box(p, M["steel"], 0.36, 0.03, 0.36, 0, 0.015, 0, round_=0.008)
    # The post stops under the sign: it is thicker than the sign, so it would show through both faces.
    box(p, M["steel"], 0.1, 1.94, 0.1, 0, 0.97, 0, round_=0.01)
    box(p, M["steel"], 0.5, 0.04, 0.07, 0, 1.96, 0, round_=0.008)
    box(p, M["bezel"], 1.84, 0.64, 0.08, 0, 2.3, 0, round_=0.015)
    # One face each side, each turned so its text reads the right way round from that side.
    for face in (1, -1):
        bpy.ops.mesh.primitive_plane_add(size=1)
        board = bpy.context.active_object
        board.name = f"sign_pillar_face_{'front' if face > 0 else 'back'}"
        board.scale = (1.76, 0.56, 1)
        bpy.ops.object.transform_apply(scale=True)
        board.data.materials.append(M["sign_face"])
        place(board, p, 0, 2.3, face * 0.0415)
        board.rotation_euler = (math.radians(90), 0, 0 if face > 0 else math.pi)


def small_plant(parent, name, x, z):
    pot = piece(name)
    pot.parent = parent
    pot.location = to_blender(x, 0, z)
    plant_parts(pot, 0.2, 0.38, [(0, 0.75, 0, 0.3), (0.15, 0.6, 0.08, 0.22), (-0.14, 0.62, -0.06, 0.22)])


def reception():
    p = piece("reception")
    # A stone floor marks the area. Visitors come from the lifts on -z.
    box(p, M["tile"], 8.2, 0.012, 4.0, 0, 0.008, 1.3, round_=0)
    # One continuous counter on an arc bowing toward the lifts: short segments, each overlapping the next.
    radius, spread, count = 6.0, math.radians(38), 14
    centre = radius

    def on_arc(r, angle):
        return r * math.sin(angle), centre - r * math.cos(angle)

    step = 2 * spread / count
    for k in range(count):
        angle = -spread + (k + 0.5) * step
        for r, w, h, d, y, mat in (
            (radius + 0.06, 1.0, 1.05, 0.12, 0.525, "walnut"),
            (radius - 0.02, 1.0, 0.04, 0.36, 1.07, "stone_dark"),
            (radius - 0.42, 1.0, 0.04, 0.72, 0.74, "desk_top"),
        ):
            x, z = on_arc(r, angle)
            box(p, M[mat], 2 * r * math.sin(step / 2) * w * 1.04, h, d, x, y, z, rot_y=-angle, round_=0.005)
    for side in (-1, 1):
        x, z = on_arc(radius - 0.2, side * spread)
        box(p, M["walnut"], 0.1, 1.05, 0.9, x, 0.525, z, rot_y=-side * spread, round_=0.01)
    # The name panel, bent to the counter's curve so it sits flush; its UVs survive the bend.
    bpy.ops.mesh.primitive_plane_add(size=1)
    board = bpy.context.active_object
    board.name = "reception_face"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=15)
    bpy.ops.object.mode_set(mode="OBJECT")
    # The counter's outer face is at radius + 0.12; the panel stands just proud of it.
    panel_w, panel_h, face_r = 2.6, 0.42, radius + 0.14
    # Seen from the lifts (looking +z), +x is on the left, so the text runs toward -x.
    for v in board.data.vertices:
        u, h = -v.co.x * panel_w, v.co.y * panel_h
        angle = u / face_r
        v.co.x, v.co.y, v.co.z = face_r * math.sin(angle), -(centre - face_r * math.cos(angle)), h
    board.data.materials.append(M["sign_face"])
    place(board, p, 0, 0.62, 0)
    board.rotation_euler = (0, 0, 0)
    # The app draws one side only: the face must point at the lifts (three -z, Blender +y).
    board.data.update()
    if board.data.polygons[len(board.data.polygons) // 2].normal.y < 0:
        board.data.flip_normals()
    # Two stations behind it.
    for x in (-1.3, 1.3):
        cz = centre - math.sqrt(radius**2 - x**2)
        monitor(p, x, cz + 0.35, 1)
        box(p, M["keys"], 0.44, 0.02, 0.14, x, 0.77, cz + 0.62, round_=0.005)
        task_chair(p, x, cz + 1.3, 1)
        marker(p, "seat", x, cz + 1.3, math.pi)
    cyl(p, M["brass"], 0.05, 0.03, -2.4, 1.105, 0.5)
    cyl(p, M["brass"], 0.035, 0.03, -2.4, 1.13, 0.5)
    # A low credenza behind the stations and one plant at the end.
    box(p, M["walnut"], 5.0, 0.9, 0.5, 0, 0.45, 2.6, round_=0.02)
    box(p, M["stone_dark"], 5.1, 0.03, 0.54, 0, 0.915, 2.6, round_=0.01)
    box(p, M["bezel"], 0.45, 0.25, 0.35, 1.6, 1.055, 2.6, round_=0.02)
    small_plant(p, "reception_plant", -4.3, 2.2)
    marker(p, "block", 0, 0.3, w=4.6, d=0.9)
    for side in (-1, 1):
        marker(p, "block", side * 3.0, 1.0, w=1.6, d=1.0)
    marker(p, "block", 0, 2.6, w=5.1, d=0.6)


def armchair(p, x, z, facing):
    """facing: +1 looks toward +z."""
    back = -facing
    box(p, M["upholstery"], 0.8, 0.42, 0.78, x, 0.21, z, round_=0.06)
    box(p, M["upholstery"], 0.8, 0.45, 0.18, x, 0.62, z + back * 0.3, round_=0.05)
    for side in (-1, 1):
        box(p, M["upholstery"], 0.14, 0.58, 0.78, x + side * 0.33, 0.29, z, round_=0.04)
    marker(p, "seat", x, z, 0.0 if facing > 0 else math.pi)


def waiting_room():
    p = piece("waiting_room")
    box(p, M["rug"], 4.4, 0.01, 3.4, 0, 0.012, -0.4, round_=0)
    # A sofa with its back to the windows, two armchairs facing it across a low table.
    box(p, M["upholstery"], 2.2, 0.42, 0.85, 0, 0.21, -2.2, round_=0.06)
    box(p, M["upholstery"], 2.2, 0.48, 0.22, 0, 0.62, -2.52, round_=0.06)
    for side in (-1, 1):
        box(p, M["upholstery"], 0.22, 0.62, 0.85, side * 1.0, 0.31, -2.2, round_=0.05)
    for x in (-0.68, 0, 0.68):
        box(p, M["upholstery"], 0.62, 0.1, 0.6, x, 0.47, -2.14, round_=0.04)
        marker(p, "seat", x, -2.1, 0.0)
    for x in (-0.8, 0.8):
        armchair(p, x, 0.6, -1)
    box(p, M["walnut"], 1.2, 0.04, 0.6, 0, 0.4, -0.8, round_=0.01)
    for sx in (-0.52, 0.52):
        for sz in (-0.24, 0.24):
            box(p, M["steel"], 0.04, 0.38, 0.04, sx, 0.19, -0.8 + sz, round_=0.005)
    for k, (dx, colour) in enumerate(((-0.3, "chalk"), (0.05, "red"), (0.3, "ceramic"))):
        box(p, M[colour], 0.22, 0.012, 0.3, dx, 0.426 + k * 0.004, -0.8, rot_y=0.2 * (k - 1), round_=0)
    # A water cooler and plants in the corners.
    box(p, M["ceramic"], 0.34, 1.0, 0.34, 2.5, 0.5, -2.5, round_=0.03)
    cyl(p, M["glass_dark"], 0.15, 0.42, 2.5, 1.22, -2.5)
    small_plant(p, "waiting_plant_l", -2.5, -2.5)
    small_plant(p, "waiting_plant_r", 2.5, 1.9)
    marker(p, "block", 0, -2.25, w=2.4, d=0.9)
    marker(p, "block", 0, -0.8, w=1.3, d=0.7)
    for x in (-0.8, 0.8):
        marker(p, "block", x, 0.6, w=0.85, d=0.85)


def meeting_table(p, length, x, z, chairs):
    box(p, M["walnut"], length, 0.05, 1.4, x, 0.74, z, round_=0.02)
    for sx in (-1, 1):
        box(p, M["steel"], 0.12, 0.7, 0.9, x + sx * (length / 2 - 0.5), 0.36, z, round_=0.01)
    pitch = length / chairs
    for k in range(chairs):
        cx = x - length / 2 + pitch * (k + 0.5)
        for side in (-1, 1):
            task_chair(p, cx, z + side * 1.05, side)
            marker(p, "seat", cx, z + side * 1.05, math.pi if side > 0 else 0.0)
    marker(p, "block", x, z, w=length + 0.2, d=1.5)


def screen_stand(p, x, z, facing_x, width=1.9):
    """A wall-sized display on a floor stand, its screen toward +x when facing_x is 1."""
    rot = -facing_x * math.pi / 2
    box(p, M["steel"], 0.9, 0.04, 0.5, x, 0.02, z, rot_y=rot, round_=0.01)
    box(p, M["steel"], 0.08, 1.4, 0.08, x, 0.72, z, round_=0.01)
    box(p, M["bezel"], 0.06, width * 0.58, width, x + facing_x * 0.06, 1.45, z, round_=0.01)
    box(p, M["screen"], 0.01, width * 0.54, width - 0.08, x + facing_x * 0.095, 1.45, z, round_=0)
    marker(p, "block", x, z, w=0.6, d=width)


def conference_room():
    p = piece("conference_room")
    box(p, M["rug"], 7.6, 0.01, 4.6, 0, 0.012, -0.2, round_=0)
    meeting_table(p, 5.2, 0.3, -0.2, 6)
    screen_stand(p, -3.9, -0.2, 1, width=2.4)
    box(p, M["walnut"], 3.0, 0.75, 0.45, 1.0, 0.375, 3.0, round_=0.02)
    box(p, M["stone_dark"], 3.1, 0.03, 0.49, 1.0, 0.765, 3.0, round_=0.01)
    for k in range(3):
        cyl(p, M["cup"], 0.04, 0.1, 0.4 + k * 0.25, 0.83, 3.0, r_top=0.05)
    cyl(p, M["alu"], 0.08, 0.28, -0.3, 0.92, 3.0, r_top=0.06)
    marker(p, "block", 1.0, 3.0, w=3.1, d=0.5)


def meeting_room():
    p = piece("meeting_room")
    box(p, M["rug"], 4.0, 0.01, 4.0, 0, 0.012, 0.0, round_=0)
    meeting_table(p, 2.4, -0.3, 0.0, 3)
    screen_stand(p, 1.95, 0.0, -1, width=1.6)


def call_unit(p, x, y, z):
    """A UK manual call point centred at x, y with its back on z: red housing on a back box, its front
    a "call_face" the scene paints. Clicked in the app to raise the alarm."""
    box(p, M["fire_red"], 0.095, 0.095, 0.022, x, y, z + 0.011, round_=0.008)
    box(p, M["fire_red"], 0.089, 0.089, 0.024, x, y, z + 0.034, round_=0.012)
    box(p, M["ceramic"], 0.074, 0.074, 0.006, x, y, z + 0.0475, round_=0.004)
    bpy.ops.mesh.primitive_plane_add(size=1)
    face = bpy.context.active_object
    face.name = f"{p.name}_face"
    face.scale = (0.07, 0.07, 1)
    bpy.ops.object.transform_apply(scale=True)
    face.data.materials.append(M["call_face"])
    place(face, p, x, y, z + 0.051)
    face.rotation_euler = (math.radians(90), 0, 0)


def call_point():
    p = piece("call_point")
    call_unit(p, 0, 1.4, 0)


def call_post():
    """A short post for a call point where the wall is glass."""
    p = piece("call_post")
    box(p, M["steel"], 0.24, 0.02, 0.24, 0, 0.01, 0, round_=0.006)
    box(p, M["steel"], 0.07, 1.52, 0.07, 0, 0.77, 0, round_=0.01)
    box(p, M["steel"], 0.09, 0.02, 0.09, 0, 1.54, 0, round_=0.005)
    call_unit(p, 0, 1.4, 0.035)


def smoke_detector():
    """A European combined unit: sounder-beacon base (grille and a red lens ring the scene flashes
    during an alarm) with the smoke detector head fitted underneath. Origin at the ceiling surface."""
    p = piece("smoke_detector")
    cyl(p, M["trim"], 0.08, 0.02, 0, -0.01, 0, verts=32)
    for k in range(16):
        a = k * 2 * math.pi / 16
        box(p, M["chalk"], 0.012, 0.012, 0.003, math.cos(a) * 0.081, -0.01, math.sin(a) * 0.081, rot_y=-a + math.pi / 2, round_=0)
    cyl(p, M["strobe"], 0.072, 0.012, 0, -0.026, 0, verts=32)
    cyl(p, M["ceramic"], 0.055, 0.03, 0, -0.047, 0, verts=32, r_top=0.06)
    cyl(p, M["trim"], 0.04, 0.008, 0, -0.066, 0, verts=24)
    box(p, M["red"], 0.008, 0.004, 0.008, 0.035, -0.064, 0, round_=0)


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
lift_door()
stairwell()
toilets()
wc_door("wc_door", 0.814, False)
wc_door("wc_door_accessible", 0.914, True)
cubicle_door()
hand_dryer()
tap()
plant_room()
breaker()
server_room()
server_rack()
server_unit()
breakout()
printer()
print_room()
pod_door()
phone_pods()
locker_door()
arrival_hub()
feature_planter()
feature_board()
feature_gallery()
feature_shelf()
feature_display()
town_hall()
fire_door()
ceiling_light()
pod_screen()
sign_pillar()
reception()
waiting_room()
conference_room()
meeting_room()
call_point()
call_post()
smoke_detector()
sofa()
low_table()
merge()

os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
# export_extras carries the marker properties through to three.js userData.
bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=False, export_apply=True, export_yup=True, export_extras=True)
print(f"office: {len([o for o in bpy.data.objects if o.parent is None])} pieces -> {GLB}")


def copy_piece(name, x, z, rot_y=0.0):
    original = bpy.data.objects[name]
    copy = original.copy()
    bpy.context.scene.collection.objects.link(copy)
    for child in list(original.children):
        c = child.copy()
        c.parent = copy
        bpy.context.scene.collection.objects.link(c)
    copy.location = to_blender(x, 0, z)
    copy.rotation_euler = (0, 0, rot_y)


def preview():
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(material("floor", "#bdb6a8", 0.9))
    pieces = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == "EMPTY"}
    layout = {
        "workstation": (-3, 0, 0),
        "exec_desk": (2, 0, 0.4),
        "plant": (4.2, 0, -1),
        "kitchen": (0, 0, -10),
        "lift_core": (12, 0, -3),
        "sofa": (0.5, 0, -3.3),
        "low_table": (0.5, 0, -2.1),
        "pod_screen": (-9, 0, 7.5),
    }
    pieces["ceiling_light"].location = to_blender(-15, 2.0, 0)
    for name, (x, y, z) in layout.items():
        pieces[name].location = to_blender(x, y, z)
    for k in range(3):
        for j in range(2):
            copy_piece("workstation", -8 - j * 2.2, -1 + k * 2.2)
    for dx in (-0.82, 0.82):
        copy_piece("workstation", -9 + dx, 7.5 + 0.45, math.pi)
        copy_piece("workstation", -9 + dx, 7.5 - 0.45)
    shots = {
        "office-overview": (to_blender(6, 9, 10), to_blender(-1, 0, -2), 55),
        "office-your-desk": (to_blender(2, 1.2, 1.55), to_blender(2, 0.95, -1), 70),
        "office-workstations": (to_blender(-5, 1.7, 4), to_blender(-9, 0.7, 0), 50),
        "office-pod": (to_blender(-5.5, 3.2, 11.5), to_blender(-9, 0.6, 7.5), 50),
        "office-kitchen": (to_blender(7, 7, -1), to_blender(0, 0.6, -10.5), 60),
        "office-ceiling-light": (to_blender(-14.6, 0.5, -0.4), to_blender(-15, 2.0, 0), 45),
    }
    render_previews(shots, "#cfe2f2", 0.8, 3.5, 45, 30, "AgX")


if PREVIEW:
    preview()
