import { describe, expect, it } from "vitest";
import { hexToRgb, hsbToRgb, normalizeHex, rgbToHex, rgbToHsb } from "@/renderer/utils/colorUtils";

describe("colorUtils", () => {
  it("converts six and three digit hex values to RGB", () => {
    expect(hexToRgb("#ff6600")).toEqual({ r: 255, g: 102, b: 0 });
    expect(hexToRgb("0f8")).toEqual({ r: 0, g: 255, b: 136 });
  });

  it("normalizes RGB values to lowercase six digit hex", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 16 })).toBe("#ff0010");
    expect(normalizeHex("#F80")).toBe("#ff8800");
    expect(normalizeHex("invalid")).toBeNull();
  });

  it("converts primary colors between RGB and HSB", () => {
    expect(rgbToHsb({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, b: 100 });
    expect(rgbToHsb({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, b: 100 });
    expect(hsbToRgb({ h: 240, s: 100, b: 100 })).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("keeps neutral colors at zero hue", () => {
    expect(rgbToHsb({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, b: (128 / 255) * 100 });
  });
});
