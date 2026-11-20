export const typographyStyles = {
  color: [
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i,
    /^(?:black|white|gray|grey|red|green|blue)$/i,
    /^rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)$/i,
  ],
  "font-weight": [/^(?:normal|bold|[1-9]00)$/],
  "font-style": [/^(?:normal|italic)$/],
  "font-size": [/^(?:[89]|[12]\d|3[0-2])(?:px|pt)$/],
  "text-decoration": [/^(?:none|underline|line-through|underline line-through)$/],
  "text-align": [/^(?:left|center|right)$/],
};

export function typographyStyle(value: unknown) {
  if (typeof value !== "string") return "";
  const accepted = new Map<string, string>();
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const cssValue = declaration.slice(colon + 1).trim();
    if (!Object.hasOwn(typographyStyles, property)) continue;
    const rules = typographyStyles[property as keyof typeof typographyStyles];
    if (rules?.some((rule) => rule.test(cssValue))) accepted.set(property, cssValue);
  }
  return [...accepted].map(([property, cssValue]) => `${property}:${cssValue}`).join(";");
}
