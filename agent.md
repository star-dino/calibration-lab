# Calibration Lab · AI Agent 协作与工程指南 (`agent.md`)

本文件面向**任意编码 AI Agent**（Claude / Gemini / Codex / Cursor 等），提供自包含的项目定位、双复杂度档位规范、模块地图、6 步创作工作流、工程与审美红线以及 CLI 命令速查。所有仓库内路径均相对于本仓库根目录（`stardino-calibration-lab/`）。

配套 AI 技能卡见 [`skill/SKILL.md`](skill/SKILL.md)。

---

## 1. 项目定位与两大核心任务（Overview）

**Calibration Lab（计量实验室）** 是一个基于浏览器原生 **`HTML-in-Canvas` (`CanvasDrawElement`) × Three.js (r147) × WebGL2 GTAO/颗粒后处理 × 程序化机械拟音/TTS** 的 **3D 机械拆解、剖视解释与仿生机构标定渲染引擎**。

它服务于两类核心任务：

1. **按用户题材创作 3D 机械拆解 / 原理演示短片（Topic-Driven Creation · 最常见）**  
   直接复用 [`styles/calibration-lab/kernel.js`](styles/calibration-lab/kernel.js)（生成式机械原语、联动机构、材质治理、剖切与同源 HUD）与 [`engine/`](engine/)（3D 摄影棚、电影运镜、多机位导演），在仓内 Git 忽略的独立产出目录 **`out/products/<project-slug>/v<N>/`** 下编写故事专属运动学与 3D 装配体，通过全套 3D 门禁后并发渲染出 1080p@30fps 声画同步 MP4 母带。
2. **演进机械内核原语或标杆样片（Kernel & Showcase Engineering）**  
   在 [`styles/calibration-lab/kernel.js`](styles/calibration-lab/kernel.js) 中沉淀与具体物种/机型无关的参数化机械生成原语，或维护仓库内置的两套标杆样片：
   - **默认样片《机械鹦鹉螺》**：[`styles/calibration-lab/world.js`](styles/calibration-lab/world.js) + [`styles/calibration-lab/sample/`](styles/calibration-lab/sample/)
   - **重工双档旗舰样片《深海声学须鲸 Balaenoptera AQ-12》**：[`styles/calibration-lab/whale/`](styles/calibration-lab/whale/README.md)

> **默认修改边界**：除非用户明确要求修改引擎、工具或内核，否则在创作新题材短片时**不要修改 `engine/`、`tools/` 及 `styles/calibration-lab/` 下的已有文件**；新项目的全部源码、测试与成片均写入仓内已由 `.gitignore` 忽略的 `out/` 与 `devdocs/` 目录。

---

## 2. 双复杂度档位规范：标准档 (`minimal`) vs. 复杂重工档 (`kinetic`)

本仓库通过 `resolveMechProfile(input)`（见 [`styles/calibration-lab/kernel.js`](styles/calibration-lab/kernel.js)）正式确立**两档工程复杂度标准**。AI 在立项时应首先判断采用哪一档：

| 维度 | **标准档（`minimal` · V6/V7 级 · 日常默认推荐）** | **复杂重工满舱档（`kinetic` · V10 级 · 按需启用）** |
| :--- | :--- | :--- |
| **适用场景** | **绝大多数常规机械科普、机构拆解与仿生标定任务**。追求结构逻辑清晰、画面留白干净、开发与渲染极速。 | **仅当用户明确要求「复杂参数 / 重工满舱 / 极致内构展示」时启用**。用于旗舰级微距检视与全舰多层级大爆炸展示。 |
| **零件规模** | 约 **150–250 件**（6 层模块化外甲 + 主龙骨 + 4 大封装式核心总成 + 基础作动筒）。 | **3,000–5,600+ 件**（启用 ILM 三层机械词库：Primary 主联动件 + Secondary 肋骨笼/汇流排/波纹管 + Tertiary `InstancedMesh` 紧固件/轴承滚珠/散热鳍片）。 |
| **运行参数** | `--look '{"mech":"minimal"}'`（或以 V6/V7 密度直接构建） | `--look '{"mech":"kinetic"}'`（须鲸样片默认档） |
| **标杆参考** | 须鲸 V7 基线检视表（[`contact_sheet_v7_standard.jpg`](styles/calibration-lab/whale/contact_sheet_v7_standard.jpg)）与机械鹦鹉螺默认样片 | 须鲸 V10 满舱检视表（[`styles/calibration-lab/whale/`](styles/calibration-lab/whale/README.md)，`5,632` 件内舱网格） |

> **AI 决策原则**：一般情况下**不需要**往模型体内塞入数千件微小的第三层紧固件与管线（容易造成远景高频噪点并大幅增加建模工作量），**默认按标准档（V6/V7 级）产出即可**；只有当用户点名要做“复杂档 / V10 级重工拆解”时，才启用三层微机构工厂（参考 [`whale-tier-factory.js`](styles/calibration-lab/whale/whale-tier-factory.js)）。

---

## 3. 仓库架构与模块地图（Where Things Live）

```text
stardino-calibration-lab/
├── agent.md                           # 本文件：AI Agent 协作与工程总指南
├── skill/                             # AI 技能卡目录（可直接挂载至 Claude / Gemini / Cursor）
│   ├── SKILL.md                       # 计量实验室 3D 机械拆解与标定创作技能卡
│   └── README.md                      # 技能卡安装与触发说明
├── engine/                            # 零构建 ES Module 确定性 3D 运行时
│   ├── html_in_canvas.js              # Chrome 157+ 原生 / 151–154 legacy CanvasDrawElement 兼容层
│   ├── stage.js                       # 逐帧合成主循环：prepareDom -> 3D 舞台 -> DOM 贴图上传 -> WebGL2 Pass 链
│   ├── studio3d.js                    # 3D 摄影棚底座：渲染器、画幅自适应相机、look 光能预算、director()、roleReport()
│   ├── look.js                        # 声明式外观与恒定光能预算系统 + ref.json palette 自动派生 (lookFromRefPalette)
│   ├── gtao.js                        # 硬件深度/法线 GTAO 环境光遮蔽 + 法线折痕墨线 + 剖切平面自动同步
│   ├── camera.js                      # 8 种确定性运镜 (push/pull/orbit/crane/track/dolly-zoom/whip/static) + 跨画幅补偿
│   ├── director.js                    # 3D 镜头表导演：按主体包围盒自动求解距离、导出 storyboard 与跳切/构图警告
│   ├── motion.js                      # 闭式二阶弹簧、多幕时间轴 [data-scene]、声学事件提取 (extractCues -> window.CUES)
│   ├── passes/grain.js                # WebGL2 胶片颗粒与暗角后处理 Pass
│   ├── vendor/three.min.js            # 内置离线 Three.js r147 运行时（零外网 CDN 依赖）
│   ├── server.mjs                     # 本地静态服务器（自动将 /out/* 映射至仓内 ./out/）
│   └── browser.mjs                    # 无头 Chromium 启动器（默认 SwiftShader 确定性基线；设 STYLEHOP_GPU=1 启用 RTX GPU 加速）
├── styles/calibration-lab/            # 计量实验室风格核心与双标杆样片
│   ├── SPEC.md                        # 【必读】风格规范、原语 API 契约、剖切/爆炸/HUD 规则、§9 颜色与光线 6 项自检清单
│   ├── kernel.js                      # 【核心】生成式机械原语、材质角色治理、四大联动机构、分阶段爆炸与同源仪表 HUD
│   ├── style.js & theme.css           # 风格路由元数据、默认 look 配置与工业铭牌排版样式
│   ├── world.js & scenes.html         # 默认样片《机械鹦鹉螺》入口与 5 幕时间轴（26.0s）
│   ├── sample/                        # 机械鹦鹉螺组件（hull.glb、nautilus-model.js、kin.js、palette.js、kit-compat/）
│   ├── whale/                         # 旗舰第二样片《深海声学须鲸 AQ-12》（V10 5,632 件复杂档 + V7 标准档双模式 + 剧照 + NOTES.md）
│   └── lineage/                       # 演进档案：mech-nautilus/ 与 mech-whale/（记录迭代脉络与分级决策）
├── gallery/                           # Studio 交互调试工作台（支持 Sample 样片一键切换：鹦鹉螺 / 须鲸 V10 / 须鲸标准档）
├── tools/                             # 自动化体检、并发渲染与声学/人声工具链
│   ├── audit.mjs                      # 硬门禁体检（零报错/越界/字号/遮挡/数字核查/3D 主体构图可用区占比/金属亮度/自检清单）
│   ├── render.mjs                     # 多 Worker 确定性渲染器 (--storyboard / --sheet / --pair / --shots-dir / --video)
│   ├── lookcheck.py                   # CIE Lab 外观回归、可读性下限与 ADR-021 3D 门禁 (--gates: 剪影 IoU / 机器感密度 / 颜色四层)
│   ├── sound.py & samples.py          # 48kHz 程序化机械拟音合成 + CC0 真实机械采样叠加（缓存位于 .cache/samples/）
│   └── voice.py & factcheck.mjs       # 多后端 TTS 旁白合成与画面数字溯源校验
├── devdocs/                           # 【Git 忽略】仓内私有文档（DECISIONS.md、OUTPUT_RULE.md、PLANS_AND_ITERATIONS.md、refs/）
├── out/                               # 【Git 忽略】仓内本地产出，严格分两类：
│   ├── test/{probes,look,scratch}/    #   1. 测试：专项技术验证 (probes/)、工具自动回归 (look/)、临时冒烟 (scratch/)
│   └── products/<slug>/v<N>/          #   2. 成品：按「项目名 -> v1..vN」严格两级分层
└── .cache/samples/                    # 【Git 忽略】音频采样本地缓存
```

---

## 4. `kernel.js` 核心机械原语速查（Generative Mechanical Primitives）

编写新机械题材时，优先组合 [`styles/calibration-lab/kernel.js`](styles/calibration-lab/kernel.js) 提供的参数化原语（**所有原语均无默认摆位，缺必填参数会直接抛错**）：

| 类别 | 核心导出函数 / 常量 | 用途说明 |
| :--- | :--- | :--- |
| **摄影棚与同源 HUD** | `createCalLabStudio`, `createGaugeHud`, `createSilkscreenDecal`, `createTorqueArc`, `createDimensionCallout` | 创建浅灰/深海标定摄影棚、刻线台面、随同一运动学变量实时跳动的同源仪表 HUD 与尺寸引线标注 |
| **材质角色与做旧** | `MATERIAL_ROLES`, `governMaterialRole(mat, role)`, `createMaterials`, `createSurfaceMaps`, `wearMaps` | 按角色治理 PBR 参数：`glaze`（高光清漆白瓷外壳 `roughness<=0.16, clearcoat>=0.6`）、`metal`（拉丝/机加金属）、`brass`（暖黄铜/紫铜）、`liner`（深灰吸光内衬）、`emissive`（`<=5%` 焦点信号灯） |
| **世界空间剖切与开窗** | `cutWindow(geometry, keep)`, `windowRim(edge, opts)`, `createSectionCutManager`, `createGhostShellMaterial` | 真实几何开窗与包边窗框、WebGL Stencil 剖切平面与发光剖面封盖、半透明幽灵外壳 |
| **分阶段拆解与 LOD** | `createSubsystemRig`, `createTeardownController`, `layerEase`, `lerpFramingBox`, `weightedCoreBox`, `createLod`, `lodScaleIn` | 控制多层级外壳/总成按时间轴有序剥离与归位、动态插值主体取景包围盒、按相机距离平滑缩放微零件 |
| **四大核心联动机构** | `solveFourBar`, `foldingLinkageRig`, `planetaryDriveRig`, `syncIrisRig`, `cardanGimbalRig` | 精确解析求解的**重型锻造四连杆**（舱盖展开）、**双级行星差速齿轮箱**、**凸轮同步光圈叶片环**、**正交十字万向节** |
| **运动学与作动器** | `solveTwoLinkIK2D`, `solveKinematicChain`, `solveFabrikChain`, `poseActuator`, `poseCompressedSpring`, `createArticulatedChain` | 二连杆平面 IK、多关节链条求解、液压作动筒（缸体+活塞杆实时对准两端锚点）、螺旋弹簧实时压缩变形 |
| **机器感几何构件** | `seamHardware`, `toothedRingGeometry`, `ringStack`, `radialFins`, `curveSleeve`, `machinedPlateGeometry`, `counterboreBossGeometry`, `ribbedLinkGeometry`, `gearGeometry`, `helixGeometry`, `bellowsGeometry`, `ballJointGeometry` | 沿接缝自动排布沉头螺栓/定位销、带齿环叠层、放射状散热鳍片阵列、三维样条曲线护套/波纹管、减重孔连杆、渐开线齿轮 |
| **复杂度档位控制** | `CAL_MECH_PRESETS`, `resolveMechProfile(input)` | 解析 `'minimal'`（标准档）或 `'kinetic'`（复杂重工档）配置开关 |

---

## 5. 仓内产出与私有文档规范（`out/` & `devdocs/`）

本仓库采用**仓内自包含、Git 忽略**的目录标准（详见 `devdocs/OUTPUT_RULE.md`）：

1. **Git 树零污染**：`/devdocs/`、`/out/`、`/.cache/` 均已在 [`.gitignore`](.gitignore) 中忽略。切勿把测试图或 `.mp4` 写进 `styles/` 跟踪树（除非用户明确要求更新仓库展示样片）。
2. **`out/` 内部严格分两类，注意层级目录**：
   - **第一类：`1. 测试 (out/test/)`**
     - `out/test/probes/<subject>-t<N>/`：回答单一技术问题（如某种连杆穿模验证、材质高光测试、GPU 帧率基准），内附简短 `NOTES.md`。
     - `out/test/look/`：`lookcheck.py` 与 `render.mjs` 的自动回归输出区，勿手工堆放文件。
     - `out/test/scratch/<YYYY-MM-DD>-<name>/`：一次性冒烟渲染图，随用随清。
   - **第二类：`2. 成品 (out/products/)`**
     - **必须严格执行「项目名 (`<project-slug>`) → 版本号 (`v1`, `v2`, … `v<N>`)」两级目录分层**：
       ```text
       out/products/<project-slug>/
       ├── v1/
       │   ├── TREATMENT.md            # 3 套候选叙事结构 + Native Move + 逐镜表 + 反套路自检
       │   ├── world.js                # 舞台/机构/镜头编排（import 用 /engine/... /styles/... 根相对路径）
       │   ├── scenes.html             # 分镜时长 data-dur / data-look / data-cues
       │   ├── kin.js / palette.js     # 确定性运动学与调色板
       │   ├── hull.glb                # Blender 导出的自由曲面分块外壳（如适用）
       │   ├── ref.json                # 调色板与门禁配置（原始参考大图统一放 devdocs/refs/<slug>/）
       │   ├── NOTES.md                # 本版改动、门禁数据与 §9.4 六项固定自检清单
       │   ├── <slug>_storyboard.jpg   # 逐镜分镜图
       │   ├── <slug>_sheet.jpg        # 2×2 检视表
       │   └── <slug>.mp4              # 1080p@30fps 最终成片
       └── v2/                         # 迭代新版本（从 v1 复制演进，v1 只读保留）
       ```
     - **严禁平铺与嵌套混用**：禁止出现 `out/products/whale-v1/`，一律写成 `out/products/mech-whale/v1/`；禁止把文件直接散落在 `out/products/<slug>/` 根下。

---

## 6. AI 创作新机械题材的 6 步标准工作流（How To Work）

### Step 1 · 研读规范与判定档位
1. 精读 [`styles/calibration-lab/SPEC.md`](styles/calibration-lab/SPEC.md) 与 [`skill/SKILL.md`](skill/SKILL.md)。
2. 明确复杂度档位：**默认采用标准档（`minimal` / V6–V7 级，约 150–250 件）**；仅在用户明确要求复杂重工内构时采用复杂档（`kinetic` / V10 级）。

### Step 2 · 参考先行、外壳建模与 `TREATMENT.md`
1. **参考与调色板（`ref.json`）**：将概念参考图存入 `devdocs/refs/<slug>/`，在成品目录 `out/products/<slug>/v1/ref.json` 中提取 `palette: { background, shell, mechanism, accent, glow }`。
2. **自由曲面外壳铁律（Blender GLB）**：若题材具有流线型生物外壳或复杂工业曲面板（如鹦鹉螺、鲸鱼、甲虫、流线型机头），**严禁在 Three.js 里用球体/椭球/圆柱强行拼凑动物或流线外壳**！必须先写参数化 Blender Python 脚本生成带 **45° 实体倒角、真实板厚与分块命名** 的 `hull.glb`（参考 [`whale/generate_whale_glb.py`](styles/calibration-lab/whale/generate_whale_glb.py)），并通过三视图（`--look '{"threeView":true}'`）校验轮廓。
3. **编写 `TREATMENT.md`**：设计 3 套候选叙事结构并选定最佳方案，明确全片唯一驱动变量（如曲轴角 $\theta$、推进相位 $\phi$、拆解度 $e \in [0,1]$）、至少 1 个媒介原生高潮（`Native Move`，如“全船多级爆炸同时保持连续推进波并做 58° 转台检视”），列出逐镜景别/角度表。

### Step 3 · 编写纯函数运动学 (`kin.js`) 与 3D 舞台 (`world.js`)
1. **运动学先行（`kin.js`）**：所有姿态、连杆转角、舱盖开合度与 HUD 读数都写成时间 `t` 的**纯确定性函数**（零随机状态、零帧间累加，任意跳转一帧结果 100% 相同）。
2. **机位与取景（`studio.director` + 动态包围盒）**：
   - 全片切 5–8 个镜头，相邻镜头必须切换景别（`wide` / `full` / `medium` / `close`）或改变水平角度 $\ge 30^\circ$。
   - **关键防切边技巧**：当外壳大幅爆炸展开时，若相机只绑完整爆炸包围盒会被拉得极远，若只绑死内胆又会在远景切掉飞出的甲片。应使用 `weightedCoreBox(coreBox, fullBox, weight)` 或 `lerpFramingBox` 动态混合取景盒（局部特写绑被检视子系统，全景大爆炸绑 `0.78~0.85` 权重全船盒）。
3. **同源 HUD 与引线标注**：画面上的每一条曲线、数字和引线都必须由 `kin.js` 的实时物理量驱动，且圆点引线锚点每帧通过 `anchor.getWorldPosition()` 投影到 2D 屏幕并做防碰撞排斥。

### Step 4 · 执行自动化门禁（必跑且须全部通过）
在仓库根目录下依次执行（注意**必须显式传入 `--world` 与 `--content`**）：
```bash
SLUG=my-machine
EXP=out/products/$SLUG/v1

# 1. 多画幅版面与 3D 构图可用区体检（16:9 / 9:16 / 1:1 零报错、零越界、主体可用区占比达标）
node tools/audit.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html --all-sizes

# 2. 渲染分镜表 (_storyboard.jpg)、2x2 检视表 (_sheet.jpg) 与逐镜无损帧/遮罩 (gate_shots)
node tools/render.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --storyboard $EXP/${SLUG}_storyboard.jpg \
  --sheet $EXP/${SLUG}_sheet.jpg \
  --shots-dir $EXP/gate_shots

# 3. 运行外观可读性与 ADR-021 3D 门禁（剪影 IoU / 轮廓内机器感密度 / 金属明度 / 颜色层）
python3 tools/lookcheck.py --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --shots-dir $EXP/gate_shots --gates
```

### Step 5 · AI 视觉亲检与 `NOTES.md` 六项自检（不可跳过）
AI **必须**使用读图工具亲自检视生成的 `${SLUG}_storyboard.jpg` 与 `${SLUG}_sheet.jpg`，并在 `$EXP/NOTES.md` 中如实填写 [`SPEC.md` §9.4](styles/calibration-lab/SPEC.md) 规定的 **6 项固定自检清单**（`audit.mjs` 会校验这 6 项是否存在）：
1. **机构层明度**：内舱金属机构是否层次分明、未死黑成团（`metal mean L* >= 25`）？
2. **背景色相与明度**：摄影棚背景是否与 `ref.json` 一致、干净通透？
3. **点缀色克制**：高饱和信号橙（`accent`）与发光青（`glow`）是否仅出现在焦点部位（占主体面积 $\le 5\%$）？
4. **附肢/连杆交叉与纵深**：连杆、肋骨、鳍片是否有前后遮挡与角度梯度，而非平行呆板排列？
5. **釉面/金属高光可见度**：外壳 `glaze` 清漆高光带与 `metal` 倒角高光是否清晰可读？
6. **大疏大密节奏**：合拢态外甲是否有充足留白（大疏），开窗/拆解态内舱是否紧凑精密（大密）？

### Step 6 · 渲染 1080p@30fps 声画母带
```bash
# 本机 WSL2 + RTX 4060 可加 STYLEHOP_GPU=1 启用硬件加速（帧渲染提速约 9.6x），重渲染任务 --workers 设为 1–2
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world $EXP/world.js --content $EXP/scenes.html \
  --video $EXP/${SLUG}.mp4 --fps 30 --workers 2
```

---

## 7. 核心工程与审美红线（Hard Guardrails）

1. **严禁静态浮空摆件（Zero Floating Props）**：
   - 任何掀开的装甲板或分离的子系统，在局部拆解镜头中都必须有**物理铰链、四连杆（`foldingLinkageRig`）或液压作动筒（`poseActuator`）**与主龙骨相连；只有在全舰大爆炸镜头（`TEARDOWN`）中才允许沿法线分层脱开。
2. **严禁合拢态穿模外露（100% Closed-Hull Occlusion）**：
   - 当拆解参数 `open == 0`（巡航合拢态）时，所有内部机构、肋骨与连杆必须 **100% 物理收纳在外壳内部并自动隐藏**，外表面保持纯净流线留白，绝不允许内部零件刺穿外壳。
3. **严禁同频简谐乱晃与画面震屏**：
   - 机械运动必须有真实的相位传递（如推进波从胸椎到尾鳍的相位延迟、光圈叶片由凸轮槽驱动的停顿锁定），禁止让所有零件绑同一个 `Math.sin(t)`；禁止相机震屏。
4. **严禁滥用高饱和色或发光材质**：
   - 遵循 **60% 外壳（`glaze`/`shell`）· 25% 机构金属（`metal`/`structural`）· 10% 暖金属（`brass`）· $\le 5\%$ 信号橙/发光点缀（`accent`/`emissive`）** 的面积配比。
5. **像素级回归基线规则**：
   - 更新仓库级 `styles/calibration-lab/look_baseline.{jpg,json}` 时，保持默认无头 SwiftShader（不加 `STYLEHOP_GPU=1`）渲染，确保跨机器 100% 确定性复现；日常开发预览、分镜检视与视频导出推荐开启 `STYLEHOP_GPU=1`。

---

## 8. 常用命令速查（CLI Cheat Sheet）

```bash
# 1. 启动本地 Studio 交互工作台（可在左侧 Sample 栏一键切换：机械鹦鹉螺 / 须鲸 V10 复杂档 / 须鲸标准档）
npm run serve                      # 访问 http://127.0.0.1:8080/gallery/

# 2. 默认样片《机械鹦鹉螺》体检与回归
node tools/audit.mjs --style calibration-lab --all-sizes
python3 tools/lookcheck.py --style calibration-lab

# 3. 旗舰第二样片《深海声学须鲸 Balaenoptera AQ-12》体检与双档渲染
node tools/audit.mjs --style calibration-lab \
  --world styles/calibration-lab/whale/world.js \
  --content styles/calibration-lab/whale/scenes.html --all-sizes

# 渲染须鲸 V10 复杂重工档（默认 kinetic，5,632 件）检视表
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world styles/calibration-lab/whale/world.js \
  --content styles/calibration-lab/whale/scenes.html \
  --sheet out/test/scratch/whale_v10_sheet.jpg

# 渲染须鲸 V7 标准档（minimal，184 件模块化拆解）检视表
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world styles/calibration-lab/whale/world.js \
  --content styles/calibration-lab/whale/scenes.html \
  --look '{"mech":"minimal"}' \
  --sheet out/test/scratch/whale_minimal_sheet.jpg

# 渲染须鲸三视图与等轴测工程校验图
STYLEHOP_GPU=1 node tools/render.mjs --style calibration-lab \
  --world styles/calibration-lab/whale/world.js \
  --content styles/calibration-lab/whale/scenes.html \
  --look '{"threeView":true}' \
  --sheet out/test/scratch/whale_three_view.jpg
```
