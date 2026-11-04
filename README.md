# Calibration Lab · 计量实验室

> 无缝浅色摄影棚 · 阳极氧化铝与刻线台面 · 剖切/分阶段爆炸 · 同源仪表 HUD
> 一个风格，一个仓库：HTML-in-Canvas 多场景 + Three.js 3D 舞台 + WebGL2 颗粒 pass + 确定性渲染 + 程序化机械配乐。  
> Created by **Star Dinosaur (星星恐龙)** · MIT

![calibration-lab 多场景样片检视表](styles/calibration-lab/contact_sheet.jpg)

本仓库从 [`stardino-stylehop`](https://github.com/star-dino/stardino-stylehop) 的 `bdf4dfb` 拆出，只保留 `calibration-lab` 一个风格及其运行时依赖，删去了其他风格与多风格框架的残余。默认样片《机械鹦鹉螺》共 5 个场景、26 秒，由 `styles/calibration-lab/world.js` + `sample/` 组成。

## 它是什么

- **kernel（工具箱）**：`styles/calibration-lab/kernel.js` 提供机器感原语——世界空间剖切（`cutWindow` / `windowRim`）、刻线台面、环组/散热鳍/接缝硬件、材质角色（metal / glaze / liner / emissive）、分阶段爆炸、LOD 与同源仪表 HUD。每个元素都必须带参数，没有默认摆放。
- **world（一个例子）**：`styles/calibration-lab/world.js` + `sample/`（GLB 外壳、运动学、配色、teardown kit 兼容层）是机械鹦鹉螺的具体编排，不是模板。
- **规格**：`styles/calibration-lab/SPEC.md`（去固化铁律、API、剖切/爆炸/仪表规则、§9 自检清单与 3D 门禁）。
- **来历**：`styles/calibration-lab/lineage/mech-nautilus/` 保留机械鹦鹉螺从早期 → 重做 → 迭代的过程图与说明。
- **声音**：`tools/sound.py` 的 `mech` 预设——液压泵/流体床、循环动力冲程、伺服/气阀过渡与机械拟音；无音乐铺底、无高频铃声。`styles/calibration-lab/samples.json` 可把 `brass_ratchet` / `count_tick` / `scale_tilt` / `card_enter` / `layer_float` 叠到 CC0 录音 one-shot 上；缓存缺失时自动纯合成。

## 快速开始

```bash
npm install                      # 仅依赖 playwright-core
# 需要 Chrome 157+（151–154 走 legacy 兼容路径）；用 CHROME_BIN 或 PLAYWRIGHT_CHROME 指定可执行文件，
# 否则自动探测 ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
# 声音与成片还需要 python3（numpy、scipy）与 ffmpeg

npm run init                     # 可选：下载 CC0 采样（VCSL / VSCO-2-CE，sha256 校验）到 ../out/samples-cache/；缺省则声音退回纯合成

npm run serve                    # Studio：http://127.0.0.1:8080/gallery/

# 体检：运行时报错、文字越界、字号、停留时长、浮层遮挡 + 3D 主体构图（默认 16:9 / 9:16 / 1:1）
node tools/audit.mjs --style calibration-lab --all-sizes

# 渲染 2×2 检视表（产物放在仓库外的 ../out/ 下）
node tools/render.mjs --style calibration-lab --sheet ../out/scratch/calibration-lab/sheet.jpg

# 渲染成片（逐帧截图 + 程序化配乐 + loudnorm）
node tools/render.mjs --style calibration-lab --video ../out/scratch/calibration-lab/calibration-lab.mp4 --fps 30 --workers 4

# 画面回归：与 styles/calibration-lab/look_baseline.* 对比，有意改动后 --accept
python3 tools/lookcheck.py --style calibration-lab

# 3D 门禁：剪影 / 机器感 / 颜色层（需要分镜无损帧与 subject mask）
node tools/render.mjs --style calibration-lab --world <product>/world.js --storyboard <out>/storyboard.jpg --shots-dir <out>/shots
python3 tools/lookcheck.py --style calibration-lab --world <product>/world.js --content <product>/scenes.html --gates

# 可选：人声轨（TTS 是构建步骤，默认关闭；依赖见 requirements-voice.txt）
node tools/render.mjs --style calibration-lab --video <out>.mp4 --voice <dir>/voice.json
```

产物一律写到仓库外的 `../out/`（`STYLEHOP_OUT` 可改写）；仓库内不放输出，`.gitignore` 兜底忽略 `/out`。

## 目录

```text
engine/     运行时：stage.js · motion.js · studio3d.js · camera.js · director.js · look.js · gtao.js · three_bridge.js · vendor/three.min.js · passes/grain.js · base.css …（见 engine/README.md）
gallery/    Studio（index.html + player.html + catalog.js，只列 calibration-lab）
styles/calibration-lab/
            style.js · kernel.js · world.js · scenes.html · theme.css · SPEC.md · ref.json · samples.json
            contact_sheet.jpg · look_baseline.{jpg,json} · sample/（hull.glb + 运动学/配色/kit-compat） · lineage/mech-nautilus/
tools/      audit.mjs · render.mjs · lookcheck.py · sound.py · samples.py · samples.manifest.json · audio_grains.py · textures.py · voice.py · factcheck.mjs
assets/     textures/brushed_metal.png（台面 `u_paper` 纹理；由 tools/textures.py 生成）
```

声音颗粒 `assets/audio/*.wav` 由 `tools/audio_grains.py` 在首次合成时自动生成（被 `.gitignore` 忽略，不入库）。

## 与原仓库的差异

- 删除：其余风格（`ink-wash`、`twilight-fable`、`clay-macaron`、`vintage-naturalist`、模板）、2D 栈（`studio2d`、`puppet2d`、`critter2d`）、其他 pass、其他风格的纹理/合成器/拟音、2D 专属的 lookcheck 覆盖。
- 保留：calibration-lab 全部代码路径、3D 栈与门禁（`lookcheck --gates`、`render --pair` / `--shots-dir`、`audit --framing-strict`）、默认样片与 `lineage/`、可选 CC0 采样层、`voice.py`（路径改为 `$TTS_HOME`，默认 `~/tts`）。纯合成音轨与原仓库在相同 `PYTHONHASHSEED` 下逐字节一致。
- 行为变化：无。`gallery/player.html` 保留 `ref.json` 探测（默认样片与产品都可用参考色板）。

## 许可

MIT，见 [`LICENSE`](LICENSE)；第三方声明见 [`CREDITS.md`](CREDITS.md)、[`LICENSE-THIRD-PARTY`](LICENSE-THIRD-PARTY) 与 [`SOUND_CREDITS.md`](SOUND_CREDITS.md)。
