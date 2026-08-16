/**
 * Purpose: A simple event emitter to allow decoupling of the engine from the UI.
 */
export const FORGE_EVENTS = {
  FIT_TO_SCREEN: "forge:fit-to-screen",
  REQUEST_COLOR_SAMPLE: "forge:request-color-sample",
  COLOR_SAMPLED: "forge:color-sampled",
} as const;

export interface ColorSampleRequest {
  x: number;
  y: number;
}

export interface SampledColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

class ForgeEventEmitter extends EventTarget {
  emit(eventName: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export const forgeEvents = new ForgeEventEmitter();
