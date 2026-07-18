"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextDirection } from "@/components/email/text-direction";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { ResizableImage } from "@/components/email/resizable-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { QuotedHtml, serializeEditorContent } from "@/components/email/quoted-html";
import { SignatureBlock } from "@/components/email/signature-block";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settings-store";
import { useTranslations } from "@/i18n/client";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeftRight,
  Link as LinkIcon,
  Undo,
  Redo,
  Quote,
  Code,
  RemoveFormatting,
  Heading1,
  Heading2,
  Table as TableIcon,
  Trash2,
  Rows3,
  Columns3,
} from "lucide-react";

export interface InlineImageUpload {
  src: string;
  cid?: string;
}

// Pasted email content (signatures, replies, quoted text) commonly carries
// inline styles on block elements. StarterKit's default Paragraph/Heading
// drop unknown attributes; extend them to round-trip `style` and `class` so
// signature formatting survives the editor.
const styledBlockAttributes = {
  style: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("style"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.style ? { style: attrs.style } : {},
  },
  class: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("class"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.class ? { class: attrs.class } : {},
  },
  "data-signature-block": {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-signature-block"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs["data-signature-block"]
        ? { "data-signature-block": attrs["data-signature-block"] }
        : {},
  },
};

const StyledParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

const StyledHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<InlineImageUpload | null>;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  onEditorReady?: (editor: Editor) => void;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          // `title` is kept as the accessible name (icon-only control); the
          // visible tooltip is rendered by Radix via TooltipContent below.
          // NOTE: these strings are hardcoded English - not yet i18n'd.
          aria-label={title}
          className={cn(
            "p-1.5 rounded hover:bg-accent transition-colors",
            active && "bg-accent text-accent-foreground",
            disabled && "opacity-40 cursor-not-allowed"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

const TABLE_PICKER_ROWS = 6;
const TABLE_PICKER_COLS = 8;

function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  return (
    <div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 1fr)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLS }).map((_, i) => {
          const r = Math.floor(i / TABLE_PICKER_COLS);
          const c = i % TABLE_PICKER_COLS;
          const active = hover && r <= hover.r && c <= hover.c;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onPick(r + 1, c + 1)}
              className={cn(
                "w-4 h-4 border border-border/60 rounded-[2px] transition-colors",
                active ? "bg-primary border-primary" : "bg-background hover:bg-accent"
              )}
            />
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-1.5 text-center">
        {hover ? `${hover.r + 1} × ${hover.c + 1}` : "Pick size"}
      </div>
    </div>
  );
}

export function RichTextEditor({
  content,
  onChange,
  onImageUpload,
  placeholder,
  className,
  hasError,
  onEditorReady,
}: RichTextEditorProps) {
  const t = useTranslations();
  const rtlEditingSupport = useSettingsStore((st) => st.rtlEditingSupport);
  const onImageUploadRef = React.useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;
  const onEditorReadyRef = React.useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        link: false,
        underline: false,
      }),
      StyledParagraph,
      StyledHeading.configure({ levels: [1, 2] }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color,
      ResizableImage,
      Placeholder.configure({
        placeholder,
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          border: "1",
          cellpadding: "6",
          cellspacing: "0",
          width: "100%",
          style: "width:100%;border-collapse:collapse;",
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          style: "padding:6px 8px;border:1px solid #ccc;background-color:#f5f5f5;color:#1f2937;text-align:left;",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          style: "padding:6px 8px;border:1px solid #ccc;vertical-align:top;",
        },
      }),
      // Quoted/forwarded original email body - held verbatim as an atomic
      // node so layout-heavy HTML survives 1:1 (see quoted-html.ts).
      QuotedHtml,
      // Identity signature - held verbatim as a non-editable atomic node so
      // rich/branded signatures keep their inline styling in the editor and
      // in the sent mail (see signature-block.ts).
      SignatureBlock,
      TextDirection,
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap min-h-[100px] px-4 py-3 text-sm text-foreground",
      },
      handleDrop: (view, event) => {
        const upload = onImageUploadRef.current;
        if (!upload || !event.dataTransfer?.files?.length) return false;
        const imageFiles = Array.from(event.dataTransfer.files).filter(f =>
          f.type.startsWith("image/")
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        event.stopPropagation();
        for (const file of imageFiles) {
          upload(file).then((result) => {
            if (result) {
              const { state } = view;
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const node = state.schema.nodes.image.create({ src: result.src, alt: file.name, cid: result.cid });
              const tr = state.tr.insert(pos?.pos ?? state.selection.anchor, node);
              view.dispatch(tr);
            }
          });
        }
        return true;
      },
      handlePaste: (view, event) => {
        const upload = onImageUploadRef.current;
        if (!upload || !event.clipboardData?.files?.length) return false;
        const imageFiles = Array.from(event.clipboardData.files).filter(f =>
          f.type.startsWith("image/")
        );
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        for (const file of imageFiles) {
          upload(file).then((result) => {
            if (result) {
              const { state } = view;
              const node = state.schema.nodes.image.create({ src: result.src, alt: file.name, cid: result.cid });
              const tr = state.tr.replaceSelectionWith(node);
              view.dispatch(tr);
            }
          });
        }
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // serializeEditorContent (not getHTML) so the verbatim quoted-original
      // HTML held in the QuotedHtml atom node is emitted intact.
      onChange(serializeEditorContent(editor));
    },
    immediatelyRender: false,
  });

  // Sync external content changes (e.g. template application). Compare against
  // the custom serialization so a doc that only differs inside a QuotedHtml
  // island isn't needlessly re-parsed (which would reset the island DOM).
  useEffect(() => {
    if (editor && content !== serializeEditorContent(editor)) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Expose the editor instance once it's ready so parents can target
  // specific nodes (e.g. swap the embedded signature on identity change).
  useEffect(() => {
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tableWrapperRef.current && !tableWrapperRef.current.contains(e.target as Node)) {
        setTableMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tableMenuOpen]);

  if (!editor) {
    return (
      <div className={cn("min-h-[100px]", className)} />
    );
  }

  return (
    <div className={cn("flex flex-col", hasError && "ring-2 ring-destructive rounded", className)}>
      {/* Toolbar */}
      <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title={t("Bold")}
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title={t("Italic")}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title={t("Underline")}
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title={t("Strikethrough")}
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title={t("Heading 1")}
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title={t("Heading 2")}
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title={t("Bullet List")}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title={t("Ordered List")}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title={t("Quote")}
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title={t("Code Block")}
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title={t("Align Left")}
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title={t("Align Center")}
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title={t("Align Right")}
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        {rtlEditingSupport && (
          <ToolbarButton
            active={
              (editor.getAttributes("paragraph").dir || editor.getAttributes("heading").dir) === "rtl"
            }
            onClick={() => {
              const cur =
                editor.getAttributes("paragraph").dir || editor.getAttributes("heading").dir;
              editor.chain().focus().setTextDirection(cur === "rtl" ? "ltr" : "rtl").run();
            }}
            title={t("Text direction (RTL/LTR)")}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </ToolbarButton>
        )}

        <ToolbarSeparator />

        <ToolbarButton
          active={editor.isActive("link")}
          onClick={addLink}
          title={t("Link")}
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <div ref={tableWrapperRef} className="relative">
          <ToolbarButton
            active={editor.isActive("table")}
            onClick={() => setTableMenuOpen((v) => !v)}
            title={t("Table")}
          >
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>
          {tableMenuOpen && (
            <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-md p-2 min-w-[200px]">
              {editor.isActive("table") ? (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().addRowBefore().run(); setTableMenuOpen(false); }}
                  >
                    <Rows3 className="w-4 h-4" /> Add row above
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().addRowAfter().run(); setTableMenuOpen(false); }}
                  >
                    <Rows3 className="w-4 h-4" /> Add row below
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().addColumnBefore().run(); setTableMenuOpen(false); }}
                  >
                    <Columns3 className="w-4 h-4" /> Add column before
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().addColumnAfter().run(); setTableMenuOpen(false); }}
                  >
                    <Columns3 className="w-4 h-4" /> Add column after
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().deleteRow().run(); setTableMenuOpen(false); }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete row
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().deleteColumn().run(); setTableMenuOpen(false); }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete column
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
                    onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setTableMenuOpen(false); }}
                  >
                    <Rows3 className="w-4 h-4" /> Toggle header row
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-start text-destructive"
                    onClick={() => { editor.chain().focus().deleteTable().run(); setTableMenuOpen(false); }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete table
                  </button>
                </div>
              ) : (
                <TableSizePicker
                  onPick={(rows, cols) => {
                    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                    setTableMenuOpen(false);
                  }}
                />
              )}
            </div>
          )}
        </div>

        <ToolbarSeparator />

        <ToolbarButton
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title={t("Clear Formatting")}
        >
          <RemoveFormatting className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={t("Undo")}
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={t("Redo")}
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>
      </TooltipProvider>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
