/**
 * Purpose: Reusable foundation for modal dialogs, providing consistent styling, animations, backdrop handling, and keyboard focus trapping.
 */
import React, { useEffect, useState, useRef } from "react";
import { X, LucideIcon } from "lucide-react";
import { useUIStore } from "@store/uiStore";

interface BaseModalProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;
  width?: string;
  height?: string;
  children: React.ReactNode;
  trapFocusSelector?: string;
  draggable?: boolean;
  resizable?: boolean;
  centered?: boolean;
  closeOnOutsideClick?: boolean;
  // backdropClassName?: string;
}

const BaseModal: React.FC<BaseModalProps> = ({
  id,
  isOpen,
  onClose,
  title,
  icon: Icon,
  width: initialWidth = "900px",
  height: initialHeight = "600px",
  children,
  trapFocusSelector,
  draggable = false,
  resizable = false,
  centered = true,
  closeOnOutsideClick = true,
  // backdropClassName,
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const setModalOpen = useUIStore((state) => state.setModalOpen);
  const focusModal = useUIStore((state) => state.focusModal);
  const modalOrder = useUIStore((state) => state.modalOrder);
  const activeModalId = useUIStore((state) => state.activeModalId);
  const modalSettings = useUIStore((state) => state.modalSettings[id]);
  const setModalSettings = useUIStore((state) => state.setModalSettings);

  const [dragOffset, setDragOffset] = useState({
    x: modalSettings?.x || 0,
    y: modalSettings?.y || 0,
  });
  const [manualSize, setManualSize] = useState<{ width: number; height: number } | null>(
    modalSettings?.width && modalSettings?.height
      ? { width: modalSettings.width, height: modalSettings.height }
      : null,
  );

  // --- State Synchronization during Render ---

  // Track modal open/close in UIStore
  useEffect(() => {
    setModalOpen(id, isOpen);
    return () => setModalOpen(id, false);
  }, [id, isOpen, setModalOpen]);

  // 1. If opened via prop, ensure the component is mounted in the DOM
  if (isOpen && !isRendered) {
    setIsRendered(true);
    // Reset position/size if needed (or load from store)
    setDragOffset({ x: modalSettings?.x || 0, y: modalSettings?.y || 0 });
    setManualSize(
      modalSettings?.width && modalSettings?.height
        ? { width: modalSettings.width, height: modalSettings.height }
        : null,
    );

    // If is centered and draggable, we reset the offset to center it in the viewport. Otherwise, we keep the last position.
    if (centered && draggable) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const modalWidth = manualSize?.width || parseInt(initialWidth);
      const modalHeight = manualSize?.height || parseInt(initialHeight);

      setDragOffset({
        x: Math.max(16, (viewportWidth - modalWidth) / 2),
        y: Math.max(16, (viewportHeight - modalHeight) / 2),
      });
    }
  }

  // 2. If closed via prop, trigger the exit animation (fadeOut/slideDown)
  // We keep isRendered as true so the element continues to exist during transition
  if (!isOpen && isVisible) {
    setIsVisible(false);
  }

  useEffect(() => {
    if (isOpen) {
      // Trigger the entry animation right after mounting
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // This function is the key to FadeOut: it removes the modal from the DOM
  // ONLY after the CSS transitions or animations have finished.
  const handleTransitionEnd = (e: React.TransitionEvent | React.AnimationEvent) => {
    // We ensure the transition/animation that ended was on the main container
    if (e.target === e.currentTarget && !isOpen && !isVisible) {
      setIsRendered(false);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    if (!draggable) return;

    const startX = e.clientX - dragOffset.x;
    const startY = e.clientY - dragOffset.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newOffset = {
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY,
      };

      // Prevent dragging outside the viewport
      const modalWidth = modalRef.current?.offsetWidth || 0;
      const modalHeight = modalRef.current?.offsetHeight || 0;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      newOffset.x = Math.max(16, Math.min(newOffset.x, viewportWidth - modalWidth - 16));
      newOffset.y = Math.max(16, Math.min(newOffset.y, viewportHeight - modalHeight - 16));

      setDragOffset(newOffset);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      // Persist final position
      const finalOffset = {
        x: upEvent.clientX - startX,
        y: upEvent.clientY - startY,
      };
      setModalSettings(id, {
        ...finalOffset,
        width: manualSize?.width,
        height: manualSize?.height,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const startResize = (e: React.MouseEvent) => {
    if (!resizable || !modalRef.current) return;
    e.stopPropagation();

    const rect = modalRef.current.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newSize = {
        width: Math.max(400, startWidth + (moveEvent.clientX - startX)),
        height: Math.max(300, startHeight + (moveEvent.clientY - startY)),
      };
      setManualSize(newSize);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const finalSize = {
        width: Math.max(400, startWidth + (upEvent.clientX - startX)),
        height: Math.max(300, startHeight + (upEvent.clientY - startY)),
      };
      setModalSettings(id, {
        x: dragOffset.x,
        y: dragOffset.y,
        ...finalSize,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "Tab" && modalRef.current) {
        const container = trapFocusSelector
          ? modalRef.current.querySelector(trapFocusSelector) || modalRef.current
          : modalRef.current;

        const focusableElements = container.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, trapFocusSelector]);

  if (!isRendered) return null;

  const modalStyle: React.CSSProperties = {
    width: manualSize ? `${manualSize.width}px` : initialWidth,
    height: manualSize ? `${manualSize.height}px` : initialHeight,
    left: draggable
      ? centered && dragOffset.x === 0 && dragOffset.y === 0
        ? undefined
        : `${dragOffset.x}px`
      : undefined,
    top: draggable
      ? centered && dragOffset.x === 0 && dragOffset.y === 0
        ? undefined
        : `${dragOffset.y}px`
      : undefined,
    position: draggable ? "absolute" : "relative",
    boxShadow:
      activeModalId === id
        ? "0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent)"
        : "none",
  };

  const modalStackIndex = modalOrder.indexOf(id);
  const modalZIndex = 1000 + Math.max(0, modalStackIndex);
  const isBottomModal = modalStackIndex === 0;

  const handleModalMouseDown = () => {
    focusModal(id);
  };

  // If not centered, we use absolute positioning based on the offset
  const containerClass = centered
    ? "flex items-center justify-center"
    : "flex items-start justify-start";

  return (
    <div
      className={`fixed inset-0 ${isBottomModal && closeOnOutsideClick ? "bg-black/30" : "bg-transparent"} pointer-events-none transition-opacity duration-300 ease-in-out ${containerClass} ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ zIndex: modalZIndex }}
      onTransitionEnd={handleTransitionEnd}
    >
      {draggable && (
        <style>
          {`@keyframes zoom-in {
              from {
                opacity: 0;
                transform: scale(0.95);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
            
            @keyframes zoom-out {
              from {
                opacity: 1;
                transform: scale(1);
              }
              to {
                opacity: 0;
                transform: scale(0.95);
              }
            }
            
            .animate-zoom-in {
              animation: zoom-in 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
            
            .animate-zoom-out {
              animation: zoom-out 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
          `}
        </style>
      )}
      <div
        ref={modalRef}
        style={modalStyle}
        data-modal-id={id}
        onMouseDown={handleModalMouseDown}
        className={`bg-[#252525] flex flex-col rounded-lg border border-border overflow-hidden shadow-2xl ${
          !draggable
            ? "transition-all duration-300"
            : isVisible
              ? "animate-zoom-in"
              : "animate-zoom-out"
        } transform ${
          !draggable
            ? isVisible
              ? "opacity-100 translate-y-0 ease-out pointer-events-auto"
              : "opacity-0 translate-y-8 ease-in pointer-events-none"
            : isVisible
              ? "pointer-events-auto"
              : "pointer-events-none"
        }`}
      >
        {/* Header */}
        <div
          onMouseDown={startDrag}
          className={`p-1 border-b border-bg-tertiary flex justify-between items-center ${
            draggable ? "cursor-grab select-none" : ""
          }`}
        >
          <h2 className="text-sm font-bold ml-1 flex items-center gap-2 text-text">
            {Icon && <Icon size={16} className="text-accent" />} {title}
          </h2>
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              focusModal(id);
            }}
            onClick={onClose}
            className="bg-none border-none text-inherit flex p-1 rounded cursor-pointer hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent outline-none transition-colors items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">{children}</div>

        {/* Resize Handle */}
        {resizable && (
          <div
            onMouseDown={startResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 flex items-center justify-center group"
          >
            <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white/40 group-hover:border-accent transition-colors mr-1 mb-1" />
          </div>
        )}
      </div>
    </div>
  );
};

export default BaseModal;
