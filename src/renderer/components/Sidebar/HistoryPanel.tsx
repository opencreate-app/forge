/**
 * Purpose: Sidebar panel that lists the undo/redo history for the active project, allowing users to jump to specific points in the project's timeline.
 */
import React, { useEffect } from "react";
import { useProjectStore } from "@store/projectStore";
import { RotateCcw, RotateCw } from "lucide-react";
import { getHistoryEntryKey } from "@utils/reactKeys";

interface HistoryPanelProps {
  projectId: string;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ projectId }) => {
  const project = useProjectStore((state) => state.projects.find((p) => p.id === projectId));
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const jumpToHistory = useProjectStore((state) => state.jumpToHistory);

  // Scroll to active history entry
  useEffect(() => {
    if (!project) return;

    const activeEntry = document.querySelector(
      `.history-entry-${project.undoStack.length - 1}`,
    ) as HTMLElement;
    if (activeEntry) {
      // Scroll smoothly to the active entry, centering it in the view
      activeEntry.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.undoStack.length, project?.redoStack.length]);

  if (!project) return null;

  const history = [...project.undoStack, ...[...project.redoStack].reverse()];

  return (
    <div className="flex flex-col h-full bg-[#222]">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {history.map((entry, i) => {
          const isRedo = i >= project.undoStack.length;
          const isActive = i === project.undoStack.length - 1;

          return (
            <div
              key={getHistoryEntryKey(projectId, isRedo ? "redo" : "undo", i)}
              onClick={() => jumpToHistory(projectId, i)}
              className={`text-[0.85rem] py-1.5 px-4 cursor-pointer transition-colors border-l history-entry-${i} ${
                isActive
                  ? "bg-bg-tertiary border-accent text-text"
                  : isRedo
                    ? "text-[#666] hover:bg-white/5 border-transparent"
                    : "text-text hover:bg-white/5 border-transparent"
              }`}
            >
              {entry.description}
            </div>
          );
        })}
      </div>
      <div className="p-2 border-t border-bg-tertiary flex justify-end gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => undo(projectId)}
            disabled={project.undoStack.length <= 1}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white disabled:opacity-30"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={() => redo(projectId)}
            disabled={project.redoStack.length === 0}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white disabled:opacity-30"
          >
            <RotateCw size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
