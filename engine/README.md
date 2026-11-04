# engine/ — calibration-lab 的运行时

`engine/` 是把 `styles/calibration-lab/` 的多场景 HTML 与 Three.js 3D 世界合成为确定性画面的最小运行时（HTML-in-Canvas → WebGL2 合成 → 后处理 pass）。本仓库只保留这条风格实际用到的模块。

| 文件 | 职责 |
| :-- | :-- |
| [`html_in_canvas.js`](./html_in_canvas.js) | HTML-in-Canvas 兼容层：`ensureCanvasDrawable()` / `markDrawable()`、特性探测、`texElementSubImage2D`（Chrome 157+）与旧版 `texElementImage2D`（151–154）回退、`updateElementGeometry()` |
| [`stage.js`](./stage.js) | 每帧管线：`world.render(...)` 3D 背景上传 → 当前 `.frame.scene` 与 `[data-layer]` 纹理 → 合成 → WebGL2 pass 链（`u_paper` 金属纹理）→ 屏幕 |
| [`motion.js`](./motion.js) | 确定性 `data-*` 动效（`springStep`、`smootherstep`…）、`[data-cam]` 2D 相机变换、多场景序列器（`prepareScenes` / `applyScene`）、声音 cue 提取（`extractCues` → `window.CUES`） |
| [`studio3d.js`](./studio3d.js) | 风格无关 3D 舞台：`createStudio3D(THREE, { width, height, look, presets, scenes, maxDist })` → renderer、aspect 适配相机、look 时间线、`applyShot`、`director()`、`render(frame)` |
| [`camera.js`](./camera.js) | 确定性相机机位：8 种可组合运镜（`push` / `pull` / `orbit` / `crane` / `track` / `dolly-zoom` / `whip` / `static`）、抖动/手持/定格沸腾，以及 Three.js 相机适配 |
| [`director.js`](./director.js) | 分镜导演：把场景拆成 `subject` / `size` / `angle` / `move` 镜头，按真实画幅求解相机距离，输出 `storyboard()` 与连续性告警 |
| [`look.js`](./look.js) | Three.js Look 配置与光照能量预算：color pipeline、key/hemi/bounce/IBL、背景与雾、接触阴影；`createLookTimeline` 按 `data-look` 切换 |
| [`gtao.js`](./gtao.js) | 硬件 GTAO 环境光遮蔽 pass，由 `look.ao` 开启 |
| [`three_bridge.js`](./three_bridge.js) | Three.js + 可选 `.glb` + HTML-in-Canvas 桥：`parseGlbBuffer` / `loadBlenderGlb` / DOM 纹理 |
| [`vendor/three.min.js`](./vendor/three.min.js) | 内置离线 Three.js r147 运行时（`window.THREE`） |
| [`passes/`](./passes/index.js) | 全屏 WebGL2 pass：只保留 [`grain.js`](./passes/grain.js)（颗粒 + 暗角） |
| [`base.css`](./base.css) | 排版与舞台覆盖层契约（`.frame.scene`、`[data-layer]`…），按 `--u`（画布短边 1%）缩放 |
| [`serve.mjs`](./serve.mjs) / [`server.mjs`](./server.mjs) | 本地静态服务（`--open` 打开已探测到的 Chrome） |
| [`browser.mjs`](./browser.mjs) | 无头 Chromium 启动器（确定性 sRGB），读取 `CHROME_BIN` / `PLAYWRIGHT_CHROME` |
| [`render.mjs`](./render.mjs) | 转发到 [`tools/render.mjs`](../tools/render.mjs) 的薄封装 |

## 纯 3D 舞台与声音 cue

`styles/calibration-lab/scenes.html` 在 `<canvas id="stage" content="drawable" layoutsubtree>` 里定义多个纯 3D 场景，不放开发者检查文字卡，用 `data-cues` 驱动拟音：

```html
<section class="frame scene"
         data-scene="bench-overview"
         data-title="01 · 标定台"
         data-dur="4.2"
         data-look="bench"
         data-cues="click:0.08,whir:0.5,tick:2.2"></section>
```

- **kernel 与 world**：可复用的机器感原语（剖切、刻线、环组、散热鳍、材质角色、HUD）在 `styles/calibration-lab/kernel.js`；具体故事（默认机械鹦鹉螺）在 `styles/calibration-lab/world.js` + `sample/`。
- **`extractCues(root)`**：解析每个 `.frame.scene` 上的 `data-cues` 成 `window.CUES`，由 `tools/sound.py` 的 `mech` 预设消费；可选 `styles/calibration-lab/samples.json` 把 `brass_ratchet` / `count_tick` / `scale_tilt` / `card_enter` / `layer_float` 叠到 CC0 录音 one-shot 上，缺缓存时纯合成。
- **3D 门禁**：`tools/render.mjs --shots-dir` 写出无损分镜帧与 subject mask，`tools/lookcheck.py --gates` 跑剪影 / 机器感 / 颜色层，`tools/audit.mjs --framing-strict` 检查主体在自由画幅内。
