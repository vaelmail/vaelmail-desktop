export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function Brand({ className = "", href = "#top" }: { className?: string; href?: string }) {
  return (
    <a href={href} className={`brand ${className}`} aria-label="vael home">
      <BrandMark />
      <span>
        vael<span className="brand-period">.</span>
      </span>
    </a>
  );
}
