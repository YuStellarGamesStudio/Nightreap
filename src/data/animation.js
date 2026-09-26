import { ART } from './config.js?v=cd5d8d477f8af273';

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
  // Attackers mirror toward their target for this long, overriding movement facing.
  attackFacingHold: 0.45,
});

// Grounding shadows are baked soft textures; radii/offsets scale with the drawn sprite size.
// The key light comes from the upper-left, so the cast layer leans toward the lower-right.
export const SHADOW = Object.freeze({
  textureSize: 128,
  color: '6,5,12',
  cast: Object.freeze({ radiusX: 0.38, radiusY: 0.12, offsetX: 0.09, offsetY: -0.01, angle: 0.12, alpha: 0.78,
    stops: [[0, 1], [0.35, 0.84], [0.65, 0.44], [0.88, 0.12], [1, 0]] }),
  contact: Object.freeze({ radiusX: 0.18, radiusY: 0.055, offsetX: 0.01, offsetY: -0.035, angle: 0, alpha: 0.92,
    stops: [[0, 1], [0.45, 0.78], [0.8, 0.22], [1, 0]] }),
  floatScale: 0.8, floatAlpha: 0.62, floatLiftShrink: 0.14, floatLiftFade: 0.3,
});

export const FLOATING_ART = new Set([ART.elemental, ART.void, ART['frost-bat']]);
