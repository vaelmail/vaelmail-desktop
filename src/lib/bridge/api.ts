import type { ApiFailure } from "@/lib/mail/types";
import { call } from "./invoke";
import { ApiError, BridgeError } from "./errors";
import { withPasskey } from "./passkey";

type ApiResponse = { status: number; value: unknown };

export type RequestOptions = {
  method?: string;
  body?: unknown;
  generation?: number | undefined;
  signal?: AbortSignal | undefined;
};

function targetPath(path: string): string {
  return path.startsWith("/api/") ? path : `/api/webmail/${path}`;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  generation?: number,
  signal?: AbortSignal,
): Promise<T> {
  const requestId = crypto.randomUUID();
  const cancel = () => void call("api_cancel", { requestId });
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new BridgeError({ kind: "cancelled" });
    const payload = method === "GET" ? body : await withPasskey(body);
    const response = await call<ApiResponse>("api_request", {
      requestId,
      path: targetPath(path),
      method,
      body: payload ?? null,
      generation: generation ?? null,
    });
    if (response.status >= 400) throw new ApiError(response.status, response.value as ApiFailure);
    return response.value as T;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

async function binary<T>(command: string, path: string): Promise<T> {
  try {
    return await call<T>(command, { path: targetPath(path) });
  } catch (failure) {
    if (failure instanceof BridgeError && failure.failure.kind === "status") {
      throw new ApiError(failure.failure.status, {
        code: "request_failed",
        message: "the request could not be completed",
      });
    }
    throw failure;
  }
}

export function apiBytes(path: string): Promise<ArrayBuffer> {
  return binary<ArrayBuffer>("api_bytes", path);
}

export function apiText(path: string): Promise<string> {
  return binary<string>("api_text", path);
}

export function apiDataUrl(path: string): Promise<string> {
  return binary<string>("api_data_url", path);
}

export type ImageResult =
  { ok: true; dataUrl: string; size: number } | { ok: false; code: string; message: string };

export async function apiImage(
  path: string,
  grant: string,
  generation: number,
): Promise<ImageResult> {
  const result = await call<{
    ok: boolean;
    dataUrl: string | null;
    code: string | null;
    message: string | null;
    size: number;
  }>("api_image", { path: targetPath(path), grant, generation });
  return result.ok && result.dataUrl
    ? { ok: true, dataUrl: result.dataUrl, size: result.size }
    : { ok: false, code: result.code ?? "", message: result.message ?? "image unavailable" };
}
