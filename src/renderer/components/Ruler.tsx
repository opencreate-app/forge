/**
 * Purpose: Visual aid component that displays project-aligned rulers with major/minor ticks and a mouse position indicator.
 */
import React, { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@store/projectStore";

interface RulerProps {
  orientation: "horizontal" | "vertical";
  size: number; // thickness of the ruler
}

const Ruler: React.FC<RulerProps> = ({ orientation, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === activeProjectId));

  const [mousePos, setMousePos] = useState<number | null>(null);

  // Use a ref to store the latest render parameters to avoid closing over stale state
  // while allowing the ResizeObserver to trigger a render immediately.
  const paramsRef = useRef({ project, mousePos, orientation, size });

  // Update the ref after render to avoid lint error and ensure ResizeObserver has latest data
  React.useLayoutEffect(() => {
    paramsRef.current = { project, mousePos, orientation, size };
  });

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas || !paramsRef.current.project) return;

    const ctx = canvas.getContext("2d")!;
    const { project: p, mousePos: mp, orientation: o, size: s } = paramsRef.current;
    const { zoom, panX, panY } = p;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Synchronize internal resolution
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, width, height);

    ctx.font = "9px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";

    const isHorizontal = o === "horizontal";
    const length = isHorizontal ? width : height;
    const pan = isHorizontal ? panX : panY;

    const startProj = -pan / zoom;
    const endProj = (length - pan) / zoom;

    const niceNumbers = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    let step = niceNumbers[0];
    for (const n of niceNumbers) {
      if (n * zoom >= 40) {
        step = n;
        break;
      }
    }

    const subStep = step / 5;
    const miniStep = subStep / 2;
    const firstTick = Math.floor(startProj / step) * step;

    for (let val = firstTick; val <= endProj; val += step) {
      const pos = val * zoom + pan;

      // Draw sub-ticks
      ctx.strokeStyle = "#333";
      for (let st = 1; st < 10; st++) {
        const subVal = val + st * miniStep;
        const subPos = subVal * zoom + pan;
        if (subPos >= 0 && subPos <= length) {
          ctx.beginPath();
          const tickSize = st % 2 === 0 ? s * 0.35 : s * 0.2;
          if (isHorizontal) {
            ctx.moveTo(subPos, s);
            ctx.lineTo(subPos, s - tickSize);
          } else {
            ctx.moveTo(s, subPos);
            ctx.lineTo(s - tickSize, subPos);
          }
          ctx.stroke();
        }
      }

      // Draw major tick
      if (pos >= 0 && pos <= length) {
        ctx.beginPath();
        ctx.strokeStyle = "#444";
        if (isHorizontal) {
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, s);
          ctx.stroke();

          const isOutOfBounds = val < 0 || val > p.width;
          ctx.fillStyle = isOutOfBounds ? "#555" : "#888";
          ctx.fillText(Math.round(val).toString(), pos, s - 12);
        } else {
          ctx.moveTo(0, pos);
          ctx.lineTo(s, pos);
          ctx.stroke();

          const isOutOfBounds = val < 0 || val > p.height;
          ctx.fillStyle = isOutOfBounds ? "#555" : "#888";
          ctx.save();
          ctx.translate(s - 12, pos + 4);
          // ctx.rotate(-Math.PI / 2);
          ctx.fillText(Math.round(val).toString(), 0, 0);
          ctx.restore();
        }
      }
    }

    // Draw mouse indicator
    if (mp !== null) {
      ctx.strokeStyle = "#0078ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(mp, 0);
        ctx.lineTo(mp, s);
      } else {
        ctx.moveTo(0, mp);
        ctx.lineTo(s, mp);
      }
      ctx.stroke();
    }

    ctx.restore();
  };

  // Main render effect
  useEffect(() => {
    render();
  }, [project, mousePos, orientation, size]);

  // Handle Resize and Mouse Events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const handleEngineMouseMove = (e: CustomEvent) => {
      const { x, y } = e.detail;
      setMousePos(orientation === "horizontal" ? x : y);
    };

    const resizeObserver = new ResizeObserver(() => {
      // Force immediate internal resolution update and re-render
      // using requestAnimationFrame to stay in sync with the browser's paint cycle
      requestAnimationFrame(render);
    });

    resizeObserver.observe(parent);
    window.addEventListener("forge:mouse-move" as any, handleEngineMouseMove);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("forge:mouse-move" as any, handleEngineMouseMove);
    };
  }, [orientation]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left click starts a guide drag
    if (e.button !== 0) return;

    window.dispatchEvent(
      new CustomEvent("forge:guide-drag-new", {
        detail: {
          type: orientation,
          originalEvent: e.nativeEvent,
        },
      }),
    );
  };

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair"
      style={{ imageRendering: "pixelated" }}
      onMouseDown={handleMouseDown}
    />
  );
};

export default Ruler;
