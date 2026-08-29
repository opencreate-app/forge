/**
 * Purpose: Request contract for opening the GradientEditorModal from tool controls.
 */
import { GradientPreset } from "@store/gradientStore";

export interface GradientEditorOpenRequest {
  initialPreset: GradientPreset;
  target: "layer" | "preset";
  projectId?: string;
  layerId?: string;
  onApply?: (preset: Omit<GradientPreset, "id">) => void;
}

export interface GradientEditorLayerRequestDetail {
  projectId: string;
  layerId: string;
}
