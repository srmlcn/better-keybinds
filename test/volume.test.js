"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { SLIDER_BIAS, amplitudeToSlider, roundVolume, sliderToAmplitude } = require("../src/lib/volume");

describe("Discord device volume curve", () => {
  it("maps 0 and 100 to themselves", () => {
    assert.equal(sliderToAmplitude(0), 0);
    assert.equal(sliderToAmplitude(100), 100);
    assert.equal(amplitudeToSlider(0), 0);
    assert.equal(amplitudeToSlider(100), 100);
  });
  it("cubes a +2-biased slider percent to amplitude", () => {
    assert.equal(SLIDER_BIAS, 2);
    assert.ok(Math.abs(sliderToAmplitude(50) - 100 * (0.52 ** 3)) < 1e-9);
    assert.ok(Math.abs(sliderToAmplitude(40) - 100 * (0.42 ** 3)) < 1e-9);
  });
  it("reads Discord's labeled percent from raw amplitude", () => {
    assert.equal(roundVolume(amplitudeToSlider(40)), 72);
    assert.equal(roundVolume(amplitudeToSlider(60)), 82);
    assert.equal(roundVolume(amplitudeToSlider(sliderToAmplitude(50))), 50);
  });
  it("round-trips slider percents", () => {
    for (const p of [1, 10, 25, 40, 50, 60, 75, 90, 100]) {
      const back = amplitudeToSlider(sliderToAmplitude(p));
      assert.ok(Math.abs(back - p) < 1e-9, `${p} -> ${back}`);
    }
  });
});
