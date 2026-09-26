// World-space stride and SVG-space articulation are visual only; see DESIGN.md.
export const ANIMATION = Object.freeze({
  svgSize: 128,
  strideDistance: 44,
  maxStepDistance: 38,
  maxSampleDistance: 52,
  minMovement: 0.02,
  facingThreshold: 0.15,
  legAngle: 0.34,
  footLift: 3,
  armAngle: 0.23,
  wingAngle: 0.18,
  tailAngle: 0.12,
  floatRate: 2.6,
  floatHeight: 2.5,
  floatArmAngle: 0.14,
});

export const FLOATING_ART = new Set(['elemental', 'void', 'frost-bat']);
