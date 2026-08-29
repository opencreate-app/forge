/**
 * Purpose: Vite environment type definitions and module declarations for assets like CSS.
 */
/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    debugCrashRenderer?: () => void;
    writeClipboardText?: (text: string) => Promise<boolean>;
  };
  __forgeDebug?: {
    crashRenderer: () => void;
  };
}

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

declare module "upng-js" {
  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[],
  ): ArrayBuffer;
  export function decode(data: ArrayBuffer): any;
  export function toRGBA8(out: any): ArrayBuffer[];
}
