/**
 * Tests for the sandbox.html HUD top-right row layout.
 * Verifies skull, kill count, XP bar, and settings button elements exist
 * and are in the correct DOM order (left to right): skull → kills → XP → settings.
 */

const fs   = require('fs');
const path = require('path');

const sandboxHTML = fs.readFileSync(
  path.resolve(__dirname, '../sandbox.html'), 'utf8'
);

// ── Element presence ──────────────────────────────────────────────────────────
describe('sandbox.html HUD element presence', () => {
  test('has #hud-top-right-row container', () => {
    expect(sandboxHTML).toContain('id="hud-top-right-row"');
  });

  test('has skull icon #hud-skull-icon', () => {
    expect(sandboxHTML).toContain('id="hud-skull-icon"');
  });

  test('has kill count #hud-kill-count', () => {
    expect(sandboxHTML).toContain('id="hud-kill-count"');
  });

  test('has XP mini bar wrapper #hud-xp-mini-bar-wrap', () => {
    expect(sandboxHTML).toContain('id="hud-xp-mini-bar-wrap"');
  });

  test('has XP fill element #hud-xp-mini-fill', () => {
    expect(sandboxHTML).toContain('id="hud-xp-mini-fill"');
  });

  test('settings button is inside the top-right row', () => {
    const rowIdx = sandboxHTML.indexOf('id="hud-top-right-row"');
    const btnIdx = sandboxHTML.indexOf('id="settings-btn"', rowIdx);
    expect(rowIdx).toBeGreaterThan(-1);
    expect(btnIdx).toBeGreaterThan(rowIdx);
  });
});

// ── DOM order: skull → kills → XP bar → settings ─────────────────────────────
describe('HUD element DOM order (left to right)', () => {
  const skullIdx    = sandboxHTML.indexOf('id="hud-skull-icon"');
  const killsIdx    = sandboxHTML.indexOf('id="hud-kill-count"');
  const xpIdx       = sandboxHTML.indexOf('id="hud-xp-mini-bar-wrap"');
  const settingsIdx = sandboxHTML.indexOf('id="settings-btn"');

  test('skull before kills', () => {
    expect(skullIdx).toBeLessThan(killsIdx);
  });
  test('kills before XP bar', () => {
    expect(killsIdx).toBeLessThan(xpIdx);
  });
  test('XP bar before settings button', () => {
    expect(xpIdx).toBeLessThan(settingsIdx);
  });
});

// ── CSS layout sanity ─────────────────────────────────────────────────────────
describe('HUD layout CSS', () => {
  // Extract just the #hud-top-right-row CSS rule block for precise assertions
  const ruleMatch = sandboxHTML.match(/#hud-top-right-row\s*\{([^}]+)\}/);
  const ruleBody  = ruleMatch ? ruleMatch[1] : '';

  test('top-right row rule block exists in sandbox.html <style>', () => {
    expect(ruleMatch).not.toBeNull();
  });

  test('top-right row has position:fixed within its own rule block', () => {
    expect(ruleBody).toMatch(/position:\s*fixed/);
  });

  test('top-right row has flex-direction within its own rule block', () => {
    expect(ruleBody).toMatch(/flex-direction/);
  });
});
