/**
 * Purpose: Contextual header component that displays settings and options specific to the currently active tool.
 */
import React from "react";
import { useToolStore, ToolId } from "@store/toolStore";
import { TOOLS } from "../constants/tools";
import { Settings2 } from "lucide-react";

import { BrushOptions } from "./tools/BrushOptions";
import { MoveOptions } from "./tools/MoveOptions";
import { PencilOptions } from "./tools/PencilOptions";
import { EraserOptions } from "./tools/EraserOptions";
import { SelectOptions } from "./tools/SelectOptions";
import { TransformOptions } from "./tools/TransformOptions";
import { CropOptions } from "./tools/CropOptions";
import { TextOptions } from "./tools/TextOptions";
import { PaintBucketOptions } from "./tools/PaintBucketOptions";

const TOOL_COMPONENTS: Partial<Record<ToolId, React.FC>> = {
  move: MoveOptions,
  brush: BrushOptions,
  pencil: PencilOptions,
  eraser: EraserOptions,
  select: SelectOptions,
  transform: TransformOptions,
  crop: CropOptions,
  text: TextOptions,
  paintBucket: PaintBucketOptions,
};

const ToolOptions: React.FC = () => {
  const activeToolId = useToolStore((state) => state.activeToolId);

  const activeTool = TOOLS.find((tool) => tool.id === activeToolId);
  const ToolIcon = activeTool?.icon || Settings2;
  const OptionsComponent = TOOL_COMPONENTS[activeToolId];

  return (
    <div className="flex items-center gap-4 px-4 py-1 pr-[calc(0.5rem-1px)]">
      <div className="flex items-center gap-4 border-r border-border pr-4 h-full py-1">
        <ToolIcon size={16} className="text-accent" />
        <span className="text-[0.85rem] font-bold uppercase">
          {activeTool?.name || activeToolId}
        </span>
      </div>
      <div className="flex-1 flex items-center h-full">
        {OptionsComponent ? (
          <OptionsComponent />
        ) : (
          <span className="text-[0.75rem] text-[#666]">No options for this tool</span>
        )}
      </div>
    </div>
  );
};

export default ToolOptions;
