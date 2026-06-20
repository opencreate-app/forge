/**
 * Purpose: Advanced export modal with interactive preview (zoom/pan), estimated file size, and format/quality settings.
 * Design follows the NewProjectModal pattern (900x600px, two-column layout).
 */
import React, { useState, useEffect, useRef } from "react";
import { useProjectStore, Project } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { ForgeEngine } from "@core/engine/ForgeEngine";
import {
  Info,
  ZoomIn,
  ZoomOut,
  Maximize,
  // FileImage,
  ImageDown,
  // Link,
  Link2,
  Unlink2,
} from "lucide-react";
import BaseModal from "./BaseModal";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
}

const formats = [
  {
    label: "PNG",
    value: "image/png",
    ext: "png",
    info: "PNG is a lossless format, ideal for graphics with transparency or sharp edges.",
  },
  {
    label: "JPEG",
    value: "image/jpeg",
    ext: "jpg",
    info: "JPEG is a lossy format, ideal for photographs and images with many colors.",
  },
  {
    label: "WEBP",
    value: "image/webp",
    ext: "webp",
    info: "WEBP is a modern format that offers both lossless and lossy compression.",
  },
];

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project }) => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const activeProject = project || projects.find((p) => p.id === activeProjectId);

  const setExportSettings = useUIStore((state) => state.setExportSettings);
  const engineRef = useRef<ForgeEngine | null>(null);

  // Form State
  const [filename, setFilename] = useState("");
  const [format, setFormat] = useState(formats[0]);
  const [quality, setQuality] = useState(100);
  const [exportWidth, setExportWidth] = useState(0);
  const [exportHeight, setExportHeight] = useState(0);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const filenameInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Initialize local engine for headless export if project prop is provided
  useEffect(() => {
    if (isOpen && project) {
      const dummyCanvas = document.createElement("canvas");
      dummyCanvas.width = 1;
      dummyCanvas.height = 1;
      const engine = new ForgeEngine(dummyCanvas, undefined, { headless: true });
      engine.setProject(project);
      engineRef.current = engine;
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [isOpen, project]);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && activeProject) {
      setFilename(activeProject.name);

      // Load persisted settings (read once via getState to avoid infinite loop)
      const {
        lastExportFormat: savedFormat,
        lastExportQuality: savedQuality,
        lastLockAspectRatio: savedLock,
      } = useUIStore.getState();
      const persistedFormat = formats.find((f) => f.value === savedFormat) || formats[0];

      setFormat(persistedFormat);
      setQuality(savedQuality);
      setLockAspectRatio(savedLock);

      setPan({ x: 0, y: 0 });
      setPreviewUrl("");
      setFileSize(null);
      setExportWidth(activeProject.width);
      setExportHeight(activeProject.height);
      setTimeout(() => {
        filenameInputRef.current?.focus();
        filenameInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, activeProject]);

  // Persist settings when changed
  useEffect(() => {
    if (isOpen) {
      setExportSettings(format.value, quality, lockAspectRatio);
    }
  }, [format.value, quality, lockAspectRatio, setExportSettings, isOpen]);

  // Generate preview and calculate size
  useEffect(() => {
    if (!isOpen || !activeProject) return;

    const generatePreview = async () => {
      const finishPreview = (dataUrl: string) => {
        setPreviewUrl(dataUrl);
        // Calculate size
        const base64Length = dataUrl.split(",")[1].length;
        const sizeInBytes = base64Length * 0.75;
        setFileSize(sizeInBytes);
      };

      if (engineRef.current) {
        const dataUrl = await engineRef.current.exportProject(
          format.value,
          quality / 100,
          exportWidth,
          exportHeight,
        );
        finishPreview(dataUrl);
      } else {
        window.dispatchEvent(
          new CustomEvent("forge:request-export-preview", {
            detail: {
              format: format.value,
              quality: quality / 100,
              width: exportWidth,
              height: exportHeight,
              callback: finishPreview,
            },
          }),
        );
      }
    };

    const timer = setTimeout(generatePreview, 300); // Debounce
    return () => clearTimeout(timer);
  }, [isOpen, activeProject, format, quality, exportWidth, exportHeight]);

  // Viewport Logic (Matches engine feeling)
  const resetPreview = () => {
    if (!activeProject || !previewContainerRef.current) return;

    const container = previewContainerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const padding = 40;
    const scaleX = (cw - padding * 2) / activeProject.width;
    const scaleY = (ch - padding * 2) / activeProject.height;
    const scale = Math.min(scaleX, scaleY);

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  };

  // Auto-fit on first load
  useEffect(() => {
    if (isOpen && activeProject && previewUrl) {
      resetPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, !!previewUrl]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    if (!previewContainerRef.current) return;

    const delta = e.deltaY > 0 ? 0.8 : 1.2;
    const nextZoom = Math.max(0.01, Math.min(zoom * delta, 50));

    // Zoom towards mouse position
    const rect = previewContainerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mx = e.clientX - rect.left - centerX;
    const my = e.clientY - rect.top - centerY;

    const newPanX = mx - (mx - pan.x) * (nextZoom / zoom);
    const newPanY = my - (my - pan.y) * (nextZoom / zoom);

    setZoom(nextZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const formatSize = (bytes: number | null) => {
    if (bytes === null) return "Calculating...";
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleWidthChange = (val: number) => {
    setExportWidth(val);
    if (lockAspectRatio && activeProject) {
      const ratio = activeProject.height / activeProject.width;
      setExportHeight(Math.round(val * ratio));
    }
  };

  const handleHeightChange = (val: number) => {
    setExportHeight(val);
    if (lockAspectRatio && activeProject) {
      const ratio = activeProject.width / activeProject.height;
      setExportWidth(Math.round(val * ratio));
    }
  };

  const handleExport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeProject) return;

    const filters = [{ name: format.label, extensions: [format.ext] }];
    const exportDetail = {
      format: format.value,
      quality: quality / 100,
      filename: `${filename}.${format.ext}`,
      filters,
      width: exportWidth,
      height: exportHeight,
    };

    if (engineRef.current) {
      const dataURL = await engineRef.current.exportProject(
        exportDetail.format,
        exportDetail.quality,
        exportDetail.width,
        exportDetail.height,
      );
      if ((window as any).electronAPI) {
        const result = await (window as any).electronAPI.saveFile({
          dataURL,
          defaultName: exportDetail.filename,
          filters: exportDetail.filters,
        });
        if (result.success) {
          useUIStore.getState().showToast("Project exported successfully", "info");
        } else if (result.error !== "Cancelled") {
          useUIStore.getState().showToast(`Failed to export: ${result.error}`, "error");
        }
      }
    } else {
      window.dispatchEvent(
        new CustomEvent("forge:export-project", {
          detail: exportDetail,
        }),
      );
    }

    onClose();
  };

  if (!activeProject) return null;

  return (
    <BaseModal
      id="export-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Export for Web"
      icon={ImageDown}
      width="900px"
      height="600px"
    >
      <form onSubmit={handleExport} className="flex flex-1 overflow-hidden">
        {/* Left Panel: Interactive Preview */}
        <div className="w-[600px] border-r border-bg-tertiary flex flex-col bg-[#1e1e1e] relative group">
          <div
            ref={previewContainerRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Checkerboard Background */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)`,
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                backgroundColor: "#111",
              }}
            />

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  maxWidth: "none",
                  boxShadow: "0 0 40px rgba(0,0,0,0.5)",
                  transition: isDragging ? "none" : "transform 0.1s ease-out",
                  imageRendering: "pixelated",
                }}
              />
            ) : (
              <div className="text-[#444] flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                {/* <span className="text-xs font-bold uppercase tracking-widest">
                  Generating Preview...
                </span> */}
              </div>
            )}

            {/* Preview Controls overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-[#252525]/80 backdrop-blur-md p-1.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => {
                  const nextZoom = Math.min(zoom * 1.2, 50);
                  setZoom(nextZoom);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-text"
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextZoom = Math.max(zoom * 0.8, 0.01);
                  setZoom(nextZoom);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-text"
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={resetPreview}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-text"
                title="Fit Preview"
              >
                <Maximize size={16} />
              </button>
            </div>
          </div>

          {/* Size Info Footer */}
          <div className="p-1 px-3 bg-bg-secondary border-t border-bg-tertiary flex justify-between items-center">
            <div className="flex items-center gap-2 text-[#999]">
              {/* <FileImage size={14} /> */}
              <span className="text-[0.65rem] font-bold uppercase tracking-wider">
                {exportWidth} × {exportHeight} PX
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* <span className="text-[0.65rem] text-[#666] uppercase tracking-wider">
                Estimated Size
              </span> */}
              <span className="text-xs font-mono font-bold text-accent">
                {formatSize(fileSize)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Panel: Settings */}
        <div className="flex-1 p-4 flex flex-col justify-between bg-[#252525]" id="export-details">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label className="text-[0.75rem] text-[#999]">Filename</label>
                  <input
                    ref={filenameInputRef}
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                    placeholder="Filename"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.75rem] text-[#999]">Format</label>
                  <select
                    value={format.value}
                    onChange={(e) => {
                      const selected = formats.find((f) => f.value === e.target.value);
                      if (selected) setFormat(selected);
                    }}
                    className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                    // className="w-full bg-bg-primary border border-border text-text p-2 rounded text-sm outline-none cursor-pointer hover:bg-[#333] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                  >
                    {formats.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dimensions Section */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.75rem] text-[#999] font-medium">Export Size</label>
                <div className="flex items-center gap-1">
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="bg-bg-primary border border-border flex items-center px-2 py-1.5 rounded selection:bg-accent focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-bg-secondary transition-all">
                      <input
                        type="number"
                        value={exportWidth}
                        min={1}
                        onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                        className="bg-transparent border-none text-text text-sm w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[0.65rem] text-[#666] font-bold">px</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLockAspectRatio(!lockAspectRatio)}
                    className={`py-2 rounded transition-colors ${
                      lockAspectRatio ? "text-accent bg-accent/10" : "text-[#666] hover:bg-white/5"
                    }`}
                    title={lockAspectRatio ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
                  >
                    {lockAspectRatio ? (
                      <Link2 size={16} style={{ transform: "rotate(90deg)" }} />
                    ) : (
                      <Unlink2 size={16} style={{ transform: "rotate(90deg)" }} />
                    )}
                    {/* <Link2 size={16} style={{ transform: "rotate(90deg)" }} /> */}
                  </button>

                  <div className="flex-1 flex flex-col gap-1">
                    <div className="bg-bg-primary border border-border flex items-center px-2 py-1.5 rounded selection:bg-accent focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-bg-secondary transition-all">
                      <input
                        type="number"
                        value={exportHeight}
                        min={1}
                        onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                        className="bg-transparent border-none text-text text-sm w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[0.65rem] text-[#666] font-bold">px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quality Settings */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-[0.75rem] text-[#999] font-medium">Quality</label>
                  <div className="flex items-center gap-1 bg-bg-primary border border-border hover:border-accent/50 px-1.5 py-0.5 rounded transition-all cursor-pointer group">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={quality}
                      onChange={(e) =>
                        setQuality(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))
                      }
                      className="bg-transparent border-none text-[0.75rem] w-8 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-white font-medium"
                    />
                    <span className="text-[0.65rem] text-[#666] select-none font-bold">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <div className="flex justify-between text-[0.6rem] text-[#777] font-bold uppercase tracking-tighter">
                  <span>Small Size</span>
                  <span>Best Quality</span>
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-[#ccc] shrink-0 mt-0.5" />
                <p className="text-[0.7rem] text-[#ccc] leading-normal font-medium">
                  {format.info}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              className="p-3 bg-accent text-white border-none rounded font-bold hover:brightness-110 transition-all text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
            >
              Export Image
            </button>
            {/* <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#666] hover:text-[#999] transition-colors text-xs font-bold uppercase tracking-widest outline-none focus-visible:text-text"
            >
              Cancel
            </button> */}
          </div>
        </div>
      </form>
    </BaseModal>
  );
};

export default ExportModal;
