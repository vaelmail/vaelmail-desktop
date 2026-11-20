import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Options = { loading?: () => ReactNode; ssr?: boolean };

export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  options: Options = {},
): ComponentType<P> {
  const Lazy = lazy(() => loader().then((component) => ({ default: component })));
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        <Lazy {...(props as P & object)} />
      </Suspense>
    );
  };
}
