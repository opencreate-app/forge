/**
 * Purpose: A simple event emitter to allow decoupling of the engine from the UI.
 */
export const FORGE_EVENTS = {
  FIT_TO_SCREEN: "forge:fit-to-screen",
} as const;

class ForgeEventEmitter extends EventTarget {
  emit(eventName: string, detail?: any) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export const forgeEvents = new ForgeEventEmitter();
