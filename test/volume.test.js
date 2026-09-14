"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { amplitudeToSlider, roundVolume, sliderToAmplitude } = require("../src/lib/volume");

describe("Discord device volume curve", () => {
  it("maps 0 and 100 to themselves", () => {
    assert.equal(sliderToAmplitude(0), 0);
    assert.equal(sliderToAmplitude(100), 100);
    assert.equal(amplitudeToSlider(0), 0);
    assert.equal(amplitudeToSlider(100), 100);
  });
  it("cubes slider percent to amplitude", () => {
    assert.equal(sliderToAmplitude(50), 12.5);
    assert.ok(Math.abs(sliderToAmplitude(40) - 6.4) < 1e-9);
  });
  it("matches measured slider labels for raw amplitudes", () => {
    assert.equal(roundVolume(amplitudeToSlider(40)), 74);
    assert.equal(roundVolume(amplitudeToSlider(60)), 84);
    assert.equal(roundVolume(amplitudeToSlider(3.1622776601683795)), 32);
  });
  it("round-trips slider percents", () => {
    for (const p of [1, 10, 25, 40, 50, 60, 75, 90, 100]) {
      const back = amplitudeToSlider(sliderToAmplitude(p));
      assert.ok(Math.abs(back - p) < 1e-9, `${p} -> ${back}`);
    }
  });
});
