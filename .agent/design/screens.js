// Artboard manifest (design-canvas window.CANVAS shape). Read by index.html (gallery) and tools/check.mjs (shoot.mjs + auditLayout).
// w/h = artboard size; h is the full content height for long pages (gallery auto-fits when served over http).
window.CANVAS = {
  title: 'BasaManager',
  themes: ['light', 'dark'],
  groups: [
    { id: 'kit', title: 'Kit and states', screens: [
      { file: 'kit.html', title: 'K01 · Component kit', w: 1440, h: 5600 },
    ] },
  ],
};
