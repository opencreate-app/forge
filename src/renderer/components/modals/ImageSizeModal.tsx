import React, { useState, useEffect, useRef } from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { Image as ImageIcon, Link2, Unlink2 } from "lucide-react";
import BaseModal from "./BaseModal";
import { forgeEvents, FORGE_EVENTS } from "@utils/events";

interface ImageSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImageSizeModal: React.FC<ImageSizeModalProps> = ({ isOpen, onClose }) => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === activeProjectId),
  );
  const resizeProject = useProjectStore((state) => state.resizeProject);
  const showToast = useUIStore((state) => state.showToast);

  const [width, setWidth] = useState<number>(1);
  const [height, setHeight] = useState<number>(1);
  const [constrain, setConstrain] = useState<boolean>(true);
  const [resample, setResample] = useState<"nearest" | "bilinear">("bilinear");
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const widthInputRef = useRef<HTMLInputElement>(null);

  const [constrainRatio, setConstrainRatio] = useState<number>(1);

  useEffect(() => {
    if (isOpen && activeProject) {
      setWidth(activeProject.width);
      setHeight(activeProject.height);
      setConstrain(true);
      setConstrainRatio(activeProject.height / activeProject.width);
      setResample("bilinear");
      setIsResizing(false);
      setTimeout(() => {
        widthInputRef.current?.focus();
        widthInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, activeProject]);

  if (!activeProject) return null;

  const handleWidthChange = (val: number) => {
    setWidth(val);
    if (constrain && val > 0) {
      setHeight(Math.max(1, Math.round(val * constrainRatio)));
    }
  };

  const handleHeightChange = (val: number) => {
    setHeight(val);
    if (constrain && val > 0 && constrainRatio > 0) {
      setWidth(Math.max(1, Math.round(val / constrainRatio)));
    }
  };

  const handleToggleConstrain = () => {
    const nextConstrain = !constrain;
    setConstrain(nextConstrain);
    if (nextConstrain && width > 0) {
      setConstrainRatio(height / width);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (width <= 0 || height <= 0) {
      showToast("Dimensions must be greater than 0", "error");
      return;
    }
    if (width > 10000 || height > 10000) {
      showToast("Dimensions cannot exceed 10000px", "error");
      return;
    }

    setIsResizing(true);
    try {
      // Delay slightly to let the UI render the resizing state
      await new Promise((resolve) => setTimeout(resolve, 50));
      await resizeProject(activeProject.id, width, height, resample);
      showToast("Image resized successfully", "info");

      // Trigger fit to screen animation post-resize
      forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);

      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to resize image: ${err.message}`, "error");
    } finally {
      setIsResizing(false);
    }
  };

  return (
    <BaseModal
      id="image-size-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Image Size"
      icon={ImageIcon}
      width="320px"
      height="auto"
    >
      <form onSubmit={handleSubmit} className="flex-1 p-4 flex flex-col gap-4 text-sm text-[#ccc]">
        {/* <div className="bg-[#1e1e1e] p-4 rounded border border-border flex flex-col gap-4"> */}
        {/* Dimensions Section */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.75rem] text-[#999] font-medium">New Image Size</label>
          <div className="flex items-center gap-1">
            {/* Width Input */}
            <div className="flex-1">
              <div className="bg-bg-primary border border-border flex items-center px-2 py-1.5 rounded selection:bg-accent focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-bg-secondary transition-all">
                <input
                  id="image-size-width"
                  ref={widthInputRef}
                  type="number"
                  min={1}
                  max={10000}
                  value={width || ""}
                  onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                  disabled={isResizing}
                  className="bg-transparent border-none text-text text-sm w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[0.65rem] text-[#666] font-bold">px</span>
              </div>
            </div>

            {/* Constrain proportions button */}
            <button
              type="button"
              onClick={handleToggleConstrain}
              disabled={isResizing}
              title={
                constrain
                  ? "Constrain Proportions (Locked)"
                  : "Do Not Constrain Proportions (Unlocked)"
              }
              className={`py-2 rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent shrink-0 ${
                constrain
                  ? "text-accent bg-accent/10"
                  : "text-[#666] hover:text-[#999] hover:bg-white/5"
              }`}
            >
              {constrain ? (
                <Link2 size={16} style={{ transform: "rotate(90deg)" }} />
              ) : (
                <Unlink2 size={16} style={{ transform: "rotate(90deg)" }} />
              )}
            </button>

            {/* Height Input */}
            <div className="flex-1">
              <div className="bg-bg-primary border border-border flex items-center px-2 py-1.5 rounded selection:bg-accent focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-bg-secondary transition-all">
                <input
                  id="image-size-height"
                  type="number"
                  min={1}
                  max={10000}
                  value={height || ""}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                  disabled={isResizing}
                  className="bg-transparent border-none text-text text-sm w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[0.65rem] text-[#666] font-bold">px</span>
              </div>
            </div>
          </div>
        </div>

        {/* Constrain checkbox */}
        {/* <div className="flex items-center gap-2 pl-24">
            <input
              id="image-size-constrain"
              type="checkbox"
              checked={constrain}
              onChange={(e) => setConstrain(e.target.checked)}
              disabled={isResizing}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent bg-bg-primary accent-accent"
            />
            <label htmlFor="image-size-constrain" className="text-xs text-[#999] cursor-pointer select-none">
              Constrain Proportions
            </label>
          </div> */}
        {/* </div> */}

        {/* Resampling Select */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="image-size-resample" className="text-[0.75rem] text-[#999] font-medium">
            Resample Algorithm
          </label>
          <select
            id="image-size-resample"
            value={resample}
            onChange={(e) => setResample(e.target.value as any)}
            disabled={isResizing}
            className="w-full bg-bg-primary border border-border text-text p-2 rounded text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
          >
            <option value="bilinear">Bilinear (Best for smooth gradients)</option>
            <option value="nearest">Nearest Neighbor (Best for pixel art)</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isResizing}
            className="px-4 py-2 border border-border text-text rounded font-bold hover:bg-white/5 transition-all text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isResizing}
            className="px-4 py-2 bg-accent text-white rounded font-bold hover:brightness-110 transition-all text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary disabled:opacity-50 min-w-[80px]"
          >
            {isResizing ? "Resizing..." : "OK"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default ImageSizeModal;
