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
}

const BaseModal: React.FC<BaseModalProps> = ({
  id,
  isOpen,
  onClose,
  title,
  icon: Icon,
  width = "900px",
  height = "600px",
  children,
  trapFocusSelector,
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const setModalOpen = useUIStore((state) => state.setModalOpen);

  // --- State Synchronization during Render ---

  // Track modal open/close in UIStore
  useEffect(() => {
    setModalOpen(id, isOpen);
    return () => setModalOpen(id, false);
  }, [id, isOpen, setModalOpen]);

  // 1. If opened via prop, ensure the component is mounted in the DOM
  if (isOpen && !isRendered) {
    setIsRendered(true);
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
  // ONLY after the CSS transitions have finished.
  const handleTransitionEnd = (e: React.TransitionEvent) => {
    // We ensure the transition that ended was on the main container (e.g., opacity)
    if (e.target === e.currentTarget && !isOpen && !isVisible) {
      setIsRendered(false);
    }
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

  return (
    <div
      className={`fixed inset-0 bg-black/30 flex items-center justify-center z-[1000] transition-opacity duration-300 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        ref={modalRef}
        style={{ width, height }}
        className={`bg-[#252525] rounded-lg border border-border overflow-hidden flex flex-col shadow-2xl transition-all duration-300 transform ${
          isVisible
            ? "opacity-100 translate-y-0 ease-out"
            : "opacity-0 translate-y-8 ease-in pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="p-1 border-b border-bg-tertiary flex justify-between items-center">
          <h2 className="text-sm font-bold ml-1 flex items-center gap-2 text-text">
            {Icon && <Icon size={16} className="text-accent" />} {title}
          </h2>
          <button
            onClick={onClose}
            className="bg-none border-none text-inherit flex p-1 rounded cursor-pointer hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent outline-none transition-colors items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

export default BaseModal;
