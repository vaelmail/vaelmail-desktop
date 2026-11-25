// Tamper-proof Object.prototype without the "override mistake".
//
// Tauri's security.freezePrototype runs Object.freeze(Object.prototype). That
// blocks prototype pollution, but it also makes every inherited built-in
// (valueOf, toString, constructor, hasOwnProperty, ...) read-only on ALL
// objects: a plain assignment such as `Thing.prototype.valueOf = fn` or
// `Child.prototype.constructor = Child` then throws "Cannot assign to read only
// property". Libraries do this routinely, which crashed whole panels.
//
// Same approach as SES (enablePropertyOverrides): each data property becomes a
// getter/setter pair before the freeze. Reads are unchanged. Assigning on
// Object.prototype itself still throws, so nothing can replace or add
// built-ins there; assigning on any other object defines an own property, as
// it would without the freeze. Loaded as the first script, before app code.
(function () {
  "use strict";
  var proto = Object.prototype;
  if (Object.isFrozen(proto)) return;
  var names = Object.getOwnPropertyNames(proto);
  for (var i = 0; i < names.length; i++) {
    (function (name) {
      var desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || !("value" in desc) || !desc.configurable) return;
      var value = desc.value;
      function get() {
        return value;
      }
      function set(next) {
        if (this === proto)
          throw new TypeError(
            "Cannot assign to read only property '" + name + "' of Object.prototype",
          );
        Object.defineProperty(this, name, {
          value: next,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      Object.defineProperty(proto, name, {
        get: get,
        set: set,
        enumerable: desc.enumerable,
        configurable: false,
      });
    })(names[i]);
  }
  Object.freeze(proto);
})();
