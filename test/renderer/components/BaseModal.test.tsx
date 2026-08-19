import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BaseModal from "@/renderer/components/modals/BaseModal";
import { useUIStore } from "@/renderer/store/uiStore";

const renderModal = (id: string, title: string) => (
  <BaseModal id={id} isOpen onClose={vi.fn()} title={title}>
    <div>{title} content</div>
  </BaseModal>
);

describe("BaseModal focus management", () => {
  beforeEach(() => {
    useUIStore.setState({
      activeModals: new Set(),
      modalOrder: [],
      activeModalId: null,
    });
  });

  it("brings a clicked modal to the front and highlights it", async () => {
    render(
      <>
        {renderModal("first-modal", "First modal")}
        {renderModal("second-modal", "Second modal")}
      </>,
    );

    await waitFor(() => {
      expect(useUIStore.getState().modalOrder).toEqual(["first-modal", "second-modal"]);
    });

    const firstModal = document.querySelector('[data-modal-id="first-modal"]');
    const secondModal = document.querySelector('[data-modal-id="second-modal"]');
    expect(firstModal).not.toBeNull();
    expect(secondModal).not.toBeNull();

    fireEvent.mouseDown(firstModal!);

    await waitFor(() => {
      expect(useUIStore.getState().modalOrder).toEqual(["second-modal", "first-modal"]);
      expect(useUIStore.getState().activeModalId).toBe("first-modal");
    });

    expect(firstModal).toHaveStyle({
      boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent)",
    });
    expect(secondModal).toHaveStyle({ boxShadow: "none" });
    expect(firstModal?.parentElement).toHaveStyle({ zIndex: "1001" });
  });

  it("keeps the backdrop from blocking clicks on another modal", async () => {
    render(
      <>
        {renderModal("first-modal", "First modal")}
        {renderModal("second-modal", "Second modal")}
      </>,
    );

    await screen.findByText("First modal content");
    const firstModal = document.querySelector('[data-modal-id="first-modal"]');
    fireEvent.mouseDown(firstModal!);

    expect(useUIStore.getState().activeModalId).toBe("first-modal");
  });
});
