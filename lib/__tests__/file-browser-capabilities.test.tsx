import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileBrowser } from "@/components/files/file-browser";
import { createFileProviderCapabilities } from "@/lib/files/provider";
import type { FileResource } from "@/stores/file-store";

const readOnlyCapabilities = createFileProviderCapabilities({
  browse: true,
  stat: true,
  download: true,
});

const report: FileResource = {
  id: "report-1",
  name: "report.txt",
  serverName: "report.txt",
  isDirectory: false,
  contentType: "text/plain",
  contentLength: 12,
  lastModified: "2026-07-17T10:00:00.000Z",
  parentId: null,
  permissions: {
    read: true,
    download: true,
    addChildren: false,
    modifyContent: false,
    rename: false,
    move: false,
    copy: false,
    delete: false,
  },
};

function renderBrowser(resources: FileResource[]) {
  const noop = vi.fn();
  return render(
    <FileBrowser
      currentPath="/"
      resources={resources}
      isLoading={false}
      error={null}
      selectedResources={new Set()}
      uploadProgress={null}
      clipboard={null}
      onNavigate={noop}
      onCreateFolder={noop}
      onUploadFiles={noop}
      onUploadFolder={noop}
      onCancelUpload={noop}
      onDelete={noop}
      onBatchDelete={noop}
      onRename={noop}
      onDownload={noop}
      onBatchDownload={noop}
      onRefresh={noop}
      onSelectResource={noop}
      onToggleSelect={noop}
      onSelectAll={noop}
      onClearSelection={noop}
      onSetSelection={noop}
      onCut={noop}
      onCopy={noop}
      onPaste={noop}
      onMoveToFolder={noop}
      onMoveToParent={noop}
      onPreviewImage={noop}
      onPreviewFile={noop}
      onShowDetails={noop}
      onCreateTextFile={noop}
      onDuplicate={noop}
      getImageUrl={vi.fn(async () => "")}
      listPath={vi.fn(async () => [])}
      listByParentId={vi.fn(async () => [])}
      favorites={[]}
      recentFiles={[]}
      onToggleFavorite={noop}
      showDetails={false}
      onToggleDetails={noop}
      detailResource={null}
      capabilities={readOnlyCapabilities}
    />,
  );
}

describe("FileBrowser provider capabilities", () => {
  it("keeps read-only empty states free of unsupported mutation actions", () => {
    renderBrowser([]);

    expect(screen.getByText("No files yet")).toBeInTheDocument();
    expect(screen.queryByTitle("upload")).not.toBeInTheDocument();
    expect(screen.queryByTitle("new_folder")).not.toBeInTheDocument();
    expect(screen.queryByText("empty_state_description")).not.toBeInTheDocument();
  });

  it("offers download and details but hides mutations for read-only items", () => {
    renderBrowser([report]);

    fireEvent.contextMenu(screen.getByText("report.txt"));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "rename" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "delete" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "copy" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "cut" })).not.toBeInTheDocument();
  });
});
