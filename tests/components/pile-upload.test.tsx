import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import PileUpload, {
  pileIsValid,
  submittablePile,
} from "@/components/intake/pile-upload";
import {
  MAX_FILE_SIZE_BYTES,
  type PileFile,
} from "@/components/intake/document-slots";

function makeFile(name: string, size = 12, type = "application/octet-stream"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function dropZone() {
  return screen.getByTestId("pile-dropzone");
}

function dropFiles(files: File[]) {
  fireEvent.drop(dropZone(), {
    dataTransfer: { files, items: [], types: ["Files"] },
  });
}

function Harness({
  initial = [] as PileFile[],
  onChange,
}: {
  initial?: PileFile[];
  onChange?: (next: PileFile[]) => void;
}) {
  const [value, setValue] = useState<PileFile[]>(initial);
  return (
    <PileUpload
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("PileUpload", () => {
  it("renders the drop zone with allowed extensions hint", () => {
    render(<Harness />);
    expect(dropZone()).toBeInTheDocument();
    expect(dropZone().textContent).toMatch(/Drop files/i);
    expect(dropZone().textContent).toMatch(/\.pdf/);
  });

  it("accepts files in the whitelist and renders one row per file", () => {
    render(<Harness />);
    dropFiles([makeFile("boq.xlsx"), makeFile("rfp.pdf")]);

    expect(screen.getByText("boq.xlsx")).toBeInTheDocument();
    expect(screen.getByText("rfp.pdf")).toBeInTheDocument();
  });

  it("rejects files with extensions outside the whitelist and surfaces an alert", () => {
    render(<Harness />);
    dropFiles([makeFile("evil.exe")]);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/evil\.exe/);
    expect(alert.textContent).toMatch(/extension not allowed/i);
    expect(screen.queryByTestId("pile-list")).not.toBeInTheDocument();
  });

  it("per-file tag dropdown updates the documentType", () => {
    render(<Harness />);
    dropFiles([makeFile("a.xlsx")]);

    const select = screen.getByLabelText("Tag for a.xlsx") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "boq" } });
    expect(select.value).toBe("boq");
  });

  it("shows soft warning when tag does not match extension but does not block", () => {
    render(<Harness />);
    dropFiles([makeFile("requirements.pdf")]);
    const select = screen.getByLabelText("Tag for requirements.pdf");
    fireEvent.change(select, { target: { value: "boq" } });

    expect(screen.getByText(/BoQ usually/i)).toBeInTheDocument();
  });

  it("shows oversized error for files over 500 MB", () => {
    render(<Harness />);
    dropFiles([makeFile("huge.pdf", MAX_FILE_SIZE_BYTES + 1)]);

    expect(screen.getByText(/exceeds 500 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/remove before continuing/i)).toBeInTheDocument();
  });

  it("remove button drops a file from the pile", () => {
    render(<Harness />);
    dropFiles([makeFile("a.xlsx"), makeFile("b.pdf")]);

    fireEvent.click(screen.getByLabelText("Remove a.xlsx"));
    expect(screen.queryByText("a.xlsx")).not.toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });
});

describe("pileIsValid", () => {
  function pf(name: string, dt: PileFile["documentType"], size = 12): PileFile {
    return { id: name, file: makeFile(name, size), documentType: dt };
  }

  it("blocks submit when no files uploaded", () => {
    const r = pileIsValid([]);
    expect(r.canSubmit).toBe(false);
    expect(r.blockingReason).toMatch(/at least one file/i);
    expect(r.warnings).toEqual([]);
  });

  it("blocks submit when any file is untagged", () => {
    const r = pileIsValid([pf("a.xlsx", "boq"), pf("b.pdf", null)]);
    expect(r.canSubmit).toBe(false);
    expect(r.blockingReason).toMatch(/need a tag/i);
  });

  it("blocks submit when any file is over 500 MB", () => {
    const r = pileIsValid([
      pf("a.xlsx", "boq"),
      pf("b.pdf", "rfp"),
      pf("huge.pdf", "other", MAX_FILE_SIZE_BYTES + 1),
    ]);
    expect(r.canSubmit).toBe(false);
    expect(r.blockingReason).toMatch(/exceed 500 MB/i);
  });

  it("blocks submit on oversized even when untagged", () => {
    const r = pileIsValid([pf("huge.pdf", null, MAX_FILE_SIZE_BYTES + 1)]);
    expect(r.canSubmit).toBe(false);
    expect(r.blockingReason).toMatch(/exceed 500 MB/i);
  });

  it("allows submit with warning when no BoQ tagged", () => {
    const r = pileIsValid([pf("a.pdf", "rfp"), pf("b.pdf", "compliance")]);
    expect(r.canSubmit).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/No BoQ/)]),
    );
    expect(r.warnings).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/No RFP/)]),
    );
  });

  it("allows submit with warning when no RFP tagged", () => {
    const r = pileIsValid([pf("a.xlsx", "boq"), pf("b.xlsx", "bom")]);
    expect(r.canSubmit).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/No RFP/)]),
    );
    expect(r.warnings).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/No BoQ/)]),
    );
  });

  it("allows submit with both warnings when only Other tagged", () => {
    const r = pileIsValid([pf("notes.txt", "other")]);
    expect(r.canSubmit).toBe(true);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/No BoQ/),
        expect.stringMatching(/No RFP/),
      ]),
    );
  });

  it("allows submit with no warnings when both BoQ and RFP tagged", () => {
    const r = pileIsValid([pf("a.xlsx", "boq"), pf("b.pdf", "rfp")]);
    expect(r.canSubmit).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.blockingReason).toBeUndefined();
  });
});

describe("submittablePile", () => {
  function pf(name: string, dt: PileFile["documentType"], size = 12): PileFile {
    return { id: name, file: makeFile(name, size), documentType: dt };
  }

  it("filters out oversized files", () => {
    const result = submittablePile([
      pf("a.xlsx", "boq"),
      pf("huge.pdf", "rfp", MAX_FILE_SIZE_BYTES + 1),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].file.name).toBe("a.xlsx");
  });

  it("filters out untagged files", () => {
    const result = submittablePile([pf("a.xlsx", "boq"), pf("b.pdf", null)]);
    expect(result).toHaveLength(1);
    expect(result[0].documentType).toBe("boq");
  });
});
