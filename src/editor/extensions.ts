import StarterKit from "@tiptap/starter-kit";

export function bodyExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
      trailingNode: false,
    }),
  ];
}
