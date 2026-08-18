import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/renderer/store/uiStore";

describe("uiStore modal stack", () => {
  beforeEach(() => {
    useUIStore.setState({
      activeModals: new Set(),
      modalOrder: [],
      activeModalId: null,
    });
  });

  it("puts opened modals at the top of the stack", () => {
    const { setModalOpen } = useUIStore.getState();

    setModalOpen("first-modal", true);
    setModalOpen("second-modal", true);

    expect(useUIStore.getState().modalOrder).toEqual(["first-modal", "second-modal"]);
    expect(useUIStore.getState().activeModalId).toBe("second-modal");
  });

  it("moves an active modal to the top when it receives focus", () => {
    const { setModalOpen, focusModal } = useUIStore.getState();

    setModalOpen("first-modal", true);
    setModalOpen("second-modal", true);
    focusModal("first-modal");

    expect(useUIStore.getState().modalOrder).toEqual(["second-modal", "first-modal"]);
    expect(useUIStore.getState().activeModalId).toBe("first-modal");
  });

  it("activates the previous modal when the active modal closes", () => {
    const { setModalOpen } = useUIStore.getState();

    setModalOpen("first-modal", true);
    setModalOpen("second-modal", true);
    setModalOpen("second-modal", false);

    expect(useUIStore.getState().modalOrder).toEqual(["first-modal"]);
    expect(useUIStore.getState().activeModalId).toBe("first-modal");
  });
});
