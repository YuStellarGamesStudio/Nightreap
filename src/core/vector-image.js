// Keep SVG as the source of truth, but never replay its paths during animated draws.
export function rasterizeVector(source, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
