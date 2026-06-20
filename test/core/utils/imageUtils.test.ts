import { describe, it, expect, vi } from "vitest";
import {
  getOptimizedBoundingBox,
  quantizeImageData,
  safeBase64FromBuffer,
} from "@/core/utils/imageUtils";

describe("imageUtils", () => {
  describe("getOptimizedBoundingBox", () => {
    it("should find the correct bounding box logic", () => {
      const mockData = new Uint8ClampedArray(100 * 100 * 4);
      const idx = (50 * 100 + 50) * 4;
      mockData[idx + 3] = 255;
      const mockCtx = {
        getImageData: vi.fn(() => ({ data: mockData })),
      } as any;
      const mockCanvas = { width: 100, height: 100, getContext: () => mockCtx } as any;
      const bounds = getOptimizedBoundingBox(mockCanvas, { x: 0, y: 0, width: 100, height: 100 });
      expect(bounds).toEqual({ x: 50, y: 50, width: 1, height: 1 });
    });
  });

  describe("quantizeImageData", () => {
    it("should return the same imageData if quality >= 1", () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      const imageData = { data, width: 1, height: 1 } as ImageData;
      const result = quantizeImageData(imageData, 1);
      expect(result).toBe(imageData);
      expect(result.data[0]).toBe(255);
    });

    it("should reduce colors based on quality", () => {
      // Create a 2x2 image with 4 distinct colors
      const data = new Uint8ClampedArray([
        255,
        0,
        0,
        255, // Red
        0,
        255,
        0,
        255, // Green
        0,
        0,
        255,
        255, // Blue
        255,
        255,
        255,
        255, // White
      ]);
      const imageData = { data, width: 2, height: 2 } as ImageData;

      // Quality 0.01 should result in very few colors (min 2)
      const result = quantizeImageData(imageData, 0.01);
      const uniqueColors = new Set();
      for (let i = 0; i < result.data.length; i += 4) {
        uniqueColors.add(`${result.data[i]},${result.data[i + 1]},${result.data[i + 2]}`);
      }

      expect(uniqueColors.size).toBeLessThanOrEqual(2);
    });
  });

  describe("safeBase64FromBuffer", () => {
    it("should correctly encode an ArrayBuffer to base64", () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
      const result = safeBase64FromBuffer(buffer);
      expect(result).toBe(btoa("Hello"));
    });

    it("should handle large buffers by chunking", () => {
      const size = 20000;
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = i % 256;
      const result = safeBase64FromBuffer(bytes.buffer);

      let expectedBinary = "";
      for (let i = 0; i < size; i++) expectedBinary += String.fromCharCode(bytes[i]);
      expect(result).toBe(btoa(expectedBinary));
    });
  });
});
