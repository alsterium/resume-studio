(() => {
  let stage = 0;
  let editor;
  const button = (text) => [...document.querySelectorAll("button")].find((el) => el.textContent === text);
  const poll = setInterval(() => {
    try {
      if (document.querySelector('[role="alert"]')) throw new Error(document.querySelector('[role="alert"]').textContent);
      const dom = document.querySelector(".tiptap");
      if (stage === 0 && dom?.editor) {
        editor = dom.editor;
        editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "架空の日本語本文 & %" }] }] });
        editor.commands.selectAll();
        button("太字").click();
        button("箇条書き").click();
        const snapshot = editor.getJSON();
        const json = JSON.stringify(snapshot);
        if (!json.includes('"type":"bold"') || !json.includes('"type":"bulletList"')) throw new Error("toolbar formats");
        editor.commands.clearContent();
        editor.commands.setContent(snapshot, { errorOnInvalidContent: true });
        if (JSON.stringify(editor.getJSON()) !== json) throw new Error("JSON roundtrip");
        stage = 1;
      } else if (stage === 1 && dom.querySelector("strong")) {
        // Synthetic composition exercises the WebView event path, not the OS IME.
        dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        const text = dom.querySelector("strong").firstChild;
        text.textContent += " 日本語の確定";
        dom.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "日本語の確定", isComposing: true }));
        dom.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本語の確定" }));
        stage = 2;
      } else if (stage === 2 && editor.getText().includes("日本語の確定")) {
        button("PDF更新").click();
        stage = 3;
      } else if (stage === 3 && document.querySelector("canvas")?.dataset.renderedPage === "1") {
        const canvas = document.querySelector("canvas");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels.some((v, i) => i % 4 !== 3 && v < 100)) throw new Error("blank PDF");
        clearInterval(poll);
        location.href = "https://diagnostic-probe.invalid/success";
      }
    } catch (error) {
      clearInterval(poll);
      location.href = "https://diagnostic-probe.invalid/failure?stage=" + stage + "&reason=" + encodeURIComponent(String(error));
    }
  }, 100);
})();
