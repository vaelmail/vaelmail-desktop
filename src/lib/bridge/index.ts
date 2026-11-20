import { api, apiBytes, apiDataUrl, apiImage, apiText } from "./api";
import { cache } from "./cache";
import { desktop } from "./desktop";
import { files } from "./files";
import { realtime } from "./realtime";
import { recovery } from "./recovery";
import { session } from "./session";

export const bridge = {
  api,
  apiBytes,
  apiText,
  apiDataUrl,
  apiImage,
  session,
  files,
  realtime,
  cache,
  recovery,
  desktop,
};

export { api, apiBytes, apiDataUrl, apiImage, apiText } from "./api";
export { ApiError, BridgeError } from "./errors";
export { on } from "./events";
export { assetUrl, frameUrl } from "./asset-url";
export { passkeyFactor, usePasskeyPrompt } from "./passkey";
