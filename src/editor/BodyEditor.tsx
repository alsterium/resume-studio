import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { bodyExtensions } from "./extensions";

export const emptyBody: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function BodyEditor({
  initialContent = emptyBody,
  onChange,
}: {
  initialContent?: JSONContent;
  onChange: (body: JSONContent) => void;
}) {
  const editor = useEditor({
    extensions: bodyExtensions(),
    content: initialContent,
    editorProps: {
      attributes: { "aria-label": "本文", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor: updated }) => onChange(updated.getJSON()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bullets: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
    }),
  });

  return (
    <div className="body-editor">
      <div aria-label="本文の書式" className="editor-toolbar">
        <button
          type="button"
          disabled={!editor}
          aria-pressed={state.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          太字
        </button>
        <button
          type="button"
          disabled={!editor}
          aria-pressed={state.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          斜体
        </button>
        <button
          type="button"
          disabled={!editor}
          aria-pressed={state.bullets}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          箇条書き
        </button>
        <button
          type="button"
          disabled={!editor}
          aria-pressed={state.ordered}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          番号付きリスト
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          元に戻す
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          やり直す
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
