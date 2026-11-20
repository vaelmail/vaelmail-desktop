import type { ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  alt: string;
  unoptimized?: boolean;
  priority?: boolean;
};

export default function Image({
  unoptimized: _unoptimized,
  priority: _priority,
  ...props
}: ImageProps) {
  return <img {...props} />;
}
