/**
 * Purpose: Modal dialog showing information about OpenCreate Forge — version, tech stack, repository links, and credits.
 */
import React, { useEffect, useState } from "react";
import { ExternalLink, Heart, Zap, Code2, Download, GitBranch, InfoIcon, Bug } from "lucide-react";
import BaseModal from "./BaseModal";
import { MadeInBrasilSeal } from "../ui/Global";

interface AboutModalProps {
  /** Flag showing if the modal is currently open */
  isOpen: boolean;
  /** Function called when closing the modal */
  onClose: () => void;
}

interface TechItem {
  name: string;
  description: string;
}

const TECH_STACK: TechItem[] = [
  { name: "Electron", description: "Desktop shell" },
  { name: "React 19", description: "UI framework" },
  { name: "TypeScript 6", description: "Type safety" },
  { name: "Zustand 5", description: "State management" },
  { name: "Tailwind CSS v4", description: "Styling" },
  { name: "Vite 8", description: "Build tool" },
  { name: "HTML5 Canvas", description: "Rendering engine" },
];

/**
 * Opens a URL in the system's default browser via Electron's shell.openExternal.
 */
function openExternal(url: string): void {
  if ((window as any).electronAPI?.openExternal) {
    (window as any).electronAPI.openExternal(url);
  }
}

interface LinkButtonProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  variant?: "primary" | "secondary";
}

const LinkButton: React.FC<LinkButtonProps> = ({
  href,
  icon,
  label,
  description,
  variant = "secondary",
}) => {
  const baseClass =
    "flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 !cursor-pointer border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";

  const variantClass =
    variant === "primary"
      ? "bg-accent/20 border-accent/40 text-accent hover:bg-accent/30 hover:border-accent"
      : "bg-bg-secondary/60 border-border/60 text-text-secondary hover:bg-bg-secondary hover:border-border hover:text-text";

  return (
    <button
      className={`${baseClass} ${variantClass}`}
      onClick={() => openExternal(href)}
      type="button"
    >
      {icon}
      <span className="flex flex-col items-start leading-tight">
        <span>{label}</span>
        {description && <span className="text-[0.7rem] opacity-60 font-normal">{description}</span>}
      </span>
      <ExternalLink size={14} className="ml-auto opacity-50 flex-shrink-0" />
    </button>
  );
};

/**
 * Official OpenCreate Forge logo (dark variant).
 */
const LogoDark = ({ width }: { width: number }) => {
  const originalWidth = 603;
  const originalHeight = 200;
  const height = (width * originalHeight) / originalWidth;

  return (
    <svg
      version="1.2"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 603 200"
      width={width}
      height={height}
    >
      <style>{`.a{fill:#ff6c00}.b{fill:#ccc}.c{fill:#fff}`}</style>
      <path
        className="a"
        d="m37.3 106h19.6q-0.9 4.5-0.9 9.3c0 7.2 1.6 14 4.5 20-6.4 5-14.4 8-23.2 8v46.7c-20.6 0-37.3-16.7-37.3-37.3v-65.4c0-20.6 16.7-37.3 37.3-37.3h62.3c0 7.1-2 13.8-5.5 19.4-11.7 2.2-21.8 8.7-28.7 17.8q-1.6 0.1-3.2 0.1h-24.9zm65.4 84h-37.4l12.5-37.3h24.9c-20.7 0-37.4-16.7-37.4-37.3 0-20.7 16.7-37.4 37.4-37.4 7.3 0 14.2 2.2 20 5.8l17.3-5.8v74.7c0 20.6-16.7 37.3-37.3 37.3zm9.3-74.6c0-5.2-4.2-9.4-9.3-9.4-5.2 0-9.4 4.2-9.4 9.4 0 5.1 4.2 9.3 9.4 9.3 5.1 0 9.3-4.2 9.3-9.3z"
      />
      <path
        className="b"
        d="m205 50c-13.8 0-25-11.2-25-25 0-13.8 11.2-25 25-25 13.8 0 25 11.2 25 25 0 13.8-11.2 25-25 25zm15-25c0-8.3-6.7-15-15-15-8.3 0-15 6.7-15 15 0 8.3 6.7 15 15 15 8.3 0 15-6.7 15-15zm35 25q0 0 0 0 0 0-0.1 0-2.4 0-4.8-0.6l2.5-9.7q1.1 0.3 2.4 0.3c5.5 0 10-4.5 10-10 0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10v30h-10v-50h10v2.7c2.9-1.7 6.4-2.7 10-2.7 11.1 0 20 8.9 20 20 0 11.1-8.9 20-20 20zm39.8-0.7c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1zm50.2-39.3c11.1 0 20 8.9 20 20v20h-10v-20c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10v20h-10v-20c0-11.1 8.9-20 20-20zm50 40c-13.8 0-25-11.2-25-25 0-13.8 11.2-25 25-25 6.9 0 13.2 2.8 17.7 7.3l-7.1 7.1c-2.7-2.7-6.5-4.4-10.6-4.4-8.3 0-15 6.7-15 15 0 8.3 6.7 15 15 15 4.1 0 7.9-1.7 10.6-4.4l7.1 7.1c-4.5 4.5-10.8 7.3-17.7 7.3zm42.5-40q2.5 0 4.9 0.6l-2.5 9.7q-1.1-0.3-2.4-0.3c-5.5 0-10 4.5-10 10v20h-10c0 0 0-20 0-20 0-11.1 8.9-20 20-20zm22.3 39.3c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1zm50.3 0.7c-11.1 0-20.1-8.9-20.1-20 0-11.1 8.9-20 20-20 11.1 0 20 8.9 20 20v20h-10v-20c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7q-2.4 0.6-4.8 0.6zm44.9 0c-11.1 0-20-8.9-20-20v-20h20v10h-10v10c0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7q-2.4 0.6-4.9 0.6zm22.3-0.7c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1z"
      />
      <path
        className="c"
        d="m200 170h-20v-100h60l-5 20h-35v20h20v20h-20zm59.6-1.4c-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 21.3 5.7 34 27.6 28.2 49-5.7 21.3-27.6 34-49 28.2zm30.4-38.6c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20 11.1 0 20-8.9 20-20zm65-40c3.3 0 6.6 0.4 9.7 1.2l-4.8 19.4q-2.4-0.6-4.9-0.6c-11.1 0-20 8.9-20 20v40h-20v-40c0-22.1 17.9-40 40-40zm50 90c9.3 0 17.2-6.4 19.4-15-8.8 4.8-19.3 6.4-29.8 3.6-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 3.4 0.9 6.6 2.3 9.6 4v-5.4h20v39.4q0 0.5 0 1.1v28.9c0.1 3.6-0.4 7.3-1.4 11-5.6 21.1-27.1 33.7-48.3 28.4l4.8-19.4q2.4 0.6 4.9 0.6zm20-50c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20 11.1 0 20-8.9 20-20zm54.6 38.6c-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 18 4.8 29.9 21.2 29.6 39.1v-0.5h-20c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20q2.5 0 4.9-0.6l4.8 19.4c-6.4 1.6-13.2 1.7-20.1-0.2z"
      />
    </svg>
  );
};

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [appVersion, setAppVersion] = useState<string>("0.1.0");

  useEffect(() => {
    if (!isOpen) return;
    if ((window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI
        .getAppVersion()
        .then((v: string) => {
          if (v) setAppVersion(v);
        })
        .catch(() => {
          // Fallback to default
        });
    }
  }, [isOpen]);

  return (
    <BaseModal
      id="about-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="About OpenCreate Forge"
      icon={InfoIcon}
      width="500px"
      height="auto"
      centered
      closeOnOutsideClick
    >
      <div className="flex flex-col w-full overflow-y-auto p-5 gap-5">
        {/* Hero: logo + version */}
        <div className="flex flex-col items-center gap-3 py-2">
          <LogoDark width={220} />
          <div className="flex items-center gap-2">
            {/* <span className="text-xs text-text-secondary">Version</span>
            <span className="font-mono bg-bg-tertiary px-2 py-0.5 rounded text-accent text-[0.72rem]">
              v{appVersion}
            </span> */}
            <div className="text-[0.7rem] text-white/60 font-medium">Version {appVersion}</div>
          </div>
          <p className="text-xs text-text-secondary text-center leading-relaxed max-w-[340px]">
            A modern, open-source image manipulation software powered by
            React&nbsp;&amp;&nbsp;Electron.
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/50" />

        {/* Links */}
        <div className="flex flex-col gap-2">
          {/* <p className="text-[0.9rem] text-text-secondary/60 mb-0.5">Resources</p> */}
          <div className="grid grid-cols-2 gap-2">
            <LinkButton
              href="https://github.com/gabrielborgesweb/opencreate-forge"
              icon={<GitBranch size={22} strokeWidth={1.4} />}
              label="Source Code"
              description="GitHub repository"
              // variant="primary"
            />
            <LinkButton
              href="https://github.com/gabrielborgesweb/opencreate-forge/releases/latest"
              icon={<Download size={22} strokeWidth={1.4} />}
              label="Latest Release"
              description="Download builds"
            />
            <LinkButton
              href="https://github.com/gabrielborgesweb/opencreate-forge/issues"
              icon={<Bug size={22} strokeWidth={1.4} />}
              label="Issue Tracker"
              description="Report bugs &amp; ideas"
            />
            <LinkButton
              href="https://github.com/gabrielborgesweb/opencreate-forge/blob/main/CONTRIBUTING.md"
              icon={<Code2 size={22} strokeWidth={1.4} />}
              label="Contributing"
              description="How to contribute"
            />
          </div>
        </div>

        {/* Tech Stack */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[0.8rem] font-semibold text-text-secondary/60 mb-0.5 flex items-center gap-1.5">
            <Zap size={14} className="text-accent" />
            Built with
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 mx-5">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                title={tech.description}
                // onClick={() => openExternal(tech.url)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-secondary/60 border border-border/50 text-[0.72rem] font-medium text-text-secondary"
              >
                {tech.name}
              </div>
            ))}
          </div>
        </div>

        {/* License + Credits */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-[0.75rem] text-text-secondary leading-relaxed">
            Licensed under the{" "}
            <button
              type="button"
              onClick={() =>
                openExternal(
                  "https://github.com/gabrielborgesweb/opencreate-forge/blob/main/LICENSE",
                )
              }
              className="underline text-accent hover:text-accent/80 !cursor-pointer bg-transparent border-none p-0 font-medium"
            >
              GPL-3.0 License
            </button>
            .
          </p>
          <p className="text-[0.75rem] text-text-secondary leading-relaxed">
            Created with{" "}
            <Heart size={14} className="text-red-400 fill-red-400 flex-shrink-0 inline mb-1" /> by{" "}
            <button
              type="button"
              onClick={() => openExternal("https://github.com/gabrielborgesweb")}
              className="underline text-accent hover:text-accent/80 !cursor-pointer bg-transparent border-none p-0 font-medium"
            >
              Gabriel Borges
            </button>
            .
          </p>
        </div>

        {/* Seal */}
        <div className="flex justify-center">
          <MadeInBrasilSeal
            height={56}
            className="scale-[1] hover:scale-[1.1] transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
          />
        </div>
      </div>
    </BaseModal>
  );
};
