const windows = navigator.userAgent.includes("Windows");

export function assetUrl(path: string): string {
  const base = windows ? "http://vaelapi.localhost" : "vaelapi://localhost";
  return `${base}${path}`;
}

export function frameUrl(id: string): string {
  const base = windows ? "http://vaelframe.localhost" : "vaelframe://localhost";
  return `${base}/${id}`;
}
