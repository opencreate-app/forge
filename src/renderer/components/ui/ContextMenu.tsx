import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";

export type ContextMenuItem =
  | {
      label: string;
      icon?: React.ElementType;
      onClick: () => void;
      danger?: boolean;
    }
  | {
      isSeparator: true;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [coords, setCoords] = useState({ posX: x, posY: y });
  const [origin, setOrigin] = useState("top left");

  const handleClose = useCallback(() => {
    setIsExiting(true);
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 100); // Matches animation-context-menu-out duration
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let newX = x;
      let newY = y;
      let originX = "left";
      let originY = "top";

      if (x + rect.width > window.innerWidth) {
        newX = x - rect.width;
        originX = "right";
      }
      if (y + rect.height > window.innerHeight) {
        newY = y - rect.height;
        originY = "bottom";
      }

      // Final boundary checks
      newX = Math.max(8, Math.min(newX, window.innerWidth - rect.width - 8));
      newY = Math.max(8, Math.min(newY, window.innerHeight - rect.height - 8));

      setCoords({ posX: newX, posY: newY });
      setOrigin(`${originY} ${originX}`);
    }
  }, [x, y, items]);

  return (
    <>
      <style>
        {`
      @keyframes context-menu-in {
        from {
          opacity: 0;
          transform: scale(0.9);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes context-menu-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      .animate-context-menu-in {
        animation: context-menu-in 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .animate-context-menu-out {
        animation: context-menu-out 100ms ease-in forwards;
      }
      `}
      </style>
      <div
        ref={menuRef}
        className={`fixed z-[1000] bg-bg-primary/80 backdrop-blur-lg border border-bg-tertiary rounded-lg shadow-xl py-2 min-w-[200px] ${
          isExiting ? "animate-context-menu-out" : "animate-context-menu-in"
        }`}
        style={{
          top: coords.posY,
          left: coords.posX,
          transformOrigin: origin,
        }}
      >
        {items.map((item, index) => {
          if ("isSeparator" in item) {
            return <div key={index} className="my-1 border-b border-bg-tertiary" />;
          }

          return (
            <div
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                handleClose();
              }}
              className={`flex items-center gap-3 px-3 py-1 cursor-pointer active:opacity-80 ${
                item.danger ? "text-red-400 hover:bg-red-400/10" : "text-text hover:bg-white/10"
              }`}
            >
              {item.icon && <item.icon size={16} />}
              <span className="text-[0.85rem] text-nowrap">{item.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ContextMenu;
