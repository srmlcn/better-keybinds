"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { amplitudeToPerceptual, perceptualToAmplitude, roundVolume } = require("../src/lib/volume");

describe("Discord perceptual volume curve", () => {
  it("maps 0 and 100 to themselves", () => {
    assert.equal(perceptualToAmplitude(0), 0);
    assert.equal(perceptualToAmplitude(100), 100);
    assert.equal(amplitudeToPerceptual(0), 0);
    assert.equal(amplitudeToPerceptual(100), 100);
  });
  it("converts slider 50% to ~5.62 amplitude (50 dB range)", () => {
    assert.ok(Math.abs(perceptualToAmplitude(50) - 5.6234132519) < 1e-9);
  });
  it("converts amplitude 40/60 to the slider percents Discord shows", () => {
    assert.equal(roundVolume(amplitudeToPerceptual(40)), 84);
    assert.equal(roundVolume(amplitudeToPerceptual(60)), 91);
  });
  it("round-trips slider percents", () => {
    for (const p of [1, 10, 25, 40, 50, 60, 75, 90, 100, 150]) {
      const back = amplitudeToPerceptual(perceptualToAmplitude(p));
      assert.ok(Math.abs(back - p) < 1e-9, `${p} -> ${back}`);
    }
  });
  it("uses the 6 dB boost range above 100%", () => {
    assert.ok(Math.abs(perceptualToAmplitude(200) - 199.5262314968) < 1e-6);
    assert.ok(Math.abs(amplitudeToPerceptual(200) - 200.343426) < 1e-4);
  });
});
