(() => {
  let clicked = false;
  const poll = setInterval(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent === "TeX環境を確認",
    );
    if (!clicked && button) {
      clicked = true;
      button.click();
    }
    if (document.body.textContent.includes("日本語PDFを生成できました。")) {
      clearInterval(poll);
      location.href = "https://diagnostic-probe.invalid/success";
    } else if (clicked && document.querySelector('[role="alert"]')) {
      clearInterval(poll);
      location.href = "https://diagnostic-probe.invalid/failure";
    }
  }, 100);
})();
