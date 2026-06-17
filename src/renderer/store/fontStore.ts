/**
 * Purpose: Store for managing system and Google fonts, including loading, weight mapping, and ensuring fonts are available for rendering.
 */
import { create } from "zustand";

export interface FontInfo {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  weight: number | string;
  source: "system" | "google";
}

interface FontState {
  systemFonts: FontInfo[];
  googleFonts: FontInfo[];
  systemFontWeights: Record<string, string[]>;
  isLoading: boolean;
  error: string | null;

  loadSystemFonts: () => Promise<void>;
  loadGoogleFonts: () => Promise<void>;
  ensureFontLoaded: (family: string, weight?: string | number) => Promise<void>;
  getFontWeights: (family: string) => string[];
}

const STYLE_TO_WEIGHT: Record<string, string> = {
  thin: "100",
  hairline: "100",
  extralight: "200",
  "extra light": "200",
  ultralight: "200",
  "ultra light": "200",
  light: "300",
  regular: "400",
  normal: "400",
  medium: "500",
  semibold: "600",
  "semi bold": "600",
  demibold: "600",
  "demi bold": "600",
  bold: "700",
  extrabold: "800",
  "extra bold": "800",
  ultrabold: "800",
  "ultra bold": "800",
  black: "900",
  heavy: "900",
};

export const useFontStore = create<FontState>((set, get) => ({
  systemFonts: [],
  googleFonts: [],
  systemFontWeights: {},
  isLoading: false,
  error: null,

  loadSystemFonts: async () => {
    if (get().systemFonts.length > 0) return;
    set({ isLoading: true });
    try {
      if ("queryLocalFonts" in window) {
        // @ts-expect-error - queryLocalFonts is a new API
        const availableFonts = await window.queryLocalFonts();
        const weightsMap: Record<string, Set<string>> = {};

        const fonts: FontInfo[] = availableFonts.map((font: any) => {
          const family = font.family;
          const style = font.style.toLowerCase();

          if (!weightsMap[family]) weightsMap[family] = new Set();

          // Try to map style to numeric weight
          let weight = "400";
          for (const [key, val] of Object.entries(STYLE_TO_WEIGHT)) {
            if (style.includes(key)) {
              weight = val;
              break;
            }
          }
          weightsMap[family].add(weight);

          return {
            family: font.family,
            fullName: font.fullName,
            postscriptName: font.postscriptName,
            style: font.style,
            weight,
            source: "system",
          };
        });

        // Deduplicate families for the list
        const uniqueFamilies = Array.from(new Set(fonts.map((f) => f.family))).sort();
        const deduplicated = uniqueFamilies.map(
          (family) => fonts.find((f) => f.family === family)!,
        );

        const systemFontWeights: Record<string, string[]> = {};
        for (const [family, weights] of Object.entries(weightsMap)) {
          systemFontWeights[family] = Array.from(weights).sort((a, b) => parseInt(a) - parseInt(b));
        }

        set({
          systemFonts: deduplicated,
          systemFontWeights,
        });
      } else {
        console.warn("queryLocalFonts not supported");
        set({
          systemFonts: [
            {
              family: "Arial",
              fullName: "Arial",
              postscriptName: "Arial",
              style: "Regular",
              weight: 400,
              source: "system",
            },
          ],
          systemFontWeights: { Arial: ["400", "700"] },
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadGoogleFonts: async () => {
    if (get().googleFonts.length > 0) return;
    const popularGoogleFonts: FontInfo[] = [
      {
        family: "Roboto",
        fullName: "Roboto",
        postscriptName: "Roboto-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Open Sans",
        fullName: "Open Sans",
        postscriptName: "Open Sans",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Lato",
        fullName: "Lato",
        postscriptName: "Lato-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Montserrat",
        fullName: "Montserrat",
        postscriptName: "Montserrat-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Oswald",
        fullName: "Oswald",
        postscriptName: "Oswald-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Raleway",
        fullName: "Raleway",
        postscriptName: "Raleway-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Ubuntu",
        fullName: "Ubuntu",
        postscriptName: "Ubuntu-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Playfair Display",
        fullName: "Playfair Display",
        postscriptName: "PlayfairDisplay-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Poppins",
        fullName: "Poppins",
        postscriptName: "Poppins-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Inter",
        fullName: "Inter",
        postscriptName: "Inter-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Merriweather",
        fullName: "Merriweather",
        postscriptName: "Merriweather-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Noto Sans",
        fullName: "Noto Sans",
        postscriptName: "NotoSans-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Nunito",
        fullName: "Nunito",
        postscriptName: "Nunito-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Quicksand",
        fullName: "Quicksand",
        postscriptName: "Quicksand-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Work Sans",
        fullName: "Work Sans",
        postscriptName: "WorkSans-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Fira Sans",
        fullName: "Fira Sans",
        postscriptName: "FiraSans-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Josefin Sans",
        fullName: "Josefin Sans",
        postscriptName: "JosefinSans-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Libre Baskerville",
        fullName: "Libre Baskerville",
        postscriptName: "LibreBaskerville-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "PT Sans",
        fullName: "PT Sans",
        postscriptName: "PTSans-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "PT Serif",
        fullName: "PT Serif",
        postscriptName: "PTSerif-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Archivo",
        fullName: "Archivo",
        postscriptName: "Archivo-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Bitter",
        fullName: "Bitter",
        postscriptName: "Bitter-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Caveat",
        fullName: "Caveat",
        postscriptName: "Caveat-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Dancing Script",
        fullName: "Dancing Script",
        postscriptName: "DancingScript-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Pacifico",
        fullName: "Pacifico",
        postscriptName: "Pacifico-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Space Grotesk",
        fullName: "Space Grotesk",
        postscriptName: "SpaceGrotesk-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
      {
        family: "Titillium Web",
        fullName: "Titillium Web",
        postscriptName: "TitilliumWeb-Regular",
        style: "Regular",
        weight: 400,
        source: "google",
      },
    ];
    set({ googleFonts: popularGoogleFonts });
  },

  ensureFontLoaded: async (family: string, weight?: string | number) => {
    const font = [...get().systemFonts, ...get().googleFonts].find((f) => f.family === family);
    
    // If it's a known Google font, or it's not a known system font, treat it as a potential Google font
    const isGoogle = font?.source === "google" || (!font && family !== "Arial" && family !== "serif" && family !== "sans-serif" && family !== "monospace");

    if (isGoogle) {
      const fontId = `google-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
      if (!document.getElementById(fontId)) {
        const link = document.createElement("link");
        link.id = fontId;
        link.rel = "stylesheet";
        const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900].join(";");
        link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@${weights}&display=swap`;
        
        const loadPromise = new Promise<void>((resolve) => {
          link.onload = () => resolve();
          link.onerror = () => resolve();
        });
        
        document.head.appendChild(link);
        await loadPromise;
      }

      // Always try to load the specific font face to ensure it's ready in the document
      try {
        const weightStr = weight ? weight.toString() : "400";
        await (document as any).fonts.load(`${weightStr} 1em "${family}"`);
      } catch (e) {
        console.error(`Failed to load font ${family} (weight: ${weight})`, e);
      }
    } else {
      // For system fonts, we still want to ensure the specific face is loaded/ready
      try {
        const weightStr = weight ? weight.toString() : "400";
        await (document as any).fonts.load(`${weightStr} 1em "${family}"`);
      } catch (_e) {
        // System fonts should usually be ready, but this triggers browser discovery
      }
    }
  },

  getFontWeights: (family: string) => {
    if (get().systemFontWeights[family]) {
      return get().systemFontWeights[family];
    }
    const isGoogle = get().googleFonts.some((f) => f.family === family);
    if (isGoogle) {
      return ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
    }
    return ["400", "700"];
  },
}));
