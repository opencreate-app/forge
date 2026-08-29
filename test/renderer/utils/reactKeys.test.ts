import { describe, expect, it } from "vitest";
import { getContextMenuItemKey, getHistoryEntryKey } from "@/renderer/utils/reactKeys";

describe("renderer React keys", () => {
  it("keeps undo and redo history keys distinct", () => {
    const keys = [
      getHistoryEntryKey("project-1", "undo", 0),
      getHistoryEntryKey("project-1", "redo", 0),
      getHistoryEntryKey("project-1", "undo", 1),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("namespaces context menu item keys", () => {
    expect(getContextMenuItemKey("delete-layer")).toBe("context-menu:delete-layer");
  });
});
