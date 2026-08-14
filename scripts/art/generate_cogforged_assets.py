#!/usr/bin/env python3
"""
Comprehensive Cogforged Asset Generator for Starhaven.
Generates all 11 buildings and 2 units with grand architectural depth,
multi-tier geometry, intricate copper pipes, glowing amber furnace windows,
gear domes, and thousands of painted colors.
"""
import math
import os
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from cogforged_engine import CogforgedRenderer

OUT_DIR = "/Users/prateekranka/Cowork/starhaven-checkpoint-3b/media/sprites"
os.makedirs(OUT_DIR, exist_ok=True)

def generate_foundry_core_tc():
    """1. bldg-cog-tc.png — Foundry Core (grand town center, 840x898)"""
    w, h = 840, 898
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Base Tier 1 - Grand stone and iron foundry foundation
    ren.draw_iso_block(-160, -160, 0, 320, 320, 30, mat="stone", origin=orig)
    ren.draw_iso_block(-140, -140, 30, 280, 280, 20, mat="iron", origin=orig)
    
    # Tier 2 - Massive lower furnace block with bastions
    ren.draw_iso_block(-120, -120, 50, 240, 240, 70, mat="brass", origin=orig)
    # Corner bastions
    for bx, by in [(-130, -130), (70, -130), (-130, 70), (70, 70)]:
        ren.draw_iso_block(bx, by, 50, 60, 60, 85, mat="copper", origin=orig)
        ren.draw_iso_cylinder(bx + 30, by + 30, 135, 24, 25, mat="brass", origin=orig)
        ren.draw_iso_dome(bx + 30, by + 30, 160, 24, mat="copper", origin=orig)

    # Tier 3 - Central Grand Foundry Hall
    ren.draw_iso_block(-85, -85, 120, 170, 170, 90, mat="steel", origin=orig)
    # Reinforced brass buttresses
    for offset in [-70, -20, 30]:
        ren.draw_iso_block(offset, -95, 120, 30, 15, 80, mat="brass", origin=orig)
        ren.draw_iso_block(offset, 80, 120, 30, 15, 80, mat="brass", origin=orig)
        ren.draw_iso_block(-95, offset, 120, 15, 30, 80, mat="brass", origin=orig)
        ren.draw_iso_block(80, offset, 120, 15, 30, 80, mat="brass", origin=orig)

    # Tier 4 - Upper Grand Gear Chamber
    ren.draw_iso_cylinder(0, 0, 210, 75, 45, mat="iron", segments=24, origin=orig)
    ren.draw_iso_gear(0, 0, 255, 85, teeth=12, thickness=18, mat="brass", origin=orig)
    ren.draw_iso_dome(0, 0, 273, 68, mat="copper", rings=12, segments=24, origin=orig)
    
    # Master Clockwork Spire on top
    ren.draw_iso_cylinder(0, 0, 341, 18, 60, mat="steel", origin=orig)
    ren.draw_iso_gear(0, 0, 401, 32, teeth=8, thickness=10, mat="brass", origin=orig)
    ren.draw_iso_cylinder(0, 0, 411, 8, 50, mat="copper", origin=orig)
    ren.draw_iso_dome(0, 0, 461, 8, mat="glow", rings=6, segments=12, origin=orig)

    # Glowing Furnace Windows & Ports
    p_win1 = ren.iso_to_screen(0, 122, 65, *orig)
    ren.draw_furnace_window(p_win1[0] - 25, p_win1[1] - 30, 50, 45)
    
    p_win2 = ren.iso_to_screen(86, 0, 140, *orig)
    ren.draw_furnace_window(p_win2[0] - 18, p_win2[1] - 25, 36, 40)

    p_win3 = ren.iso_to_screen(0, 86, 140, *orig)
    ren.draw_furnace_window(p_win3[0] - 18, p_win3[1] - 25, 36, 40)
    
    # Side archways & forge portals
    p_portal = ren.iso_to_screen(122, 0, 65, *orig)
    ren.draw_furnace_window(p_portal[0] - 25, p_portal[1] - 30, 50, 45)

    # Complex Relay Pipes connecting bastions and core
    p_b1 = ren.iso_to_screen(70, -100, 140, *orig)
    p_b2 = ren.iso_to_screen(0, -70, 220, *orig)
    ren.draw_pipe(p_b1, p_b2, radius=5, mat="copper")
    
    p_c1 = ren.iso_to_screen(-100, 70, 140, *orig)
    p_c2 = ren.iso_to_screen(-70, 0, 220, *orig)
    ren.draw_pipe(p_c1, p_c2, radius=5, mat="copper")

    p_d1 = ren.iso_to_screen(70, 70, 140, *orig)
    p_d2 = ren.iso_to_screen(60, 60, 220, *orig)
    ren.draw_pipe(p_d1, p_d2, radius=6, mat="brass")

    # Final painterly composite
    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "bldg-cog-tc.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_capacitor_hut_house():
    """2. bldg-cog-house.png — Capacitor Hut (small dwelling, 820x929)"""
    w, h = 820, 929
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Foundation
    ren.draw_iso_block(-90, -90, 0, 180, 180, 25, mat="stone", origin=orig)
    ren.draw_iso_block(-80, -80, 25, 160, 160, 15, mat="iron", origin=orig)
    
    # Main hut body - Octagonal / brass cylinder with coils
    ren.draw_iso_cylinder(0, 0, 40, 70, 80, mat="brass", segments=18, origin=orig)
    
    # Capacitor Induction Coils wrapped around body
    for cz in [60, 80, 100]:
        ren.draw_iso_cylinder(0, 0, cz, 76, 8, mat="copper", segments=18, origin=orig)
        
    # Roof - Steep copper gear-cone
    ren.draw_iso_gear(0, 0, 120, 82, teeth=10, thickness=14, mat="iron", origin=orig)
    ren.draw_iso_dome(0, 0, 134, 65, mat="copper", rings=10, segments=20, origin=orig)
    
    # Top capacitor insulator pylon
    ren.draw_iso_cylinder(0, 0, 199, 12, 40, mat="steel", origin=orig)
    ren.draw_iso_dome(0, 0, 239, 18, mat="glow", rings=6, segments=12, origin=orig)
    
    # Glowing window & door
    p_door = ren.iso_to_screen(0, 72, 45, *orig)
    ren.draw_furnace_window(p_door[0] - 16, p_door[1] - 25, 32, 45)
    
    p_win = ren.iso_to_screen(72, 0, 65, *orig)
    ren.draw_furnace_window(p_win[0] - 12, p_win[1] - 15, 24, 25)

    # Side accumulator battery tank
    ren.draw_iso_cylinder(-60, 60, 25, 22, 50, mat="steel", segments=12, origin=orig)
    ren.draw_iso_dome(-60, 60, 75, 22, mat="glow", rings=6, segments=12, origin=orig)
    
    # Connecting pipe
    p1 = ren.iso_to_screen(-60, 60, 65, *orig)
    p2 = ren.iso_to_screen(-30, 40, 75, *orig)
    ren.draw_pipe(p1, p2, radius=4, mat="copper")

    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-house.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_assembly_hall_rax():
    """3. bldg-cog-rax.png — Assembly Hall (barracks, 1008x942)"""
    w, h = 1008, 942
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Fortified Iron & Stone Foundation
    ren.draw_iso_block(-150, -120, 0, 300, 240, 30, mat="stone", origin=orig)
    ren.draw_iso_block(-135, -105, 30, 270, 210, 15, mat="iron", origin=orig)
    
    # Heavy Barracks Hallway
    ren.draw_iso_block(-120, -90, 45, 240, 180, 80, mat="steel", origin=orig)
    
    # Twin Assembly Bays with Cranes
    ren.draw_iso_block(-130, -80, 125, 110, 160, 50, mat="brass", origin=orig)
    ren.draw_iso_block(20, -80, 125, 110, 160, 50, mat="brass", origin=orig)
    
    # Heavy Ribs and Arches
    for x_off in [-110, -50, 40, 100]:
        ren.draw_iso_block(x_off, -95, 45, 20, 10, 140, mat="iron", origin=orig)
        ren.draw_iso_block(x_off, 85, 45, 20, 10, 140, mat="iron", origin=orig)
        
    # Twin Gear Roof Vents
    ren.draw_iso_gear(-75, 0, 175, 45, teeth=8, thickness=12, mat="copper", origin=orig)
    ren.draw_iso_dome(-75, 0, 187, 35, mat="brass", rings=8, segments=16, origin=orig)

    ren.draw_iso_gear(75, 0, 175, 45, teeth=8, thickness=12, mat="copper", origin=orig)
    ren.draw_iso_dome(75, 0, 187, 35, mat="brass", rings=8, segments=16, origin=orig)
    
    # Center Assembly Gate (Massive furnace door for automata)
    p_gate = ren.iso_to_screen(0, 92, 55, *orig)
    ren.draw_furnace_window(p_gate[0] - 35, p_gate[1] - 45, 70, 70)
    
    # Side Weaponry Vents
    p_v1 = ren.iso_to_screen(-80, 92, 70, *orig)
    ren.draw_furnace_window(p_v1[0] - 15, p_v1[1] - 20, 30, 35)

    p_v2 = ren.iso_to_screen(80, 92, 70, *orig)
    ren.draw_furnace_window(p_v2[0] - 15, p_v2[1] - 20, 30, 35)

    # Steam exhaust pipes
    p_ex1 = ren.iso_to_screen(-110, -70, 175, *orig)
    p_ex2 = ren.iso_to_screen(-110, -70, 230, *orig)
    ren.draw_pipe(p_ex1, p_ex2, radius=7, mat="steel")

    p_ex3 = ren.iso_to_screen(110, -70, 175, *orig)
    p_ex4 = ren.iso_to_screen(110, -70, 230, *orig)
    ren.draw_pipe(p_ex3, p_ex4, radius=7, mat="steel")

    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "bldg-cog-rax.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_flux_mill():
    """4. bldg-cog-mill.png — Flux Mill (1007x945)"""
    w, h = 1007, 945
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Foundation
    ren.draw_iso_block(-110, -110, 0, 220, 220, 30, mat="stone", origin=orig)
    
    # Lower Grinding Chamber
    ren.draw_iso_cylinder(0, 0, 30, 85, 70, mat="iron", segments=20, origin=orig)
    ren.draw_iso_gear(0, 0, 100, 95, teeth=12, thickness=15, mat="brass", origin=orig)
    
    # Upper Mill Tower
    ren.draw_iso_cylinder(0, 0, 115, 60, 90, mat="brass", segments=18, origin=orig)
    ren.draw_iso_dome(0, 0, 205, 55, mat="copper", rings=10, segments=20, origin=orig)
    
    # Giant Vertical Flux Wheel (facing side)
    wheel_center = (95, 0, 130)
    # Wheel axle
    ren.draw_iso_cylinder(60, 0, 130, 12, 40, mat="steel", segments=10, origin=orig)
    # Giant clockwork rotor
    p_wheel = ren.iso_to_screen(95, 0, 130, *orig)
    ren.draw.ellipse([p_wheel[0] - 80, p_wheel[1] - 80, p_wheel[0] + 80, p_wheel[1] + 80], fill=(*ren.COPPER_BASE, 255), outline=(*ren.OUTLINE, 255), width=4)
    ren.draw.ellipse([p_wheel[0] - 65, p_wheel[1] - 65, p_wheel[0] + 65, p_wheel[1] + 65], fill=(*ren.BRASS_LIGHT, 255), outline=(*ren.OUTLINE, 200), width=3)
    ren.draw.ellipse([p_wheel[0] - 30, p_wheel[1] - 30, p_wheel[0] + 30, p_wheel[1] + 30], fill=(*ren.GLOW_AMBER, 255))
    ren.draw.ellipse([p_wheel[0] - 15, p_wheel[1] - 15, p_wheel[0] + 15, p_wheel[1] + 15], fill=(*ren.GLOW_HOT, 255))
    # Wheel vanes
    for i in range(8):
        ang = i * math.pi / 4
        vx = int(p_wheel[0] + math.cos(ang) * 75)
        vy = int(p_wheel[1] + math.sin(ang) * 75)
        ren.draw.line([p_wheel, (vx, vy)], fill=(*ren.IRON_DARK, 255), width=4)

    # Flux Chutes & Hoppers
    ren.draw_iso_block(-70, 40, 30, 45, 45, 50, mat="copper", origin=orig)
    p_hopper = ren.iso_to_screen(-47, 62, 50, *orig)
    ren.draw_furnace_window(p_hopper[0] - 12, p_hopper[1] - 12, 24, 24)

    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "bldg-cog-mill.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_timber_relay_lumber():
    """5. bldg-cog-lumber.png — Timber Relay (512x480)"""
    w, h = 512, 480
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Base Platform
    ren.draw_iso_block(-70, -70, 0, 140, 140, 20, mat="stone", origin=orig)
    
    # Rotary Saw & Conveyor Housing
    ren.draw_iso_block(-50, -50, 20, 100, 100, 45, mat="iron", origin=orig)
    
    # Copper Conveyor Ramp
    ren.draw_iso_block(-60, 10, 20, 120, 30, 25, mat="copper", origin=orig)
    
    # Cut Timber / Log Stacks
    for lz in [20, 32]:
        for ly in [-35, -20]:
            ren.draw_iso_cylinder(30, ly, lz, 8, 35, mat="stone", segments=8, origin=orig)
            
    # Giant Clockwork Crane Mast
    ren.draw_iso_cylinder(-30, -30, 65, 12, 70, mat="steel", segments=10, origin=orig)
    ren.draw_iso_gear(-30, -30, 135, 22, teeth=8, thickness=8, mat="brass", origin=orig)
    
    # Crane Jib (Boom) extending over conveyor
    p_mast = ren.iso_to_screen(-30, -30, 140, *orig)
    p_jib = ren.iso_to_screen(30, 30, 125, *orig)
    ren.draw.line([p_mast, p_jib], fill=(*ren.BRASS_LIGHT, 255), width=6)
    ren.draw.line([p_mast, p_jib], fill=(*ren.IRON_DARK, 255), width=2)
    # Cable & Saw Hook
    p_hook = ren.iso_to_screen(30, 30, 65, *orig)
    ren.draw.line([p_jib, p_hook], fill=(*ren.STEEL_LIGHT, 255), width=2)
    # Glowing Rotary Saw Blade
    ren.draw.ellipse([p_hook[0] - 15, p_hook[1] - 15, p_hook[0] + 15, p_hook[1] + 15], fill=(*ren.GLOW_AMBER, 255), outline=(*ren.BRASS_SPEC, 255), width=2)

    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-lumber.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_ore_relay_mine():
    """6. bldg-cog-mine.png — Ore Relay (512x480)"""
    w, h = 512, 480
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Foundation
    ren.draw_iso_block(-75, -75, 0, 150, 150, 20, mat="stone", origin=orig)
    
    # Deep Mine Shaft Entrance (Dark void with glow)
    ren.draw_iso_block(-55, -55, 20, 110, 110, 40, mat="iron", origin=orig)
    
    # Headframe Tower (Steel lattice structure)
    ren.draw_iso_block(-40, -40, 60, 80, 80, 60, mat="steel", origin=orig)
    
    # Giant Mine Hoist Gear & Pulley
    ren.draw_iso_gear(0, 0, 120, 42, teeth=10, thickness=12, mat="brass", origin=orig)
    ren.draw_iso_dome(0, 0, 132, 28, mat="copper", rings=6, segments=12, origin=orig)
    
    # Glowing Ore Smelting Crucible / Chute
    p_ore = ren.iso_to_screen(0, 56, 30, *orig)
    ren.draw_furnace_window(p_ore[0] - 22, p_ore[1] - 20, 44, 30)

    # Ore Cart on rails
    ren.draw_iso_block(35, 25, 20, 30, 20, 18, mat="copper", origin=orig)
    
    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-mine.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_optic_spire():
    """7. bldg-cog-spire.png — Optic Spire (tall relay tower, 512x480)"""
    w, h = 512, 480
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.82))
    
    # Foundation Base
    ren.draw_iso_block(-50, -50, 0, 100, 100, 20, mat="stone", origin=orig)
    ren.draw_iso_cylinder(0, 0, 20, 40, 30, mat="iron", segments=16, origin=orig)
    
    # Lower Spire Shaft
    ren.draw_iso_cylinder(0, 0, 50, 30, 80, mat="brass", segments=16, origin=orig)
    ren.draw_iso_gear(0, 0, 130, 38, teeth=8, thickness=10, mat="copper", origin=orig)
    
    # Middle Spire Shaft
    ren.draw_iso_cylinder(0, 0, 140, 22, 90, mat="steel", segments=14, origin=orig)
    ren.draw_iso_gear(0, 0, 230, 28, teeth=8, thickness=8, mat="brass", origin=orig)
    
    # Upper Observatory & Optic Lens Housing
    ren.draw_iso_cylinder(0, 0, 238, 32, 35, mat="copper", segments=16, origin=orig)
    ren.draw_iso_dome(0, 0, 273, 28, mat="brass", rings=8, segments=16, origin=orig)
    
    # Giant Glowing Optic Eye / Core
    p_eye = ren.iso_to_screen(0, 28, 255, *orig)
    ren.draw_furnace_window(p_eye[0] - 15, p_eye[1] - 15, 30, 30)

    # Top Antenna / Lightning Spire
    p_top = ren.iso_to_screen(0, 0, 301, *orig)
    p_tip = ren.iso_to_screen(0, 0, 355, *orig)
    ren.draw.line([p_top, p_tip], fill=(*ren.BRASS_SPEC, 255), width=4)
    ren.draw.ellipse([p_tip[0] - 8, p_tip[1] - 8, p_tip[0] + 8, p_tip[1] + 8], fill=(*ren.GLOW_HOT, 255))

    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-spire.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_strider_bay_den():
    """8. bldg-cog-den.png — Strider Bay (open hangar for walkers, 512x480)"""
    w, h = 512, 480
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Foundation
    ren.draw_iso_block(-75, -75, 0, 150, 150, 20, mat="stone", origin=orig)
    
    # Massive Open Arched Hangar
    ren.draw_iso_block(-65, -65, 20, 130, 130, 50, mat="iron", origin=orig)
    
    # Reinforced Arch Pillars
    ren.draw_iso_block(-65, 45, 20, 30, 20, 70, mat="brass", origin=orig)
    ren.draw_iso_block(35, 45, 20, 30, 20, 70, mat="brass", origin=orig)
    
    # Domed Hangar Roof with Gantry Gears
    ren.draw_iso_gear(0, -10, 70, 55, teeth=10, thickness=12, mat="copper", origin=orig)
    ren.draw_iso_dome(0, -10, 82, 45, mat="steel", rings=8, segments=16, origin=orig)
    
    # Glowing Walker Charging Pad inside Hangar
    p_hangar = ren.iso_to_screen(0, 50, 35, *orig)
    ren.draw_furnace_window(p_hangar[0] - 25, p_hangar[1] - 30, 50, 45)
    
    # Gantry arm extending forward
    p_g1 = ren.iso_to_screen(0, 0, 85, *orig)
    p_g2 = ren.iso_to_screen(0, 60, 80, *orig)
    ren.draw_pipe(p_g1, p_g2, radius=5, mat="copper")

    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-den.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_siege_foundry_workshop():
    """9. bldg-cog-workshop.png — Siege Foundry (512x480)"""
    w, h = 512, 480
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.72))
    
    # Base
    ren.draw_iso_block(-75, -75, 0, 150, 150, 20, mat="stone", origin=orig)
    
    # Heavy Blast Furnace Body
    ren.draw_iso_cylinder(0, 0, 20, 55, 60, mat="iron", segments=18, origin=orig)
    ren.draw_iso_gear(0, 0, 80, 62, teeth=10, thickness=12, mat="brass", origin=orig)
    
    # Massive Smelting Chimney
    ren.draw_iso_cylinder(0, 0, 92, 35, 50, mat="copper", segments=14, origin=orig)
    ren.draw_iso_dome(0, 0, 142, 30, mat="glow", rings=6, segments=12, origin=orig)
    
    # Siege Projector Ramp & Anvil
    ren.draw_iso_block(25, -40, 20, 45, 80, 30, mat="steel", origin=orig)
    
    # Huge Forge Portal
    p_forge = ren.iso_to_screen(0, 56, 35, *orig)
    ren.draw_furnace_window(p_forge[0] - 22, p_forge[1] - 25, 44, 38)

    # Exhaust Quench Pipes
    p1 = ren.iso_to_screen(-40, -40, 80, *orig)
    p2 = ren.iso_to_screen(-40, -40, 130, *orig)
    ren.draw_pipe(p1, p2, radius=6, mat="steel")

    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=3)
    out_path = os.path.join(OUT_DIR, "bldg-cog-workshop.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_foundry_engine_wonder():
    """10. bldg-cog-wonder.png — Foundry Engine (wonder, 1013x983)"""
    w, h = 1013, 983
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.75))
    
    # Grand Multi-Tiered Ziggurat Platform
    ren.draw_iso_block(-180, -180, 0, 360, 360, 35, mat="stone", origin=orig)
    ren.draw_iso_block(-155, -155, 35, 310, 310, 25, mat="iron", origin=orig)
    ren.draw_iso_block(-130, -130, 60, 260, 260, 25, mat="brass", origin=orig)
    
    # 4 Corner Great Reactor Towers
    for tx, ty in [(-135, -135), (85, -135), (-135, 85), (85, 85)]:
        ren.draw_iso_cylinder(tx + 25, ty + 25, 85, 32, 80, mat="copper", origin=orig)
        ren.draw_iso_gear(tx + 25, ty + 25, 165, 40, teeth=8, thickness=12, mat="brass", origin=orig)
        ren.draw_iso_dome(tx + 25, ty + 25, 177, 30, mat="glow", rings=8, segments=16, origin=orig)
        
    # Central Colossal Engine Core
    ren.draw_iso_cylinder(0, 0, 85, 95, 90, mat="steel", segments=24, origin=orig)
    ren.draw_iso_gear(0, 0, 175, 115, teeth=16, thickness=25, mat="brass", origin=orig)
    
    # Secondary Gyro-Ring
    ren.draw_iso_cylinder(0, 0, 200, 80, 60, mat="copper", segments=20, origin=orig)
    ren.draw_iso_gear(0, 0, 260, 92, teeth=12, thickness=18, mat="iron", origin=orig)
    
    # Celestial Apex Gear Dome
    ren.draw_iso_dome(0, 0, 278, 75, mat="brass", rings=12, segments=24, origin=orig)
    
    # Wonder Monolith / Arc Emitter
    ren.draw_iso_cylinder(0, 0, 353, 20, 80, mat="steel", origin=orig)
    ren.draw_iso_dome(0, 0, 433, 28, mat="glow", rings=8, segments=16, origin=orig)
    
    # Radiant Amber Furnace Ports around perimeter
    for angle in [math.pi/4, 3*math.pi/4, 5*math.pi/4, 7*math.pi/4]:
        px_pos = int(math.cos(angle) * 96)
        py_pos = int(math.sin(angle) * 96)
        p_pt = ren.iso_to_screen(px_pos, py_pos, 115, *orig)
        ren.draw_furnace_window(p_pt[0] - 18, p_pt[1] - 18, 36, 36)

    # Interconnected High-Pressure Steam Mains
    for tx, ty in [(-110, -110), (110, -110), (-110, 110), (110, 110)]:
        p_src = ren.iso_to_screen(tx, ty, 160, *orig)
        p_dst = ren.iso_to_screen(tx // 2, ty // 2, 220, *orig)
        ren.draw_pipe(p_src, p_dst, radius=7, mat="copper")

    final = ren.apply_painterly_shading(noise_amount=15, bloom_radius=5)
    out_path = os.path.join(OUT_DIR, "bldg-cog-wonder.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_grid_pylon():
    """11. bldg-cog-grid-pylon.png — Grid Pylon (copper relay mast, 512x640)"""
    w, h = 512, 640
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.85))
    
    # Tripod / Hexagonal Brass Foundation
    ren.draw_iso_block(-40, -40, 0, 80, 80, 20, mat="stone", origin=orig)
    ren.draw_iso_cylinder(0, 0, 20, 32, 25, mat="iron", segments=14, origin=orig)
    
    # Tall Lattice Copper Mast
    ren.draw_iso_cylinder(0, 0, 45, 20, 120, mat="copper", segments=12, origin=orig)
    ren.draw_iso_gear(0, 0, 165, 30, teeth=8, thickness=10, mat="brass", origin=orig)
    
    # Middle Relay Coils
    ren.draw_iso_cylinder(0, 0, 175, 14, 110, mat="steel", segments=10, origin=orig)
    ren.draw_iso_gear(0, 0, 285, 24, teeth=6, thickness=8, mat="copper", origin=orig)
    
    # Upper Induction Beacon
    ren.draw_iso_cylinder(0, 0, 293, 10, 70, mat="brass", segments=8, origin=orig)
    ren.draw_iso_dome(0, 0, 363, 16, mat="glow", rings=6, segments=12, origin=orig)
    
    # Crossarms with hanging spark insulators
    p_arm_left = ren.iso_to_screen(-45, 0, 240, *orig)
    p_arm_right = ren.iso_to_screen(45, 0, 240, *orig)
    p_center = ren.iso_to_screen(0, 0, 240, *orig)
    ren.draw.line([p_arm_left, p_arm_right], fill=(*ren.BRASS_LIGHT, 255), width=6)
    
    # Insulator globes
    ren.draw.ellipse([p_arm_left[0] - 8, p_arm_left[1] + 5, p_arm_left[0] + 8, p_arm_left[1] + 21], fill=(*ren.GLOW_HOT, 255))
    ren.draw.ellipse([p_arm_right[0] - 8, p_arm_right[1] + 5, p_arm_right[0] + 8, p_arm_right[1] + 21], fill=(*ren.GLOW_HOT, 255))

    final = ren.apply_painterly_shading(noise_amount=12, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "bldg-cog-grid-pylon.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_gear_strider_unit():
    """12. unit-cog-strider.png — Gear Strider still (967x854)"""
    w, h = 967, 854
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.65))
    
    # Four-legged massive clockwork walker
    # Main Body Chassis - Brass sphere / cylinder boiler
    ren.draw_iso_cylinder(0, 0, 120, 65, 70, mat="brass", segments=20, origin=orig)
    ren.draw_iso_gear(0, 0, 190, 72, teeth=12, thickness=14, mat="copper", origin=orig)
    ren.draw_iso_dome(0, 0, 204, 55, mat="steel", rings=10, segments=20, origin=orig)
    
    # Glowing Furnace Core in Chest
    p_chest = ren.iso_to_screen(0, 66, 145, *orig)
    ren.draw_furnace_window(p_chest[0] - 22, p_chest[1] - 22, 44, 44)
    
    # Heavy Articulated Quad Legs
    leg_coords = [
        ((-90, -70, 0), (-60, -40, 90), (-40, -30, 130)), # Back-Left
        ((90, -70, 0), (60, -40, 90), (40, -30, 130)),   # Back-Right
        ((-100, 80, 0), (-70, 50, 80), (-45, 35, 130)),  # Front-Left
        ((100, 80, 0), (70, 50, 80), (45, 35, 130)),    # Front-Right
    ]
    
    for foot, knee, hip in leg_coords:
        p_foot = ren.iso_to_screen(*foot, *orig)
        p_knee = ren.iso_to_screen(*knee, *orig)
        p_hip = ren.iso_to_screen(*hip, *orig)
        
        # Upper limb
        ren.draw.line([p_hip, p_knee], fill=(*ren.IRON_BASE, 255), width=18)
        ren.draw.line([p_hip, p_knee], fill=(*ren.BRASS_LIGHT, 255), width=8)
        # Lower limb
        ren.draw.line([p_knee, p_foot], fill=(*ren.IRON_DARK, 255), width=14)
        ren.draw.line([p_knee, p_foot], fill=(*ren.COPPER_LIGHT, 255), width=6)
        # Joint gears
        ren.draw.ellipse([p_hip[0]-14, p_hip[1]-14, p_hip[0]+14, p_hip[1]+14], fill=(*ren.BRASS_BASE, 255), outline=(*ren.OUTLINE, 255), width=3)
        ren.draw.ellipse([p_knee[0]-12, p_knee[1]-12, p_knee[0]+12, p_knee[1]+12], fill=(*ren.COPPER_BASE, 255), outline=(*ren.OUTLINE, 255), width=3)
        # Foot pad
        ren.draw.rectangle([p_foot[0]-16, p_foot[1]-6, p_foot[0]+16, p_foot[1]+6], fill=(*ren.IRON_DARK, 255), outline=(*ren.OUTLINE, 255))

    # Top Saddle Platform & Spark Lance
    ren.draw_iso_block(-30, -30, 255, 60, 60, 15, mat="brass", origin=orig)
    p_lance_base = ren.iso_to_screen(15, 15, 270, *orig)
    p_lance_tip = ren.iso_to_screen(70, 70, 360, *orig)
    ren.draw.line([p_lance_base, p_lance_tip], fill=(*ren.STEEL_LIGHT, 255), width=6)
    ren.draw.ellipse([p_lance_tip[0]-10, p_lance_tip[1]-10, p_lance_tip[0]+10, p_lance_tip[1]+10], fill=(*ren.GLOW_HOT, 255))

    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "unit-cog-strider.png")
    final.save(out_path, optimize=True)
    return out_path

def generate_calibrator_siege_unit():
    """13. unit-cog-siege.png — Calibrator siege still (857x788)"""
    w, h = 857, 788
    ren = CogforgedRenderer(w, h)
    orig = (w // 2, int(h * 0.65))
    
    # Heavy Wheeled Chassis / Carriage
    ren.draw_iso_block(-70, -50, 30, 140, 100, 35, mat="iron", origin=orig)
    
    # 4 Massive Iron-Spoked Wheels
    for wx, wy in [(-75, -55), (75, -55), (-75, 55), (75, 55)]:
        p_w = ren.iso_to_screen(wx, wy, 35, *orig)
        ren.draw.ellipse([p_w[0]-28, p_w[1]-28, p_w[0]+28, p_w[1]+28], fill=(*ren.IRON_DARK, 255), outline=(*ren.OUTLINE, 255), width=4)
        ren.draw.ellipse([p_w[0]-20, p_w[1]-20, p_w[0]+20, p_w[1]+20], fill=(*ren.BRASS_DARK, 255), outline=(*ren.OUTLINE, 200), width=2)
        ren.draw.ellipse([p_w[0]-8, p_w[1]-8, p_w[0]+8, p_w[1]+8], fill=(*ren.COPPER_BASE, 255))
        
    # Calibrator Turret Base & Theodolite Aiming Gear
    ren.draw_iso_cylinder(0, 0, 65, 50, 30, mat="brass", segments=18, origin=orig)
    ren.draw_iso_gear(0, 0, 95, 60, teeth=10, thickness=12, mat="copper", origin=orig)
    
    # Massive Heavy Projector Barrel / Lens Mount
    ren.draw_iso_cylinder(0, 0, 107, 35, 40, mat="steel", segments=16, origin=orig)
    
    # Elevated Great Beam Projector Cannon
    p_pivot = ren.iso_to_screen(0, 0, 135, *orig)
    p_muzzle = ren.iso_to_screen(70, 70, 200, *orig)
    p_breech = ren.iso_to_screen(-40, -40, 100, *orig)
    
    # Heavy Cannon Barrel
    ren.draw.line([p_breech, p_muzzle], fill=(*ren.BRASS_DARK, 255), width=32)
    ren.draw.line([p_breech, p_muzzle], fill=(*ren.BRASS_LIGHT, 255), width=16)
    ren.draw.line([p_breech, p_muzzle], fill=(*ren.COPPER_BASE, 255), width=8)
    
    # Muzzle Focus Rings & Glowing Amber Emitter
    ren.draw.ellipse([p_muzzle[0]-20, p_muzzle[1]-20, p_muzzle[0]+20, p_muzzle[1]+20], fill=(*ren.IRON_DARK, 255), outline=(*ren.OUTLINE, 255), width=3)
    ren.draw.ellipse([p_muzzle[0]-14, p_muzzle[1]-14, p_muzzle[0]+14, p_muzzle[1]+14], fill=(*ren.GLOW_ORANGE, 255))
    ren.draw.ellipse([p_muzzle[0]-8, p_muzzle[1]-8, p_muzzle[0]+8, p_muzzle[1]+8], fill=(*ren.GLOW_HOT, 255))

    final = ren.apply_painterly_shading(noise_amount=14, bloom_radius=4)
    out_path = os.path.join(OUT_DIR, "unit-cog-siege.png")
    final.save(out_path, optimize=True)
    return out_path

if __name__ == "__main__":
    generators = [
        ("bldg-cog-tc.png", generate_foundry_core_tc),
        ("bldg-cog-house.png", generate_capacitor_hut_house),
        ("bldg-cog-rax.png", generate_assembly_hall_rax),
        ("bldg-cog-mill.png", generate_flux_mill),
        ("bldg-cog-lumber.png", generate_timber_relay_lumber),
        ("bldg-cog-mine.png", generate_ore_relay_mine),
        ("bldg-cog-spire.png", generate_optic_spire),
        ("bldg-cog-den.png", generate_strider_bay_den),
        ("bldg-cog-workshop.png", generate_siege_foundry_workshop),
        ("bldg-cog-wonder.png", generate_foundry_engine_wonder),
        ("bldg-cog-grid-pylon.png", generate_grid_pylon),
        ("unit-cog-strider.png", generate_gear_strider_unit),
        ("unit-cog-siege.png", generate_calibrator_siege_unit)
    ]
    
    print("Generating Cogforged Assembly assets...")
    for name, gen in generators:
        path = gen()
        im = Image.open(path)
        colors = len(set(im.getdata()))
        sz = os.path.getsize(path)
        print(f"Done {name:25s} | size: {str(im.size):12s} | colors: {colors:7d} | bytes: {sz:8d} ({sz/1024:.1f} KB)")
