/**
 * Purpose: Configuration and definitions for all available tools, including icons, labels, and associated IDs.
 */
import {
  MousePointer2,
  SquareDashed,
  Brush,
  Pencil,
  Eraser,
  PaintBucket,
  Type,
  Maximize2,
  Crop,
  LucideIcon,
} from "lucide-react";
import { ToolId } from "@store/toolStore";

export interface ToolDefinition {
  id: ToolId;
  icon: LucideIcon;
  label: string;
  name: string;
}

export const TOOLS: ToolDefinition[] = [
  { id: "move", icon: MousePointer2, label: "Move (V)", name: "Move" },
  { id: "select", icon: SquareDashed, label: "Select (M)", name: "Select" },
  {
    id: "transform",
    icon: Maximize2,
    label: "Transform (Ctrl+T)",
    name: "Transform",
  },
  { id: "crop", icon: Crop, label: "Crop (C)", name: "Crop" },
  { id: "brush", icon: Brush, label: "Brush (B)", name: "Brush" },
  { id: "pencil", icon: Pencil, label: "Pencil (P)", name: "Pencil" },
  { id: "eraser", icon: Eraser, label: "Eraser (E)", name: "Eraser" },
  {
    id: "paintBucket",
    icon: PaintBucket,
    label: "Paint Bucket (G)",
    name: "Paint Bucket",
  },
  { id: "text", icon: Type, label: "Text (T)", name: "Text" },
];
