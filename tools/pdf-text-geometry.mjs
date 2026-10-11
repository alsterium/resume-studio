import { readFile } from "node:fs/promises";
import { getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";

const [path, ...labels] = process.argv.slice(2);
if (!path) throw new Error("node tools/pdf-text-geometry.mjs <pdf> [labels...]");
const task = getDocument({ data: new Uint8Array(await readFile(path)) });
const document = await task.promise;
const bounds = {};
const rules = [];
for (let number = 1; number <= document.numPages; number++) {
  const page = await document.getPage(number);
  const content = await page.getTextContent();
  for (const label of labels) {
    if (bounds[label]) continue;
    const items = content.items.filter((item) => item.str?.includes(label));
    if (items.length) {
      bounds[label] = [
        Math.min(...items.map((item) => item.transform[5])),
        Math.max(...items.map((item) => item.transform[5] + item.height)),
      ];
    }
  }
  const operators = await page.getOperatorList();
  let matrix = [1, 0, 0, 1, 0, 0];
  let width = 1;
  const stack = [];
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i];
    const args = operators.argsArray[i];
    if (op === OPS.save) stack.push([matrix, width]);
    else if (op === OPS.restore) [matrix, width] = stack.pop();
    else if (op === OPS.transform) matrix = Util.transform(matrix, args);
    else if (op === OPS.setLineWidth) width = args[0];
    else if (op === OPS.constructPath) {
      const rect = args[2];
      if (rect && rect[1] === rect[3]) {
        const point = (x, y) => [
          matrix[0] * x + matrix[2] * y + matrix[4],
          matrix[1] * x + matrix[3] * y + matrix[5],
        ];
        const start = point(rect[0], rect[1]);
        const end = point(rect[2], rect[3]);
        if (Math.abs(end[0] - start[0]) > 0.5 && Math.abs(end[1] - start[1]) < 0.01) {
          if (!rules.some((rule) => rule.page === number && Math.abs(rule.y - start[1]) < 0.01)) {
            rules.push({ page: number, y: start[1], width: width * Math.abs(matrix[3]) });
          }
        }
      }
    }
  }
}
bounds._rules = rules;
console.log(JSON.stringify(bounds));
await task.destroy();
