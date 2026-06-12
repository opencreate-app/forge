/**
 * Purpose: Modal dialog for creating new projects, featuring presets for social media, print, and screen sizes, along with custom dimension controls.
 */
import React, { useState, useEffect, useRef } from "react";
import { useProjectStore, Project } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { Layout } from "lucide-react";
import BaseModal from "./BaseModal";

interface NewProjectProps {
  isOpen: boolean;
  onClose: () => void;
  initialDimensions?: { width: number; height: number };
}

const presetsData = {
  Social: [
    { name: "Instagram Square", w: 1080, h: 1080 },
    { name: "Instagram Story", w: 1080, h: 1920 },
    { name: "Instagram Portrait", w: 1080, h: 1350 },
    { name: "Facebook Page Cover", w: 1640, h: 664 },
    { name: "Facebook Event Image", w: 1920, h: 1080 },
    { name: "Facebook Group Header", w: 1640, h: 856 },
    { name: "YouTube Thumbnail", w: 1280, h: 720 },
    { name: "YouTube Profile", w: 800, h: 800 },
    { name: "YouTube Cover", w: 2560, h: 1440 },
    { name: "Twitter Profile", w: 400, h: 400 },
    { name: "Twitter Header", w: 1500, h: 500 },
  ],
  Print: [
    { name: "A4 Paper", w: 2480, h: 3508 },
    { name: "A5 Paper", w: 1748, h: 2480 },
    { name: "Letter", w: 2550, h: 3300 },
  ],
  Screen: [
    { name: "HD Video", w: 1920, h: 1080 },
    { name: "4K UHD", w: 3840, h: 2160 },
    { name: "MacBook Pro 14", w: 3024, h: 1964 },
  ],
  "2ᴺ": [
    { name: "16x16", w: 16, h: 16 },
    { name: "32x32", w: 32, h: 32 },
    { name: "64x64", w: 64, h: 64 },
    { name: "128x128", w: 128, h: 128 },
    { name: "256x256", w: 256, h: 256 },
    { name: "512x512", w: 512, h: 512 },
    { name: "1024x1024", w: 1024, h: 1024 },
  ],
};

const NewProject: React.FC<NewProjectProps> = ({ isOpen, onClose, initialDimensions }) => {
  const [name, setName] = useState("Untitled");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [background, setBackground] = useState<"white" | "black" | "transparent">("white");
  const [activeCategory, setActiveCategory] = useState<keyof typeof presetsData>("Social");

  const addProject = useProjectStore((state) => state.addProject);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = React.useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const id = crypto.randomUUID();
      let dataUrl: string | undefined = undefined;

      if (background !== "transparent") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, width, height);
          dataUrl = canvas.toDataURL("image/png");
        }
      }

      const newProject: Project = {
        id,
        name: name || "Untitled",
        width,
        height,
        layers: [
          {
            id: "bg-" + id,
            name: "Background",
            type: "raster",
            visible: true,
            locked: false,
            opacity: 100,
            fill: 100,
            x: 0,
            y: 0,
            width,
            height,
            data: dataUrl,
            blendMode: "source-over",
          },
        ],
        guides: [],
        activeLayerId: "bg-" + id,
        selectedLayerIds: ["bg-" + id],
        selection: { hasSelection: false, bounds: null },
        zoom: 1,
        panX: 0,
        panY: 0,
        isDirty: false,
        undoStack: [{ description: "New Project", state: {} as any }],
        redoStack: [],
      };
      addProject(newProject);
      setActiveTab(id);
      onClose();
    },
    [addProject, background, height, name, onClose, setActiveTab, width],
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (initialDimensions) {
          setWidth(initialDimensions.width);
          setHeight(initialDimensions.height);
          setName("Untitled");
        } else {
          setName("Untitled");
          setWidth(1920);
          setHeight(1080);
        }
        setBackground("white");
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialDimensions]);

  const applyPreset = (w: number, h: number, n: string) => {
    setWidth(w);
    setHeight(h);
    setName(n);
  };

  return (
    <BaseModal
      id="new-project-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="New Project"
      icon={Layout}
      width="900px"
      height="600px"
      trapFocusSelector="#project-details"
    >
      <form onSubmit={handleCreate} className="flex flex-1 overflow-hidden">
        {/* Left Panel: Categories & Presets */}
        <div className="w-[600px] border-r border-bg-tertiary flex flex-col bg-[#1e1e1e]">
          {/* Categories Tabs */}
          <div className="flex border-b border-bg-tertiary">
            {(Object.keys(presetsData) as Array<keyof typeof presetsData>).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 text-xs font-bold uppercase transition-colors outline-none focus-visible:bg-bg-tertiary focus-visible:text-accent ${
                  activeCategory === cat
                    ? "text-accent border-b border-accent bg-bg-tertiary/50"
                    : "text-[#666] border-b border-transparent hover:text-[#999] hover:bg-bg-tertiary/50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Presets Grid */}
          <div className="flex-1 overflow-y-scroll p-4 custom-scrollbar">
            <div className="grid grid-cols-3 gap-3">
              {presetsData[activeCategory].map((p) => {
                const maxDim = Math.max(p.w, p.h);
                const scale = (80 / maxDim) * 0.9;
                const pw = p.w * scale;
                const ph = p.h * scale;

                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p.w, p.h, p.name)}
                    onDoubleClick={() => {
                      applyPreset(p.w, p.h, p.name);
                      handleCreate();
                    }}
                    className={`group flex flex-col items-center p-3 rounded border transition-colors text-center outline-none bg-bg-secondary focus-visible:ring-1 focus-visible:ring-accent ${
                      width === p.w && height === p.h
                        ? "border-accent"
                        : "border-bg-tertiary hover:border-[#555]"
                    }`}
                  >
                    <div className="w-full h-[90px] bg-[#1a1a1a] rounded flex items-center justify-center mb-3">
                      <div
                        className="bg-[#333] border border-[#444] shadow-sm"
                        style={{ width: `${pw}px`, height: `${ph}px` }}
                      />
                    </div>

                    <div className="w-full">
                      <div className="font-bold text-[0.7rem] truncate text-[#ccc] mb-1">
                        {p.name}
                      </div>
                      <div className="text-[0.65rem] text-[#666]">
                        {p.w} x {p.h} px
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel: Project Details */}
        <div className="flex-1 p-4 flex flex-col justify-between" id="project-details">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.75rem] text-[#999]">Project Name</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  minLength={1}
                  maxLength={50}
                  placeholder="Untitled"
                  onChange={(e) => setName(e.target.value)}
                  className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.75rem] text-[#999]">Width (px)</label>
                  <input
                    type="number"
                    value={width}
                    min={1}
                    max={10000}
                    onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                    className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.75rem] text-[#999]">Height (px)</label>
                  <input
                    type="number"
                    value={height}
                    min={1}
                    max={10000}
                    onChange={(e) => setHeight(parseInt(e.target.value) || 0)}
                    className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.75rem] text-[#999]">Background</label>
                <div className="flex gap-2">
                  {(["white", "black", "transparent"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBackground(type)}
                      title={type.charAt(0).toUpperCase() + type.slice(1)}
                      className={`group relative w-8 h-8 rounded-full border-2 transition-all outline-none flex items-center justify-center focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${
                        background === type
                          ? "border-accent"
                          : "border-white/5 hover:border-white/20"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-full overflow-hidden ${
                          type === "white"
                            ? "bg-white"
                            : type === "black"
                              ? "bg-black"
                              : "bg-transparent"
                        }`}
                        style={
                          type === "transparent"
                            ? {
                                backgroundImage: `
                              linear-gradient(45deg, #333 25%, transparent 25%), 
                              linear-gradient(-45deg, #333 25%, transparent 25%), 
                              linear-gradient(45deg, transparent 75%, #333 75%), 
                              linear-gradient(-45deg, transparent 75%, #333 75%)
                            `,
                                backgroundSize: "8px 8px",
                                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                                backgroundColor: "#1a1a1a",
                              }
                            : {}
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="mt-6 p-3 bg-accent text-white border-none rounded font-bold hover:brightness-110 transition-all text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
          >
            Create Project
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default NewProject;
