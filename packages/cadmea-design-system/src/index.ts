// Copyright (c) 2026 BowenLabs. MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-design-system
//
// A framework-agnostic design-token engine: turn a settings object into the
// CSS token cascade (DaisyUI v5 themes + an OKLCH brand ramp + spacing/type
// tokens + font pairings). Pure functions, zero dependencies, no platform
// APIs — usable server-side (SSR <style>) or client-side (live preview).
//
// Not a plugin and not an adapter — a standalone library (see EXTENDING.md).

export * from "./build-token-style.js";
export * from "./color-scale.js";
export * from "./contrast.js";
export * from "./font-pairing.js";
export * from "./resolve-spacing-tokens.js";
export * from "./spacing-presets.js";
export * from "./theme-presets.js";
export * from "./type-defaults.js";
