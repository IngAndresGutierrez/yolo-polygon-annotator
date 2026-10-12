/** Canvas colors (Konva needs literal colors, not CSS classes). */
export const shapeColors = {
  normal: { stroke: '#22c55e', fill: 'rgba(34,197,94,0.14)', label: '#052e16' },
  selected: { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.18)', label: '#082f49' },
  invalid: { stroke: '#f43f5e', fill: 'rgba(244,63,94,0.16)', label: '#ffffff' },
  draft: { stroke: '#facc15', fill: 'rgba(250,204,21,0.12)', label: '#422006' },
} as const
