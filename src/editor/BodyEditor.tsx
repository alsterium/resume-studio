import { Button } from "../components/ui/button";
import { Bold, Italic, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { bodyExtensions } from "./extensions";
import { useEffect } from "react";

export const emptyBody: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function BodyEditor({
  initialContent = emptyBody,
  onChange,
  editable = true,
  label = "本文",
}: {
  initialContent?: JSONContent;
  onChange: (body: JSONContent) => void;
  editable?: boolean;
  label?: string;
}) {
  const editor = useEditor({
    extensions: bodyExtensions(),
    content: initialContent,
    editorProps: {
      attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor: updated }) => onChange(updated.getJSON()),
  });
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);
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
      <div aria-label={`${label}の書式`} className="editor-toolbar">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          aria-pressed={state.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" />
          <span className="sr-only">太字</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          aria-pressed={state.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" />
          <span className="sr-only">斜体</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          aria-pressed={state.bullets}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List aria-hidden="true" />
          <span className="sr-only">箇条書き</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          aria-pressed={state.ordered}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden="true" />
          <span className="sr-only">番号付きリスト</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 aria-hidden="true" />
          <span className="sr-only">元に戻す</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          disabled={!editor || !editable}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 aria-hidden="true" />
          <span className="sr-only">やり直す</span>
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
