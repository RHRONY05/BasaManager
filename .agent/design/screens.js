// Artboard manifest (design-canvas window.CANVAS shape). Read by index.html (gallery) and tools/check.mjs (shoot.mjs + auditLayout).
// w/h = artboard size; h is the full content height for long pages (gallery auto-fits when served over http).
window.CANVAS = {
  title: 'BasaManager',
  themes: ['light', 'dark'],
  groups: [
    { id: 'kit', title: 'Kit and states', screens: [
      { file: 'kit.html', title: 'K01 · Component kit', w: 1440, h: 5600 },
    ] },
    { id: 'tenant', title: 'Tenant', screens: [
      { file: 'desktop/15-tenant-home-due.html', title: 'D15 · Tenant home — due', w: 1440, h: 1017, route: '/t' },
      { file: 'mobile/15-tenant-home-due.html', title: 'M15 · Tenant home — due', w: 390, h: 1330, route: '/t' },
      { file: 'desktop/16-tenant-home-paid.html', title: 'D16 · Tenant home — all paid', w: 1440, h: 955, route: '/t' },
      { file: 'mobile/16-tenant-home-paid.html', title: 'M16 · Tenant home — all paid', w: 390, h: 1176, route: '/t' },
      { file: 'desktop/17-tenant-home-overdue.html', title: 'D17 · Tenant home — overdue', w: 1440, h: 975, route: '/t' },
      { file: 'mobile/17-tenant-home-overdue.html', title: 'M17 · Tenant home — overdue', w: 390, h: 1284, route: '/t' },
    ] },
  ],
};
