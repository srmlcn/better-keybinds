"use strict";

// Device output/input sliders (Voice & Video) are cubic, not Discord's 50 dB
// per-user curve. Store/API values are linear amplitude; the slider label is
// 100 * (amp/100)^(1/3). Measured: amplitude 40 → ~74% on the slider, so
// writing 50 dB-converted 3.16 for a "40%" bind landed near 29%.
const VOLUME_MAX = 100;

function sliderToAmplitude(percent, max = VOLUME_MAX) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0 || max <= 0) return 0;
  const n = Math.max(0, p / max);
  return max * (n ** 3);
}

function amplitudeToSlider(amplitude, max = VOLUME_MAX) {
  const a = Number(amplitude);
  if (!Number.isFinite(a) || a <= 0 || max <= 0) return 0;
  const n = Math.max(0, a / max);
  return max * (n ** (1 / 3));
}

function roundVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

module.exports = {
  VOLUME_MAX,
  amplitudeToSlider,
  roundVolume,
  sliderToAmplitude
};
