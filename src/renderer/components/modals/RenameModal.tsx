/**
 * Purpose: Simple modal for renaming items, such as projects, replacing the native prompt() which might not be supported in all environments.
 */
import React, { useState, useEffect, useRef } from "react";
import { Edit2 } from "lucide-react";
import BaseModal from "./BaseModal";

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  initialValue: string;
  title?: string;
}

const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  onRename,
  initialValue,
  title = "Rename",
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && value !== initialValue) {
      onRename(value.trim());
    }
    onClose();
  };

  return (
    <BaseModal
      id="rename-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={Edit2}
      width="400px"
      height="auto"
    >
      <form onSubmit={handleSubmit} className="flex flex-col p-4 w-full gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.75rem] text-text-secondary">New Name</label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            minLength={1}
            required
            onChange={(e) => setValue(e.target.value.trim())}
            className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
          />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-accent text-white rounded text-sm font-bold hover:brightness-110 transition-all"
          >
            Rename
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default RenameModal;
