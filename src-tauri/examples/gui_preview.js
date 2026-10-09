(() => {
  let stage = 0;
  let originalWidth = 0;
  function setValue(element, prototype, value, event) {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event(event, { bubbles: true }));
  }
  function button(text) {
    return [...document.querySelectorAll("button")].find((el) => el.textContent === text);
  }
  function hasInk(canvas) {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 64) {
      if (pixels[i + 3] > 0 && pixels[i] < 200 && pixels[i + 1] < 200 && pixels[i + 2] < 200) dark++;
    }
    return dark > 20;
  }
  const poll = setInterval(() => {
    try {
      if (document.querySelector('[role="alert"]')) throw new Error("UI alert");
      const canvas = document.querySelector("canvas");
      if (stage === 0 && button("PDF更新")) {
        setValue(document.querySelector(".draft-editor input"), HTMLInputElement.prototype, "架空 山田", "input");
        document.querySelector(".tiptap").editor.commands.setContent({ type: "doc", content: Array.from({ length: 180 }, (_, i) => ({ type: "paragraph", content: [{ type: "text", text: `架空の職務内容 ${i + 1} 日本語と記号 & % _ # $ { } ~ ^ \\` }] })) });
        stage = 1;
      } else if (stage === 1) {
        button("PDF更新").click();
        stage = 2;
      } else if (stage === 2 && canvas?.dataset.renderedPage === "1") {
        if (!hasInk(canvas)) throw new Error("blank first page");
        const pageCount = Number(document.querySelector('[aria-label="ページ番号"]').textContent.split("/")[1]);
        if (pageCount < 2) throw new Error("not multipage");
        originalWidth = canvas.width;
        document.querySelector('[aria-label="拡大"]').click();
        stage = 25;
      } else if (stage === 25 && canvas?.dataset.renderedScale === "1.25") {
        document.querySelector('[aria-label="拡大"]').click();
        stage = 3;
      } else if (stage === 3 && canvas?.dataset.renderedScale === "1.5") {
        if (canvas.width <= originalWidth || !hasInk(canvas)) throw new Error("zoom failed");
        button("次のページ").click();
        stage = 4;
      } else if (stage === 4 && canvas?.dataset.renderedPage === "2") {
        if (!hasInk(canvas)) throw new Error("blank second page");
        clearInterval(poll);
        location.href = "https://diagnostic-probe.invalid/success";
      }
    } catch (error) {
      clearInterval(poll);
      location.href = "https://diagnostic-probe.invalid/failure?stage=" + stage + "&reason=" + encodeURIComponent(String(error));
    }
  }, 100);
})();
