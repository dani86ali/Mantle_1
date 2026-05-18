import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TypedSlotUpload from "@/components/intake/typed-slot-upload";
import {
  DOCUMENT_SLOTS,
  REQUIRED_SLOT_IDS,
  type SlotFileMap,
} from "@/components/intake/document-slots";
import type { DocumentType } from "@/types/document-type";

function makeFile(name: string, type = "application/octet-stream", size = 12): File {
  return new File([new Uint8Array(size)], name, { type });
}

function Harness({
  initial = {} as SlotFileMap,
  onValidityChange,
  onChange,
}: {
  initial?: SlotFileMap;
  onValidityChange?: (v: boolean) => void;
  onChange?: (m: SlotFileMap) => void;
}) {
  const [value, setValue] = useState<SlotFileMap>(initial);
  return (
    <TypedSlotUpload
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      onValidityChange={onValidityChange}
    />
  );
}

function fileInputFor(slotId: DocumentType): HTMLInputElement {
  const el = document.getElementById(`slot-input-${slotId}`);
  if (!(el instanceof HTMLInputElement))
    throw new Error(`input for slot ${slotId} not found`);
  return el;
}

function uploadTo(slotId: DocumentType, files: File[]) {
  const input = fileInputFor(slotId);
  Object.defineProperty(input, "files", {
    value: files,
    configurable: true,
  });
  fireEvent.change(input);
}

describe("TypedSlotUpload", () => {
  it("renders six labeled drop zones", () => {
    render(<Harness />);
    for (const slot of DOCUMENT_SLOTS) {
      expect(screen.getByTestId(`slot-${slot.id}`)).toBeInTheDocument();
      expect(screen.getAllByText(slot.label).length).toBeGreaterThan(0);
    }
  });

  it("shows a rejection message when an unsupported extension is dropped on the BoQ slot", () => {
    render(<Harness />);
    uploadTo("boq", [makeFile("brochure.pdf", "application/pdf")]);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/unsupported/i);
    expect(alert.textContent).toMatch(/brochure\.pdf/);
  });

  it("renders required indicator only for boq and rfp_sow slots", () => {
    render(<Harness />);
    for (const slot of DOCUMENT_SLOTS) {
      const zone = screen.getByTestId(`slot-${slot.id}`);
      const asterisk = zone.querySelector('[aria-label="required"]');
      if (REQUIRED_SLOT_IDS.includes(slot.id)) {
        expect(asterisk).not.toBeNull();
      } else {
        expect(asterisk).toBeNull();
      }
    }
  });

  it("multi-file slot appends multiple files", () => {
    render(<Harness />);
    uploadTo("vendor_bom", [
      makeFile("vendor-a.xlsx"),
      makeFile("vendor-b.xlsx"),
    ]);
    uploadTo("vendor_bom", [makeFile("vendor-c.pdf", "application/pdf")]);

    const zone = screen.getByTestId("slot-vendor_bom");
    expect(zone.textContent).toContain("vendor-a.xlsx");
    expect(zone.textContent).toContain("vendor-b.xlsx");
    expect(zone.textContent).toContain("vendor-c.pdf");
  });

  it("remove-X removes a single file from a slot", () => {
    render(<Harness />);
    uploadTo("vendor_bom", [
      makeFile("vendor-a.xlsx"),
      makeFile("vendor-b.xlsx"),
    ]);
    expect(screen.getByText("vendor-a.xlsx")).toBeInTheDocument();

    const removeBtn = screen.getByLabelText("Remove vendor-a.xlsx");
    fireEvent.click(removeBtn);

    expect(screen.queryByText("vendor-a.xlsx")).not.toBeInTheDocument();
    expect(screen.getByText("vendor-b.xlsx")).toBeInTheDocument();
  });

  it("onValidityChange fires true only when both required slots are populated", () => {
    const onValidityChange = vi.fn();
    render(<Harness onValidityChange={onValidityChange} />);

    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    act(() => {
      uploadTo("boq", [makeFile("bill.xlsx")]);
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    act(() => {
      uploadTo("rfp_sow", [makeFile("rfp.docx")]);
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    act(() => {
      const removeBtn = screen.getByLabelText("Remove bill.xlsx");
      fireEvent.click(removeBtn);
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });
});
