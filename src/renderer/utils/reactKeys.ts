/**
 * Purpose: Stable React key builders for renderer lists whose items can move between groups.
 */

export const getHistoryEntryKey = (
  projectId: string,
  stack: "undo" | "redo",
  index: number,
): string => `history:${projectId}:${stack}:${index}`;

export const getContextMenuItemKey = (id: string): string => `context-menu:${id}`;
