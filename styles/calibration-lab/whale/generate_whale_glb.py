import os, sys, json, struct, math
import numpy as np
from scipy.interpolate import PchipInterpolator

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# 1. Exact Hero Reference Bounding Box & Camera Geometry (1920x1080, fov=28 deg vertical, cam_d=34.0)
#    V2 Colossal Balaenoptera Proportions: Compact rostrum (-9.65m to -2.31m shoulder) + long sweeping posterior body (+11.65m tail)!
W_CANVAS, H_CANVAS = 1920, 1080
hx0, hx1 = 345, 1715
hy0, hy1 = 278, 762
L_px = float(hx1 - hx0)
H_px = float(hy1 - hy0)

CAM_FOV_DEG = 28.0
CAM_D = 34.0
TAN_HALF_FOV = math.tan(math.radians(CAM_FOV_DEG) * 0.5)
ASPECT = W_CANVAS / H_CANVAS

def screen_to_world_xy(px, py, z=0.0):
    dist = CAM_D - z
    ndc_x = (px - W_CANVAS * 0.5) / (W_CANVAS * 0.5)
    ndc_y = (H_CANVAS * 0.5 - py) / (H_CANVAS * 0.5)
    x = ndc_x * dist * TAN_HALF_FOV * ASPECT
    y = ndc_y * dist * TAN_HALF_FOV
    return x, y

def uv_to_screen(u, v):
    px = hx0 + u * L_px
    py = hy1 - v * H_px
    return px, py

def uv_to_world_xy(u, v, z=0.0):
    px, py = uv_to_screen(u, v)
    return screen_to_world_xy(px, py, z)

def world_y_to_v(y, z=0.0):
    dist = CAM_D - z
    ndc_y = y / (dist * TAN_HALF_FOV)
    py = H_CANVAS * 0.5 - ndc_y * (H_CANVAS * 0.5)
    return (hy1 - py) / H_px

# 2. Smooth C1 Monotonic Splines (PchipInterpolator) for Hull & Hydrofoil Profiles
#    V2: Sleek, taut hydrodynamic rorqual throat curve (no bloated pot-belly!) + arched brow + long muscular tail stock
hull_top_ctrl = np.array([
    [0.000, 0.728],
    [0.012, 0.768],
    [0.040, 0.812],
    [0.085, 0.846],
    [0.145, 0.870],
    [0.205, 0.878],
    [0.265, 0.872],
    [0.335, 0.856],
    [0.410, 0.832],
    [0.485, 0.804],
    [0.560, 0.772],
    [0.625, 0.736],
    [0.685, 0.700],
    [0.745, 0.684],
    [0.792, 0.696],
    [0.855, 0.748],
    [0.903, 0.792],
    [0.950, 0.812],
    [1.000, 0.825],
])

hull_bot_ctrl = np.array([
    [0.000, 0.714],
    [0.012, 0.682],
    [0.042, 0.596],
    [0.085, 0.514],
    [0.145, 0.418],
    [0.205, 0.352],
    [0.275, 0.304],
    [0.335, 0.282],
    [0.410, 0.280],
    [0.520, 0.292],
    [0.640, 0.308],
    [0.700, 0.344],
    [0.750, 0.402],
    [0.792, 0.442],
    [0.855, 0.545],
    [0.903, 0.665],
    [0.950, 0.725],
    [1.000, 0.765],
])

# Dorsal fin top profile (u in [0.525, 0.642])
dorsal_fin_ctrl = np.array([
    [0.525, 0.783],
    [0.545, 0.792],
    [0.565, 0.818],
    [0.585, 0.842],
    [0.608, 0.856],
    [0.620, 0.842],
    [0.630, 0.792],
    [0.638, 0.748],
    [0.642, 0.724],
])

# Caudal fluke upper & lower profiles (u in [0.855, 1.000])
fluke_top_ctrl = np.array([
    [0.855, 0.755],
    [0.875, 0.828],
    [0.895, 0.878],
    [0.920, 0.914],
    [0.950, 0.946],
    [0.985, 0.982],
    [1.000, 0.994],
])

fluke_bot_ctrl = np.array([
    [0.855, 0.535],
    [0.880, 0.602],
    [0.903, 0.668],
    [0.930, 0.752],
    [0.955, 0.832],
    [0.985, 0.916],
    [1.000, 0.962],
])

# Top-ortho half-width profile w_half(u) in model metres (broad U-shaped baleen rostrum + 2.22 m chest half-width)
w_ctrl_u = np.array([0.00, 0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.41, 0.49, 0.57, 0.65, 0.73, 0.80, 0.86, 0.90, 0.95, 1.00])
w_ctrl_z = np.array([0.28, 0.82, 1.36, 1.78, 2.06, 2.20, 2.22, 2.08, 1.88, 1.62, 1.32, 1.04, 0.78, 0.58, 0.44, 0.30, 0.18])

# Lateral mechanical trench centerline v_trench(u) and vertical half-gap dv_trench(u)
trench_u = np.array([0.00, 0.045, 0.105, 0.160, 0.205, 0.270, 0.335, 0.450, 0.560, 0.655, 0.735, 0.792, 0.850, 0.903, 0.950, 1.00])
trench_v = np.array([0.720, 0.692, 0.668, 0.648, 0.635, 0.592, 0.558, 0.525, 0.505, 0.495, 0.518, 0.552, 0.625, 0.715, 0.762, 0.790])
trench_gap = np.array([0.009, 0.013, 0.018, 0.024, 0.028, 0.028, 0.040, 0.032, 0.028, 0.030, 0.025, 0.024, 0.016, 0.012, 0.010, 0.008])

f_hull_top = PchipInterpolator(hull_top_ctrl[:, 0], hull_top_ctrl[:, 1])
f_hull_bot = PchipInterpolator(hull_bot_ctrl[:, 0], hull_bot_ctrl[:, 1])
f_dorsal_fin = PchipInterpolator(dorsal_fin_ctrl[:, 0], dorsal_fin_ctrl[:, 1])
f_fluke_top = PchipInterpolator(fluke_top_ctrl[:, 0], fluke_top_ctrl[:, 1])
f_fluke_bot = PchipInterpolator(fluke_bot_ctrl[:, 0], fluke_bot_ctrl[:, 1])
f_w_z = PchipInterpolator(w_ctrl_u, w_ctrl_z)
f_trench_v = PchipInterpolator(trench_u, trench_v)
f_trench_gap = PchipInterpolator(trench_u, trench_gap)

def get_hull_slice(u):
    uc = float(np.clip(u, 0.0, 1.0))
    vt = float(f_hull_top(uc))
    vb = float(f_hull_bot(uc))
    wz = float(f_w_z(uc))
    vtr = float(f_trench_v(uc))
    vgap = float(f_trench_gap(uc))
    return vt, vb, wz, vtr, vgap

# Build a 1D parameter spacing in [0, 1] with concentrated 45° bevel rings near 0 and 1
def beveled_param_grid(n, bevel_frac=0.022):
    if n < 6:
        return np.linspace(0.0, 1.0, n)
    inner = np.linspace(bevel_frac, 1.0 - bevel_frac, n - 2)
    return np.concatenate([[0.0], inner, [1.0]])

# Helper to build a watertight beveled 3D patch mesh from a grid of outer points P_out[nu, nv, 3] and inner points P_in[nu, nv, 3]
def build_thick_patch(P_out, P_in):
    nu, nv, _ = P_out.shape
    verts = []
    norms = []
    uvs = []
    indices = []

    def add_quad(p00, p10, p11, p01, uv00, uv10, uv11, uv01):
        base = len(verts)
        e1 = p10 - p00
        e2 = p01 - p00
        n = np.cross(e1, e2)
        ln = np.linalg.norm(n)
        if ln > 1e-8:
            n = n / ln
        else:
            n = np.array([0.0, 1.0, 0.0])
        for p, uv in [(p00, uv00), (p10, uv10), (p11, uv11), (p01, uv01)]:
            verts.append(p)
            norms.append(n)
            uvs.append(uv)
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    # Outer face (smooth normals across interior; 3D beveled perimeter ring gives natural key/shadow edge)
    base_out = len(verts)
    N_out = np.zeros_like(P_out)
    for i in range(nu):
        for j in range(nv):
            du = P_out[min(nu-1, i+1), j] - P_out[max(0, i-1), j]
            dv = P_out[i, min(nv-1, j+1)] - P_out[i, max(0, j-1)]
            n = np.cross(du, dv)
            ln = np.linalg.norm(n)
            N_out[i, j] = n / ln if ln > 1e-8 else np.array([0.0, 0.0, 1.0])
            verts.append(P_out[i, j])
            norms.append(N_out[i, j])
            uvs.append((i / max(1, nu - 1), j / max(1, nv - 1)))
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = base_out + i * nv + j
            b = base_out + (i + 1) * nv + j
            c = base_out + (i + 1) * nv + (j + 1)
            d = base_out + i * nv + (j + 1)
            indices.extend([a, b, c, a, c, d])

    # Inner face (winding reversed, with true surface normals computed from P_in so two-sided hydrofoils shade cleanly on both sides)
    base_in = len(verts)
    for i in range(nu):
        for j in range(nv):
            du_in = P_in[min(nu-1, i+1), j] - P_in[max(0, i-1), j]
            dv_in = P_in[i, min(nv-1, j+1)] - P_in[i, max(0, j-1)]
            n_in = -np.cross(du_in, dv_in)
            ln_in = np.linalg.norm(n_in)
            n_vec = n_in / ln_in if ln_in > 1e-8 else -N_out[i, j]
            verts.append(P_in[i, j])
            norms.append(n_vec)
            uvs.append((i / max(1, nu - 1), j / max(1, nv - 1)))
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = base_in + i * nv + j
            b = base_in + (i + 1) * nv + j
            c = base_in + (i + 1) * nv + (j + 1)
            d = base_in + i * nv + (j + 1)
            indices.extend([a, c, b, a, d, c])

    # 4 perimeter walls mapped to interior warm-porcelain UV (0.04..0.08) so side walls NEVER turn pitch-black!
    for i in range(nu - 1):
        u0, u1 = 0.05 + 0.90 * (i / (nu - 1)), 0.05 + 0.90 * ((i + 1) / (nu - 1))
        add_quad(
            P_out[i, 0], P_in[i, 0], P_in[i+1, 0], P_out[i+1, 0],
            (u0, 0.04), (u0, 0.08), (u1, 0.08), (u1, 0.04),
        )
    for i in range(nu - 1):
        u0, u1 = 0.05 + 0.90 * (i / (nu - 1)), 0.05 + 0.90 * ((i + 1) / (nu - 1))
        add_quad(
            P_out[i, nv-1], P_out[i+1, nv-1], P_in[i+1, nv-1], P_in[i, nv-1],
            (u0, 0.96), (u1, 0.96), (u1, 0.92), (u0, 0.92),
        )
    for j in range(nv - 1):
        v0, v1 = 0.05 + 0.90 * (j / (nv - 1)), 0.05 + 0.90 * ((j + 1) / (nv - 1))
        add_quad(
            P_out[0, j], P_out[0, j+1], P_in[0, j+1], P_in[0, j],
            (0.04, v0), (0.04, v1), (0.08, v1), (0.08, v0),
        )
    for j in range(nv - 1):
        v0, v1 = 0.05 + 0.90 * (j / (nv - 1)), 0.05 + 0.90 * ((j + 1) / (nv - 1))
        add_quad(
            P_out[nu-1, j], P_in[nu-1, j], P_in[nu-1, j+1], P_out[nu-1, j+1],
            (0.96, v0), (0.92, v0), (0.92, v1), (0.96, v1),
        )

    return (
        np.array(verts, dtype=np.float32),
        np.array(norms, dtype=np.float32),
        np.array(uvs, dtype=np.float32),
        np.array(indices, dtype=np.uint32),
    )

# Map (u, s_norm, z_sign) on the hull cross-section to 3D point (x, y, z)
def hull_point(u, s_norm, z_sign=1.0, radial_inset=0.0):
    vt, vb, wz, _, _ = get_hull_slice(u)
    vc = 0.5 * (vt + vb)
    vh = max(0.005, 0.5 * (vt - vb))
    ang = s_norm * (math.pi * 0.5)
    sin_a = math.sin(ang)
    cos_a = math.cos(ang)
    # Fuller, rounder barrel-chested cetacean cross-section in the ventral throat pouch (s_norm < 0, u < 0.42)
    exp_lat = 0.42 if (s_norm < 0.0 and u < 0.42) else 0.48
    lat = (abs(cos_a) ** exp_lat) * wz
    z = z_sign * max(0.0, lat - radial_inset * abs(cos_a))
    v_scale = 0.035 if radial_inset > 0.2 else 0.055
    v = vc + sin_a * vh - radial_inset * v_scale * sin_a
    x, y = uv_to_world_xy(u, v, z=abs(z))
    return np.array([x, y, z], dtype=np.float32)

meshes = []

# Supports:
#   - 3D 45° perimeter bevel (`bevel_depth = 0.020m`): adjacent plates touch at the base of the 3D bevel (`du=0.0001`),
#     eliminating open black through-slots while casting a real 3D beveled V-groove shadow in both closed & exploded states!
#   - `bone`: hierarchical skeletal bone name (`cranial`, `jaw`, `thoracic`, `lumbar`, `peduncle`, `fluke`, `flipper_L/R`, `flipper_dist_L/R`)
def add_hull_patch(
    name, mat, u0, u1, s_fn0, s_fn1, z_sign=1.0, thick=0.13, inset=0.0, shingle=0.0,
    nu=28, nv=16, explode=(0,1,0), u_shift0=None, u_shift1=None, bone='thoracic', bevel_depth=0.020
):
    P_out = np.zeros((nu, nv, 3), dtype=np.float32)
    P_in = np.zeros((nu, nv, 3), dtype=np.float32)
    u_mid = 0.5 * (u0 + u1)
    s_ref0 = s_fn0(u_mid)
    s_ref1 = s_fn1(u_mid)
    t_s_grid = beveled_param_grid(nv, 0.032)
    t_u_grid = beveled_param_grid(nu, 0.024)
    for j in range(nv):
        t_s = float(t_s_grid[j] if z_sign > 0 else t_s_grid[nv - 1 - j])
        is_s_border = (j == 0 or j == nv - 1)
        s_approx = s_ref0 + (s_ref1 - s_ref0) * t_s
        du0 = u_shift0(s_approx) if u_shift0 is not None else 0.0
        du1 = u_shift1(s_approx) if u_shift1 is not None else 0.0
        u_start = u0 + du0
        u_end = u1 + du1
        edge_taper = math.sin(np.clip(t_s, 0.06, 0.94) * math.pi)
        for i in range(nu):
            t_u = float(t_u_grid[i])
            is_u_border = (i == 0 or i == nu - 1)
            u = u_start + (u_end - u_start) * t_u
            sa = s_fn0(u)
            sb = s_fn1(u)
            s = sa + (sb - sa) * t_s
            # 3D 45-deg perimeter bevel: recesses the outermost vertex ring by `bevel_depth`
            b_drop = bevel_depth if (is_u_border or is_s_border) else 0.0
            r_in = inset + shingle * (0.35 - 0.95 * t_u) * edge_taper + b_drop
            po = hull_point(u, s, z_sign, radial_inset=r_in)
            # V3 Priority-2 Detailing: 3D Waffle Structural Rib Relief sculpted onto the inner face `P_in`
            if bevel_depth > 0.0:
                is_frame = (t_u < 0.14 or t_u > 0.86 or t_s < 0.16 or t_s > 0.84)
                is_rib_u = abs(math.sin(t_u * math.pi * 3.0)) < 0.24
                is_rib_s = abs(math.sin(t_s * math.pi * 2.0)) < 0.26
                rib_mult = 1.12 if (is_frame or is_rib_u or is_rib_s) else 0.68
            else:
                rib_mult = 1.0
            pi = hull_point(u, s, z_sign, radial_inset=inset + thick * rib_mult)
            if abs(s) >= 0.994 or u <= 0.0005:
                po[2] = 0.0
                pi[2] = 0.0
            P_out[i, j] = po
            P_in[i, j] = pi
    v, n, uv, idx = build_thick_patch(P_out, P_in)
    meshes.append({
        'name': name,
        'mat': mat,
        'verts': v, 'norms': n, 'uvs': uv, 'indices': idx,
        'explode': list(explode),
        'bone': bone,
    })

    # V3 Priority-2 Detailing: Bolted Dark-Titanium Inner Arch Stiffener Ribs (`truss__{name}_{k}`)
    # Two narrow circumferential I-beam arch ribs mounted flush on the inner wall (`P_in`) of major plates.
    # Moves 1:1 with the parent plate (`explode` & `order`) so it adds authentic inner structural framing
    # without floating separately or blocking the view of the internal MHD reactor, sonar dome, or baleen rack!
    if any(k in name for k in ('rostrum_shield', 'maxilla_cowl', 'brow_hood', 'ridge_01', 'ridge_02', 'flank_01', 'flank_02', 'cheek_hull')):
        for r_idx, tu_center in enumerate([0.32, 0.68]):
            tnu, tnv = 5, 12
            T_out = np.zeros((tnu, tnv, 3), dtype=np.float32)
            T_in = np.zeros((tnu, tnv, 3), dtype=np.float32)
            for jj, ts_v in enumerate(np.linspace(0.12, 0.88, tnv)):
                if z_sign < 0:
                    ts_v = 1.0 - ts_v
                s_ap = s_ref0 + (s_ref1 - s_ref0) * ts_v
                du0_t = u_shift0(s_ap) if u_shift0 is not None else 0.0
                du1_t = u_shift1(s_ap) if u_shift0 is not None and u_shift1 is not None else (u_shift1(s_ap) if u_shift1 is not None else 0.0)
                us_t = u0 + du0_t
                ue_t = u1 + du1_t
                for ii, d_tu in enumerate(np.linspace(-0.028, 0.028, tnu)):
                    tu_v = np.clip(tu_center + d_tu, 0.05, 0.95)
                    u_t = us_t + (ue_t - us_t) * tu_v
                    sa_t = s_fn0(u_t)
                    sb_t = s_fn1(u_t)
                    s_t = sa_t + (sb_t - sa_t) * ts_v
                    to_pt = hull_point(u_t, s_t, z_sign, radial_inset=inset + thick * 0.95)
                    ti_pt = hull_point(u_t, s_t, z_sign, radial_inset=inset + thick * 0.95 + 0.048)
                    T_out[ii, jj] = to_pt
                    T_in[ii, jj] = ti_pt
            vt, nt, uvt, idxt = build_thick_patch(T_out, T_in)
            meshes.append({
                'name': f'truss__{name}_{r_idx}',
                'mat': 'titanium',
                'verts': vt, 'norms': nt, 'uvs': uvt, 'indices': idxt,
                'explode': list(explode),
                'bone': bone,
            })

# Exact 3D circular bearing hub definitions in world metres: (u_center, x_world, y_world, z_world, r_clear_top, r_clear_bot)
# V2 Compact Cranial & Forward Shoulder Landmarks (1:2.15 head-to-body ratio!)
HUB_CIRCLES_3D = [
    (0.205, -4.956, 1.266, 1.880, 0.72, 0.72),  # Eye gimbal hub (outer R = 0.63m)
    (0.335, -2.314, 0.713, 1.880, 1.15, 1.14),  # Shoulder main pivot hub (outer R = 1.06m)
    (0.655,  4.286, 0.267, 1.120, 0.72, 0.71),  # Mid-body lumbar pivot hub (outer R = 0.63m)
    (0.792,  7.236, 0.695, 0.660, 0.56, 0.55),  # Aft peduncle pivot hub (outer R = 0.49m)
]

def v_to_s(v_target, vc, vh):
    sin_a = np.clip((v_target - vc) / max(1e-4, vh), -0.985, 0.985)
    return float(math.asin(sin_a) / (math.pi * 0.5))

def trench_upper_s(u):
    vt, vb, wz, vtr, vgap = get_hull_slice(u)
    vc = 0.5 * (vt + vb)
    vh = max(0.01, 0.5 * (vt - vb))
    shroud_step = 0.0
    if 0.39 < u < 0.60:
        k1 = np.clip((u - 0.39) / 0.035, 0.0, 1.0)
        k2 = np.clip((0.60 - u) / 0.035, 0.0, 1.0)
        shroud_step = -0.010 * min(k1, k2)
    s_base = v_to_s(vtr + vgap + shroud_step, vc, vh)
    x_u, _ = uv_to_world_xy(u, vtr, z=wz * 0.85)
    for _, hx, hy, hz, r_top, _ in HUB_CIRCLES_3D:
        dx = x_u - hx
        if abs(dx) < r_top:
            t = 1.0 - (dx / r_top) ** 2
            y_arch = hy + r_top * math.sqrt(max(0.0, t))
            v_arch = world_y_to_v(y_arch, z=hz)
            s_arch = v_to_s(v_arch, vc, vh)
            s_base = max(s_base, s_arch)
    return float(np.clip(s_base, -0.65, 0.76))

def trench_lower_s(u):
    vt, vb, wz, vtr, vgap = get_hull_slice(u)
    vc = 0.5 * (vt + vb)
    vh = max(0.01, 0.5 * (vt - vb))
    s_base = v_to_s(vtr - vgap, vc, vh)
    x_u, _ = uv_to_world_xy(u, vtr, z=wz * 0.85)
    for _, hx, hy, hz, _, r_bot in HUB_CIRCLES_3D:
        dx = x_u - hx
        if abs(dx) < r_bot:
            t = 1.0 - (dx / r_bot) ** 2
            y_arch = hy - r_bot * math.sqrt(max(0.0, t))
            v_arch = world_y_to_v(y_arch, z=hz)
            s_arch = v_to_s(v_arch, vc, vh)
            s_base = min(s_base, s_arch)
    return float(np.clip(s_base, -0.88, 0.45))

def smooth_ramp(u, u_a, u_b):
    t = np.clip((u - u_a) / max(1e-5, u_b - u_a), 0.0, 1.0)
    return float(t * t * (3.0 - 2.0 * t))

def trap_tab(u, u0, u1, ramp=0.018):
    return smooth_ramp(u, u0, u0 + ramp) * (1.0 - smooth_ramp(u, u1 - ramp, u1))

# Smooth 30°/45° Z-stepped & asymmetric trapezoidal dovetail longitudinal seam between dorsal ridge and lateral flank
def dorsal_flank_split_s(u):
    s = 0.52
    s -= 0.14 * smooth_ramp(u, 0.28, 0.34)
    s += 0.16 * smooth_ramp(u, 0.46, 0.52)
    s -= 0.11 * smooth_ramp(u, 0.60, 0.65)
    s += 0.048 * trap_tab(u, 0.375, 0.440, 0.016)
    s -= 0.044 * trap_tab(u, 0.530, 0.585, 0.015)
    s += 0.040 * trap_tab(u, 0.670, 0.720, 0.014)
    return float(np.clip(s, 0.34, 0.58))

def make_s_dogleg(amp=0.0048, sign=1.0, s_center=0.46, s_width=0.22):
    def fn(s):
        k = np.clip((s - (s_center - s_width * 0.5)) / s_width, 0.0, 1.0)
        step = k * k * (3.0 - 2.0 * k) - 0.5
        return float(sign * amp * step)
    return fn

def make_s_hub_tangent(du_slope=0.010, s_anchor=0.22):
    def fn(s):
        ds = np.clip(s - s_anchor, -0.35, 0.45)
        return float(du_slope * ds)
    return fn

def make_s_dovetail(amp=0.0042, sign=1.0, s0=0.28, s1=0.62):
    def fn(s):
        tab = trap_tab(s, s0, s1, 0.08) - 0.45
        return float(sign * amp * tab)
    return fn

# -------------------------------------------------------------------------
# 1. Permanent Metallic Lateral Trench Channel (`trench__channel_*_L/R`)
#    Split across `cranial` (0.012..0.204), `thoracic` (0.204..0.654), `lumbar` (0.654..0.791),
#    and `peduncle` (0.791..0.880) so the recessed trench channel bends 100% with the spine bones!
# -------------------------------------------------------------------------
trench_bone_spans = [
    ('cranial',    0.012, 0.204, 20),
    ('thoracic',   0.204, 0.548, 28),
    ('spine_0',    0.548, 0.654, 12),
    ('lumbar',     0.654, 0.732, 10),
    ('lumbar_2',   0.732, 0.791, 10),
    ('peduncle',   0.791, 0.835, 8),
    ('peduncle_2', 0.835, 0.880, 8),
]
for bone_nm, u0_tr, u1_tr, nu_tr in trench_bone_spans:
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'trench__channel_{bone_nm}_{side_nm}', 'titanium',
            u0_tr, u1_tr,
            lambda u: max(-0.88, trench_lower_s(u) - 0.05),
            lambda u: min(0.88, trench_upper_s(u) + 0.05),
            z_sign=z_sgn, thick=0.12, inset=0.44, shingle=0.0, nu=nu_tr, nv=10,
            explode=(0.0, 0.0, 0.0), bone=bone_nm, bevel_depth=0.0
        )

# -------------------------------------------------------------------------
# 2. Subsystem `cranial` (Bone: `cranial`):
#    Compact, arched baleen whale head terminating at `seam_u204` (`u = 0.2040`) right at the eye gimbal hub!
# -------------------------------------------------------------------------
seam_u088 = make_s_dogleg(0.0055, 1.0, s_center=0.52, s_width=0.26)
seam_u204 = make_s_hub_tangent(-0.012, s_anchor=0.26)

for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
    # 2a. Reinforced high-pressure nose cone & rostrum shield (u = 0.000 .. 0.0880, Tier +1: inset=-0.020)
    add_hull_patch(
        f'cranial__rostrum_shield_{side_nm}', 'white',
        0.000, 0.0880,
        lambda u: trench_upper_s(u) + 0.006,
        lambda u: 0.998,
        z_sign=z_sgn, thick=0.14, inset=-0.020, shingle=0.016, nu=30, nv=20,
        explode=(-1.85, 0.95, 0.55 * z_sgn),
        u_shift0=None,
        u_shift1=seam_u088,
        bone='cranial',
    )
    # 2b. Sweeping maxilla & pre-orbital cheek cowl (u = 0.0882 .. 0.2040, Tier 0)
    add_hull_patch(
        f'cranial__maxilla_cowl_{side_nm}', 'ceramic',
        0.0882, 0.2040,
        lambda u: trench_upper_s(u) + 0.004,
        lambda u: dorsal_flank_split_s(u) - 0.0002,
        z_sign=z_sgn, thick=0.13, inset=0.000, shingle=0.020, nu=34, nv=16,
        explode=(-1.35, 0.85, 0.92 * z_sgn),
        u_shift0=seam_u088,
        u_shift1=seam_u204,
        bone='cranial',
    )
    # 2c. Large streamlined supraorbital / cranial dome hood (u = 0.0882 .. 0.2040, Tier +1: inset=-0.022)
    add_hull_patch(
        f'cranial__brow_hood_{side_nm}', 'white',
        0.0882, 0.2040,
        lambda u: dorsal_flank_split_s(u) + 0.0002,
        lambda u: 0.998,
        z_sign=z_sgn, thick=0.14, inset=-0.022, shingle=0.022, nu=34, nv=16,
        explode=(-0.95, 1.65, 0.75 * z_sgn),
        u_shift0=seam_u088,
        u_shift1=seam_u204,
        bone='cranial',
    )

# -------------------------------------------------------------------------
# 3. Subsystem `dorsal`:
#    3A. Dorsal Ridge Carapaces (`dorsal__ridge_01..03` on `thoracic` bone; `04..05` on `lumbar` bone)
#        Aligned circumferentially with `dorsal_flank_bands` & `belly_u_bands` at `u = 0.6540` (`seam_f34`)!
# -------------------------------------------------------------------------
seam_r12 = make_s_dogleg(0.0048, -1.0, s_center=0.72, s_width=0.22)
seam_r23 = make_s_dovetail(0.0044, 1.0, s0=0.58, s1=0.86)
seam_f34 = make_s_hub_tangent(-0.010, s_anchor=0.18)
seam_r45 = make_s_dogleg(0.0040, 1.0, s_center=0.68, s_width=0.22)
seam_u791 = make_s_hub_tangent(0.008, s_anchor=0.25)

dorsal_ridge_bands = [
    (0.2042, 0.4450, '01', 'white',   seam_u204, seam_r12,  48, 'thoracic'),
    (0.4452, 0.5680, '02', 'ceramic', seam_r12,  seam_r23,  32, 'thoracic'),
    (0.5682, 0.6540, '03', 'white',   seam_r23,  seam_f34,  28, 'spine_0'),
    (0.6542, 0.7320, '04', 'ceramic', seam_f34,  seam_r45,  24, 'lumbar'),
    (0.7322, 0.7910, '05', 'white',   seam_r45,  seam_u791, 24, 'lumbar_2'),
]
for idx, (u0, u1, num_str, mat_nm, sh0, sh1, nu_cnt, bone_nm) in enumerate(dorsal_ridge_bands):
    u_mid = 0.5 * (u0 + u1)
    ex_x = (u_mid - 0.48) * 1.8
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'dorsal__ridge_{num_str}_{side_nm}', mat_nm,
            u0, u1,
            lambda u: dorsal_flank_split_s(u) + 0.0002,
            lambda u: 0.998,
            z_sign=z_sgn, thick=0.14, inset=-0.022, shingle=0.024, nu=nu_cnt, nv=16,
            explode=(ex_x, 2.35 + (idx % 2) * 0.28, z_sgn * (0.65 + (idx % 2) * 0.20)),
            u_shift0=sh0, u_shift1=sh1,
            bone=bone_nm,
        )

# -------------------------------------------------------------------------
#    3B. Function-Following Lateral Flank Plates (`dorsal__flank_01..02` on `thoracic`; `03` on `spine_0`; `04` on `lumbar`; `05` on `lumbar_2`)
# -------------------------------------------------------------------------
seam_f12 = make_s_hub_tangent(0.012, s_anchor=0.22)
seam_f23 = make_s_dovetail(0.0048, -1.0, s0=0.12, s1=0.38)
seam_f34 = make_s_hub_tangent(-0.010, s_anchor=0.18)
seam_f45 = make_s_dogleg(0.0044, 1.0, s_center=0.24, s_width=0.18)

dorsal_flank_bands = [
    (0.2042, 0.3340, '01', 'white',   0.000, 0.020, seam_u204, seam_f12,  36, 'thoracic'),
    (0.3342, 0.5320, '02', 'white',  -0.004, 0.022, seam_f12,  seam_f23,  44, 'thoracic'),
    (0.5322, 0.6540, '03', 'ceramic', 0.012, 0.022, seam_f23,  seam_f34,  36, 'spine_0'),
    (0.6542, 0.7320, '04', 'white',   0.000, 0.024, seam_f34,  seam_f45,  28, 'lumbar'),
    (0.7322, 0.7910, '05', 'ceramic', 0.010, 0.024, seam_f45,  seam_u791, 24, 'lumbar_2'),
]
for idx, (u0, u1, num_str, mat_nm, fl_inset, fl_shingle, sh0, sh1, nu_cnt, bone_nm) in enumerate(dorsal_flank_bands):
    u_mid = 0.5 * (u0 + u1)
    ex_x = (u_mid - 0.48) * 1.6
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'dorsal__flank_{num_str}_{side_nm}', mat_nm,
            u0, u1,
            lambda u: trench_upper_s(u),
            lambda u: dorsal_flank_split_s(u) - 0.0002,
            z_sign=z_sgn, thick=0.13, inset=fl_inset, shingle=fl_shingle, nu=nu_cnt, nv=16,
            explode=(ex_x, 0.55 + (idx % 2) * 0.22, z_sgn * (1.60 + (idx % 2) * 0.25)),
            u_shift0=sh0, u_shift1=sh1,
            bone=bone_nm,
        )

# -------------------------------------------------------------------------
# 4. Dorsal Fin Assembly (`dorsal__fin_...`, Bone: `spine_0`)
# -------------------------------------------------------------------------
fin_nu, fin_nv = 24, 14
fin_us = np.linspace(0.530, 0.638, fin_nu)
for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
    P_out = np.zeros((fin_nu, fin_nv, 3), dtype=np.float32)
    P_in = np.zeros((fin_nu, fin_nv, 3), dtype=np.float32)
    for i, u in enumerate(fin_us):
        v_base = float(f_hull_top(u)) - 0.005
        v_peak = float(f_dorsal_fin(u))
        v_bot_fin = v_base if u < 0.612 else v_base + ((u - 0.612) / 0.026) * 0.055
        vs = np.linspace(v_bot_fin, max(v_bot_fin + 0.006, v_peak), fin_nv)
        if z_sgn < 0:
            vs = vs[::-1]
        for j, v in enumerate(vs):
            t_h = (v - v_bot_fin) / max(1e-4, v_peak - v_bot_fin)
            z_out = z_sgn * (0.24 * (1.0 - 0.72 * t_h) * math.sin(math.pi * (i / (fin_nu - 1))))
            z_in = z_sgn * 0.004
            x_o, y_o = uv_to_world_xy(u, v, z=abs(z_out))
            P_out[i, j] = [x_o, y_o, z_out]
            P_in[i, j] = [x_o, y_o, z_in]
    v, n, uv, idx = build_thick_patch(P_out, P_in)
    meshes.append({
        'name': f'dorsal__fin_blade_{side_nm}',
        'mat': 'white',
        'verts': v, 'norms': n, 'uvs': uv, 'indices': idx,
        'explode': [0.35, 2.75, z_sgn * 0.85],
        'bone': 'spine_0',
    })

# -------------------------------------------------------------------------
# 5. Subsystem `pectoral`: Ventral Throat Pleat Array (Bone: `jaw`) & Belly Armor (`thoracic` / `lumbar`)
#    Includes a continuous sculpted ceramic inner chin/throat bowl (`pectoral__throat_liner_L/R`)
#    and full-length pleats starting at `u = 0.000` so the Front View has ZERO hollow gaps!
# -------------------------------------------------------------------------
for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
    add_hull_patch(
        f'pectoral__throat_liner_{side_nm}', 'ceramic',
        0.000, 0.4320,
        lambda u: -0.998,
        lambda u: trench_lower_s(u) - 0.004,
        z_sign=z_sgn, thick=0.10, inset=0.042, shingle=0.0, nu=36, nv=14,
        explode=(-0.35, -1.15, z_sgn * 0.25),
        bone='jaw', bevel_depth=0.0,
    )

N_PLEATS = 7
for p_idx in range(N_PLEATS):
    fa = p_idx / N_PLEATS
    fb = (p_idx + 0.985) / N_PLEATS
    u_start = 0.000
    if p_idx == 6:
        u_end = 0.288
    elif p_idx == 5:
        u_end = 0.306
    else:
        u_end = 0.432
    pleat_inset = 0.002 if p_idx % 2 == 0 else 0.014
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'pectoral__pleat_0{p_idx+1}_{side_nm}',
            'white' if p_idx % 2 == 0 else 'ceramic',
            u_start, u_end,
            lambda u, a=fa, b=fb: -0.998 + a * (trench_lower_s(u) + 0.998),
            lambda u, a=fa, b=fb: -0.998 + b * (trench_lower_s(u) + 0.998),
            z_sign=z_sgn, thick=0.11, inset=pleat_inset, shingle=0.010, nu=42, nv=8,
            explode=(-0.45 - 0.08 * p_idx, -1.45 - 0.20 * (N_PLEATS - p_idx), z_sgn * (0.42 + 0.14 * p_idx)),
            bone='jaw', bevel_depth=0.010,
        )

seam_b12 = make_s_dovetail(0.0045, -1.0, s0=-0.78, s1=-0.42)
seam_b23 = make_s_dogleg(0.0045, 1.0, s_center=-0.58, s_width=0.22)
seam_b34 = make_s_dogleg(0.0040, -1.0, s_center=-0.52, s_width=0.22)
belly_u_bands = [
    (0.4322, 0.5680, '01', 'ceramic', 0.000, 0.022, None,     seam_b12, 'thoracic'),
    (0.5682, 0.6540, '02', 'white',   0.012, 0.022, seam_b12, seam_b23, 'spine_0'),
    (0.6542, 0.7320, '03', 'ceramic', 0.000, 0.024, seam_b23, seam_b34, 'lumbar'),
    (0.7322, 0.7910, '04', 'white',   0.008, 0.024, seam_b34, None,     'lumbar_2'),
]
for idx, (u0, u1, num_str, mat_nm, b_inset, b_shingle, sh0, sh1, bone_nm) in enumerate(belly_u_bands):
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'pectoral__belly_{num_str}_{side_nm}', mat_nm,
            u0, u1,
            lambda u: -0.996,
            lambda u: trench_lower_s(u),
            z_sign=z_sgn, thick=0.12, inset=b_inset, shingle=b_shingle, nu=22, nv=12,
            explode=((0.5 * (u0 + u1) - 0.5) * 1.2, -1.45 - idx * 0.22, z_sgn * 0.80),
            u_shift0=sh0, u_shift1=sh1,
            bone=bone_nm,
        )

# -------------------------------------------------------------------------
# 6. Subsystem `pectoral` V2:
#    - True Rotary Gimbal Shaft & Orange Torque Collar (`pectoral__flipper_root_{L/R}` + `pectoral__flipper_collar_{L/R}`)
#      emerging from the center of `G.shoulderHub` (`[-2.965, 0.710, ±1.920]`) across `t = 0.00..0.145`
#      with an explicit articulation clearance gap before the white armor starts (`t = 0.140`)!
#    - Reference-Accurate 3-Layer Mechanical Hydrofoil Hierarchy:
#      * Layer A (Leading-Edge Main Carapaces): `01` (Upper Arm, `flipper_{L/R}`), `02` (Forearm, `flipper_dist_{L/R}`), `03` (Tip, `flipper_dist_{L/R}`)
#        + Orange Leading-Edge Bumper Strip (`pectoral__flipper_accent_{L/R}`)
#      * Layer B (Central Longitudinal Hydraulic Trench, `w in [0.57, 0.66]` + Mid-Wing Rotary Hinge Gap, `t in [0.495, 0.540]`):
#        Exposes the dark titanium skeleton (`pectoral__flipper_spar_*`) and chrome hydraulic cylinders!
#      * Layer C (Trailing-Edge Articulated Flap Plates, `w in [0.66, 1.00]`):
#        `04` (Upper-Arm Flap, `flipper_{L/R}`) and `05` (Forearm Flap, `flipper_dist_{L/R}`), stepped down in thickness!
# -------------------------------------------------------------------------
# Columns: [t_span, x_le, y_le, z_le, x_te, y_te, z_te, thickness]
flipper_sym_ctrl = np.array([
    [0.00, -2.88,  0.40, 2.26, -1.48,  0.82, 1.36, 0.48],
    [0.18, -2.16, -0.26, 3.00, -0.50,  0.20, 1.82, 0.52],
    [0.40, -1.06, -1.14, 3.74,  0.58, -0.68, 2.56, 0.46],
    [0.62,  0.08, -1.98, 4.34,  1.54, -1.58, 3.30, 0.40],
    [0.82,  1.16, -2.66, 4.70,  2.22, -2.38, 3.94, 0.30],
    [1.00,  2.14, -3.16, 4.82,  2.62, -3.02, 4.48, 0.15],
])
flipper_sym_splines = [PchipInterpolator(flipper_sym_ctrl[:, 0], flipper_sym_ctrl[:, k]) for k in range(1, 8)]

def interp_flipper_sym(t):
    tc = float(np.clip(t, 0.0, 1.0))
    return tuple(float(sp(tc)) for sp in flipper_sym_splines)

def flipper_world_pt(t, w=0.45, z_sgn=1.0):
    xle, yle, zle, xte, yte, zte, _ = interp_flipper_sym(t)
    x = xle + (xte - xle) * w
    y = yle + (yte - yle) * w
    z_abs = zle + (zte - zle) * w
    return np.array([x, y, z_sgn * z_abs], dtype=np.float32)

def flipper_unit_normal(t, z_sgn=1.0):
    p0 = flipper_world_pt(max(0.0, t - 0.02), 0.45, z_sgn)
    p1 = flipper_world_pt(min(1.0, t + 0.02), 0.45, z_sgn)
    c0 = flipper_world_pt(t, 0.0, z_sgn)
    c1 = flipper_world_pt(t, 1.0, z_sgn)
    v_span = p1 - p0
    v_chord = c1 - c0
    n = np.cross(v_span, v_chord) if z_sgn > 0 else np.cross(v_chord, v_span)
    ln = np.linalg.norm(n)
    return n / ln if ln > 1e-8 else np.array([0.0, 0.0, z_sgn], dtype=np.float32)

# 5 Layered Armor Plates per Flipper:
#   (num_str, t0, t1, w0, w1, th_scale, mat_nm, is_dist_bone, ex_mult)
flip_plate_specs = [
    # 01: Upper-Arm Leading-Edge Main Carapace (Tier +1 thick, leaves t < 0.140 rotary shaft exposed!)
    ('01', 0.140, 0.495, 0.00, 0.57, 1.08, 'white',   False, 0.72),
    # 02: Forearm Leading-Edge Swept Carapace (starts after t=0.495..0.540 mid-wing hinge gap, stencil '04')
    ('02', 0.540, 0.815, 0.00, 0.59, 1.04, 'ceramic', True,  1.25),
    # 03: Distal Wingtip Hydrofoil Fairing (full-chord tapered hydrofoil tip)
    ('03', 0.822, 1.000, 0.00, 0.96, 0.98, 'white',   True,  1.78),
    # 04: Upper-Arm Trailing-Edge Articulated Flap Plate (stepped down behind w=0.57..0.66 hydraulic trench)
    ('04', 0.168, 0.485, 0.66, 1.00, 0.70, 'ceramic', False, 0.92),
    # 05: Forearm Trailing-Edge Articulated Flap Plate (stepped down behind forearm hydraulic trench)
    ('05', 0.552, 0.805, 0.66, 1.00, 0.68, 'white',   True,  1.45),
]

for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
    bone_prox = f'flipper_{side_nm}'
    bone_dist = f'flipper_dist_{side_nm}'
    u_span = flipper_world_pt(0.98, 0.45, z_sgn) - flipper_world_pt(0.06, 0.45, z_sgn)
    u_span = u_span / np.linalg.norm(u_span)

    # 6a. Exposed Stepped Rotary Gimbal Shaft & Clevis Yoke (`pectoral__flipper_root_{L/R}`)
    #     Emerges directly from the center of `G.shoulderHub` (`[-2.314, 0.713, ±1.880]`) across t = 0.00..0.155
    r_nu, r_nv = 18, 20
    P_out_r = np.zeros((r_nu, r_nv, 3), dtype=np.float32)
    P_in_r = np.zeros((r_nu, r_nv, 3), dtype=np.float32)
    p_hub = np.array([-2.314, 0.713, z_sgn * 1.80], dtype=np.float32)
    p_root_end = flipper_world_pt(0.155, 0.40, z_sgn)
    ax = p_root_end - p_hub
    ax_u = ax / np.linalg.norm(ax)
    up_ref = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    b1 = np.cross(ax_u, up_ref)
    b1 = b1 / np.linalg.norm(b1)
    b2 = np.cross(ax_u, b1)
    for i, s_r in enumerate(np.linspace(0.0, 1.0, r_nu)):
        c_pt = p_hub + ax * s_r
        # Stepped rotary shaft profile: bearing journal (0..0.32) -> recessed axle neck (0.32..0.72) -> clevis flange (0.72..1.0)
        if s_r < 0.32:
            rad_o = 0.42
        elif s_r < 0.74:
            rad_o = 0.29
        else:
            rad_o = 0.35 * (1.0 - 0.15 * (s_r - 0.74) / 0.26)
        rad_i = rad_o * 0.65
        ang_seq = np.linspace(0.0, 2.0 * math.pi, r_nv) if z_sgn > 0 else np.linspace(2.0 * math.pi, 0.0, r_nv)
        for j, ang in enumerate(ang_seq):
            radial = math.cos(ang) * b1 + math.sin(ang) * b2
            P_out_r[i, j] = c_pt + radial * rad_o
            P_in_r[i, j] = c_pt + radial * rad_i
    v_r, n_r, uv_r, idx_r = build_thick_patch(P_out_r, P_in_r)
    meshes.append({
        'name': f'pectoral__flipper_root_{side_nm}',
        'mat': 'titanium',
        'verts': v_r, 'norms': n_r, 'uvs': uv_r, 'indices': idx_r,
        'explode': (u_span * 0.25 + np.array([0.0, 0.0, z_sgn * 0.22])).tolist(),
        'bone': bone_prox,
    })

    # 6a-2. Bright Orange Anodized Rotary Torque Collar (`pectoral__flipper_collar_{L/R}`) on the exposed shaft neck!
    c_nu, c_nv = 8, 20
    P_out_c = np.zeros((c_nu, c_nv, 3), dtype=np.float32)
    P_in_c = np.zeros((c_nu, c_nv, 3), dtype=np.float32)
    for i, s_r in enumerate(np.linspace(0.40, 0.66, c_nu)):
        c_pt = p_hub + ax * s_r
        rad_o = 0.355
        rad_i = 0.285
        ang_seq = np.linspace(0.0, 2.0 * math.pi, c_nv) if z_sgn > 0 else np.linspace(2.0 * math.pi, 0.0, c_nv)
        for j, ang in enumerate(ang_seq):
            radial = math.cos(ang) * b1 + math.sin(ang) * b2
            P_out_c[i, j] = c_pt + radial * rad_o
            P_in_c[i, j] = c_pt + radial * rad_i
    v_c, n_c, uv_c, idx_c = build_thick_patch(P_out_c, P_in_c)
    meshes.append({
        'name': f'pectoral__flipper_collar_{side_nm}',
        'mat': 'accent',
        'verts': v_c, 'norms': n_c, 'uvs': uv_c, 'indices': idx_c,
        'explode': (u_span * 0.32 + np.array([0.0, 0.0, z_sgn * 0.28])).tolist(),
        'bone': bone_prox,
    })

    # 6a-3. V3 Priority-1 Detailing: Slotted Planetary Cardan Gimbal Clevis Yoke (`pectoral__flipper_gimbal_{L/R}`)
    g_nu, g_nv = 10, 24
    P_out_g = np.zeros((g_nu, g_nv, 3), dtype=np.float32)
    P_in_g = np.zeros((g_nu, g_nv, 3), dtype=np.float32)
    for i, s_r in enumerate(np.linspace(0.68, 0.98, g_nu)):
        c_pt = p_hub + ax * s_r
        ang_seq = np.linspace(0.0, 2.0 * math.pi, g_nv) if z_sgn > 0 else np.linspace(2.0 * math.pi, 0.0, g_nv)
        for j, ang in enumerate(ang_seq):
            lug = 0.055 if math.cos(6.0 * ang) > 0.35 else 0.0
            rad_o = 0.37 + lug
            rad_i = 0.27
            radial = math.cos(ang) * b1 + math.sin(ang) * b2
            P_out_g[i, j] = c_pt + radial * rad_o
            P_in_g[i, j] = c_pt + radial * rad_i
    v_g, n_g, uv_g, idx_g = build_thick_patch(P_out_g, P_in_g)
    meshes.append({
        'name': f'pectoral__flipper_gimbal_{side_nm}',
        'mat': 'steel',
        'verts': v_g, 'norms': n_g, 'uvs': uv_g, 'indices': idx_g,
        'explode': (u_span * 0.42 + np.array([0.0, 0.0, z_sgn * 0.34])).tolist(),
        'bone': bone_prox,
    })

    # 6b. 5 Layered Hydrofoil Armor Plates (`pectoral__flipper_{L/R}_01..05`)
    for num_str, t0, t1, w0, w1, th_scale, mat_nm, is_dist_bone, ex_dist in flip_plate_specs:
        nu, nv = 18, 14
        P_out = np.zeros((nu, nv, 3), dtype=np.float32)
        P_in = np.zeros((nu, nv, 3), dtype=np.float32)
        ws = w0 + beveled_param_grid(nv, 0.032) * (w1 - w0)
        if z_sgn < 0:
            ws = ws[::-1]
        for j, w in enumerate(ws):
            w_local = (w - w0) / max(1e-4, w1 - w0)
            # 45-deg dog-leg step along span borders for mechanical interlocking look
            dw = 0.014 * (smooth_ramp(w_local, 0.28, 0.72) - 0.5)
            t_start = t0 + (dw if num_str in ('02', '03', '05') else 0.0)
            t_end = t1 + (dw if num_str in ('01', '02', '04') else 0.0)
            ts = t_start + beveled_param_grid(nu, 0.028) * (t_end - t_start)
            for i, t in enumerate(ts):
                t_u = i / max(1, nu - 1)
                *_, th = interp_flipper_sym(t)
                base_pt = flipper_world_pt(t, w, z_sgn)
                n_vec = flipper_unit_normal(t, z_sgn)
                # Full-chord NACA envelope combined with local plate bevel so both leading carapaces and trailing flaps have crisp 3D chamfered edges
                global_foil = math.sin(math.pow(np.clip(w, 0.02, 0.98), 0.62) * math.pi)
                local_arch = 0.72 + 0.28 * math.sin(np.clip(w_local, 0.0, 1.0) * math.pi)
                edge_bevel = 0.50 if (i == 0 or i == nu - 1 or j == 0 or j == nv - 1) else 1.0
                camber = max(0.18, global_foil) * local_arch * th * th_scale * edge_bevel
                shingle_lift = 0.024 * (1.0 - t_u)
                P_out[i, j] = base_pt + n_vec * (camber * 0.60 + shingle_lift)
                P_in[i, j] = base_pt - n_vec * (camber * 0.40 - shingle_lift * 0.3)
        v, n, uv, idx = build_thick_patch(P_out, P_in)
        w_mid = 0.5 * (w0 + w1)
        aft_ex = 0.35 if w0 > 0.5 else 0.0
        ex_vec = (u_span * ex_dist + np.array([aft_ex, -0.18 * aft_ex, z_sgn * 0.36])).tolist()
        meshes.append({
            'name': f'pectoral__flipper_{side_nm}_{num_str}',
            'mat': mat_nm,
            'verts': v, 'norms': n, 'uvs': uv, 'indices': idx,
            'explode': ex_vec,
            'proxAnchor': flipper_world_pt(t0 + 0.02, w_mid, z_sgn).round(4).tolist(),
            'distAnchor': flipper_world_pt(t1 - 0.02, w_mid, z_sgn).round(4).tolist(),
            'bone': bone_dist if is_dist_bone else bone_prox,
        })

    # 6b-2. Subtle Recessed Orange Mechanical Lock-Tab (`pectoral__flipper_accent_{L/R}`) near the distal end of Upper Arm `01`
    a_nu, a_nv = 8, 6
    P_out_a = np.zeros((a_nu, a_nv, 3), dtype=np.float32)
    P_in_a = np.zeros((a_nu, a_nv, 3), dtype=np.float32)
    ws_a = np.linspace(0.02, 0.08, a_nv) if z_sgn > 0 else np.linspace(0.08, 0.02, a_nv)
    for i, t in enumerate(np.linspace(0.41, 0.48, a_nu)):
        *_, th = interp_flipper_sym(t)
        n_vec = flipper_unit_normal(t, z_sgn)
        for j, w in enumerate(ws_a):
            base_pt = flipper_world_pt(t, w, z_sgn)
            foil = math.sin(math.pow(max(0.03, w), 0.62) * math.pi) * th * 1.06
            P_out_a[i, j] = base_pt + n_vec * (foil * 0.60 + 0.012)
            P_in_a[i, j] = base_pt - n_vec * (foil * 0.36)
    v_a, n_a, uv_a, idx_a = build_thick_patch(P_out_a, P_in_a)
    meshes.append({
        'name': f'pectoral__flipper_accent_{side_nm}',
        'mat': 'accent',
        'verts': v_a, 'norms': n_a, 'uvs': uv_a, 'indices': idx_a,
        'explode': (u_span * 0.80 + np.array([-0.25, 0.10, z_sgn * 0.42])).tolist(),
        'bone': bone_prox,
    })

    # 6c. Two-Stage Internal Dark Titanium Hydrofoil Skeleton (`pectoral__flipper_spar_{L/R}` & `pectoral__flipper_spar_dist_{L/R}`)
    #     Visible inside the longitudinal hydraulic trench (w in [0.55, 0.68]) and the mid-wing rotary hinge gap (t in [0.495, 0.540])!
    for spar_nm, t_s0, t_s1, sp_bone, ex_d in [
        (f'pectoral__flipper_spar_{side_nm}',      0.10, 0.525, bone_prox, 0.95),
        (f'pectoral__flipper_spar_dist_{side_nm}', 0.520, 0.94, bone_dist, 1.45),
    ]:
        nu, nv = 20, 10
        P_out = np.zeros((nu, nv, 3), dtype=np.float32)
        P_in = np.zeros((nu, nv, 3), dtype=np.float32)
        ws = np.linspace(0.46, 0.88, nv) if z_sgn > 0 else np.linspace(0.88, 0.46, nv)
        for i, t in enumerate(np.linspace(t_s0, t_s1, nu)):
            *_, th = interp_flipper_sym(t)
            n_vec = flipper_unit_normal(t, z_sgn)
            for j, w in enumerate(ws):
                base_pt = flipper_world_pt(t, w, z_sgn) - n_vec * 0.015
                camber = math.sin(((w - 0.44) / 0.46) * math.pi) * th * 0.34
                P_out[i, j] = base_pt + n_vec * camber
                P_in[i, j] = base_pt - n_vec * camber
        v, n, uv, idx = build_thick_patch(P_out, P_in)
        meshes.append({
            'name': spar_nm,
            'mat': 'titanium',
            'verts': v, 'norms': n, 'uvs': uv, 'indices': idx,
            'explode': (u_span * ex_d + np.array([0.0, 0.0, z_sgn * 0.32])).tolist(),
            'bone': sp_bone,
        })

# -------------------------------------------------------------------------
# 7. Subsystem `caudal`:
#    7A. Caudal Peduncle Sleeves (`peduncle` bone, u = 0.7912 .. 0.9160)
#        Tapers smoothly right into the root of the horizontal flukes!
# -------------------------------------------------------------------------
seam_c12 = make_s_dogleg(0.0038, 1.0, s_center=0.0, s_width=0.45)
seam_c23 = make_s_dogleg(0.0038, -1.0, s_center=0.0, s_width=0.45)
seam_c34 = make_s_dogleg(0.0035, 1.0, s_center=0.0, s_width=0.45)

caudal_u_bands = [
    (0.7912, 0.8350, '01', 'white',   seam_u791, seam_c12, 'peduncle'),
    (0.8352, 0.8760, '02', 'ceramic', seam_c12,  seam_c23, 'peduncle_2'),
    (0.8762, 0.9160, '03', 'white',   seam_c23,  seam_c34, 'peduncle_3'),
]
for idx, (u0, u1, num_str, mat_nm, sh0, sh1, c_bone) in enumerate(caudal_u_bands):
    for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
        add_hull_patch(
            f'caudal__peduncle_top_{num_str}_{side_nm}', mat_nm,
            u0, u1,
            lambda u: trench_upper_s(u),
            lambda u: 0.996,
            z_sign=z_sgn, thick=0.11, inset=-0.008, shingle=0.026, nu=18, nv=12,
            explode=(-0.45 + idx * 0.25, 1.15 + idx * 0.22, z_sgn * 0.65),
            u_shift0=sh0, u_shift1=sh1,
            bone=c_bone,
        )
        add_hull_patch(
            f'caudal__peduncle_bot_{num_str}_{side_nm}', 'ceramic' if mat_nm == 'white' else 'white',
            u0, u1,
            lambda u: -0.996,
            lambda u: trench_lower_s(u),
            z_sign=z_sgn, thick=0.11, inset=0.000, shingle=0.026, nu=18, nv=12,
            explode=(0.65 + idx * 0.25, -0.95 - idx * 0.20, z_sgn * 0.65),
            u_shift0=sh0, u_shift1=sh1,
            bone=c_bone,
        )

# -------------------------------------------------------------------------
#    7B. TRUE 3D Horizontal Twin-Lobed Whale Caudal Flukes (`fluke` bone)
#        Broad crescent whale planform (chord 1.92m at root/mid-span, wingspan 7.20m across +-Z,
#        central V-notch at x=9.38m, 24° dihedral, and 0.38m NACA hydrofoil thickness along +-Y)!
#        Plugs directly into the end of the tail peduncle at `G.flukeHub` (`[8.38, 1.72, ±0.36]`)!
# -------------------------------------------------------------------------
# Columns: [s_span, x_le, y_le, x_te, y_te, z_span, thickness]
fluke_lobe_ctrl = np.array([
    [0.00,  8.68, 1.72, 10.46, 1.76, 0.00, 0.40],
    [0.24,  9.04, 2.12, 10.92, 2.08, 1.02, 0.34],
    [0.52,  9.68, 2.68, 11.24, 2.58, 2.16, 0.26],
    [0.78, 10.52, 3.24, 11.48, 3.14, 3.06, 0.18],
    [1.00, 11.40, 3.72, 11.66, 3.64, 3.60, 0.08],
])
fluke_lobe_splines = [PchipInterpolator(fluke_lobe_ctrl[:, 0], fluke_lobe_ctrl[:, k]) for k in range(1, 7)]

def interp_fluke_lobe(s):
    sc = float(np.clip(s, 0.0, 1.0))
    return tuple(float(sp(sc)) for sp in fluke_lobe_splines)

def fluke_world_pt(s, w=0.45, z_sgn=1.0):
    xle, yle, xte, yte, zs, _ = interp_fluke_lobe(s)
    x = xle + (xte - xle) * w
    y = yle + (yte - yle) * w
    return np.array([x, y, z_sgn * zs], dtype=np.float32)

def fluke_unit_normal(s, z_sgn=1.0):
    p0 = fluke_world_pt(max(0.0, s - 0.02), 0.45, z_sgn)
    p1 = fluke_world_pt(min(1.0, s + 0.02), 0.45, z_sgn)
    c0 = fluke_world_pt(s, 0.0, z_sgn)
    c1 = fluke_world_pt(s, 1.0, z_sgn)
    v_span = p1 - p0
    v_chord = c1 - c0
    # Upper (dorsal, +Y) normal of the horizontal fluke wing
    n = np.cross(v_chord, v_span) if z_sgn > 0 else np.cross(v_span, v_chord)
    ln = np.linalg.norm(n)
    return n / ln if ln > 1e-8 else np.array([0.0, 1.0, 0.0], dtype=np.float32)

fluke_span_segs = [
    (0.02, 0.35, '01', 'white'),
    (0.36, 0.68, '02', 'ceramic'),
    (0.69, 1.00, '03', 'white'),
]

for side_nm, z_sgn in [('L', 1.0), ('R', -1.0)]:
    u_fluke_span = fluke_world_pt(0.98, 0.45, z_sgn) - fluke_world_pt(0.05, 0.45, z_sgn)
    u_fluke_span = u_fluke_span / np.linalg.norm(u_fluke_span)

    for idx, (s0, s1, num_str, mat_nm) in enumerate(fluke_span_segs):
        nu, nv = 16, 14
        P_out = np.zeros((nu, nv, 3), dtype=np.float32)
        P_in = np.zeros((nu, nv, 3), dtype=np.float32)
        ws = beveled_param_grid(nv, 0.028)
        if z_sgn > 0:
            ws = ws[::-1]
        for j, w in enumerate(ws):
            ds = 0.014 * (smooth_ramp(w, 0.25, 0.75) - 0.5)
            s_start = s0 + (ds if idx > 0 else 0.0)
            s_end = s1 + (ds if idx < 2 else 0.0)
            ss_grid = s_start + beveled_param_grid(nu, 0.028) * (s_end - s_start)
            for i, s_val in enumerate(ss_grid):
                t_u = i / max(1, nu - 1)
                _, _, _, _, _, th = interp_fluke_lobe(s_val)
                base_pt = fluke_world_pt(s_val, w, z_sgn)
                n_vec = fluke_unit_normal(s_val, z_sgn)
                # True horizontal airfoil thickness along wing normal (+Y dorsal / -Y ventral)
                foil_shape = math.sin(math.pow(np.clip(w, 0.0, 1.0), 0.62) * math.pi)
                edge_bevel = 0.52 if (i == 0 or i == nu - 1 or j == 0 or j == nv - 1) else 1.0
                camber = foil_shape * th * edge_bevel
                shingle_lift = 0.018 * (1.0 - t_u)
                P_out[i, j] = base_pt + n_vec * (camber * 0.56 + shingle_lift)
                P_in[i, j] = base_pt - n_vec * (camber * 0.44 + shingle_lift * 0.4)
        v, n, uv, idxs = build_thick_patch(P_out, P_in)
        ex_dist = 0.45 + (idx + 1) * 0.48
        ex_vec = (u_fluke_span * ex_dist + np.array([0.18 * (idx + 1), 0.14 * (idx + 1), 0.0])).tolist()
        meshes.append({
            'name': f'caudal__fluke_{num_str}_{side_nm}',
            'mat': mat_nm,
            'verts': v, 'norms': n, 'uvs': uv, 'indices': idxs,
            'explode': ex_vec,
            'bone': 'fluke',
        })

    # Internal Swept Horizontal Titanium Wing Spar for each fluke lobe (`caudal__fluke_spar_{L/R}`)
    nu, nv = 24, 10
    P_out = np.zeros((nu, nv, 3), dtype=np.float32)
    P_in = np.zeros((nu, nv, 3), dtype=np.float32)
    ws = np.linspace(0.78, 0.22, nv) if z_sgn > 0 else np.linspace(0.22, 0.78, nv)
    for i, s_val in enumerate(np.linspace(0.02, 0.92, nu)):
        _, _, _, _, _, th = interp_fluke_lobe(s_val)
        n_vec = fluke_unit_normal(s_val, z_sgn)
        for j, w in enumerate(ws):
            base_pt = fluke_world_pt(s_val, w, z_sgn)
            camber = math.sin(w * math.pi) * th * 0.20
            P_out[i, j] = base_pt + n_vec * camber
            P_in[i, j] = base_pt - n_vec * camber
    v, n, uv, idxs = build_thick_patch(P_out, P_in)
    meshes.append({
        'name': f'caudal__fluke_spar_{side_nm}',
        'mat': 'titanium',
        'verts': v, 'norms': n, 'uvs': uv, 'indices': idxs,
        'explode': (u_fluke_span * 0.95 + np.array([0.25, 0.18, 0.0])).tolist(),
        'bone': 'fluke',
    })

# -------------------------------------------------------------------------
# 8. Export binary glTF 2.0 (`hull.glb`) with LOCAL PIVOT CENTERING!
#    Every node stores its own 3D world centroid in `translation: [px, py, pz]`
#    and local vertices `v_local = v_world - pivot`, so rotations NEVER swing around (0,0,0)!
# -------------------------------------------------------------------------
mat_names = ['white', 'ceramic', 'titanium', 'steel', 'brass', 'liner', 'accent']
mat_index = {nm: i for i, nm in enumerate(mat_names)}

bin_chunks = []
buffer_views = []
accessors = []
gltf_meshes = []
gltf_nodes = []

offset = 0
def append_buffer(arr, target):
    global offset
    raw = arr.tobytes()
    pad = (4 - (len(raw) % 4)) % 4
    raw_padded = raw + (b'\x00' * pad)
    bv_idx = len(buffer_views)
    buffer_views.append({
        'buffer': 0,
        'byteOffset': offset,
        'byteLength': len(raw),
        'target': target,
    })
    bin_chunks.append(raw_padded)
    offset += len(raw_padded)
    return bv_idx

for m in meshes:
    v_world = np.ascontiguousarray(m['verts'], dtype=np.float32)
    pivot = (0.5 * (v_world.min(axis=0) + v_world.max(axis=0))).astype(np.float32)
    v_arr = np.ascontiguousarray(v_world - pivot, dtype=np.float32)
    n_arr = np.ascontiguousarray(m['norms'], dtype=np.float32)
    u_arr = np.ascontiguousarray(m['uvs'], dtype=np.float32)
    i_arr = np.ascontiguousarray(m['indices'], dtype=np.uint32)

    bv_v = append_buffer(v_arr, 34962)
    bv_n = append_buffer(n_arr, 34962)
    bv_u = append_buffer(u_arr, 34962)
    bv_i = append_buffer(i_arr, 34963)

    acc_v = len(accessors)
    accessors.append({
        'bufferView': bv_v, 'byteOffset': 0, 'componentType': 5126,
        'count': len(v_arr), 'type': 'VEC3',
        'min': v_arr.min(axis=0).tolist(), 'max': v_arr.max(axis=0).tolist(),
    })
    acc_n = len(accessors)
    accessors.append({
        'bufferView': bv_n, 'byteOffset': 0, 'componentType': 5126,
        'count': len(n_arr), 'type': 'VEC3',
    })
    acc_u = len(accessors)
    accessors.append({
        'bufferView': bv_u, 'byteOffset': 0, 'componentType': 5126,
        'count': len(u_arr), 'type': 'VEC2',
    })
    acc_i = len(accessors)
    accessors.append({
        'bufferView': bv_i, 'byteOffset': 0, 'componentType': 5125,
        'count': len(i_arr), 'type': 'SCALAR',
    })

    mesh_idx = len(gltf_meshes)
    gltf_meshes.append({
        'name': m['name'],
        'primitives': [{
            'attributes': {'POSITION': acc_v, 'NORMAL': acc_n, 'TEXCOORD_0': acc_u},
            'indices': acc_i,
            'material': mat_index.get(m['mat'], 0),
        }]
    })
    extras = {
        'explode': m['explode'],
        'bone': m.get('bone', 'thoracic'),
        'pivot': [round(float(x), 4) for x in pivot],
    }
    if 'proxAnchor' in m:
        extras['proxAnchor'] = m['proxAnchor']
    if 'distAnchor' in m:
        extras['distAnchor'] = m['distAnchor']
    gltf_nodes.append({
        'name': m['name'],
        'mesh': mesh_idx,
        'translation': [round(float(x), 5) for x in pivot],
        'extras': extras,
    })

gltf_json = {
    'asset': {'version': '2.0', 'generator': 'calibration-lab-whale-glb'},
    'scene': 0,
    'scenes': [{'nodes': list(range(len(gltf_nodes)))}],
    'nodes': gltf_nodes,
    'meshes': gltf_meshes,
    'materials': [{'name': nm} for nm in mat_names],
    'accessors': accessors,
    'bufferViews': buffer_views,
    'buffers': [{'byteLength': offset}],
}

json_bytes = json.dumps(gltf_json, separators=(',', ':')).encode('utf-8')
json_pad = (4 - (len(json_bytes) % 4)) % 4
json_bytes += b' ' * json_pad
bin_bytes = b''.join(bin_chunks)

total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
glb_out = bytearray()
glb_out += struct.pack('<III', 0x46546C67, 2, total_len)
glb_out += struct.pack('<II', len(json_bytes), 0x4E4F534A)
glb_out += json_bytes
glb_out += struct.pack('<II', len(bin_bytes), 0x004E4942)
glb_out += bin_bytes

out_path = os.path.join(OUT_DIR, 'hull.glb')
with open(out_path, 'wb') as f:
    f.write(glb_out)

print(f"Wrote {out_path}: {len(gltf_nodes)} nodes, {len(glb_out)/1024:.1f} KB")
