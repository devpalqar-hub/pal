"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline, Strikethrough, Heading2, List, ListOrdered, Quote, Code, Link2, Unlink, Undo2, Redo2 } from "lucide-react";
import { toHtml } from "@/lib/client/rich";

/** Read-only formatted view. Content is sanitised on the server before it is stored. */
export function RichText({ html, className = "" }: { html?: string | null; className?: string }) {
  if (!html) return null;
  return <div className={`rich-content ${className}`} dangerouslySetInnerHTML={{ __html: toHtml(html) }} />;
}

function Btn({ on, active, title, children, disabled }: { on: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`rte-btn${active ? " on" : ""}`} title={title} aria-label={title} aria-pressed={active} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={on}>{children}</button>
  );
}

/** TipTap editor. `value` / `onChange` carry HTML ("" when empty). */
export function RichTextEditor({ value, onChange, placeholder = "Write something…", minHeight = 120, autoFocus }: {
  value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number; autoFocus?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false, // avoids SSR hydration mismatch
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ? toHtml(value) : "",
    editorProps: { attributes: { class: "rte-area", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Keep in sync when the parent resets the value (e.g. after submit).
  useEffect(() => {
    if (editor && value === "" && !editor.isEmpty) editor.commands.clearContent();
  }, [value, editor]);

  if (!editor) return <div className="rte"><div className="rte-area" style={{ minHeight }} /></div>;

  function setLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") return void editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    const href = /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor!.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }
  const c = () => editor.chain().focus();

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label="Formatting">
        <Btn title="Bold (Ctrl+B)" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold size={15} /></Btn>
        <Btn title="Italic (Ctrl+I)" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic size={15} /></Btn>
        <Btn title="Underline (Ctrl+U)" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><Underline size={15} /></Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough size={15} /></Btn>
        <span className="rte-sep" />
        <Btn title="Heading" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></Btn>
        <Btn title="Bulleted list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List size={15} /></Btn>
        <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered size={15} /></Btn>
        <Btn title="Quote" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote size={15} /></Btn>
        <Btn title="Code" active={editor.isActive("code")} on={() => c().toggleCode().run()}><Code size={15} /></Btn>
        <span className="rte-sep" />
        <Btn title="Add link" active={editor.isActive("link")} on={setLink}><Link2 size={15} /></Btn>
        <Btn title="Remove link" disabled={!editor.isActive("link")} on={() => c().extendMarkRange("link").unsetLink().run()}><Unlink size={15} /></Btn>
        <span className="rte-sep" />
        <Btn title="Undo" disabled={!editor.can().undo()} on={() => c().undo().run()}><Undo2 size={15} /></Btn>
        <Btn title="Redo" disabled={!editor.can().redo()} on={() => c().redo().run()}><Redo2 size={15} /></Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
