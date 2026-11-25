import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const harden = readFileSync(resolve(process.cwd(), "public/harden.js"), "utf8");
const require = createRequire(import.meta.url);
const signalsFile = createRequire(require.resolve("@dnd-kit/state"))
  .resolve("@preact/signals-core")
  .replace(/signals-core\.js$/, "signals-core.module.js");
const signals = readFileSync(signalsFile, "utf8");

function run(setup: string, code: string) {
  const context: Record<string, unknown> = {};
  runInNewContext(setup + '\n(function(){"use strict";' + code + "\n})();", context);
  return context;
}
const plainFreeze = 'Object.freeze(Object.prototype);';

function signalsScript() {
  const local = /export\s*\{[^}]*?\b([\w$]+) as signal\b/.exec(signals)?.[1];
  if (!local) throw new Error("signal export not found");
  const body = signals.replace(/export\s*\{[^}]*\};?\s*(\/\/#.*)?\s*$/, "");
  return `(function(){"use strict";${body};const __sig=${local}(41);__sig.value++;globalThis.out=[__sig.valueOf(),String(__sig)];})();`;
}

describe("Object.prototype hardening", () => {
  it("reproduces the desktop crash with Tauri's plain freeze", () => {
    expect(() => run(plainFreeze, signalsScript())).toThrow(
      /Cannot assign to read only property 'valueOf'/,
    );
    expect(() =>
      run(plainFreeze, 'function A(){};A.prototype={size:1};A.prototype.constructor=A;'),
    ).toThrow(/read only property 'constructor'/);
  });
  it("lets libraries override built-ins on their own objects", () => {
    expect(run(harden, signalsScript()).out).toEqual([42, "42"]);
    const ctx = run(
      harden,
      `function A(){};A.prototype={size:1};A.prototype.constructor=A;A.prototype.toString=function(){return "a"};
       var o={};o.hasOwnProperty=function(){return "own"};
       globalThis.r=[String(new A()),o.hasOwnProperty(),Object.keys(o).join(),({}).toString(),Object.isFrozen(Object.prototype)];`,
    );
    expect(ctx.r).toEqual(["a", "own", "hasOwnProperty", "[object Object]", true]);
  });
  it("still blocks prototype pollution", () => {
    expect(() => run(harden, 'Object.prototype.polluted=1;')).toThrow();
    expect(() => run(harden, 'Object.prototype.toString=function(){};')).toThrow(
      /read only property 'toString'/,
    );
    expect(() =>
      run(harden, 'Object.defineProperty(Object.prototype,"valueOf",{value:1});'),
    ).toThrow();
    const ctx = run(harden, 'var o=JSON.parse(\'{"__proto__":{"admin":true}}\');globalThis.r=({}).admin;');
    expect(ctx.r).toBeUndefined();
  });
});
