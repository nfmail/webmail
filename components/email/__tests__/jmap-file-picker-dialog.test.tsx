import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JmapFilePickerDialog } from "@/components/email/jmap-file-picker-dialog";
import type { EmailAttachmentSource } from "@/lib/files/email-attachment-source";
import type { FileItem } from "@/lib/files/provider";

const permissions = {
  read: true,
  download: true,
  addChildren: false,
  modifyContent: false,
  rename: false,
  move: false,
  copy: false,
  delete: false,
};

function item(
  id: string,
  name: string,
  kind: "file" | "directory",
  parentId: string | null,
): FileItem {
  return {
    id,
    name,
    kind,
    parentId,
    mediaType: kind === "file" ? "text/plain" : null,
    size: kind === "file" ? 42 : null,
    permissions,
  };
}

function makeSource(): EmailAttachmentSource {
  const items = [
    item("folder-1", "Documents", "directory", null),
    item("file-1", "notes.txt", "file", null),
    item("file-2", "report.txt", "file", "folder-1"),
  ];
  return {
    list: vi.fn(async ({ parentId }) => ({
      items: items.filter((candidate) => candidate.parentId === parentId),
      nextCursor: null,
    })),
    resolve: vi.fn(async (ids: readonly string[]) => ids.map((id) => {
      const selected = items.find((candidate) => candidate.id === id)!;
      return {
        blobId: `blob-${id}`,
        name: selected.name,
        type: selected.mediaType || "application/octet-stream",
        size: selected.size || 0,
      };
    })),
  };
}

describe("JmapFilePickerDialog", () => {
  it("navigates folders and attaches selected server-side files", async () => {
    const source = makeSource();
    const onAttach = vi.fn();
    const onClose = vi.fn();

    render(
      <JmapFilePickerDialog
        isOpen
        source={source}
        onAttach={onAttach}
        onClose={onClose}
      />,
    );

    fireEvent.click(await screen.findByText("Documents"));
    fireEvent.click(await screen.findByRole("checkbox", { name: /report.txt/ }));
    fireEvent.click(screen.getByRole("button", { name: /Attach/ }));

    await waitFor(() => {
      expect(onAttach).toHaveBeenCalledWith([{
        blobId: "blob-file-2",
        name: "report.txt",
        type: "text/plain",
        size: 42,
      }]);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the dialog open and reports a coded source failure", async () => {
    const source = makeSource();
    source.resolve = vi.fn(async () => {
      const error = new Error("Stored file was not found.");
      Object.assign(error, { code: "not-found" });
      throw error;
    });
    const onClose = vi.fn();

    render(
      <JmapFilePickerDialog
        isOpen
        source={source}
        onAttach={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: /notes.txt/ }));
    fireEvent.click(screen.getByRole("button", { name: /Attach/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stored file was not found.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
