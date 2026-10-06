import { Editor } from "@tiptap/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { BodyEditor } from "../../src/editor/BodyEditor";
import { bodyExtensions } from "../../src/editor/extensions";
import fixture from "../fixtures/rich-body.json";
import emptyProject from "../fixtures/project-empty.json";
import { validateProject } from "../../src/domain/validate-project";

test("許可書式と日本語をJSONで取得し、再投入して保持する", () => {
  const editor = new Editor({ extensions: bodyExtensions(), content: fixture });
  try {
    const json = editor.getJSON();
    expect(
      validateProject({ ...emptyProject, career: { ...emptyProject.career, summary: json } }).career
        .summary,
    ).toEqual(json);
    editor.commands.clearContent();
    editor.commands.setContent(json, { errorOnInvalidContent: true });
    expect(editor.getJSON()).toEqual(json);
    expect(editor.getHTML()).toContain("<strong>太字の日本語 &amp; %</strong>");
    expect(editor.getHTML()).toContain('<ol start="2">');
    expect(editor.getHTML()).toContain("<em>斜体の本文</em>");
    expect(() =>
      editor.commands.setContent(
        {
          type: "doc",
          content: [{ type: "heading", content: [{ type: "text", text: "unsupported" }] }],
        },
        { errorOnInvalidContent: true },
      ),
    ).toThrow("Invalid JSON content");
  } finally {
    editor.destroy();
  }
});

test("実Tiptapの入力と太字・箇条書きツールバーを本文JSONへ反映する", async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<BodyEditor onChange={change} />);
  await user.click(screen.getByRole("button", { name: "太字" }));
  await user.type(screen.getByRole("textbox", { name: "本文" }), "日本語の本文");
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(JSON.stringify(change.mock.lastCall?.[0])).toContain('"type":"bold"');
  await user.click(screen.getByRole("button", { name: "箇条書き" }));
  await waitFor(() =>
    expect(JSON.stringify(change.mock.lastCall?.[0])).toContain('"type":"bulletList"'),
  );
  expect(screen.getByRole("button", { name: "箇条書き" })).toHaveAttribute("aria-pressed", "true");
});
