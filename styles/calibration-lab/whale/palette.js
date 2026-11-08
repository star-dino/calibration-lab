// Palette tokens for Mechanical Cetacean (Archive / 012 · Balaenoptera Teardown).
// Calibrated directly to the 3-view reference sheet (image_8f96b7.jpg / image_8f9697.jpg):
//   - Shell (~68%): crisp matte-glazed ceramic white & warm industrial porcelain (#F4F3F0 .. #E5E3DD)
//   - Mechanism (~30%): deep gunmetal chassis, dark steel hydraulic cylinders, machined steel & titanium
//   - Warm metal (~1.5%): bronze & copper bearing races, hose ferrules, and seam trim
//   - Signal orange accent (~0.5–2%): concentric rotary hub rings, fastener tabs, and optical/core glow

export const P = {
  name: 'Cetacean Archive 012',
  shell: {
    plain: ['#ECEAE4', '#F1EFE9', '#E6E3DC', '#DCD9D1'],
    ceramic: ['#E0DDD5', '#E5E2DA', '#DAD6CE', '#CFCBC2'],
    pleatPlain: ['#EEECE6', '#F2F0EA', '#E4E1DA'],
    pleatCeramic: ['#E2DFD7', '#E6E3DB', '#D8D4CC'],
    // Level-2 secondary assembly chamfer & groove weights (subtle light grey so 3D Level-1 physical gaps & shingled AO dominate)
    chamferDark: 'rgba(124, 130, 140, 0.16)',
    chamferLight: 'rgba(255, 255, 255, 0.92)',
    facetLine: 'rgba(120, 126, 136, 0.18)',
    stencil: 'rgba(28, 32, 38, 0.88)',
    ghost: '#EBE9E3',
    panelLine: 'rgba(116, 122, 132, 0.25)',
    panelHi: 'rgba(255, 255, 255, 0.86)',
    hatchLine: 'rgba(108, 114, 124, 0.34)',
    hatchHi: 'rgba(255, 255, 255, 0.88)',
    hatchDot: 'rgba(84, 90, 100, 0.52)',
    slot: 'rgba(68, 72, 80, 0.48)',
    rivet: 'rgba(96, 102, 112, 0.44)',
    wearInk: 'rgba(64, 60, 56, 0.45)',
  },
  seam: {
    chamfer: '#BA723A',
    copper: '#D68648',
    copperDark: '#9E5C2E',
    copperMetalness: 0.94,
  },
  mech: {
    alu: '#C6CCD4',
    aluDark: '#525862',
    titanium: '#9EA6B2',
    steel: '#D8DEE5',
    chrome: '#EEF2F7',
    structure: '#464C56',
    liner: '#181B20',
    hose: '#23272E',
    darkGunmetal: '#424852',
    cavity: '#5A6068',
    brass: '#CFA254',
    bronze: '#B47E44',
    white: '#F4F2ED',
    ceramic: '#EAE7E0',
  },
  glow: {
    accent: '#E86820',
    stencilBar: '#EC5E1A',
    eyeBase: '#3A1E08',
    eyeEmissive: '#FF8420',
    eyeLight: '#FF6E22',
    hubLight: '#FF7828',
    lens: '#0B0D10',
  },
  stage: {
    bg: '#EAE7E1',
    ground: '#E7E3DC',
    mark: '#CFC8BC',
    shadow: '#58524A',
    surround: '#44484E',
    envFloor: '#88847C',
    envIntensity: 0.82,
    sun: '#FFF9F0',
    fill: '#FAF8F4',
    rim: '#E4ECF6',
    ink: '#22262E',
    shadowOpacity: 0.22,
  },
};
