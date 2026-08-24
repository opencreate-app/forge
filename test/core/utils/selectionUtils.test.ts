import { describe, expect, it } from "vitest";
import { combineSelections, type SelectionResult } from "@utils/selectionUtils";

const incoming: SelectionResult = {
  bounds: { x: 10, y: 20, width: 5, height: 6 },
  mask: "data:image/png;base64,incoming",
};

describe("selectionUtils", () => {
  it("uses the incoming selection when replacing or adding without an existing selection", async () => {
    const current = { hasSelection: false, bounds: null };

    await expect(combineSelections(current, incoming, "replace")).resolves.toEqual(incoming);
    await expect(combineSelections(current, incoming, "unite")).resolves.toEqual(incoming);
  });

  it("keeps the selection empty when subtracting without an existing selection", async () => {
    const current = { hasSelection: false, bounds: null };

    await expect(combineSelections(current, incoming, "subtract")).resolves.toBeNull();
  });
});
