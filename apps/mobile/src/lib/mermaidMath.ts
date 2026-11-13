import DOMPurify from "dompurify";
import katex from "katex";
import type { MathResolver } from "pele";

export function createMermaidMathResolver(): MathResolver {
  const cache = new Map<string, ReturnType<MathResolver>>();
  return (tex, size) => {
    const key = `${size}:${tex}`;
    if (cache.has(key)) return cache.get(key);
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;left:-9999px;visibility:hidden;display:inline-block;font-size:${size}px;white-space:nowrap`;
    document.body.append(probe);
    let markup: ReturnType<MathResolver> = null;
    try {
      probe.innerHTML = katex.renderToString(tex, {
        displayMode: true,
        output: "mathml",
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxSize: 20,
        maxExpand: 1000,
      });
      const expression = probe.querySelector("math");
      expression?.querySelector("annotation")?.remove();
      if (expression) {
        const { width, height } = expression.getBoundingClientRect();
        markup = { html: expression.outerHTML, width, height };
      }
    } catch {
      // Unsupported TeX stays readable as source, matching the Web client.
    } finally {
      probe.remove();
    }
    cache.set(key, markup);
    return markup;
  };
}

const KATEX_MATHML_TAGS = new Set([
  "math",
  "menclose",
  "mfrac",
  "mi",
  "mlabeledtr",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mroot",
  "mrow",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
]);
// Presentation attributes KaTeX sets on those elements. The profiles already
// cover class, style, width, height, display, and xmlns.
const KATEX_MATHML_ATTRIBUTES = new Set([
  "accent",
  "accentunder",
  "columnalign",
  "columnlines",
  "columnspacing",
  "depth",
  "displaystyle",
  "fence",
  "largeop",
  "linebreak",
  "linethickness",
  "lspace",
  "mathbackground",
  "mathcolor",
  "mathsize",
  "mathvariant",
  "maxsize",
  "minsize",
  "notation",
  "rowlines",
  "rowspacing",
  "rspace",
  "scriptlevel",
  "separator",
  "stretchy",
  "voffset",
]);

let purifier: ReturnType<typeof DOMPurify> | null = null;

// Diagrams can come from untrusted PR descriptions. Pele escapes labels and
// links and images are off, so this is defense in depth against anything that
// could navigate, run script, or fetch remote content.
export function sanitizeDiagramSvg(svg: string): Node {
  purifier ??= DOMPurify(window);
  return purifier.sanitize(svg, {
    FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
    FORBID_TAGS: ["a", "image", "foreignObject", "style"],
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM_FRAGMENT: true,
  });
}

// Pele puts MathML labels in a <foreignObject> with an HTML <div> around them.
export function sanitizeMathDiagramSvg(svg: string): Node {
  purifier ??= DOMPurify(window);
  return purifier.sanitize(svg, {
    // DOMPurify still only accepts <math> under an HTML parent and checks every
    // MathML child's namespace.
    ADD_TAGS: ["foreignObject", ...KATEX_MATHML_TAGS],
    ADD_ATTR: (attribute, tagName) =>
      KATEX_MATHML_TAGS.has(tagName) && KATEX_MATHML_ATTRIBUTES.has(attribute),
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
    FORBID_TAGS: ["a", "img", "image", "script", "style"],
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    RETURN_DOM_FRAGMENT: true,
  });
}
