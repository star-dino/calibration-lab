// Calibration Lab Studio catalog (`gallery/catalog.js`): the one style this repo ships.
export const STYLES = [
  {
    id: 'calibration-lab',
    name: 'Calibration Lab',
    zh: '计量实验室',
    scenes: 5,
    dur: 26.0,
    preset: 'mech',
    stageMode: '3d-pure',
    defaultOverlay: 'none',
    kernel: './kernel.js',
    samples: [
      { id: 'nautilus', name: 'Mechanical Nautilus', zh: '机械鹦鹉螺 · 默认样片', world: null, content: null },
      { id: 'whale-v10', name: 'Balaenoptera AQ-12 (V10)', zh: '深海声学须鲸 · 复杂档', world: '/styles/calibration-lab/whale/world.js', content: '/styles/calibration-lab/whale/scenes.html' },
      { id: 'whale-minimal', name: 'Balaenoptera AQ-12 (Minimal)', zh: '深海声学须鲸 · 标准档', world: '/styles/calibration-lab/whale/world.js', content: '/styles/calibration-lab/whale/scenes.html', look: '{"mech":"minimal"}' },
    ],
    bestFor: [
      '机械原理 / 结构拆解 / 剖视解释（发动机 / 泵 / 减速箱 / 连杆机构）',
      '工业产品与量具 / 标定与公差 / 制造工艺科普',
      '工程教学 / 物理机制讲解 / “它为什么这么动”',
      '技术发布会结构页 / 专利与论文机制可视化',
    ],
    avoidFor: [
      '需要情绪与角色的故事短片',
      '高密度金融K线与财务报表',
      '纯命令行代码终端演示',
    ],
    keywords: [
      '机械', '原理', '结构', '剖视', '剖面', '爆炸图', '拆解', '机构', '发动机', '引擎',
      '四冲程', '曲轴', '活塞', '连杆', '凸轮', '气门', '齿轮', '减速箱', '变速箱', '泵',
      '液压', '轴承', '公差', '标定', '量具', '实验室', '工程', '工业', '制造', '装配',
      '教学', '科普', '怎么工作', '为什么', '原理演示',
      'machine', 'mechanism', 'cutaway', 'section', 'exploded', 'engine', 'piston', 'crank',
      'gear', 'pump', 'bearing', 'calibration', 'metrology', 'engineering', 'assembly',
      'how it works', 'explainer',
    ],
    cameraPresets: [
      'heroEstablish',
      'macroPush',
      'tabletopOrbit',
      'dollyVertigo',
      'finalePull',
    ],
  },
];

export const SIZES = [
  { id: '1920x1080', name: '16:9 横屏' },
  { id: '1080x1920', name: '9:16 竖屏' },
  { id: '1080x1080', name: '1:1 方画幅' },
];
