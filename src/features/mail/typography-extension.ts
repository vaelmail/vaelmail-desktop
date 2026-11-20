import { Mark } from "@tiptap/react";
import { typographyStyle } from "@/lib/mail/typography";

const styleAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => typographyStyle(element.getAttribute("style")) || null,
  renderHTML: (attributes: Record<string, unknown>) => {
    const style = typographyStyle(attributes.style);
    return style ? { style } : {};
  },
};

export const ComposeTypography = Mark.create({
  name: "vaelTypography",
  addAttributes: () => ({ style: styleAttribute }),
  addGlobalAttributes: () => [
    { types: ["paragraph", "heading"], attributes: { style: styleAttribute } },
  ],
  parseHTML: () => [
    {
      tag: "span[style]",
      getAttrs: (element) => (typographyStyle(element.getAttribute("style")) ? {} : false),
    },
  ],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});
