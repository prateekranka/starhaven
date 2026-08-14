"""
Enhanced High-Fidelity Painted Isometric Renderer for Starhaven Cogforged Assembly.
Features layered brass panelling, mechanical bevels, rivet lines, furnace glows, and rich atmospheric lighting.
"""
import math
import os
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

class CogforgedRenderer:
    def __init__(self, width=896, height=896):
        self.width = width
        self.height = height
        self.img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.img)
        
        # Color palettes with rich lighting gradients
        self.BRASS_BASE = (205, 140, 85)
        self.BRASS_LIGHT = (250, 205, 150)
        self.BRASS_SPEC = (255, 245, 220)
        self.BRASS_DARK = (130, 75, 40)
        self.BRASS_SHADOW = (70, 40, 22)
        
        self.COPPER_BASE = (190, 105, 55)
        self.COPPER_LIGHT = (240, 160, 105)
        self.COPPER_DARK = (110, 50, 25)
        
        self.STEEL_BASE = (115, 125, 140)
        self.STEEL_LIGHT = (175, 190, 210)
        self.STEEL_DARK = (65, 72, 85)
        self.STEEL_SHADOW = (35, 38, 48)
        
        self.IRON_BASE = (60, 62, 72)
        self.IRON_LIGHT = (90, 95, 110)
        self.IRON_DARK = (30, 32, 40)
        
        self.GLOW_HOT = (255, 250, 215)
        self.GLOW_AMBER = (255, 180, 45)
        self.GLOW_ORANGE = (240, 110, 25)
        self.GLOW_DEEP = (170, 50, 15)
        
        self.STONE_BASE = (155, 130, 110)
        self.STONE_LIGHT = (195, 170, 145)
        self.STONE_DARK = (100, 80, 65)
        
        self.OUTLINE = (22, 20, 28)

    def iso_to_screen(self, x, y, z, origin_x=None, origin_y=None):
        if origin_x is None: origin_x = self.width // 2
        if origin_y is None: origin_y = int(self.height * 0.72)
        sx = origin_x + (x - y) * 1.0
        sy = origin_y + (x + y) * 0.5 - z * 1.0
        return int(sx), int(sy)

    def draw_iso_block(self, ox, oy, oz, dx, dy, dz, mat="brass", origin=None, rivets=True):
        p000 = self.iso_to_screen(ox, oy, oz, *origin) if origin else self.iso_to_screen(ox, oy, oz)
        p100 = self.iso_to_screen(ox + dx, oy, oz, *origin) if origin else self.iso_to_screen(ox + dx, oy, oz)
        p110 = self.iso_to_screen(ox + dx, oy + dy, oz, *origin) if origin else self.iso_to_screen(ox + dx, oy + dy, oz)
        p010 = self.iso_to_screen(ox, oy + dy, oz, *origin) if origin else self.iso_to_screen(ox, oy + dy, oz)
        
        p001 = self.iso_to_screen(ox, oy, oz + dz, *origin) if origin else self.iso_to_screen(ox, oy, oz + dz)
        p101 = self.iso_to_screen(ox + dx, oy, oz + dz, *origin) if origin else self.iso_to_screen(ox + dx, oy, oz + dz)
        p111 = self.iso_to_screen(ox + dx, oy + dy, oz + dz, *origin) if origin else self.iso_to_screen(ox + dx, oy + dy, oz + dz)
        p011 = self.iso_to_screen(ox, oy + dy, oz + dz, *origin) if origin else self.iso_to_screen(ox, oy + dy, oz + dz)
        
        if mat == "brass":
            c_top, c_left, c_right = self.BRASS_LIGHT, self.BRASS_BASE, self.BRASS_DARK
        elif mat == "copper":
            c_top, c_left, c_right = self.COPPER_LIGHT, self.COPPER_BASE, self.COPPER_DARK
        elif mat == "steel":
            c_top, c_left, c_right = self.STEEL_LIGHT, self.STEEL_BASE, self.STEEL_DARK
        elif mat == "iron":
            c_top, c_left, c_right = self.IRON_LIGHT, self.IRON_BASE, self.IRON_DARK
        elif mat == "stone":
            c_top, c_left, c_right = self.STONE_LIGHT, self.STONE_BASE, self.STONE_DARK
        else:
            c_top, c_left, c_right = (210, 210, 210), (160, 160, 160), (110, 110, 110)

        # Left face
        self.draw.polygon([p000, p100, p101, p001], fill=(*c_left, 255), outline=(*self.OUTLINE, 220))
        # Right face
        self.draw.polygon([p100, p110, p111, p101], fill=(*c_right, 255), outline=(*self.OUTLINE, 220))
        # Top face
        self.draw.polygon([p001, p101, p111, p011], fill=(*c_top, 255), outline=(*self.OUTLINE, 220))

        # Panel Lines and Rivet Rows
        if rivets and dz >= 30:
            for step_z in range(oz + 15, oz + dz - 10, 25):
                # Left seam
                s_p0 = self.iso_to_screen(ox, oy, step_z, *origin) if origin else self.iso_to_screen(ox, oy, step_z)
                s_p1 = self.iso_to_screen(ox + dx, oy, step_z, *origin) if origin else self.iso_to_screen(ox + dx, oy, step_z)
                self.draw.line([s_p0, s_p1], fill=(*self.OUTLINE, 120), width=1)
                # Left rivets
                for step_x in range(ox + 10, ox + dx, 25):
                    rp = self.iso_to_screen(step_x, oy, step_z, *origin) if origin else self.iso_to_screen(step_x, oy, step_z)
                    self.draw.rectangle([rp[0]-1, rp[1]-1, rp[0]+1, rp[1]+1], fill=(*self.BRASS_LIGHT, 255))
                    
                # Right seam
                s_p2 = self.iso_to_screen(ox + dx, oy + dy, step_z, *origin) if origin else self.iso_to_screen(ox + dx, oy + dy, step_z)
                self.draw.line([s_p1, s_p2], fill=(*self.OUTLINE, 120), width=1)
                for step_y in range(oy + 10, oy + dy, 25):
                    rp = self.iso_to_screen(ox + dx, step_y, step_z, *origin) if origin else self.iso_to_screen(ox + dx, step_y, step_z)
                    self.draw.rectangle([rp[0]-1, rp[1]-1, rp[0]+1, rp[1]+1], fill=(*self.BRASS_LIGHT, 255))

    def draw_iso_cylinder(self, cx, cy, cz, radius, height, mat="brass", segments=20, origin=None):
        angles = [2 * math.pi * i / segments for i in range(segments + 1)]
        top_pts, bot_pts = [], []
        
        for a in angles:
            x = cx + radius * math.cos(a)
            y = cy + radius * math.sin(a)
            p_bot = self.iso_to_screen(x, y, cz, *origin) if origin else self.iso_to_screen(x, y, cz)
            p_top = self.iso_to_screen(x, y, cz + height, *origin) if origin else self.iso_to_screen(x, y, cz + height)
            top_pts.append(p_top)
            bot_pts.append(p_bot)
            
        if mat == "brass":
            c_light, c_base, c_dark = self.BRASS_LIGHT, self.BRASS_BASE, self.BRASS_DARK
        elif mat == "copper":
            c_light, c_base, c_dark = self.COPPER_LIGHT, self.COPPER_BASE, self.COPPER_DARK
        elif mat == "iron":
            c_light, c_base, c_dark = self.IRON_LIGHT, self.IRON_BASE, self.IRON_DARK
        else:
            c_light, c_base, c_dark = self.STEEL_LIGHT, self.STEEL_BASE, self.STEEL_DARK

        for i in range(segments):
            a_mid = (angles[i] + angles[i+1]) / 2
            light_f = (math.cos(a_mid + math.pi * 0.75) + 1) / 2
            r = int(c_dark[0] + (c_light[0] - c_dark[0]) * light_f)
            g = int(c_dark[1] + (c_light[1] - c_dark[1]) * light_f)
            b = int(c_dark[2] + (c_light[2] - c_dark[2]) * light_f)
            quad = [bot_pts[i], bot_pts[i+1], top_pts[i+1], top_pts[i]]
            self.draw.polygon(quad, fill=(r, g, b, 255), outline=(*self.OUTLINE, 180))
            
        self.draw.polygon(top_pts, fill=(*c_light, 255), outline=(*self.OUTLINE, 220))

    def draw_iso_dome(self, cx, cy, cz, radius, mat="brass", rings=10, segments=20, origin=None):
        if mat == "brass":
            c_light, c_base, c_dark = self.BRASS_LIGHT, self.BRASS_BASE, self.BRASS_DARK
        elif mat == "copper":
            c_light, c_base, c_dark = self.COPPER_LIGHT, self.COPPER_BASE, self.COPPER_DARK
        elif mat == "glow":
            c_light, c_base, c_dark = self.GLOW_HOT, self.GLOW_AMBER, self.GLOW_ORANGE
        else:
            c_light, c_base, c_dark = self.STEEL_LIGHT, self.STEEL_BASE, self.STEEL_DARK

        for r_idx in range(rings):
            phi1 = (math.pi / 2) * (r_idx / rings)
            phi2 = (math.pi / 2) * ((r_idx + 1) / rings)
            z1 = cz + radius * math.sin(phi1)
            z2 = cz + radius * math.sin(phi2)
            rad1 = radius * math.cos(phi1)
            rad2 = radius * math.cos(phi2)
            
            for s in range(segments):
                theta1 = 2 * math.pi * s / segments
                theta2 = 2 * math.pi * (s + 1) / segments
                
                p1 = self.iso_to_screen(cx + rad1 * math.cos(theta1), cy + rad1 * math.sin(theta1), z1, *origin) if origin else self.iso_to_screen(cx + rad1 * math.cos(theta1), cy + rad1 * math.sin(theta1), z1)
                p2 = self.iso_to_screen(cx + rad1 * math.cos(theta2), cy + rad1 * math.sin(theta2), z1, *origin) if origin else self.iso_to_screen(cx + rad1 * math.cos(theta2), cy + rad1 * math.sin(theta2), z1)
                p3 = self.iso_to_screen(cx + rad2 * math.cos(theta2), cy + rad2 * math.sin(theta2), z2, *origin) if origin else self.iso_to_screen(cx + rad2 * math.cos(theta2), cy + rad2 * math.sin(theta2), z2)
                p4 = self.iso_to_screen(cx + rad2 * math.cos(theta1), cy + rad2 * math.sin(theta1), z2, *origin) if origin else self.iso_to_screen(cx + rad2 * math.cos(theta1), cy + rad2 * math.sin(theta1), z2)
                
                mid_theta = (theta1 + theta2) / 2
                mid_phi = (phi1 + phi2) / 2
                nx = math.cos(mid_phi) * math.cos(mid_theta)
                ny = math.cos(mid_phi) * math.sin(mid_theta)
                nz = math.sin(mid_phi)
                lx, ly, lz = -0.5, -0.5, 0.7
                dot = max(0.0, nx * lx + ny * ly + nz * lz)
                
                r = int(c_dark[0] + (c_light[0] - c_dark[0]) * (0.3 + 0.7 * dot))
                g = int(c_dark[1] + (c_light[1] - c_dark[1]) * (0.3 + 0.7 * dot))
                b = int(c_dark[2] + (c_light[2] - c_dark[2]) * (0.3 + 0.7 * dot))
                
                self.draw.polygon([p1, p2, p3, p4], fill=(r, g, b, 255), outline=(*self.OUTLINE, 120))

    def draw_iso_gear(self, cx, cy, cz, radius, teeth=10, thickness=14, mat="brass", origin=None):
        self.draw_iso_cylinder(cx, cy, cz, radius, thickness, mat=mat, segments=teeth*2, origin=origin)
        for i in range(teeth):
            a = 2 * math.pi * i / teeth
            tx = cx + (radius + 8) * math.cos(a)
            ty = cy + (radius + 8) * math.sin(a)
            self.draw_iso_block(tx - 6, ty - 6, cz, 12, 12, thickness, mat="copper", origin=origin, rivets=False)

    def draw_furnace_window(self, sx, sy, width, height, arch=True):
        self.draw.rounded_rectangle([sx - 3, sy - 3, sx + width + 3, sy + height + 3], radius=6, fill=(*self.IRON_DARK, 255), outline=(*self.OUTLINE, 255))
        self.draw.rounded_rectangle([sx, sy, sx + width, sy + height], radius=4, fill=(*self.GLOW_ORANGE, 255))
        
        pad_x, pad_y = max(2, width // 5), max(2, height // 5)
        self.draw.rounded_rectangle([sx + pad_x, sy + pad_y, sx + width - pad_x, sy + height - pad_y], radius=3, fill=(*self.GLOW_AMBER, 255))
        
        cpad_x, cpad_y = max(4, width // 3), max(4, height // 3)
        self.draw.rectangle([sx + cpad_x, sy + cpad_y, sx + width - cpad_x, sy + height - cpad_y], fill=(*self.GLOW_HOT, 255))
        
        if width > 16:
            for gx in range(sx + width // 3, sx + width, width // 3):
                self.draw.line([(gx, sy), (gx, sy + height)], fill=(*self.IRON_BASE, 230), width=2)

    def draw_pipe(self, p1, p2, radius=4, mat="copper"):
        col = self.COPPER_BASE if mat == "copper" else self.BRASS_BASE
        col_light = self.COPPER_LIGHT if mat == "copper" else self.BRASS_LIGHT
        self.draw.line([p1, p2], fill=(*col, 255), width=radius * 2)
        
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length > 0:
            nx, ny = -dy / length, dx / length
            hp1 = (p1[0] + nx * (radius - 1), p1[1] + ny * (radius - 1))
            hp2 = (p2[0] + nx * (radius - 1), p2[1] + ny * (radius - 1))
            self.draw.line([hp1, hp2], fill=(*col_light, 220), width=max(1, radius // 2))

    def apply_painterly_shading(self, noise_amount=16, bloom_radius=4):
        arr = np.array(self.img, dtype=np.float32)
        h, w = arr.shape[:2]
        
        # Micro-texture noise
        noise = np.random.normal(0, noise_amount, (h, w, 3))
        for c in range(3):
            arr[:, :, c] = np.clip(arr[:, :, c] + noise[:, :, c] * (arr[:, :, 3] / 255.0), 0, 255)
            
        painted = Image.fromarray(arr.astype(np.uint8))
        
        # Amber bloom
        glow_mask = (arr[:, :, 0] > 190) & (arr[:, :, 1] > 120) & (arr[:, :, 2] < 90) & (arr[:, :, 3] > 180)
        glow_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        glow_arr = np.array(glow_img)
        glow_arr[glow_mask] = [255, 175, 45, 190]
        glow_layer = Image.fromarray(glow_arr).filter(ImageFilter.GaussianBlur(bloom_radius))
        
        final_img = Image.alpha_composite(painted, glow_layer)
        return final_img
