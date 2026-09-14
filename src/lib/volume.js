"use strict";

// Discord's Voice & Video slider is perceptual (dB), while MediaEngineStore
// and AUDIO_SET_*_VOLUME use linear amplitude. Same mapping as Discord's
// PerceptualVolumeUtils / @discordapp/perceptual: 50 dB below 100%, 6 dB boost
// above 100%. See https://github.com/discord/perceptual

const VOLUME_MAX = 100;
const RANGE_DB = 50;
const BOOST_DB = 6;

function perceptualToAmplitude(perceptual, max = VOLUME_MAX) {
  const p = Number(perceptual);
  if (!Number.isFinite(p) || p <= 0 || max <= 0) return 0;
  const db = p > max ? ((p - max) / max) * BOOST_DB : (p / max) * RANGE_DB - RANGE_DB;
  return max * (10 ** (db / 20));
}

function amplitudeToPerceptual(amplitude, max = VOLUME_MAX) {
  const a = Number(amplitude);
  if (!Number.isFinite(a) || a <= 0 || max <= 0) return 0;
  const db = 20 * Math.log10(a / max);
  const frac = db > 0 ? db / BOOST_DB + 1 : (db + RANGE_DB) / RANGE_DB;
  return max * frac;
}

function roundVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

module.exports = {
  BOOST_DB,
  RANGE_DB,
  VOLUME_MAX,
  amplitudeToPerceptual,
  perceptualToAmplitude,
  roundVolume
};
