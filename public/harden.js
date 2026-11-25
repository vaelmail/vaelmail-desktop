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
