/**
 * Purpose: Main container for the right-hand sidebar, featuring resizable panels and tabs for switching between layers and history.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useUIStore } from "@store/uiStore";
import LayerList from "./LayerList";
import HistoryPanel from "./HistoryPanel";
import {
  Layers,
  History,
  // ChevronRight,
  // ChevronLeft,
  GripVertical,
  ChevronLast,
} from "lucide-react";

export const ChevronLastInverse = ({
  size = 24,
  stroke = "currentColor", // Agora funciona dinamicamente!
  strokeWidth = 2,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Seta interna (Chevron) */}
    <path d="m13 18l-6-6 6-6" />
    {/* Linha vertical */}
    <path d="m17 6v12" />
  </svg>
);

const RightSidebar: React.FC = () => {
  const activeTab = useUIStore((state) => state.activeTab);
  const activeSidebarTab = useUIStore((state) => state.activeSidebarTab);
  const setActiveSidebarTab = useUIStore((state) => state.setActiveSidebarTab);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);
  const isSidebarExpanded = useUIStore((state) => state.isSidebarExpanded);
  const setIsSidebarExpanded = useUIStore((state) => state.setIsSidebarExpanded);

  const [isResizing, setIsResizing] = useState(false);

  // Add a reference to control the animation
  const rafRef = useRef<number | null>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Optimization: High-performance throttling with requestAnimationFrame
  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
          const newWidth = window.innerWidth - e.clientX;
          setSidebarWidth(newWidth);
        });
      }
    },
    [isResizing, setSidebarWidth],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  useEffect(() => {
    const sidebarElement = document.getElementById("rightsidebar");

    if (isResizing && sidebarElement) {
      sidebarElement.style.transition = "none";
    } else if (sidebarElement) {
      sidebarElement.style.transition = ""; // Reset to default
    }
  }, [isResizing]);

  if (activeTab === "home") return null;

  return (
    <aside
      className="bg-[#222] border-l border-bg-tertiary flex relative transition-all duration-300 ease"
      style={{ width: isSidebarExpanded ? `${sidebarWidth}px` : "36px" }}
      id="rightsidebar"
    >
      {/* Resize Handle */}
      {isSidebarExpanded && (
        <div
          onMouseDown={startResizing}
          className="absolute top-0 bottom-0 left-[-4px] w-[7px] cursor-col-resize hover:bg-accent/20 transition-colors z-50 flex items-center justify-center group"
        >
          <div className="opacity-0 group-hover:opacity-50 text-text">
            <GripVertical size={12} />
          </div>
          <div className="absolute top-0 bottom-0 left-[-4px] right-[-4px]" />
        </div>
      )}

      {/* Tabs / Icons Sidebar (when collapsed or as a header) */}
      <div className="flex flex-col border-r border-bg-tertiary items-center bg-[#1a1a1a] flex-shrink-0">
        <button
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="p-2 hover:bg-white/10 border-x border-transparent transition-colors text-[#888] hover:text-white"
          title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarExpanded ? <ChevronLast size={16} /> : <ChevronLastInverse size={16} />}
        </button>

        <div className="w-full h-[1px] bg-bg-tertiary" />

        <button
          onClick={() => {
            setActiveSidebarTab("layers");
            if (!isSidebarExpanded) setIsSidebarExpanded(true);
          }}
          className={`p-2 border-x border-transparent transition-colors ${
            activeSidebarTab === "layers" && isSidebarExpanded
              ? "border-l-accent bg-bg-tertiary text-white"
              : "text-[#888] hover:text-white hover:bg-white/5"
          }`}
          title="Layers"
        >
          <Layers size={16} />
        </button>

        <button
          onClick={() => {
            setActiveSidebarTab("history");
            if (!isSidebarExpanded) setIsSidebarExpanded(true);
          }}
          className={`p-2 border-x border-transparent transition-colors ${
            activeSidebarTab === "history" && isSidebarExpanded
              ? "border-l-accent bg-bg-tertiary text-white"
              : "text-[#888] hover:text-white hover:bg-white/5"
          }`}
          title="History"
        >
          <History size={16} />
        </button>
      </div>

      {/* Content Area */}
      {isSidebarExpanded && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="border-b border-bg-tertiary flex items-center p-2 px-3 justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#aaa]">
              {activeSidebarTab === "layers" ? "Layers" : "History"}
            </span>
          </header>

          <div className="flex-1 overflow-hidden flex flex-col">
            {activeSidebarTab === "layers" ? <LayerList /> : <HistoryPanel projectId={activeTab} />}
          </div>
        </div>
      )}
    </aside>
  );
};

export default RightSidebar;
