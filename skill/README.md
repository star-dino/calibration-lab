# Calibration Lab · AI Skill 技能卡目录

本目录存放面向 AI 编码代理（Claude Code / Gemini CLI / Antigravity / Cursor / Codex）的标准技能卡：

- **[`SKILL.md`](SKILL.md)**：`calibration-lab`（计量实验室）3D 机械原理拆解、剖视解释与仿生机械标定短片创作技能卡。
- 仓库级完整 AI 协作指南见根目录 **[`../agent.md`](../agent.md)**。

## 如何挂载到常用 AI 工具

```bash
# Claude Code
ln -s /root/projects/earn/gemini-stylehop/stardino-calibration-lab/skill ~/.claude/skills/calibration-lab

# Gemini / Antigravity
ln -s /root/projects/earn/gemini-stylehop/stardino-calibration-lab/skill ~/.gemini/config/skills/calibration-lab
```

挂载后，当用户提出「做一个发动机/减速箱/连杆机构拆解动画」「把这张机械生物设定图做成 3D 剖视标定短片」等需求时，AI 会自动加载 [`SKILL.md`](SKILL.md) 并按 6 步标准流完成建模、门禁校验与 1080p 成片渲染。
