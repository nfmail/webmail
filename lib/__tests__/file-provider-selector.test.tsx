import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileProviderSelector } from "@/components/files/file-provider-selector";

describe("FileProviderSelector", () => {
  it("offers the built-in providers through an accessible shared control", () => {
    const onChange = vi.fn();
    render(
      <FileProviderSelector
        value="jmap"
        onChange={onChange}
        label="File storage"
      />,
    );

    const select = screen.getByRole("combobox", { name: "File storage" });
    expect(select).toHaveValue("jmap");
    expect(screen.getByRole("option", { name: "JMAP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "WebDAV" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "webdav" } });
    expect(onChange).toHaveBeenCalledWith("webdav");
  });

  it("can be disabled while provider state is loading", () => {
    render(
      <FileProviderSelector
        value="webdav"
        onChange={vi.fn()}
        label="File storage"
        disabled
      />,
    );

    expect(screen.getByRole("combobox", { name: "File storage" })).toBeDisabled();
  });
});
