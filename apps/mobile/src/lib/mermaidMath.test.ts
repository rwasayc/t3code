import { expect, it } from "vite-plus/test";
import {
  createMermaidMathResolver,
  sanitizeDiagramSvg,
  sanitizeMathDiagramSvg,
} from "./mermaidMath";

it("typesets math labels without exposing active HTML and keeps invalid TeX as source", () => {
  const resolve = createMermaidMathResolver();
  const before = document.body.childElementCount;
  const result = resolve("\\frac{x^2}{2}", 16);
  if (!result || !("html" in result)) throw new Error("missing MathML");
  expect(result.html).toContain("<mfrac>");
  expect(result.html).toContain("<msup>");
  expect(result.html).not.toContain("<annotation");
  expect(resolve("\\frac{x^2}{2}", 16)).toBe(result);
  expect(resolve("\\notAValidCommand", 16)).toBeNull();
  const untrusted = resolve("\\href{https://example.com}{click}", 16);
  expect(untrusted && "html" in untrusted ? untrusted.html : "").not.toMatch(/href=|<a[ >]/);
  expect(document.body.childElementCount).toBe(before);
});

it("keeps MathML in math diagrams while removing scripts, navigation and remote content", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>x</mi><mn>2</mn></mfrac></math><script>alert(1)</script><img src="https://example.com/a" onerror="alert(1)" /></div></foreignObject><a href="https://example.com"><text onclick="alert(1)">label</text></a><image href="https://example.com/x" /></svg>';
  const fragment = sanitizeMathDiagramSvg(svg);
  const container = document.createElement("div");
  container.append(fragment);
  expect(container.querySelector("math mfrac")).not.toBeNull();
  expect(container.querySelector("script,img,image,a,[href],[src],[onerror],[onclick]")).toBeNull();
  const plain = document.createElement("div");
  plain.append(sanitizeDiagramSvg(svg));
  expect(plain.querySelector("foreignObject")).toBeNull();
});
