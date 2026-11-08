---
name: calibration-lab
description: 使用 Calibration Lab（计量实验室）3D 机械拆解与标定渲染引擎，构建并渲染机械原理、发动机/减速箱/连杆机构、剖视解释、多级分阶段爆炸（Exploded View）以及仿生机械生物（如机械鹦鹉螺、深海声学须鲸）的交互检视舞台与 1080p 声画同步工程短片。支持标准档（minimal，约 180 件模块化拆解）与复杂重工满舱档（kinetic，V10 级 5,000+ 件三层微机构）双模式。
version: 2.0.0
stack: [html-in-canvas, threejs-r147, webgl2-gtao, kinematics, blender-glb, procedural-audio]
---

# Calibration Lab · 计量实验室 3D 机械拆解与标定技能卡

> **仓库根路径**：本技能卡位于 `stardino-calibration-lab/skill/SKILL.md`。所有 CLI 命令均在仓库根目录（`stardino-calibration-lab/`）下执行。完整仓库架构见 [`../agent.md`](../agent.md)，内核规格见 [`../styles/calibration-lab/SPEC.md`](../styles/calibration-lab/SPEC.md)。

---

## 1. 核心铁律与双复杂度档位（先定档，再动手）

1. **先判复杂度档位（`minimal` 标准档 vs `kinetic` 复杂档）**：
   - **日常默认用「标准档 (`minimal` · V6/V7 级)」**：约 150–250 件模块化外甲、核心龙骨与 4 大主动力总成拆解，结构清晰、留白干净、构建极快。
   - **点名重工时用「复杂档 (`kinetic` · V10 级)」**：仅当用户明确要求“复杂参数 / 重工满舱 / 极致体内细节”时，启用工业光魔（ILM）三层机械词库（Primary 主联动件 + Secondary 肋骨笼/汇流排/波纹管 + Tertiary `InstancedMesh` 紧固件/轴承滚珠/散热鳍片，参考 [`../styles/calibration-lab/whale/`](../styles/calibration-lab/whale/README.md) 的 `5,632` 件架构）。
2. **自由曲面外壳必须走 Blender GLB（严禁拿数学球/椭球拼动物）**：
   - 凡涉及仿生生物外壳、流线型艇体或复杂工业壳体（鹦鹉螺、鲸鱼、甲虫、机身），必须编写参数化 Blender 脚本导出带 **45° 实体倒角、真实板厚与分块命名** 的 `hull.glb`（参考 [`../styles/calibration-lab/whale/generate_whale_glb.py`](../styles/calibration-lab/whale/generate_whale_glb.py)），绝不用球体/圆柱强凑。
3. **同源确定性驱动（Single Source of Truth）**：
   - 零件运动、舱盖四连杆展开、光圈缩放与 HUD 仪表读数必须由同一个纯函数 `kin(t)` 驱动；巡航合拢态（`open == 0`）下内部零件必须 **100% 物理收纳遮蔽**，零穿模外露。
4. **仓内自包含产出（Git 树零污染）**：
   - **测试**写 `out/test/probes/<subject>-t<N>/` 或 `out/test/scratch/<date>-<name>/`；
   - **成品**严格按两级目录写 `out/products/<project-slug>/v<N>/`（从 `v1` 起，只增不改）；
   - **私有参考图**统一放 `devdocs/refs/<project-slug>/`。

---

## 2. 两套内置标杆样片（学习与对照参考）

在动手写新题材前，可参考仓库内置的两套完整样片（但**严禁直接照搬其专属物种几何或构图数值**）：

| 样片 | 路径 | 特点与可借鉴架构 |
| :--- | :--- | :--- |
| **《机械鹦鹉螺》**<br>（默认样片） | [`styles/calibration-lab/world.js`](../styles/calibration-lab/world.js)<br>[`styles/calibration-lab/sample/`](../styles/calibration-lab/sample/) | 对数螺线腔体剖切、曲柄摇杆连杆驱动 28 条触手、偏心轮呼吸波、多级分阶段爆炸与同源遥测曲线 |
| **《深海声学须鲸 AQ-12》**<br>（V7 标准档 & V10 复杂档） | [`styles/calibration-lab/whale/world.js`](../styles/calibration-lab/whale/world.js)<br>[`styles/calibration-lab/whale/README.md`](../styles/calibration-lab/whale/README.md) | 23m 水动力标定场、7 骨骼连续推进波、54 块实体倒角白瓷外甲、四大核心联动机构（四连杆/行星齿轮/同步光圈/十字万向节）、`resolveMechProfile` 双档切换（V7 184 件 vs V10 5,632 件） |

---

## 3. 代码结构与 `kernel.js` 常用配方

每个新成品在 `out/products/<slug>/v1/` 下按职责拆分为模块化文件：

```text
out/products/<slug>/v1/
├── TREATMENT.md          # 3 套候选叙事结构 + Native Move + 逐镜表 + 反套路自检
├── ref.json              # 调色板 palette (background/shell/mechanism/accent/glow)
├── scenes.html           # 5 幕时间轴 [data-scene] + data-dur + data-cues
├── kin.js                # 纯数学运动学：输入时间 t，输出所有关节角、拆解度与传感器读数
├── palette.js            # 材质角色实例化（governMaterialRole: glaze / metal / brass / liner / emissive）
├── <slug>-model.js       # 3D 装配体构建与 update(state) 姿态更新
├── world.js              # 摄影棚初始化、director 多机位调度、动态取景包围盒与 HUD 绘制
└── NOTES.md              # 门禁结果与 SPEC §9.4 六项固定视觉自检清单
```

### 配方 A · 初始化摄影棚、材质角色与复杂度档位

```js
import {
  THREE,
  createCalLabStudio,
  governMaterialRole,
  resolveMechProfile,
  weightedCoreBox,
  lerpFramingBox,
} from '/styles/calibration-lab/kernel.js';

export async function createWorld(stage, { width, height, scenes, style }) {
  const studio = createCalLabStudio({ width, height, scenes, style, maxDist: 160 });
  const profile = resolveMechProfile(style?.look?.mech || 'minimal'); // 'minimal' (标准档) 或 'kinetic' (复杂档)

  // 按角色治理材质（自动获得柔光箱高光与曲率响应）
  const shellMat = governMaterialRole(new THREE.MeshPhysicalMaterial({ color: 0xeae6df }), 'glaze');
  const frameMat = governMaterialRole(new THREE.MeshStandardMaterial({ color: 0x6e7885 }), 'metal');
  const brassMat = governMaterialRole(new THREE.MeshStandardMaterial({ color: 0xc8963e }), 'brass');
  const linerMat = governMaterialRole(new THREE.MeshStandardMaterial({ color: 0x1d232b }), 'liner');
  const accentMat = governMaterialRole(new THREE.MeshStandardMaterial({ color: 0xd9531e }), 'accent');
  // ...
}
```

### 配方 B · 四大核心联动机构原语（消除静态浮空摆件）

```js
import {
  foldingLinkageRig,   // 重型锻造四连杆 + 液压作动筒（用于掀开舱盖/装甲板，零浮空）
  planetaryDriveRig,   // 开顶双级行星差速齿轮箱（太阳轮 + 行星架 + 内齿圈真实啮合比）
  syncIrisRig,         // 凸轮环驱动的多叶同步收放光圈 / 散热百叶
  cardanGimbalRig,     // 双级正交十字万向节 + 推挽拉杆（用于尾椎/喷口双轴偏转）
  seamHardware,        // 沿接缝曲线自动排布沉头内六角螺栓与定位销
  ringStack,           // 带齿环叠层
  radialFins,          // 放射状散热鳍片阵列
  curveSleeve,         // 沿三维样条走线的波纹管/编织护套
} from '/styles/calibration-lab/kernel.js';
```

### 配方 C · 动态取景包围盒（防止大爆炸切边或特写过远）

当模型在不同镜头里局部展开或全舰大爆炸时，使用 `weightedCoreBox` 让相机平滑兼顾内胆主体与外飞甲片：

```js
// 特写镜头聚焦当前展开的子系统；全景大爆炸镜头按 0.80 权重包裹外飞甲片
const activeBox = isFullTeardown
  ? weightedCoreBox(coreHullBox, explodedFullBox, 0.20) // 80% 权重给完整爆炸外框，绝不切边
  : subsystemBox;
```

---

## 4. 必跑门禁与出片流水线

在仓库根目录（`/root/projects/earn/gemini-stylehop/stardino-calibration-lab`）下执行：

```bash
SLUG=my-mech
EXP=out/products/$SLUG/v1

# 1. 多画幅版面与 3D 构图可用区体检（16:9 / 9:16 / 1:1 必须 0 issues）
node tools/audit.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html --all-sizes

# 2. 渲染逐镜分镜图、2x2 检视表与门禁遮罩帧（WSL2 + RTX 4060 加 STYLEHOP_GPU=1 提速 9.6x）
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --storyboard $EXP/${SLUG}_storyboard.jpg \
  --sheet $EXP/${SLUG}_sheet.jpg \
  --shots-dir $EXP/gate_shots

# 3. 运行三视图工程校验（检查正侧/正顶/正前/等轴测比例与合拢态零穿模）
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --look '{"threeView":true}' \
  --sheet $EXP/${SLUG}_three_view.jpg

# 4. 运行 ADR-021 3D 视觉门禁（剪影 IoU / 机器感密度 / 金属明度 / 颜色层）
python3 tools/lookcheck.py --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --shots-dir $EXP/gate_shots --gates

# 5. 渲染 1080p@30fps 声画同步 MP4 成片（重渲染 --workers 设为 1–2）
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --video $EXP/${SLUG}.mp4 --fps 30 --workers 2
```

---

## 5. 交付前 AI 视觉亲检六问（必写进 `$EXP/NOTES.md`）

每次渲染出 `_storyboard.jpg` 与 `_sheet.jpg` 后，AI **必须亲自看图**并在 `$EXP/NOTES.md` 逐条回答以下 6 项自检（未填写会被 `audit.mjs` 告警）：

1. **机构是否比参考过暗？**（内舱 `metal` 平均明度 `L* >= 25`，有清晰倒角高光，无死黑团块）
2. **背景色相与明度是否一致？**（与 `ref.json` 调色板一致，主体与背景明度差充足）
3. **高饱和点缀色是否只在焦点？**（安全橙 `accent` 与青色发光 `glow` 面积占比 $\le 5\%$）
4. **附肢/连杆交叉与纵深是否自然？**（连杆、肋骨、鳍片有前后遮挡与角度梯度，无平行贴纸感）
5. **釉面与金属高光是否可见？**（外甲 `glaze` 柔光箱长条高光带与金属拉丝高光清晰可读）
6. **大疏大密对比是否成立？**（巡航合拢态外壳留白充足，拆解开窗处内舱精密饱满）
