"use strict";

// Device output/input sliders are cubic in amplitude. Discord's Voice & Video
// label reads ~2 points below a pure cube-root of the store value (50 in a
// bind showed 48). Bias the conversion so the labeled percent matches the bind.
const VOLUME_MAX = 100;
const SLIDER_BIAS = 2;

function sliderToAmplitude(percent, max = VOLUME_MAX) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0 || max <= 0) return 0;
  const biased = p >= max ? max : Math.min(max, p + SLIDER_BIAS);
  return max * ((biased / max) ** 3);
}

function amplitudeToSlider(amplitude, max = VOLUME_MAX) {
  const a = Number(amplitude);
  if (!Number.isFinite(a) || a <= 0 || max <= 0) return 0;
  const p = max * ((Math.max(0, a / max)) ** (1 / 3));
  if (p >= max) return max;
  return Math.max(0, p - SLIDER_BIAS);
}

function roundVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

module.exports = {
  SLIDER_BIAS,
  VOLUME_MAX,
  amplitudeToSlider,
  roundVolume,
  sliderToAmplitude
};
