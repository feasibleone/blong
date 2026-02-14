var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react.production.min.js"(exports) {
    "use strict";
    var l2 = /* @__PURE__ */ Symbol.for("react.element");
    var n = /* @__PURE__ */ Symbol.for("react.portal");
    var p = /* @__PURE__ */ Symbol.for("react.fragment");
    var q2 = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var r = /* @__PURE__ */ Symbol.for("react.profiler");
    var t = /* @__PURE__ */ Symbol.for("react.provider");
    var u = /* @__PURE__ */ Symbol.for("react.context");
    var v2 = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var w = /* @__PURE__ */ Symbol.for("react.suspense");
    var x = /* @__PURE__ */ Symbol.for("react.memo");
    var y2 = /* @__PURE__ */ Symbol.for("react.lazy");
    var z3 = Symbol.iterator;
    function A2(a) {
      if (null === a || "object" !== typeof a) return null;
      a = z3 && a[z3] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B3 = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C2 = Object.assign;
    var D2 = {};
    function E3(a, b2, e) {
      this.props = a;
      this.context = b2;
      this.refs = D2;
      this.updater = e || B3;
    }
    E3.prototype.isReactComponent = {};
    E3.prototype.setState = function(a, b2) {
      if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b2, "setState");
    };
    E3.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F2() {
    }
    F2.prototype = E3.prototype;
    function G3(a, b2, e) {
      this.props = a;
      this.context = b2;
      this.refs = D2;
      this.updater = e || B3;
    }
    var H3 = G3.prototype = new F2();
    H3.constructor = G3;
    C2(H3, E3.prototype);
    H3.isPureReactComponent = true;
    var I3 = Array.isArray;
    var J3 = Object.prototype.hasOwnProperty;
    var K3 = { current: null };
    var L2 = { key: true, ref: true, __self: true, __source: true };
    function M2(a, b2, e) {
      var d, c2 = {}, k2 = null, h = null;
      if (null != b2) for (d in void 0 !== b2.ref && (h = b2.ref), void 0 !== b2.key && (k2 = "" + b2.key), b2) J3.call(b2, d) && !L2.hasOwnProperty(d) && (c2[d] = b2[d]);
      var g = arguments.length - 2;
      if (1 === g) c2.children = e;
      else if (1 < g) {
        for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
        c2.children = f;
      }
      if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c2[d] && (c2[d] = g[d]);
      return { $$typeof: l2, type: a, key: k2, ref: h, props: c2, _owner: K3.current };
    }
    function N2(a, b2) {
      return { $$typeof: l2, type: a.type, key: b2, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O3(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l2;
    }
    function escape(a) {
      var b2 = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b2[a2];
      });
    }
    var P3 = /\/+/g;
    function Q4(a, b2) {
      return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b2.toString(36);
    }
    function R2(a, b2, e, d, c2) {
      var k2 = typeof a;
      if ("undefined" === k2 || "boolean" === k2) a = null;
      var h = false;
      if (null === a) h = true;
      else switch (k2) {
        case "string":
        case "number":
          h = true;
          break;
        case "object":
          switch (a.$$typeof) {
            case l2:
            case n:
              h = true;
          }
      }
      if (h) return h = a, c2 = c2(h), a = "" === d ? "." + Q4(h, 0) : d, I3(c2) ? (e = "", null != a && (e = a.replace(P3, "$&/") + "/"), R2(c2, b2, e, "", function(a2) {
        return a2;
      })) : null != c2 && (O3(c2) && (c2 = N2(c2, e + (!c2.key || h && h.key === c2.key ? "" : ("" + c2.key).replace(P3, "$&/") + "/") + a)), b2.push(c2)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I3(a)) for (var g = 0; g < a.length; g++) {
        k2 = a[g];
        var f = d + Q4(k2, g);
        h += R2(k2, b2, e, f, c2);
      }
      else if (f = A2(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k2 = a.next()).done; ) k2 = k2.value, f = d + Q4(k2, g++), h += R2(k2, b2, e, f, c2);
      else if ("object" === k2) throw b2 = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b2 ? "object with keys {" + Object.keys(a).join(", ") + "}" : b2) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S3(a, b2, e) {
      if (null == a) return a;
      var d = [], c2 = 0;
      R2(a, d, "", "", function(a2) {
        return b2.call(e, a2, c2++);
      });
      return d;
    }
    function T2(a) {
      if (-1 === a._status) {
        var b2 = a._result;
        b2 = b2();
        b2.then(function(b3) {
          if (0 === a._status || -1 === a._status) a._status = 1, a._result = b3;
        }, function(b3) {
          if (0 === a._status || -1 === a._status) a._status = 2, a._result = b3;
        });
        -1 === a._status && (a._status = 0, a._result = b2);
      }
      if (1 === a._status) return a._result.default;
      throw a._result;
    }
    var U2 = { current: null };
    var V2 = { transition: null };
    var W2 = { ReactCurrentDispatcher: U2, ReactCurrentBatchConfig: V2, ReactCurrentOwner: K3 };
    function X2() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports.Children = { map: S3, forEach: function(a, b2, e) {
      S3(a, function() {
        b2.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b2 = 0;
      S3(a, function() {
        b2++;
      });
      return b2;
    }, toArray: function(a) {
      return S3(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O3(a)) throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports.Component = E3;
    exports.Fragment = p;
    exports.Profiler = r;
    exports.PureComponent = G3;
    exports.StrictMode = q2;
    exports.Suspense = w;
    exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W2;
    exports.act = X2;
    exports.cloneElement = function(a, b2, e) {
      if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C2({}, a.props), c2 = a.key, k2 = a.ref, h = a._owner;
      if (null != b2) {
        void 0 !== b2.ref && (k2 = b2.ref, h = K3.current);
        void 0 !== b2.key && (c2 = "" + b2.key);
        if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
        for (f in b2) J3.call(b2, f) && !L2.hasOwnProperty(f) && (d[f] = void 0 === b2[f] && void 0 !== g ? g[f] : b2[f]);
      }
      var f = arguments.length - 2;
      if (1 === f) d.children = e;
      else if (1 < f) {
        g = Array(f);
        for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
        d.children = g;
      }
      return { $$typeof: l2, type: a.type, key: c2, ref: k2, props: d, _owner: h };
    };
    exports.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports.createElement = M2;
    exports.createFactory = function(a) {
      var b2 = M2.bind(null, a);
      b2.type = a;
      return b2;
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(a) {
      return { $$typeof: v2, render: a };
    };
    exports.isValidElement = O3;
    exports.lazy = function(a) {
      return { $$typeof: y2, _payload: { _status: -1, _result: a }, _init: T2 };
    };
    exports.memo = function(a, b2) {
      return { $$typeof: x, type: a, compare: void 0 === b2 ? null : b2 };
    };
    exports.startTransition = function(a) {
      var b2 = V2.transition;
      V2.transition = {};
      try {
        a();
      } finally {
        V2.transition = b2;
      }
    };
    exports.unstable_act = X2;
    exports.useCallback = function(a, b2) {
      return U2.current.useCallback(a, b2);
    };
    exports.useContext = function(a) {
      return U2.current.useContext(a);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(a) {
      return U2.current.useDeferredValue(a);
    };
    exports.useEffect = function(a, b2) {
      return U2.current.useEffect(a, b2);
    };
    exports.useId = function() {
      return U2.current.useId();
    };
    exports.useImperativeHandle = function(a, b2, e) {
      return U2.current.useImperativeHandle(a, b2, e);
    };
    exports.useInsertionEffect = function(a, b2) {
      return U2.current.useInsertionEffect(a, b2);
    };
    exports.useLayoutEffect = function(a, b2) {
      return U2.current.useLayoutEffect(a, b2);
    };
    exports.useMemo = function(a, b2) {
      return U2.current.useMemo(a, b2);
    };
    exports.useReducer = function(a, b2, e) {
      return U2.current.useReducer(a, b2, e);
    };
    exports.useRef = function(a) {
      return U2.current.useRef(a);
    };
    exports.useState = function(a) {
      return U2.current.useState(a);
    };
    exports.useSyncExternalStore = function(a, b2, e) {
      return U2.current.useSyncExternalStore(a, b2, e);
    };
    exports.useTransition = function() {
      return U2.current.useTransition();
    };
    exports.version = "18.3.1";
  }
});

// ../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/index.js
var require_react = __commonJS({
  "../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_production_min();
    } else {
      module.exports = null;
    }
  }
});

// ../../common/temp/node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/cjs/scheduler.production.min.js
var require_scheduler_production_min = __commonJS({
  "../../common/temp/node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/cjs/scheduler.production.min.js"(exports) {
    "use strict";
    function f(a, b2) {
      var c2 = a.length;
      a.push(b2);
      a: for (; 0 < c2; ) {
        var d = c2 - 1 >>> 1, e = a[d];
        if (0 < g(e, b2)) a[d] = b2, a[c2] = e, c2 = d;
        else break a;
      }
    }
    function h(a) {
      return 0 === a.length ? null : a[0];
    }
    function k2(a) {
      if (0 === a.length) return null;
      var b2 = a[0], c2 = a.pop();
      if (c2 !== b2) {
        a[0] = c2;
        a: for (var d = 0, e = a.length, w = e >>> 1; d < w; ) {
          var m = 2 * (d + 1) - 1, C2 = a[m], n = m + 1, x = a[n];
          if (0 > g(C2, c2)) n < e && 0 > g(x, C2) ? (a[d] = x, a[n] = c2, d = n) : (a[d] = C2, a[m] = c2, d = m);
          else if (n < e && 0 > g(x, c2)) a[d] = x, a[n] = c2, d = n;
          else break a;
        }
      }
      return b2;
    }
    function g(a, b2) {
      var c2 = a.sortIndex - b2.sortIndex;
      return 0 !== c2 ? c2 : a.id - b2.id;
    }
    if ("object" === typeof performance && "function" === typeof performance.now) {
      l2 = performance;
      exports.unstable_now = function() {
        return l2.now();
      };
    } else {
      p = Date, q2 = p.now();
      exports.unstable_now = function() {
        return p.now() - q2;
      };
    }
    var l2;
    var p;
    var q2;
    var r = [];
    var t = [];
    var u = 1;
    var v2 = null;
    var y2 = 3;
    var z3 = false;
    var A2 = false;
    var B3 = false;
    var D2 = "function" === typeof setTimeout ? setTimeout : null;
    var E3 = "function" === typeof clearTimeout ? clearTimeout : null;
    var F2 = "undefined" !== typeof setImmediate ? setImmediate : null;
    "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
    function G3(a) {
      for (var b2 = h(t); null !== b2; ) {
        if (null === b2.callback) k2(t);
        else if (b2.startTime <= a) k2(t), b2.sortIndex = b2.expirationTime, f(r, b2);
        else break;
        b2 = h(t);
      }
    }
    function H3(a) {
      B3 = false;
      G3(a);
      if (!A2) if (null !== h(r)) A2 = true, I3(J3);
      else {
        var b2 = h(t);
        null !== b2 && K3(H3, b2.startTime - a);
      }
    }
    function J3(a, b2) {
      A2 = false;
      B3 && (B3 = false, E3(L2), L2 = -1);
      z3 = true;
      var c2 = y2;
      try {
        G3(b2);
        for (v2 = h(r); null !== v2 && (!(v2.expirationTime > b2) || a && !M2()); ) {
          var d = v2.callback;
          if ("function" === typeof d) {
            v2.callback = null;
            y2 = v2.priorityLevel;
            var e = d(v2.expirationTime <= b2);
            b2 = exports.unstable_now();
            "function" === typeof e ? v2.callback = e : v2 === h(r) && k2(r);
            G3(b2);
          } else k2(r);
          v2 = h(r);
        }
        if (null !== v2) var w = true;
        else {
          var m = h(t);
          null !== m && K3(H3, m.startTime - b2);
          w = false;
        }
        return w;
      } finally {
        v2 = null, y2 = c2, z3 = false;
      }
    }
    var N2 = false;
    var O3 = null;
    var L2 = -1;
    var P3 = 5;
    var Q4 = -1;
    function M2() {
      return exports.unstable_now() - Q4 < P3 ? false : true;
    }
    function R2() {
      if (null !== O3) {
        var a = exports.unstable_now();
        Q4 = a;
        var b2 = true;
        try {
          b2 = O3(true, a);
        } finally {
          b2 ? S3() : (N2 = false, O3 = null);
        }
      } else N2 = false;
    }
    var S3;
    if ("function" === typeof F2) S3 = function() {
      F2(R2);
    };
    else if ("undefined" !== typeof MessageChannel) {
      T2 = new MessageChannel(), U2 = T2.port2;
      T2.port1.onmessage = R2;
      S3 = function() {
        U2.postMessage(null);
      };
    } else S3 = function() {
      D2(R2, 0);
    };
    var T2;
    var U2;
    function I3(a) {
      O3 = a;
      N2 || (N2 = true, S3());
    }
    function K3(a, b2) {
      L2 = D2(function() {
        a(exports.unstable_now());
      }, b2);
    }
    exports.unstable_IdlePriority = 5;
    exports.unstable_ImmediatePriority = 1;
    exports.unstable_LowPriority = 4;
    exports.unstable_NormalPriority = 3;
    exports.unstable_Profiling = null;
    exports.unstable_UserBlockingPriority = 2;
    exports.unstable_cancelCallback = function(a) {
      a.callback = null;
    };
    exports.unstable_continueExecution = function() {
      A2 || z3 || (A2 = true, I3(J3));
    };
    exports.unstable_forceFrameRate = function(a) {
      0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P3 = 0 < a ? Math.floor(1e3 / a) : 5;
    };
    exports.unstable_getCurrentPriorityLevel = function() {
      return y2;
    };
    exports.unstable_getFirstCallbackNode = function() {
      return h(r);
    };
    exports.unstable_next = function(a) {
      switch (y2) {
        case 1:
        case 2:
        case 3:
          var b2 = 3;
          break;
        default:
          b2 = y2;
      }
      var c2 = y2;
      y2 = b2;
      try {
        return a();
      } finally {
        y2 = c2;
      }
    };
    exports.unstable_pauseExecution = function() {
    };
    exports.unstable_requestPaint = function() {
    };
    exports.unstable_runWithPriority = function(a, b2) {
      switch (a) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          a = 3;
      }
      var c2 = y2;
      y2 = a;
      try {
        return b2();
      } finally {
        y2 = c2;
      }
    };
    exports.unstable_scheduleCallback = function(a, b2, c2) {
      var d = exports.unstable_now();
      "object" === typeof c2 && null !== c2 ? (c2 = c2.delay, c2 = "number" === typeof c2 && 0 < c2 ? d + c2 : d) : c2 = d;
      switch (a) {
        case 1:
          var e = -1;
          break;
        case 2:
          e = 250;
          break;
        case 5:
          e = 1073741823;
          break;
        case 4:
          e = 1e4;
          break;
        default:
          e = 5e3;
      }
      e = c2 + e;
      a = { id: u++, callback: b2, priorityLevel: a, startTime: c2, expirationTime: e, sortIndex: -1 };
      c2 > d ? (a.sortIndex = c2, f(t, a), null === h(r) && a === h(t) && (B3 ? (E3(L2), L2 = -1) : B3 = true, K3(H3, c2 - d))) : (a.sortIndex = e, f(r, a), A2 || z3 || (A2 = true, I3(J3)));
      return a;
    };
    exports.unstable_shouldYield = M2;
    exports.unstable_wrapCallback = function(a) {
      var b2 = y2;
      return function() {
        var c2 = y2;
        y2 = b2;
        try {
          return a.apply(this, arguments);
        } finally {
          y2 = c2;
        }
      };
    };
  }
});

// ../../common/temp/node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/index.js
var require_scheduler = __commonJS({
  "../../common/temp/node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_scheduler_production_min();
    } else {
      module.exports = null;
    }
  }
});

// ../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/cjs/react-dom.production.min.js
var require_react_dom_production_min = __commonJS({
  "../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/cjs/react-dom.production.min.js"(exports) {
    "use strict";
    var aa = require_react();
    var ca = require_scheduler();
    function p(a) {
      for (var b2 = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c2 = 1; c2 < arguments.length; c2++) b2 += "&args[]=" + encodeURIComponent(arguments[c2]);
      return "Minified React error #" + a + "; visit " + b2 + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    var da = /* @__PURE__ */ new Set();
    var ea = {};
    function fa(a, b2) {
      ha(a, b2);
      ha(a + "Capture", b2);
    }
    function ha(a, b2) {
      ea[a] = b2;
      for (a = 0; a < b2.length; a++) da.add(b2[a]);
    }
    var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
    var ja = Object.prototype.hasOwnProperty;
    var ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/;
    var la = {};
    var ma = {};
    function oa(a) {
      if (ja.call(ma, a)) return true;
      if (ja.call(la, a)) return false;
      if (ka.test(a)) return ma[a] = true;
      la[a] = true;
      return false;
    }
    function pa(a, b2, c2, d) {
      if (null !== c2 && 0 === c2.type) return false;
      switch (typeof b2) {
        case "function":
        case "symbol":
          return true;
        case "boolean":
          if (d) return false;
          if (null !== c2) return !c2.acceptsBooleans;
          a = a.toLowerCase().slice(0, 5);
          return "data-" !== a && "aria-" !== a;
        default:
          return false;
      }
    }
    function qa(a, b2, c2, d) {
      if (null === b2 || "undefined" === typeof b2 || pa(a, b2, c2, d)) return true;
      if (d) return false;
      if (null !== c2) switch (c2.type) {
        case 3:
          return !b2;
        case 4:
          return false === b2;
        case 5:
          return isNaN(b2);
        case 6:
          return isNaN(b2) || 1 > b2;
      }
      return false;
    }
    function v2(a, b2, c2, d, e, f, g) {
      this.acceptsBooleans = 2 === b2 || 3 === b2 || 4 === b2;
      this.attributeName = d;
      this.attributeNamespace = e;
      this.mustUseProperty = c2;
      this.propertyName = a;
      this.type = b2;
      this.sanitizeURL = f;
      this.removeEmptyString = g;
    }
    var z3 = {};
    "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
      z3[a] = new v2(a, 0, false, a, null, false, false);
    });
    [["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
      var b2 = a[0];
      z3[b2] = new v2(b2, 1, false, a[1], null, false, false);
    });
    ["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
      z3[a] = new v2(a, 2, false, a.toLowerCase(), null, false, false);
    });
    ["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
      z3[a] = new v2(a, 2, false, a, null, false, false);
    });
    "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
      z3[a] = new v2(a, 3, false, a.toLowerCase(), null, false, false);
    });
    ["checked", "multiple", "muted", "selected"].forEach(function(a) {
      z3[a] = new v2(a, 3, true, a, null, false, false);
    });
    ["capture", "download"].forEach(function(a) {
      z3[a] = new v2(a, 4, false, a, null, false, false);
    });
    ["cols", "rows", "size", "span"].forEach(function(a) {
      z3[a] = new v2(a, 6, false, a, null, false, false);
    });
    ["rowSpan", "start"].forEach(function(a) {
      z3[a] = new v2(a, 5, false, a.toLowerCase(), null, false, false);
    });
    var ra = /[\-:]([a-z])/g;
    function sa(a) {
      return a[1].toUpperCase();
    }
    "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
      var b2 = a.replace(
        ra,
        sa
      );
      z3[b2] = new v2(b2, 1, false, a, null, false, false);
    });
    "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
      var b2 = a.replace(ra, sa);
      z3[b2] = new v2(b2, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
    });
    ["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
      var b2 = a.replace(ra, sa);
      z3[b2] = new v2(b2, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
    });
    ["tabIndex", "crossOrigin"].forEach(function(a) {
      z3[a] = new v2(a, 1, false, a.toLowerCase(), null, false, false);
    });
    z3.xlinkHref = new v2("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
    ["src", "href", "action", "formAction"].forEach(function(a) {
      z3[a] = new v2(a, 1, false, a.toLowerCase(), null, true, true);
    });
    function ta(a, b2, c2, d) {
      var e = z3.hasOwnProperty(b2) ? z3[b2] : null;
      if (null !== e ? 0 !== e.type : d || !(2 < b2.length) || "o" !== b2[0] && "O" !== b2[0] || "n" !== b2[1] && "N" !== b2[1]) qa(b2, c2, e, d) && (c2 = null), d || null === e ? oa(b2) && (null === c2 ? a.removeAttribute(b2) : a.setAttribute(b2, "" + c2)) : e.mustUseProperty ? a[e.propertyName] = null === c2 ? 3 === e.type ? false : "" : c2 : (b2 = e.attributeName, d = e.attributeNamespace, null === c2 ? a.removeAttribute(b2) : (e = e.type, c2 = 3 === e || 4 === e && true === c2 ? "" : "" + c2, d ? a.setAttributeNS(d, b2, c2) : a.setAttribute(b2, c2)));
    }
    var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    var va = /* @__PURE__ */ Symbol.for("react.element");
    var wa = /* @__PURE__ */ Symbol.for("react.portal");
    var ya = /* @__PURE__ */ Symbol.for("react.fragment");
    var za = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var Aa = /* @__PURE__ */ Symbol.for("react.profiler");
    var Ba = /* @__PURE__ */ Symbol.for("react.provider");
    var Ca = /* @__PURE__ */ Symbol.for("react.context");
    var Da = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var Ea = /* @__PURE__ */ Symbol.for("react.suspense");
    var Fa = /* @__PURE__ */ Symbol.for("react.suspense_list");
    var Ga = /* @__PURE__ */ Symbol.for("react.memo");
    var Ha = /* @__PURE__ */ Symbol.for("react.lazy");
    var Ia = /* @__PURE__ */ Symbol.for("react.offscreen");
    var Ja = Symbol.iterator;
    function Ka(a) {
      if (null === a || "object" !== typeof a) return null;
      a = Ja && a[Ja] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var A2 = Object.assign;
    var La;
    function Ma(a) {
      if (void 0 === La) try {
        throw Error();
      } catch (c2) {
        var b2 = c2.stack.trim().match(/\n( *(at )?)/);
        La = b2 && b2[1] || "";
      }
      return "\n" + La + a;
    }
    var Na = false;
    function Oa(a, b2) {
      if (!a || Na) return "";
      Na = true;
      var c2 = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      try {
        if (b2) if (b2 = function() {
          throw Error();
        }, Object.defineProperty(b2.prototype, "props", { set: function() {
          throw Error();
        } }), "object" === typeof Reflect && Reflect.construct) {
          try {
            Reflect.construct(b2, []);
          } catch (l2) {
            var d = l2;
          }
          Reflect.construct(a, [], b2);
        } else {
          try {
            b2.call();
          } catch (l2) {
            d = l2;
          }
          a.call(b2.prototype);
        }
        else {
          try {
            throw Error();
          } catch (l2) {
            d = l2;
          }
          a();
        }
      } catch (l2) {
        if (l2 && d && "string" === typeof l2.stack) {
          for (var e = l2.stack.split("\n"), f = d.stack.split("\n"), g = e.length - 1, h = f.length - 1; 1 <= g && 0 <= h && e[g] !== f[h]; ) h--;
          for (; 1 <= g && 0 <= h; g--, h--) if (e[g] !== f[h]) {
            if (1 !== g || 1 !== h) {
              do
                if (g--, h--, 0 > h || e[g] !== f[h]) {
                  var k2 = "\n" + e[g].replace(" at new ", " at ");
                  a.displayName && k2.includes("<anonymous>") && (k2 = k2.replace("<anonymous>", a.displayName));
                  return k2;
                }
              while (1 <= g && 0 <= h);
            }
            break;
          }
        }
      } finally {
        Na = false, Error.prepareStackTrace = c2;
      }
      return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
    }
    function Pa(a) {
      switch (a.tag) {
        case 5:
          return Ma(a.type);
        case 16:
          return Ma("Lazy");
        case 13:
          return Ma("Suspense");
        case 19:
          return Ma("SuspenseList");
        case 0:
        case 2:
        case 15:
          return a = Oa(a.type, false), a;
        case 11:
          return a = Oa(a.type.render, false), a;
        case 1:
          return a = Oa(a.type, true), a;
        default:
          return "";
      }
    }
    function Qa(a) {
      if (null == a) return null;
      if ("function" === typeof a) return a.displayName || a.name || null;
      if ("string" === typeof a) return a;
      switch (a) {
        case ya:
          return "Fragment";
        case wa:
          return "Portal";
        case Aa:
          return "Profiler";
        case za:
          return "StrictMode";
        case Ea:
          return "Suspense";
        case Fa:
          return "SuspenseList";
      }
      if ("object" === typeof a) switch (a.$$typeof) {
        case Ca:
          return (a.displayName || "Context") + ".Consumer";
        case Ba:
          return (a._context.displayName || "Context") + ".Provider";
        case Da:
          var b2 = a.render;
          a = a.displayName;
          a || (a = b2.displayName || b2.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
          return a;
        case Ga:
          return b2 = a.displayName || null, null !== b2 ? b2 : Qa(a.type) || "Memo";
        case Ha:
          b2 = a._payload;
          a = a._init;
          try {
            return Qa(a(b2));
          } catch (c2) {
          }
      }
      return null;
    }
    function Ra(a) {
      var b2 = a.type;
      switch (a.tag) {
        case 24:
          return "Cache";
        case 9:
          return (b2.displayName || "Context") + ".Consumer";
        case 10:
          return (b2._context.displayName || "Context") + ".Provider";
        case 18:
          return "DehydratedFragment";
        case 11:
          return a = b2.render, a = a.displayName || a.name || "", b2.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
        case 7:
          return "Fragment";
        case 5:
          return b2;
        case 4:
          return "Portal";
        case 3:
          return "Root";
        case 6:
          return "Text";
        case 16:
          return Qa(b2);
        case 8:
          return b2 === za ? "StrictMode" : "Mode";
        case 22:
          return "Offscreen";
        case 12:
          return "Profiler";
        case 21:
          return "Scope";
        case 13:
          return "Suspense";
        case 19:
          return "SuspenseList";
        case 25:
          return "TracingMarker";
        case 1:
        case 0:
        case 17:
        case 2:
        case 14:
        case 15:
          if ("function" === typeof b2) return b2.displayName || b2.name || null;
          if ("string" === typeof b2) return b2;
      }
      return null;
    }
    function Sa(a) {
      switch (typeof a) {
        case "boolean":
        case "number":
        case "string":
        case "undefined":
          return a;
        case "object":
          return a;
        default:
          return "";
      }
    }
    function Ta(a) {
      var b2 = a.type;
      return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b2 || "radio" === b2);
    }
    function Ua(a) {
      var b2 = Ta(a) ? "checked" : "value", c2 = Object.getOwnPropertyDescriptor(a.constructor.prototype, b2), d = "" + a[b2];
      if (!a.hasOwnProperty(b2) && "undefined" !== typeof c2 && "function" === typeof c2.get && "function" === typeof c2.set) {
        var e = c2.get, f = c2.set;
        Object.defineProperty(a, b2, { configurable: true, get: function() {
          return e.call(this);
        }, set: function(a2) {
          d = "" + a2;
          f.call(this, a2);
        } });
        Object.defineProperty(a, b2, { enumerable: c2.enumerable });
        return { getValue: function() {
          return d;
        }, setValue: function(a2) {
          d = "" + a2;
        }, stopTracking: function() {
          a._valueTracker = null;
          delete a[b2];
        } };
      }
    }
    function Va(a) {
      a._valueTracker || (a._valueTracker = Ua(a));
    }
    function Wa(a) {
      if (!a) return false;
      var b2 = a._valueTracker;
      if (!b2) return true;
      var c2 = b2.getValue();
      var d = "";
      a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
      a = d;
      return a !== c2 ? (b2.setValue(a), true) : false;
    }
    function Xa(a) {
      a = a || ("undefined" !== typeof document ? document : void 0);
      if ("undefined" === typeof a) return null;
      try {
        return a.activeElement || a.body;
      } catch (b2) {
        return a.body;
      }
    }
    function Ya(a, b2) {
      var c2 = b2.checked;
      return A2({}, b2, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c2 ? c2 : a._wrapperState.initialChecked });
    }
    function Za(a, b2) {
      var c2 = null == b2.defaultValue ? "" : b2.defaultValue, d = null != b2.checked ? b2.checked : b2.defaultChecked;
      c2 = Sa(null != b2.value ? b2.value : c2);
      a._wrapperState = { initialChecked: d, initialValue: c2, controlled: "checkbox" === b2.type || "radio" === b2.type ? null != b2.checked : null != b2.value };
    }
    function ab(a, b2) {
      b2 = b2.checked;
      null != b2 && ta(a, "checked", b2, false);
    }
    function bb(a, b2) {
      ab(a, b2);
      var c2 = Sa(b2.value), d = b2.type;
      if (null != c2) if ("number" === d) {
        if (0 === c2 && "" === a.value || a.value != c2) a.value = "" + c2;
      } else a.value !== "" + c2 && (a.value = "" + c2);
      else if ("submit" === d || "reset" === d) {
        a.removeAttribute("value");
        return;
      }
      b2.hasOwnProperty("value") ? cb(a, b2.type, c2) : b2.hasOwnProperty("defaultValue") && cb(a, b2.type, Sa(b2.defaultValue));
      null == b2.checked && null != b2.defaultChecked && (a.defaultChecked = !!b2.defaultChecked);
    }
    function db(a, b2, c2) {
      if (b2.hasOwnProperty("value") || b2.hasOwnProperty("defaultValue")) {
        var d = b2.type;
        if (!("submit" !== d && "reset" !== d || void 0 !== b2.value && null !== b2.value)) return;
        b2 = "" + a._wrapperState.initialValue;
        c2 || b2 === a.value || (a.value = b2);
        a.defaultValue = b2;
      }
      c2 = a.name;
      "" !== c2 && (a.name = "");
      a.defaultChecked = !!a._wrapperState.initialChecked;
      "" !== c2 && (a.name = c2);
    }
    function cb(a, b2, c2) {
      if ("number" !== b2 || Xa(a.ownerDocument) !== a) null == c2 ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c2 && (a.defaultValue = "" + c2);
    }
    var eb = Array.isArray;
    function fb(a, b2, c2, d) {
      a = a.options;
      if (b2) {
        b2 = {};
        for (var e = 0; e < c2.length; e++) b2["$" + c2[e]] = true;
        for (c2 = 0; c2 < a.length; c2++) e = b2.hasOwnProperty("$" + a[c2].value), a[c2].selected !== e && (a[c2].selected = e), e && d && (a[c2].defaultSelected = true);
      } else {
        c2 = "" + Sa(c2);
        b2 = null;
        for (e = 0; e < a.length; e++) {
          if (a[e].value === c2) {
            a[e].selected = true;
            d && (a[e].defaultSelected = true);
            return;
          }
          null !== b2 || a[e].disabled || (b2 = a[e]);
        }
        null !== b2 && (b2.selected = true);
      }
    }
    function gb(a, b2) {
      if (null != b2.dangerouslySetInnerHTML) throw Error(p(91));
      return A2({}, b2, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
    }
    function hb(a, b2) {
      var c2 = b2.value;
      if (null == c2) {
        c2 = b2.children;
        b2 = b2.defaultValue;
        if (null != c2) {
          if (null != b2) throw Error(p(92));
          if (eb(c2)) {
            if (1 < c2.length) throw Error(p(93));
            c2 = c2[0];
          }
          b2 = c2;
        }
        null == b2 && (b2 = "");
        c2 = b2;
      }
      a._wrapperState = { initialValue: Sa(c2) };
    }
    function ib(a, b2) {
      var c2 = Sa(b2.value), d = Sa(b2.defaultValue);
      null != c2 && (c2 = "" + c2, c2 !== a.value && (a.value = c2), null == b2.defaultValue && a.defaultValue !== c2 && (a.defaultValue = c2));
      null != d && (a.defaultValue = "" + d);
    }
    function jb(a) {
      var b2 = a.textContent;
      b2 === a._wrapperState.initialValue && "" !== b2 && null !== b2 && (a.value = b2);
    }
    function kb(a) {
      switch (a) {
        case "svg":
          return "http://www.w3.org/2000/svg";
        case "math":
          return "http://www.w3.org/1998/Math/MathML";
        default:
          return "http://www.w3.org/1999/xhtml";
      }
    }
    function lb(a, b2) {
      return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b2) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b2 ? "http://www.w3.org/1999/xhtml" : a;
    }
    var mb;
    var nb = (function(a) {
      return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b2, c2, d, e) {
        MSApp.execUnsafeLocalFunction(function() {
          return a(b2, c2, d, e);
        });
      } : a;
    })(function(a, b2) {
      if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a) a.innerHTML = b2;
      else {
        mb = mb || document.createElement("div");
        mb.innerHTML = "<svg>" + b2.valueOf().toString() + "</svg>";
        for (b2 = mb.firstChild; a.firstChild; ) a.removeChild(a.firstChild);
        for (; b2.firstChild; ) a.appendChild(b2.firstChild);
      }
    });
    function ob(a, b2) {
      if (b2) {
        var c2 = a.firstChild;
        if (c2 && c2 === a.lastChild && 3 === c2.nodeType) {
          c2.nodeValue = b2;
          return;
        }
      }
      a.textContent = b2;
    }
    var pb = {
      animationIterationCount: true,
      aspectRatio: true,
      borderImageOutset: true,
      borderImageSlice: true,
      borderImageWidth: true,
      boxFlex: true,
      boxFlexGroup: true,
      boxOrdinalGroup: true,
      columnCount: true,
      columns: true,
      flex: true,
      flexGrow: true,
      flexPositive: true,
      flexShrink: true,
      flexNegative: true,
      flexOrder: true,
      gridArea: true,
      gridRow: true,
      gridRowEnd: true,
      gridRowSpan: true,
      gridRowStart: true,
      gridColumn: true,
      gridColumnEnd: true,
      gridColumnSpan: true,
      gridColumnStart: true,
      fontWeight: true,
      lineClamp: true,
      lineHeight: true,
      opacity: true,
      order: true,
      orphans: true,
      tabSize: true,
      widows: true,
      zIndex: true,
      zoom: true,
      fillOpacity: true,
      floodOpacity: true,
      stopOpacity: true,
      strokeDasharray: true,
      strokeDashoffset: true,
      strokeMiterlimit: true,
      strokeOpacity: true,
      strokeWidth: true
    };
    var qb = ["Webkit", "ms", "Moz", "O"];
    Object.keys(pb).forEach(function(a) {
      qb.forEach(function(b2) {
        b2 = b2 + a.charAt(0).toUpperCase() + a.substring(1);
        pb[b2] = pb[a];
      });
    });
    function rb(a, b2, c2) {
      return null == b2 || "boolean" === typeof b2 || "" === b2 ? "" : c2 || "number" !== typeof b2 || 0 === b2 || pb.hasOwnProperty(a) && pb[a] ? ("" + b2).trim() : b2 + "px";
    }
    function sb(a, b2) {
      a = a.style;
      for (var c2 in b2) if (b2.hasOwnProperty(c2)) {
        var d = 0 === c2.indexOf("--"), e = rb(c2, b2[c2], d);
        "float" === c2 && (c2 = "cssFloat");
        d ? a.setProperty(c2, e) : a[c2] = e;
      }
    }
    var tb = A2({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
    function ub(a, b2) {
      if (b2) {
        if (tb[a] && (null != b2.children || null != b2.dangerouslySetInnerHTML)) throw Error(p(137, a));
        if (null != b2.dangerouslySetInnerHTML) {
          if (null != b2.children) throw Error(p(60));
          if ("object" !== typeof b2.dangerouslySetInnerHTML || !("__html" in b2.dangerouslySetInnerHTML)) throw Error(p(61));
        }
        if (null != b2.style && "object" !== typeof b2.style) throw Error(p(62));
      }
    }
    function vb(a, b2) {
      if (-1 === a.indexOf("-")) return "string" === typeof b2.is;
      switch (a) {
        case "annotation-xml":
        case "color-profile":
        case "font-face":
        case "font-face-src":
        case "font-face-uri":
        case "font-face-format":
        case "font-face-name":
        case "missing-glyph":
          return false;
        default:
          return true;
      }
    }
    var wb = null;
    function xb(a) {
      a = a.target || a.srcElement || window;
      a.correspondingUseElement && (a = a.correspondingUseElement);
      return 3 === a.nodeType ? a.parentNode : a;
    }
    var yb = null;
    var zb = null;
    var Ab = null;
    function Bb(a) {
      if (a = Cb(a)) {
        if ("function" !== typeof yb) throw Error(p(280));
        var b2 = a.stateNode;
        b2 && (b2 = Db(b2), yb(a.stateNode, a.type, b2));
      }
    }
    function Eb(a) {
      zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
    }
    function Fb() {
      if (zb) {
        var a = zb, b2 = Ab;
        Ab = zb = null;
        Bb(a);
        if (b2) for (a = 0; a < b2.length; a++) Bb(b2[a]);
      }
    }
    function Gb(a, b2) {
      return a(b2);
    }
    function Hb() {
    }
    var Ib = false;
    function Jb(a, b2, c2) {
      if (Ib) return a(b2, c2);
      Ib = true;
      try {
        return Gb(a, b2, c2);
      } finally {
        if (Ib = false, null !== zb || null !== Ab) Hb(), Fb();
      }
    }
    function Kb(a, b2) {
      var c2 = a.stateNode;
      if (null === c2) return null;
      var d = Db(c2);
      if (null === d) return null;
      c2 = d[b2];
      a: switch (b2) {
        case "onClick":
        case "onClickCapture":
        case "onDoubleClick":
        case "onDoubleClickCapture":
        case "onMouseDown":
        case "onMouseDownCapture":
        case "onMouseMove":
        case "onMouseMoveCapture":
        case "onMouseUp":
        case "onMouseUpCapture":
        case "onMouseEnter":
          (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
          a = !d;
          break a;
        default:
          a = false;
      }
      if (a) return null;
      if (c2 && "function" !== typeof c2) throw Error(p(231, b2, typeof c2));
      return c2;
    }
    var Lb = false;
    if (ia) try {
      Mb = {};
      Object.defineProperty(Mb, "passive", { get: function() {
        Lb = true;
      } });
      window.addEventListener("test", Mb, Mb);
      window.removeEventListener("test", Mb, Mb);
    } catch (a) {
      Lb = false;
    }
    var Mb;
    function Nb(a, b2, c2, d, e, f, g, h, k2) {
      var l2 = Array.prototype.slice.call(arguments, 3);
      try {
        b2.apply(c2, l2);
      } catch (m) {
        this.onError(m);
      }
    }
    var Ob = false;
    var Pb = null;
    var Qb = false;
    var Rb = null;
    var Sb = { onError: function(a) {
      Ob = true;
      Pb = a;
    } };
    function Tb(a, b2, c2, d, e, f, g, h, k2) {
      Ob = false;
      Pb = null;
      Nb.apply(Sb, arguments);
    }
    function Ub(a, b2, c2, d, e, f, g, h, k2) {
      Tb.apply(this, arguments);
      if (Ob) {
        if (Ob) {
          var l2 = Pb;
          Ob = false;
          Pb = null;
        } else throw Error(p(198));
        Qb || (Qb = true, Rb = l2);
      }
    }
    function Vb(a) {
      var b2 = a, c2 = a;
      if (a.alternate) for (; b2.return; ) b2 = b2.return;
      else {
        a = b2;
        do
          b2 = a, 0 !== (b2.flags & 4098) && (c2 = b2.return), a = b2.return;
        while (a);
      }
      return 3 === b2.tag ? c2 : null;
    }
    function Wb(a) {
      if (13 === a.tag) {
        var b2 = a.memoizedState;
        null === b2 && (a = a.alternate, null !== a && (b2 = a.memoizedState));
        if (null !== b2) return b2.dehydrated;
      }
      return null;
    }
    function Xb(a) {
      if (Vb(a) !== a) throw Error(p(188));
    }
    function Yb(a) {
      var b2 = a.alternate;
      if (!b2) {
        b2 = Vb(a);
        if (null === b2) throw Error(p(188));
        return b2 !== a ? null : a;
      }
      for (var c2 = a, d = b2; ; ) {
        var e = c2.return;
        if (null === e) break;
        var f = e.alternate;
        if (null === f) {
          d = e.return;
          if (null !== d) {
            c2 = d;
            continue;
          }
          break;
        }
        if (e.child === f.child) {
          for (f = e.child; f; ) {
            if (f === c2) return Xb(e), a;
            if (f === d) return Xb(e), b2;
            f = f.sibling;
          }
          throw Error(p(188));
        }
        if (c2.return !== d.return) c2 = e, d = f;
        else {
          for (var g = false, h = e.child; h; ) {
            if (h === c2) {
              g = true;
              c2 = e;
              d = f;
              break;
            }
            if (h === d) {
              g = true;
              d = e;
              c2 = f;
              break;
            }
            h = h.sibling;
          }
          if (!g) {
            for (h = f.child; h; ) {
              if (h === c2) {
                g = true;
                c2 = f;
                d = e;
                break;
              }
              if (h === d) {
                g = true;
                d = f;
                c2 = e;
                break;
              }
              h = h.sibling;
            }
            if (!g) throw Error(p(189));
          }
        }
        if (c2.alternate !== d) throw Error(p(190));
      }
      if (3 !== c2.tag) throw Error(p(188));
      return c2.stateNode.current === c2 ? a : b2;
    }
    function Zb(a) {
      a = Yb(a);
      return null !== a ? $b(a) : null;
    }
    function $b(a) {
      if (5 === a.tag || 6 === a.tag) return a;
      for (a = a.child; null !== a; ) {
        var b2 = $b(a);
        if (null !== b2) return b2;
        a = a.sibling;
      }
      return null;
    }
    var ac = ca.unstable_scheduleCallback;
    var bc = ca.unstable_cancelCallback;
    var cc = ca.unstable_shouldYield;
    var dc = ca.unstable_requestPaint;
    var B3 = ca.unstable_now;
    var ec = ca.unstable_getCurrentPriorityLevel;
    var fc = ca.unstable_ImmediatePriority;
    var gc = ca.unstable_UserBlockingPriority;
    var hc = ca.unstable_NormalPriority;
    var ic = ca.unstable_LowPriority;
    var jc = ca.unstable_IdlePriority;
    var kc = null;
    var lc = null;
    function mc(a) {
      if (lc && "function" === typeof lc.onCommitFiberRoot) try {
        lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
      } catch (b2) {
      }
    }
    var oc = Math.clz32 ? Math.clz32 : nc;
    var pc = Math.log;
    var qc = Math.LN2;
    function nc(a) {
      a >>>= 0;
      return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
    }
    var rc = 64;
    var sc = 4194304;
    function tc(a) {
      switch (a & -a) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 4:
          return 4;
        case 8:
          return 8;
        case 16:
          return 16;
        case 32:
          return 32;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return a & 4194240;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          return a & 130023424;
        case 134217728:
          return 134217728;
        case 268435456:
          return 268435456;
        case 536870912:
          return 536870912;
        case 1073741824:
          return 1073741824;
        default:
          return a;
      }
    }
    function uc(a, b2) {
      var c2 = a.pendingLanes;
      if (0 === c2) return 0;
      var d = 0, e = a.suspendedLanes, f = a.pingedLanes, g = c2 & 268435455;
      if (0 !== g) {
        var h = g & ~e;
        0 !== h ? d = tc(h) : (f &= g, 0 !== f && (d = tc(f)));
      } else g = c2 & ~e, 0 !== g ? d = tc(g) : 0 !== f && (d = tc(f));
      if (0 === d) return 0;
      if (0 !== b2 && b2 !== d && 0 === (b2 & e) && (e = d & -d, f = b2 & -b2, e >= f || 16 === e && 0 !== (f & 4194240))) return b2;
      0 !== (d & 4) && (d |= c2 & 16);
      b2 = a.entangledLanes;
      if (0 !== b2) for (a = a.entanglements, b2 &= d; 0 < b2; ) c2 = 31 - oc(b2), e = 1 << c2, d |= a[c2], b2 &= ~e;
      return d;
    }
    function vc(a, b2) {
      switch (a) {
        case 1:
        case 2:
        case 4:
          return b2 + 250;
        case 8:
        case 16:
        case 32:
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return b2 + 5e3;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          return -1;
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1;
        default:
          return -1;
      }
    }
    function wc(a, b2) {
      for (var c2 = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f = a.pendingLanes; 0 < f; ) {
        var g = 31 - oc(f), h = 1 << g, k2 = e[g];
        if (-1 === k2) {
          if (0 === (h & c2) || 0 !== (h & d)) e[g] = vc(h, b2);
        } else k2 <= b2 && (a.expiredLanes |= h);
        f &= ~h;
      }
    }
    function xc(a) {
      a = a.pendingLanes & -1073741825;
      return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
    }
    function yc() {
      var a = rc;
      rc <<= 1;
      0 === (rc & 4194240) && (rc = 64);
      return a;
    }
    function zc(a) {
      for (var b2 = [], c2 = 0; 31 > c2; c2++) b2.push(a);
      return b2;
    }
    function Ac(a, b2, c2) {
      a.pendingLanes |= b2;
      536870912 !== b2 && (a.suspendedLanes = 0, a.pingedLanes = 0);
      a = a.eventTimes;
      b2 = 31 - oc(b2);
      a[b2] = c2;
    }
    function Bc(a, b2) {
      var c2 = a.pendingLanes & ~b2;
      a.pendingLanes = b2;
      a.suspendedLanes = 0;
      a.pingedLanes = 0;
      a.expiredLanes &= b2;
      a.mutableReadLanes &= b2;
      a.entangledLanes &= b2;
      b2 = a.entanglements;
      var d = a.eventTimes;
      for (a = a.expirationTimes; 0 < c2; ) {
        var e = 31 - oc(c2), f = 1 << e;
        b2[e] = 0;
        d[e] = -1;
        a[e] = -1;
        c2 &= ~f;
      }
    }
    function Cc(a, b2) {
      var c2 = a.entangledLanes |= b2;
      for (a = a.entanglements; c2; ) {
        var d = 31 - oc(c2), e = 1 << d;
        e & b2 | a[d] & b2 && (a[d] |= b2);
        c2 &= ~e;
      }
    }
    var C2 = 0;
    function Dc(a) {
      a &= -a;
      return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
    }
    var Ec;
    var Fc;
    var Gc;
    var Hc;
    var Ic;
    var Jc = false;
    var Kc = [];
    var Lc = null;
    var Mc = null;
    var Nc = null;
    var Oc = /* @__PURE__ */ new Map();
    var Pc = /* @__PURE__ */ new Map();
    var Qc = [];
    var Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
    function Sc(a, b2) {
      switch (a) {
        case "focusin":
        case "focusout":
          Lc = null;
          break;
        case "dragenter":
        case "dragleave":
          Mc = null;
          break;
        case "mouseover":
        case "mouseout":
          Nc = null;
          break;
        case "pointerover":
        case "pointerout":
          Oc.delete(b2.pointerId);
          break;
        case "gotpointercapture":
        case "lostpointercapture":
          Pc.delete(b2.pointerId);
      }
    }
    function Tc(a, b2, c2, d, e, f) {
      if (null === a || a.nativeEvent !== f) return a = { blockedOn: b2, domEventName: c2, eventSystemFlags: d, nativeEvent: f, targetContainers: [e] }, null !== b2 && (b2 = Cb(b2), null !== b2 && Fc(b2)), a;
      a.eventSystemFlags |= d;
      b2 = a.targetContainers;
      null !== e && -1 === b2.indexOf(e) && b2.push(e);
      return a;
    }
    function Uc(a, b2, c2, d, e) {
      switch (b2) {
        case "focusin":
          return Lc = Tc(Lc, a, b2, c2, d, e), true;
        case "dragenter":
          return Mc = Tc(Mc, a, b2, c2, d, e), true;
        case "mouseover":
          return Nc = Tc(Nc, a, b2, c2, d, e), true;
        case "pointerover":
          var f = e.pointerId;
          Oc.set(f, Tc(Oc.get(f) || null, a, b2, c2, d, e));
          return true;
        case "gotpointercapture":
          return f = e.pointerId, Pc.set(f, Tc(Pc.get(f) || null, a, b2, c2, d, e)), true;
      }
      return false;
    }
    function Vc(a) {
      var b2 = Wc(a.target);
      if (null !== b2) {
        var c2 = Vb(b2);
        if (null !== c2) {
          if (b2 = c2.tag, 13 === b2) {
            if (b2 = Wb(c2), null !== b2) {
              a.blockedOn = b2;
              Ic(a.priority, function() {
                Gc(c2);
              });
              return;
            }
          } else if (3 === b2 && c2.stateNode.current.memoizedState.isDehydrated) {
            a.blockedOn = 3 === c2.tag ? c2.stateNode.containerInfo : null;
            return;
          }
        }
      }
      a.blockedOn = null;
    }
    function Xc(a) {
      if (null !== a.blockedOn) return false;
      for (var b2 = a.targetContainers; 0 < b2.length; ) {
        var c2 = Yc(a.domEventName, a.eventSystemFlags, b2[0], a.nativeEvent);
        if (null === c2) {
          c2 = a.nativeEvent;
          var d = new c2.constructor(c2.type, c2);
          wb = d;
          c2.target.dispatchEvent(d);
          wb = null;
        } else return b2 = Cb(c2), null !== b2 && Fc(b2), a.blockedOn = c2, false;
        b2.shift();
      }
      return true;
    }
    function Zc(a, b2, c2) {
      Xc(a) && c2.delete(b2);
    }
    function $c() {
      Jc = false;
      null !== Lc && Xc(Lc) && (Lc = null);
      null !== Mc && Xc(Mc) && (Mc = null);
      null !== Nc && Xc(Nc) && (Nc = null);
      Oc.forEach(Zc);
      Pc.forEach(Zc);
    }
    function ad(a, b2) {
      a.blockedOn === b2 && (a.blockedOn = null, Jc || (Jc = true, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
    }
    function bd(a) {
      function b2(b3) {
        return ad(b3, a);
      }
      if (0 < Kc.length) {
        ad(Kc[0], a);
        for (var c2 = 1; c2 < Kc.length; c2++) {
          var d = Kc[c2];
          d.blockedOn === a && (d.blockedOn = null);
        }
      }
      null !== Lc && ad(Lc, a);
      null !== Mc && ad(Mc, a);
      null !== Nc && ad(Nc, a);
      Oc.forEach(b2);
      Pc.forEach(b2);
      for (c2 = 0; c2 < Qc.length; c2++) d = Qc[c2], d.blockedOn === a && (d.blockedOn = null);
      for (; 0 < Qc.length && (c2 = Qc[0], null === c2.blockedOn); ) Vc(c2), null === c2.blockedOn && Qc.shift();
    }
    var cd = ua.ReactCurrentBatchConfig;
    var dd = true;
    function ed(a, b2, c2, d) {
      var e = C2, f = cd.transition;
      cd.transition = null;
      try {
        C2 = 1, fd(a, b2, c2, d);
      } finally {
        C2 = e, cd.transition = f;
      }
    }
    function gd(a, b2, c2, d) {
      var e = C2, f = cd.transition;
      cd.transition = null;
      try {
        C2 = 4, fd(a, b2, c2, d);
      } finally {
        C2 = e, cd.transition = f;
      }
    }
    function fd(a, b2, c2, d) {
      if (dd) {
        var e = Yc(a, b2, c2, d);
        if (null === e) hd(a, b2, d, id3, c2), Sc(a, d);
        else if (Uc(e, a, b2, c2, d)) d.stopPropagation();
        else if (Sc(a, d), b2 & 4 && -1 < Rc.indexOf(a)) {
          for (; null !== e; ) {
            var f = Cb(e);
            null !== f && Ec(f);
            f = Yc(a, b2, c2, d);
            null === f && hd(a, b2, d, id3, c2);
            if (f === e) break;
            e = f;
          }
          null !== e && d.stopPropagation();
        } else hd(a, b2, d, null, c2);
      }
    }
    var id3 = null;
    function Yc(a, b2, c2, d) {
      id3 = null;
      a = xb(d);
      a = Wc(a);
      if (null !== a) if (b2 = Vb(a), null === b2) a = null;
      else if (c2 = b2.tag, 13 === c2) {
        a = Wb(b2);
        if (null !== a) return a;
        a = null;
      } else if (3 === c2) {
        if (b2.stateNode.current.memoizedState.isDehydrated) return 3 === b2.tag ? b2.stateNode.containerInfo : null;
        a = null;
      } else b2 !== a && (a = null);
      id3 = a;
      return null;
    }
    function jd(a) {
      switch (a) {
        case "cancel":
        case "click":
        case "close":
        case "contextmenu":
        case "copy":
        case "cut":
        case "auxclick":
        case "dblclick":
        case "dragend":
        case "dragstart":
        case "drop":
        case "focusin":
        case "focusout":
        case "input":
        case "invalid":
        case "keydown":
        case "keypress":
        case "keyup":
        case "mousedown":
        case "mouseup":
        case "paste":
        case "pause":
        case "play":
        case "pointercancel":
        case "pointerdown":
        case "pointerup":
        case "ratechange":
        case "reset":
        case "resize":
        case "seeked":
        case "submit":
        case "touchcancel":
        case "touchend":
        case "touchstart":
        case "volumechange":
        case "change":
        case "selectionchange":
        case "textInput":
        case "compositionstart":
        case "compositionend":
        case "compositionupdate":
        case "beforeblur":
        case "afterblur":
        case "beforeinput":
        case "blur":
        case "fullscreenchange":
        case "focus":
        case "hashchange":
        case "popstate":
        case "select":
        case "selectstart":
          return 1;
        case "drag":
        case "dragenter":
        case "dragexit":
        case "dragleave":
        case "dragover":
        case "mousemove":
        case "mouseout":
        case "mouseover":
        case "pointermove":
        case "pointerout":
        case "pointerover":
        case "scroll":
        case "toggle":
        case "touchmove":
        case "wheel":
        case "mouseenter":
        case "mouseleave":
        case "pointerenter":
        case "pointerleave":
          return 4;
        case "message":
          switch (ec()) {
            case fc:
              return 1;
            case gc:
              return 4;
            case hc:
            case ic:
              return 16;
            case jc:
              return 536870912;
            default:
              return 16;
          }
        default:
          return 16;
      }
    }
    var kd = null;
    var ld = null;
    var md = null;
    function nd() {
      if (md) return md;
      var a, b2 = ld, c2 = b2.length, d, e = "value" in kd ? kd.value : kd.textContent, f = e.length;
      for (a = 0; a < c2 && b2[a] === e[a]; a++) ;
      var g = c2 - a;
      for (d = 1; d <= g && b2[c2 - d] === e[f - d]; d++) ;
      return md = e.slice(a, 1 < d ? 1 - d : void 0);
    }
    function od(a) {
      var b2 = a.keyCode;
      "charCode" in a ? (a = a.charCode, 0 === a && 13 === b2 && (a = 13)) : a = b2;
      10 === a && (a = 13);
      return 32 <= a || 13 === a ? a : 0;
    }
    function pd() {
      return true;
    }
    function qd() {
      return false;
    }
    function rd(a) {
      function b2(b3, d, e, f, g) {
        this._reactName = b3;
        this._targetInst = e;
        this.type = d;
        this.nativeEvent = f;
        this.target = g;
        this.currentTarget = null;
        for (var c2 in a) a.hasOwnProperty(c2) && (b3 = a[c2], this[c2] = b3 ? b3(f) : f[c2]);
        this.isDefaultPrevented = (null != f.defaultPrevented ? f.defaultPrevented : false === f.returnValue) ? pd : qd;
        this.isPropagationStopped = qd;
        return this;
      }
      A2(b2.prototype, { preventDefault: function() {
        this.defaultPrevented = true;
        var a2 = this.nativeEvent;
        a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd);
      }, stopPropagation: function() {
        var a2 = this.nativeEvent;
        a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd);
      }, persist: function() {
      }, isPersistent: pd });
      return b2;
    }
    var sd = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
      return a.timeStamp || Date.now();
    }, defaultPrevented: 0, isTrusted: 0 };
    var td = rd(sd);
    var ud = A2({}, sd, { view: 0, detail: 0 });
    var vd = rd(ud);
    var wd;
    var xd;
    var yd;
    var Ad = A2({}, ud, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
      return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
    }, movementX: function(a) {
      if ("movementX" in a) return a.movementX;
      a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
      return wd;
    }, movementY: function(a) {
      return "movementY" in a ? a.movementY : xd;
    } });
    var Bd = rd(Ad);
    var Cd = A2({}, Ad, { dataTransfer: 0 });
    var Dd = rd(Cd);
    var Ed = A2({}, ud, { relatedTarget: 0 });
    var Fd = rd(Ed);
    var Gd = A2({}, sd, { animationName: 0, elapsedTime: 0, pseudoElement: 0 });
    var Hd = rd(Gd);
    var Id = A2({}, sd, { clipboardData: function(a) {
      return "clipboardData" in a ? a.clipboardData : window.clipboardData;
    } });
    var Jd = rd(Id);
    var Kd = A2({}, sd, { data: 0 });
    var Ld = rd(Kd);
    var Md = {
      Esc: "Escape",
      Spacebar: " ",
      Left: "ArrowLeft",
      Up: "ArrowUp",
      Right: "ArrowRight",
      Down: "ArrowDown",
      Del: "Delete",
      Win: "OS",
      Menu: "ContextMenu",
      Apps: "ContextMenu",
      Scroll: "ScrollLock",
      MozPrintableKey: "Unidentified"
    };
    var Nd = {
      8: "Backspace",
      9: "Tab",
      12: "Clear",
      13: "Enter",
      16: "Shift",
      17: "Control",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: " ",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      45: "Insert",
      46: "Delete",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      224: "Meta"
    };
    var Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
    function Pd(a) {
      var b2 = this.nativeEvent;
      return b2.getModifierState ? b2.getModifierState(a) : (a = Od[a]) ? !!b2[a] : false;
    }
    function zd() {
      return Pd;
    }
    var Qd = A2({}, ud, { key: function(a) {
      if (a.key) {
        var b2 = Md[a.key] || a.key;
        if ("Unidentified" !== b2) return b2;
      }
      return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
    }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
      return "keypress" === a.type ? od(a) : 0;
    }, keyCode: function(a) {
      return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
    }, which: function(a) {
      return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
    } });
    var Rd = rd(Qd);
    var Sd = A2({}, Ad, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 });
    var Td = rd(Sd);
    var Ud = A2({}, ud, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd });
    var Vd = rd(Ud);
    var Wd = A2({}, sd, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 });
    var Xd = rd(Wd);
    var Yd = A2({}, Ad, {
      deltaX: function(a) {
        return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
      },
      deltaY: function(a) {
        return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
      },
      deltaZ: 0,
      deltaMode: 0
    });
    var Zd = rd(Yd);
    var $d = [9, 13, 27, 32];
    var ae3 = ia && "CompositionEvent" in window;
    var be3 = null;
    ia && "documentMode" in document && (be3 = document.documentMode);
    var ce3 = ia && "TextEvent" in window && !be3;
    var de2 = ia && (!ae3 || be3 && 8 < be3 && 11 >= be3);
    var ee3 = String.fromCharCode(32);
    var fe3 = false;
    function ge3(a, b2) {
      switch (a) {
        case "keyup":
          return -1 !== $d.indexOf(b2.keyCode);
        case "keydown":
          return 229 !== b2.keyCode;
        case "keypress":
        case "mousedown":
        case "focusout":
          return true;
        default:
          return false;
      }
    }
    function he2(a) {
      a = a.detail;
      return "object" === typeof a && "data" in a ? a.data : null;
    }
    var ie3 = false;
    function je2(a, b2) {
      switch (a) {
        case "compositionend":
          return he2(b2);
        case "keypress":
          if (32 !== b2.which) return null;
          fe3 = true;
          return ee3;
        case "textInput":
          return a = b2.data, a === ee3 && fe3 ? null : a;
        default:
          return null;
      }
    }
    function ke2(a, b2) {
      if (ie3) return "compositionend" === a || !ae3 && ge3(a, b2) ? (a = nd(), md = ld = kd = null, ie3 = false, a) : null;
      switch (a) {
        case "paste":
          return null;
        case "keypress":
          if (!(b2.ctrlKey || b2.altKey || b2.metaKey) || b2.ctrlKey && b2.altKey) {
            if (b2.char && 1 < b2.char.length) return b2.char;
            if (b2.which) return String.fromCharCode(b2.which);
          }
          return null;
        case "compositionend":
          return de2 && "ko" !== b2.locale ? null : b2.data;
        default:
          return null;
      }
    }
    var le2 = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
    function me2(a) {
      var b2 = a && a.nodeName && a.nodeName.toLowerCase();
      return "input" === b2 ? !!le2[a.type] : "textarea" === b2 ? true : false;
    }
    function ne2(a, b2, c2, d) {
      Eb(d);
      b2 = oe3(b2, "onChange");
      0 < b2.length && (c2 = new td("onChange", "change", null, c2, d), a.push({ event: c2, listeners: b2 }));
    }
    var pe2 = null;
    var qe2 = null;
    function re3(a) {
      se3(a, 0);
    }
    function te3(a) {
      var b2 = ue3(a);
      if (Wa(b2)) return a;
    }
    function ve2(a, b2) {
      if ("change" === a) return b2;
    }
    var we2 = false;
    if (ia) {
      if (ia) {
        ye2 = "oninput" in document;
        if (!ye2) {
          ze3 = document.createElement("div");
          ze3.setAttribute("oninput", "return;");
          ye2 = "function" === typeof ze3.oninput;
        }
        xe4 = ye2;
      } else xe4 = false;
      we2 = xe4 && (!document.documentMode || 9 < document.documentMode);
    }
    var xe4;
    var ye2;
    var ze3;
    function Ae2() {
      pe2 && (pe2.detachEvent("onpropertychange", Be), qe2 = pe2 = null);
    }
    function Be(a) {
      if ("value" === a.propertyName && te3(qe2)) {
        var b2 = [];
        ne2(b2, qe2, a, xb(a));
        Jb(re3, b2);
      }
    }
    function Ce3(a, b2, c2) {
      "focusin" === a ? (Ae2(), pe2 = b2, qe2 = c2, pe2.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae2();
    }
    function De2(a) {
      if ("selectionchange" === a || "keyup" === a || "keydown" === a) return te3(qe2);
    }
    function Ee2(a, b2) {
      if ("click" === a) return te3(b2);
    }
    function Fe2(a, b2) {
      if ("input" === a || "change" === a) return te3(b2);
    }
    function Ge2(a, b2) {
      return a === b2 && (0 !== a || 1 / a === 1 / b2) || a !== a && b2 !== b2;
    }
    var He2 = "function" === typeof Object.is ? Object.is : Ge2;
    function Ie2(a, b2) {
      if (He2(a, b2)) return true;
      if ("object" !== typeof a || null === a || "object" !== typeof b2 || null === b2) return false;
      var c2 = Object.keys(a), d = Object.keys(b2);
      if (c2.length !== d.length) return false;
      for (d = 0; d < c2.length; d++) {
        var e = c2[d];
        if (!ja.call(b2, e) || !He2(a[e], b2[e])) return false;
      }
      return true;
    }
    function Je2(a) {
      for (; a && a.firstChild; ) a = a.firstChild;
      return a;
    }
    function Ke2(a, b2) {
      var c2 = Je2(a);
      a = 0;
      for (var d; c2; ) {
        if (3 === c2.nodeType) {
          d = a + c2.textContent.length;
          if (a <= b2 && d >= b2) return { node: c2, offset: b2 - a };
          a = d;
        }
        a: {
          for (; c2; ) {
            if (c2.nextSibling) {
              c2 = c2.nextSibling;
              break a;
            }
            c2 = c2.parentNode;
          }
          c2 = void 0;
        }
        c2 = Je2(c2);
      }
    }
    function Le2(a, b2) {
      return a && b2 ? a === b2 ? true : a && 3 === a.nodeType ? false : b2 && 3 === b2.nodeType ? Le2(a, b2.parentNode) : "contains" in a ? a.contains(b2) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b2) & 16) : false : false;
    }
    function Me3() {
      for (var a = window, b2 = Xa(); b2 instanceof a.HTMLIFrameElement; ) {
        try {
          var c2 = "string" === typeof b2.contentWindow.location.href;
        } catch (d) {
          c2 = false;
        }
        if (c2) a = b2.contentWindow;
        else break;
        b2 = Xa(a.document);
      }
      return b2;
    }
    function Ne3(a) {
      var b2 = a && a.nodeName && a.nodeName.toLowerCase();
      return b2 && ("input" === b2 && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b2 || "true" === a.contentEditable);
    }
    function Oe2(a) {
      var b2 = Me3(), c2 = a.focusedElem, d = a.selectionRange;
      if (b2 !== c2 && c2 && c2.ownerDocument && Le2(c2.ownerDocument.documentElement, c2)) {
        if (null !== d && Ne3(c2)) {
          if (b2 = d.start, a = d.end, void 0 === a && (a = b2), "selectionStart" in c2) c2.selectionStart = b2, c2.selectionEnd = Math.min(a, c2.value.length);
          else if (a = (b2 = c2.ownerDocument || document) && b2.defaultView || window, a.getSelection) {
            a = a.getSelection();
            var e = c2.textContent.length, f = Math.min(d.start, e);
            d = void 0 === d.end ? f : Math.min(d.end, e);
            !a.extend && f > d && (e = d, d = f, f = e);
            e = Ke2(c2, f);
            var g = Ke2(
              c2,
              d
            );
            e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b2 = b2.createRange(), b2.setStart(e.node, e.offset), a.removeAllRanges(), f > d ? (a.addRange(b2), a.extend(g.node, g.offset)) : (b2.setEnd(g.node, g.offset), a.addRange(b2)));
          }
        }
        b2 = [];
        for (a = c2; a = a.parentNode; ) 1 === a.nodeType && b2.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
        "function" === typeof c2.focus && c2.focus();
        for (c2 = 0; c2 < b2.length; c2++) a = b2[c2], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
      }
    }
    var Pe3 = ia && "documentMode" in document && 11 >= document.documentMode;
    var Qe2 = null;
    var Re3 = null;
    var Se3 = null;
    var Te2 = false;
    function Ue2(a, b2, c2) {
      var d = c2.window === c2 ? c2.document : 9 === c2.nodeType ? c2 : c2.ownerDocument;
      Te2 || null == Qe2 || Qe2 !== Xa(d) || (d = Qe2, "selectionStart" in d && Ne3(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se3 && Ie2(Se3, d) || (Se3 = d, d = oe3(Re3, "onSelect"), 0 < d.length && (b2 = new td("onSelect", "select", null, b2, c2), a.push({ event: b2, listeners: d }), b2.target = Qe2)));
    }
    function Ve(a, b2) {
      var c2 = {};
      c2[a.toLowerCase()] = b2.toLowerCase();
      c2["Webkit" + a] = "webkit" + b2;
      c2["Moz" + a] = "moz" + b2;
      return c2;
    }
    var We2 = { animationend: Ve("Animation", "AnimationEnd"), animationiteration: Ve("Animation", "AnimationIteration"), animationstart: Ve("Animation", "AnimationStart"), transitionend: Ve("Transition", "TransitionEnd") };
    var Xe2 = {};
    var Ye = {};
    ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We2.animationend.animation, delete We2.animationiteration.animation, delete We2.animationstart.animation), "TransitionEvent" in window || delete We2.transitionend.transition);
    function Ze3(a) {
      if (Xe2[a]) return Xe2[a];
      if (!We2[a]) return a;
      var b2 = We2[a], c2;
      for (c2 in b2) if (b2.hasOwnProperty(c2) && c2 in Ye) return Xe2[a] = b2[c2];
      return a;
    }
    var $e2 = Ze3("animationend");
    var af = Ze3("animationiteration");
    var bf = Ze3("animationstart");
    var cf = Ze3("transitionend");
    var df = /* @__PURE__ */ new Map();
    var ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
    function ff(a, b2) {
      df.set(a, b2);
      fa(b2, [a]);
    }
    for (gf = 0; gf < ef.length; gf++) {
      hf = ef[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
      ff(jf, "on" + kf);
    }
    var hf;
    var jf;
    var kf;
    var gf;
    ff($e2, "onAnimationEnd");
    ff(af, "onAnimationIteration");
    ff(bf, "onAnimationStart");
    ff("dblclick", "onDoubleClick");
    ff("focusin", "onFocus");
    ff("focusout", "onBlur");
    ff(cf, "onTransitionEnd");
    ha("onMouseEnter", ["mouseout", "mouseover"]);
    ha("onMouseLeave", ["mouseout", "mouseover"]);
    ha("onPointerEnter", ["pointerout", "pointerover"]);
    ha("onPointerLeave", ["pointerout", "pointerover"]);
    fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
    fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
    fa("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
    fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
    fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
    fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
    var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
    var mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
    function nf(a, b2, c2) {
      var d = a.type || "unknown-event";
      a.currentTarget = c2;
      Ub(d, b2, void 0, a);
      a.currentTarget = null;
    }
    function se3(a, b2) {
      b2 = 0 !== (b2 & 4);
      for (var c2 = 0; c2 < a.length; c2++) {
        var d = a[c2], e = d.event;
        d = d.listeners;
        a: {
          var f = void 0;
          if (b2) for (var g = d.length - 1; 0 <= g; g--) {
            var h = d[g], k2 = h.instance, l2 = h.currentTarget;
            h = h.listener;
            if (k2 !== f && e.isPropagationStopped()) break a;
            nf(e, h, l2);
            f = k2;
          }
          else for (g = 0; g < d.length; g++) {
            h = d[g];
            k2 = h.instance;
            l2 = h.currentTarget;
            h = h.listener;
            if (k2 !== f && e.isPropagationStopped()) break a;
            nf(e, h, l2);
            f = k2;
          }
        }
      }
      if (Qb) throw a = Rb, Qb = false, Rb = null, a;
    }
    function D2(a, b2) {
      var c2 = b2[of];
      void 0 === c2 && (c2 = b2[of] = /* @__PURE__ */ new Set());
      var d = a + "__bubble";
      c2.has(d) || (pf(b2, a, 2, false), c2.add(d));
    }
    function qf(a, b2, c2) {
      var d = 0;
      b2 && (d |= 4);
      pf(c2, a, d, b2);
    }
    var rf = "_reactListening" + Math.random().toString(36).slice(2);
    function sf(a) {
      if (!a[rf]) {
        a[rf] = true;
        da.forEach(function(b3) {
          "selectionchange" !== b3 && (mf.has(b3) || qf(b3, false, a), qf(b3, true, a));
        });
        var b2 = 9 === a.nodeType ? a : a.ownerDocument;
        null === b2 || b2[rf] || (b2[rf] = true, qf("selectionchange", false, b2));
      }
    }
    function pf(a, b2, c2, d) {
      switch (jd(b2)) {
        case 1:
          var e = ed;
          break;
        case 4:
          e = gd;
          break;
        default:
          e = fd;
      }
      c2 = e.bind(null, b2, c2, a);
      e = void 0;
      !Lb || "touchstart" !== b2 && "touchmove" !== b2 && "wheel" !== b2 || (e = true);
      d ? void 0 !== e ? a.addEventListener(b2, c2, { capture: true, passive: e }) : a.addEventListener(b2, c2, true) : void 0 !== e ? a.addEventListener(b2, c2, { passive: e }) : a.addEventListener(b2, c2, false);
    }
    function hd(a, b2, c2, d, e) {
      var f = d;
      if (0 === (b2 & 1) && 0 === (b2 & 2) && null !== d) a: for (; ; ) {
        if (null === d) return;
        var g = d.tag;
        if (3 === g || 4 === g) {
          var h = d.stateNode.containerInfo;
          if (h === e || 8 === h.nodeType && h.parentNode === e) break;
          if (4 === g) for (g = d.return; null !== g; ) {
            var k2 = g.tag;
            if (3 === k2 || 4 === k2) {
              if (k2 = g.stateNode.containerInfo, k2 === e || 8 === k2.nodeType && k2.parentNode === e) return;
            }
            g = g.return;
          }
          for (; null !== h; ) {
            g = Wc(h);
            if (null === g) return;
            k2 = g.tag;
            if (5 === k2 || 6 === k2) {
              d = f = g;
              continue a;
            }
            h = h.parentNode;
          }
        }
        d = d.return;
      }
      Jb(function() {
        var d2 = f, e2 = xb(c2), g2 = [];
        a: {
          var h2 = df.get(a);
          if (void 0 !== h2) {
            var k3 = td, n = a;
            switch (a) {
              case "keypress":
                if (0 === od(c2)) break a;
              case "keydown":
              case "keyup":
                k3 = Rd;
                break;
              case "focusin":
                n = "focus";
                k3 = Fd;
                break;
              case "focusout":
                n = "blur";
                k3 = Fd;
                break;
              case "beforeblur":
              case "afterblur":
                k3 = Fd;
                break;
              case "click":
                if (2 === c2.button) break a;
              case "auxclick":
              case "dblclick":
              case "mousedown":
              case "mousemove":
              case "mouseup":
              case "mouseout":
              case "mouseover":
              case "contextmenu":
                k3 = Bd;
                break;
              case "drag":
              case "dragend":
              case "dragenter":
              case "dragexit":
              case "dragleave":
              case "dragover":
              case "dragstart":
              case "drop":
                k3 = Dd;
                break;
              case "touchcancel":
              case "touchend":
              case "touchmove":
              case "touchstart":
                k3 = Vd;
                break;
              case $e2:
              case af:
              case bf:
                k3 = Hd;
                break;
              case cf:
                k3 = Xd;
                break;
              case "scroll":
                k3 = vd;
                break;
              case "wheel":
                k3 = Zd;
                break;
              case "copy":
              case "cut":
              case "paste":
                k3 = Jd;
                break;
              case "gotpointercapture":
              case "lostpointercapture":
              case "pointercancel":
              case "pointerdown":
              case "pointermove":
              case "pointerout":
              case "pointerover":
              case "pointerup":
                k3 = Td;
            }
            var t = 0 !== (b2 & 4), J3 = !t && "scroll" === a, x = t ? null !== h2 ? h2 + "Capture" : null : h2;
            t = [];
            for (var w = d2, u; null !== w; ) {
              u = w;
              var F2 = u.stateNode;
              5 === u.tag && null !== F2 && (u = F2, null !== x && (F2 = Kb(w, x), null != F2 && t.push(tf(w, F2, u))));
              if (J3) break;
              w = w.return;
            }
            0 < t.length && (h2 = new k3(h2, n, null, c2, e2), g2.push({ event: h2, listeners: t }));
          }
        }
        if (0 === (b2 & 7)) {
          a: {
            h2 = "mouseover" === a || "pointerover" === a;
            k3 = "mouseout" === a || "pointerout" === a;
            if (h2 && c2 !== wb && (n = c2.relatedTarget || c2.fromElement) && (Wc(n) || n[uf])) break a;
            if (k3 || h2) {
              h2 = e2.window === e2 ? e2 : (h2 = e2.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
              if (k3) {
                if (n = c2.relatedTarget || c2.toElement, k3 = d2, n = n ? Wc(n) : null, null !== n && (J3 = Vb(n), n !== J3 || 5 !== n.tag && 6 !== n.tag)) n = null;
              } else k3 = null, n = d2;
              if (k3 !== n) {
                t = Bd;
                F2 = "onMouseLeave";
                x = "onMouseEnter";
                w = "mouse";
                if ("pointerout" === a || "pointerover" === a) t = Td, F2 = "onPointerLeave", x = "onPointerEnter", w = "pointer";
                J3 = null == k3 ? h2 : ue3(k3);
                u = null == n ? h2 : ue3(n);
                h2 = new t(F2, w + "leave", k3, c2, e2);
                h2.target = J3;
                h2.relatedTarget = u;
                F2 = null;
                Wc(e2) === d2 && (t = new t(x, w + "enter", n, c2, e2), t.target = u, t.relatedTarget = J3, F2 = t);
                J3 = F2;
                if (k3 && n) b: {
                  t = k3;
                  x = n;
                  w = 0;
                  for (u = t; u; u = vf(u)) w++;
                  u = 0;
                  for (F2 = x; F2; F2 = vf(F2)) u++;
                  for (; 0 < w - u; ) t = vf(t), w--;
                  for (; 0 < u - w; ) x = vf(x), u--;
                  for (; w--; ) {
                    if (t === x || null !== x && t === x.alternate) break b;
                    t = vf(t);
                    x = vf(x);
                  }
                  t = null;
                }
                else t = null;
                null !== k3 && wf(g2, h2, k3, t, false);
                null !== n && null !== J3 && wf(g2, J3, n, t, true);
              }
            }
          }
          a: {
            h2 = d2 ? ue3(d2) : window;
            k3 = h2.nodeName && h2.nodeName.toLowerCase();
            if ("select" === k3 || "input" === k3 && "file" === h2.type) var na = ve2;
            else if (me2(h2)) if (we2) na = Fe2;
            else {
              na = De2;
              var xa = Ce3;
            }
            else (k3 = h2.nodeName) && "input" === k3.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na = Ee2);
            if (na && (na = na(a, d2))) {
              ne2(g2, na, c2, e2);
              break a;
            }
            xa && xa(a, h2, d2);
            "focusout" === a && (xa = h2._wrapperState) && xa.controlled && "number" === h2.type && cb(h2, "number", h2.value);
          }
          xa = d2 ? ue3(d2) : window;
          switch (a) {
            case "focusin":
              if (me2(xa) || "true" === xa.contentEditable) Qe2 = xa, Re3 = d2, Se3 = null;
              break;
            case "focusout":
              Se3 = Re3 = Qe2 = null;
              break;
            case "mousedown":
              Te2 = true;
              break;
            case "contextmenu":
            case "mouseup":
            case "dragend":
              Te2 = false;
              Ue2(g2, c2, e2);
              break;
            case "selectionchange":
              if (Pe3) break;
            case "keydown":
            case "keyup":
              Ue2(g2, c2, e2);
          }
          var $a;
          if (ae3) b: {
            switch (a) {
              case "compositionstart":
                var ba = "onCompositionStart";
                break b;
              case "compositionend":
                ba = "onCompositionEnd";
                break b;
              case "compositionupdate":
                ba = "onCompositionUpdate";
                break b;
            }
            ba = void 0;
          }
          else ie3 ? ge3(a, c2) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c2.keyCode && (ba = "onCompositionStart");
          ba && (de2 && "ko" !== c2.locale && (ie3 || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie3 && ($a = nd()) : (kd = e2, ld = "value" in kd ? kd.value : kd.textContent, ie3 = true)), xa = oe3(d2, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c2, e2), g2.push({ event: ba, listeners: xa }), $a ? ba.data = $a : ($a = he2(c2), null !== $a && (ba.data = $a))));
          if ($a = ce3 ? je2(a, c2) : ke2(a, c2)) d2 = oe3(d2, "onBeforeInput"), 0 < d2.length && (e2 = new Ld("onBeforeInput", "beforeinput", null, c2, e2), g2.push({ event: e2, listeners: d2 }), e2.data = $a);
        }
        se3(g2, b2);
      });
    }
    function tf(a, b2, c2) {
      return { instance: a, listener: b2, currentTarget: c2 };
    }
    function oe3(a, b2) {
      for (var c2 = b2 + "Capture", d = []; null !== a; ) {
        var e = a, f = e.stateNode;
        5 === e.tag && null !== f && (e = f, f = Kb(a, c2), null != f && d.unshift(tf(a, f, e)), f = Kb(a, b2), null != f && d.push(tf(a, f, e)));
        a = a.return;
      }
      return d;
    }
    function vf(a) {
      if (null === a) return null;
      do
        a = a.return;
      while (a && 5 !== a.tag);
      return a ? a : null;
    }
    function wf(a, b2, c2, d, e) {
      for (var f = b2._reactName, g = []; null !== c2 && c2 !== d; ) {
        var h = c2, k2 = h.alternate, l2 = h.stateNode;
        if (null !== k2 && k2 === d) break;
        5 === h.tag && null !== l2 && (h = l2, e ? (k2 = Kb(c2, f), null != k2 && g.unshift(tf(c2, k2, h))) : e || (k2 = Kb(c2, f), null != k2 && g.push(tf(c2, k2, h))));
        c2 = c2.return;
      }
      0 !== g.length && a.push({ event: b2, listeners: g });
    }
    var xf = /\r\n?/g;
    var yf = /\u0000|\uFFFD/g;
    function zf(a) {
      return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
    }
    function Af(a, b2, c2) {
      b2 = zf(b2);
      if (zf(a) !== b2 && c2) throw Error(p(425));
    }
    function Bf() {
    }
    var Cf = null;
    var Df = null;
    function Ef(a, b2) {
      return "textarea" === a || "noscript" === a || "string" === typeof b2.children || "number" === typeof b2.children || "object" === typeof b2.dangerouslySetInnerHTML && null !== b2.dangerouslySetInnerHTML && null != b2.dangerouslySetInnerHTML.__html;
    }
    var Ff = "function" === typeof setTimeout ? setTimeout : void 0;
    var Gf = "function" === typeof clearTimeout ? clearTimeout : void 0;
    var Hf = "function" === typeof Promise ? Promise : void 0;
    var Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
      return Hf.resolve(null).then(a).catch(If);
    } : Ff;
    function If(a) {
      setTimeout(function() {
        throw a;
      });
    }
    function Kf(a, b2) {
      var c2 = b2, d = 0;
      do {
        var e = c2.nextSibling;
        a.removeChild(c2);
        if (e && 8 === e.nodeType) if (c2 = e.data, "/$" === c2) {
          if (0 === d) {
            a.removeChild(e);
            bd(b2);
            return;
          }
          d--;
        } else "$" !== c2 && "$?" !== c2 && "$!" !== c2 || d++;
        c2 = e;
      } while (c2);
      bd(b2);
    }
    function Lf(a) {
      for (; null != a; a = a.nextSibling) {
        var b2 = a.nodeType;
        if (1 === b2 || 3 === b2) break;
        if (8 === b2) {
          b2 = a.data;
          if ("$" === b2 || "$!" === b2 || "$?" === b2) break;
          if ("/$" === b2) return null;
        }
      }
      return a;
    }
    function Mf(a) {
      a = a.previousSibling;
      for (var b2 = 0; a; ) {
        if (8 === a.nodeType) {
          var c2 = a.data;
          if ("$" === c2 || "$!" === c2 || "$?" === c2) {
            if (0 === b2) return a;
            b2--;
          } else "/$" === c2 && b2++;
        }
        a = a.previousSibling;
      }
      return null;
    }
    var Nf = Math.random().toString(36).slice(2);
    var Of = "__reactFiber$" + Nf;
    var Pf = "__reactProps$" + Nf;
    var uf = "__reactContainer$" + Nf;
    var of = "__reactEvents$" + Nf;
    var Qf = "__reactListeners$" + Nf;
    var Rf = "__reactHandles$" + Nf;
    function Wc(a) {
      var b2 = a[Of];
      if (b2) return b2;
      for (var c2 = a.parentNode; c2; ) {
        if (b2 = c2[uf] || c2[Of]) {
          c2 = b2.alternate;
          if (null !== b2.child || null !== c2 && null !== c2.child) for (a = Mf(a); null !== a; ) {
            if (c2 = a[Of]) return c2;
            a = Mf(a);
          }
          return b2;
        }
        a = c2;
        c2 = a.parentNode;
      }
      return null;
    }
    function Cb(a) {
      a = a[Of] || a[uf];
      return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
    }
    function ue3(a) {
      if (5 === a.tag || 6 === a.tag) return a.stateNode;
      throw Error(p(33));
    }
    function Db(a) {
      return a[Pf] || null;
    }
    var Sf = [];
    var Tf = -1;
    function Uf(a) {
      return { current: a };
    }
    function E3(a) {
      0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
    }
    function G3(a, b2) {
      Tf++;
      Sf[Tf] = a.current;
      a.current = b2;
    }
    var Vf = {};
    var H3 = Uf(Vf);
    var Wf = Uf(false);
    var Xf = Vf;
    function Yf(a, b2) {
      var c2 = a.type.contextTypes;
      if (!c2) return Vf;
      var d = a.stateNode;
      if (d && d.__reactInternalMemoizedUnmaskedChildContext === b2) return d.__reactInternalMemoizedMaskedChildContext;
      var e = {}, f;
      for (f in c2) e[f] = b2[f];
      d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b2, a.__reactInternalMemoizedMaskedChildContext = e);
      return e;
    }
    function Zf(a) {
      a = a.childContextTypes;
      return null !== a && void 0 !== a;
    }
    function $f() {
      E3(Wf);
      E3(H3);
    }
    function ag(a, b2, c2) {
      if (H3.current !== Vf) throw Error(p(168));
      G3(H3, b2);
      G3(Wf, c2);
    }
    function bg(a, b2, c2) {
      var d = a.stateNode;
      b2 = b2.childContextTypes;
      if ("function" !== typeof d.getChildContext) return c2;
      d = d.getChildContext();
      for (var e in d) if (!(e in b2)) throw Error(p(108, Ra(a) || "Unknown", e));
      return A2({}, c2, d);
    }
    function cg(a) {
      a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
      Xf = H3.current;
      G3(H3, a);
      G3(Wf, Wf.current);
      return true;
    }
    function dg(a, b2, c2) {
      var d = a.stateNode;
      if (!d) throw Error(p(169));
      c2 ? (a = bg(a, b2, Xf), d.__reactInternalMemoizedMergedChildContext = a, E3(Wf), E3(H3), G3(H3, a)) : E3(Wf);
      G3(Wf, c2);
    }
    var eg = null;
    var fg = false;
    var gg = false;
    function hg(a) {
      null === eg ? eg = [a] : eg.push(a);
    }
    function ig(a) {
      fg = true;
      hg(a);
    }
    function jg() {
      if (!gg && null !== eg) {
        gg = true;
        var a = 0, b2 = C2;
        try {
          var c2 = eg;
          for (C2 = 1; a < c2.length; a++) {
            var d = c2[a];
            do
              d = d(true);
            while (null !== d);
          }
          eg = null;
          fg = false;
        } catch (e) {
          throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
        } finally {
          C2 = b2, gg = false;
        }
      }
      return null;
    }
    var kg = [];
    var lg = 0;
    var mg = null;
    var ng = 0;
    var og = [];
    var pg = 0;
    var qg = null;
    var rg = 1;
    var sg = "";
    function tg(a, b2) {
      kg[lg++] = ng;
      kg[lg++] = mg;
      mg = a;
      ng = b2;
    }
    function ug(a, b2, c2) {
      og[pg++] = rg;
      og[pg++] = sg;
      og[pg++] = qg;
      qg = a;
      var d = rg;
      a = sg;
      var e = 32 - oc(d) - 1;
      d &= ~(1 << e);
      c2 += 1;
      var f = 32 - oc(b2) + e;
      if (30 < f) {
        var g = e - e % 5;
        f = (d & (1 << g) - 1).toString(32);
        d >>= g;
        e -= g;
        rg = 1 << 32 - oc(b2) + e | c2 << e | d;
        sg = f + a;
      } else rg = 1 << f | c2 << e | d, sg = a;
    }
    function vg(a) {
      null !== a.return && (tg(a, 1), ug(a, 1, 0));
    }
    function wg(a) {
      for (; a === mg; ) mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
      for (; a === qg; ) qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
    }
    var xg = null;
    var yg = null;
    var I3 = false;
    var zg = null;
    function Ag(a, b2) {
      var c2 = Bg(5, null, null, 0);
      c2.elementType = "DELETED";
      c2.stateNode = b2;
      c2.return = a;
      b2 = a.deletions;
      null === b2 ? (a.deletions = [c2], a.flags |= 16) : b2.push(c2);
    }
    function Cg(a, b2) {
      switch (a.tag) {
        case 5:
          var c2 = a.type;
          b2 = 1 !== b2.nodeType || c2.toLowerCase() !== b2.nodeName.toLowerCase() ? null : b2;
          return null !== b2 ? (a.stateNode = b2, xg = a, yg = Lf(b2.firstChild), true) : false;
        case 6:
          return b2 = "" === a.pendingProps || 3 !== b2.nodeType ? null : b2, null !== b2 ? (a.stateNode = b2, xg = a, yg = null, true) : false;
        case 13:
          return b2 = 8 !== b2.nodeType ? null : b2, null !== b2 ? (c2 = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b2, treeContext: c2, retryLane: 1073741824 }, c2 = Bg(18, null, null, 0), c2.stateNode = b2, c2.return = a, a.child = c2, xg = a, yg = null, true) : false;
        default:
          return false;
      }
    }
    function Dg(a) {
      return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
    }
    function Eg(a) {
      if (I3) {
        var b2 = yg;
        if (b2) {
          var c2 = b2;
          if (!Cg(a, b2)) {
            if (Dg(a)) throw Error(p(418));
            b2 = Lf(c2.nextSibling);
            var d = xg;
            b2 && Cg(a, b2) ? Ag(d, c2) : (a.flags = a.flags & -4097 | 2, I3 = false, xg = a);
          }
        } else {
          if (Dg(a)) throw Error(p(418));
          a.flags = a.flags & -4097 | 2;
          I3 = false;
          xg = a;
        }
      }
    }
    function Fg(a) {
      for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; ) a = a.return;
      xg = a;
    }
    function Gg(a) {
      if (a !== xg) return false;
      if (!I3) return Fg(a), I3 = true, false;
      var b2;
      (b2 = 3 !== a.tag) && !(b2 = 5 !== a.tag) && (b2 = a.type, b2 = "head" !== b2 && "body" !== b2 && !Ef(a.type, a.memoizedProps));
      if (b2 && (b2 = yg)) {
        if (Dg(a)) throw Hg(), Error(p(418));
        for (; b2; ) Ag(a, b2), b2 = Lf(b2.nextSibling);
      }
      Fg(a);
      if (13 === a.tag) {
        a = a.memoizedState;
        a = null !== a ? a.dehydrated : null;
        if (!a) throw Error(p(317));
        a: {
          a = a.nextSibling;
          for (b2 = 0; a; ) {
            if (8 === a.nodeType) {
              var c2 = a.data;
              if ("/$" === c2) {
                if (0 === b2) {
                  yg = Lf(a.nextSibling);
                  break a;
                }
                b2--;
              } else "$" !== c2 && "$!" !== c2 && "$?" !== c2 || b2++;
            }
            a = a.nextSibling;
          }
          yg = null;
        }
      } else yg = xg ? Lf(a.stateNode.nextSibling) : null;
      return true;
    }
    function Hg() {
      for (var a = yg; a; ) a = Lf(a.nextSibling);
    }
    function Ig() {
      yg = xg = null;
      I3 = false;
    }
    function Jg(a) {
      null === zg ? zg = [a] : zg.push(a);
    }
    var Kg = ua.ReactCurrentBatchConfig;
    function Lg(a, b2, c2) {
      a = c2.ref;
      if (null !== a && "function" !== typeof a && "object" !== typeof a) {
        if (c2._owner) {
          c2 = c2._owner;
          if (c2) {
            if (1 !== c2.tag) throw Error(p(309));
            var d = c2.stateNode;
          }
          if (!d) throw Error(p(147, a));
          var e = d, f = "" + a;
          if (null !== b2 && null !== b2.ref && "function" === typeof b2.ref && b2.ref._stringRef === f) return b2.ref;
          b2 = function(a2) {
            var b3 = e.refs;
            null === a2 ? delete b3[f] : b3[f] = a2;
          };
          b2._stringRef = f;
          return b2;
        }
        if ("string" !== typeof a) throw Error(p(284));
        if (!c2._owner) throw Error(p(290, a));
      }
      return a;
    }
    function Mg(a, b2) {
      a = Object.prototype.toString.call(b2);
      throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b2).join(", ") + "}" : a));
    }
    function Ng(a) {
      var b2 = a._init;
      return b2(a._payload);
    }
    function Og(a) {
      function b2(b3, c3) {
        if (a) {
          var d2 = b3.deletions;
          null === d2 ? (b3.deletions = [c3], b3.flags |= 16) : d2.push(c3);
        }
      }
      function c2(c3, d2) {
        if (!a) return null;
        for (; null !== d2; ) b2(c3, d2), d2 = d2.sibling;
        return null;
      }
      function d(a2, b3) {
        for (a2 = /* @__PURE__ */ new Map(); null !== b3; ) null !== b3.key ? a2.set(b3.key, b3) : a2.set(b3.index, b3), b3 = b3.sibling;
        return a2;
      }
      function e(a2, b3) {
        a2 = Pg(a2, b3);
        a2.index = 0;
        a2.sibling = null;
        return a2;
      }
      function f(b3, c3, d2) {
        b3.index = d2;
        if (!a) return b3.flags |= 1048576, c3;
        d2 = b3.alternate;
        if (null !== d2) return d2 = d2.index, d2 < c3 ? (b3.flags |= 2, c3) : d2;
        b3.flags |= 2;
        return c3;
      }
      function g(b3) {
        a && null === b3.alternate && (b3.flags |= 2);
        return b3;
      }
      function h(a2, b3, c3, d2) {
        if (null === b3 || 6 !== b3.tag) return b3 = Qg(c3, a2.mode, d2), b3.return = a2, b3;
        b3 = e(b3, c3);
        b3.return = a2;
        return b3;
      }
      function k2(a2, b3, c3, d2) {
        var f2 = c3.type;
        if (f2 === ya) return m(a2, b3, c3.props.children, d2, c3.key);
        if (null !== b3 && (b3.elementType === f2 || "object" === typeof f2 && null !== f2 && f2.$$typeof === Ha && Ng(f2) === b3.type)) return d2 = e(b3, c3.props), d2.ref = Lg(a2, b3, c3), d2.return = a2, d2;
        d2 = Rg(c3.type, c3.key, c3.props, null, a2.mode, d2);
        d2.ref = Lg(a2, b3, c3);
        d2.return = a2;
        return d2;
      }
      function l2(a2, b3, c3, d2) {
        if (null === b3 || 4 !== b3.tag || b3.stateNode.containerInfo !== c3.containerInfo || b3.stateNode.implementation !== c3.implementation) return b3 = Sg(c3, a2.mode, d2), b3.return = a2, b3;
        b3 = e(b3, c3.children || []);
        b3.return = a2;
        return b3;
      }
      function m(a2, b3, c3, d2, f2) {
        if (null === b3 || 7 !== b3.tag) return b3 = Tg(c3, a2.mode, d2, f2), b3.return = a2, b3;
        b3 = e(b3, c3);
        b3.return = a2;
        return b3;
      }
      function q2(a2, b3, c3) {
        if ("string" === typeof b3 && "" !== b3 || "number" === typeof b3) return b3 = Qg("" + b3, a2.mode, c3), b3.return = a2, b3;
        if ("object" === typeof b3 && null !== b3) {
          switch (b3.$$typeof) {
            case va:
              return c3 = Rg(b3.type, b3.key, b3.props, null, a2.mode, c3), c3.ref = Lg(a2, null, b3), c3.return = a2, c3;
            case wa:
              return b3 = Sg(b3, a2.mode, c3), b3.return = a2, b3;
            case Ha:
              var d2 = b3._init;
              return q2(a2, d2(b3._payload), c3);
          }
          if (eb(b3) || Ka(b3)) return b3 = Tg(b3, a2.mode, c3, null), b3.return = a2, b3;
          Mg(a2, b3);
        }
        return null;
      }
      function r(a2, b3, c3, d2) {
        var e2 = null !== b3 ? b3.key : null;
        if ("string" === typeof c3 && "" !== c3 || "number" === typeof c3) return null !== e2 ? null : h(a2, b3, "" + c3, d2);
        if ("object" === typeof c3 && null !== c3) {
          switch (c3.$$typeof) {
            case va:
              return c3.key === e2 ? k2(a2, b3, c3, d2) : null;
            case wa:
              return c3.key === e2 ? l2(a2, b3, c3, d2) : null;
            case Ha:
              return e2 = c3._init, r(
                a2,
                b3,
                e2(c3._payload),
                d2
              );
          }
          if (eb(c3) || Ka(c3)) return null !== e2 ? null : m(a2, b3, c3, d2, null);
          Mg(a2, c3);
        }
        return null;
      }
      function y2(a2, b3, c3, d2, e2) {
        if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2) return a2 = a2.get(c3) || null, h(b3, a2, "" + d2, e2);
        if ("object" === typeof d2 && null !== d2) {
          switch (d2.$$typeof) {
            case va:
              return a2 = a2.get(null === d2.key ? c3 : d2.key) || null, k2(b3, a2, d2, e2);
            case wa:
              return a2 = a2.get(null === d2.key ? c3 : d2.key) || null, l2(b3, a2, d2, e2);
            case Ha:
              var f2 = d2._init;
              return y2(a2, b3, c3, f2(d2._payload), e2);
          }
          if (eb(d2) || Ka(d2)) return a2 = a2.get(c3) || null, m(b3, a2, d2, e2, null);
          Mg(b3, d2);
        }
        return null;
      }
      function n(e2, g2, h2, k3) {
        for (var l3 = null, m2 = null, u = g2, w = g2 = 0, x = null; null !== u && w < h2.length; w++) {
          u.index > w ? (x = u, u = null) : x = u.sibling;
          var n2 = r(e2, u, h2[w], k3);
          if (null === n2) {
            null === u && (u = x);
            break;
          }
          a && u && null === n2.alternate && b2(e2, u);
          g2 = f(n2, g2, w);
          null === m2 ? l3 = n2 : m2.sibling = n2;
          m2 = n2;
          u = x;
        }
        if (w === h2.length) return c2(e2, u), I3 && tg(e2, w), l3;
        if (null === u) {
          for (; w < h2.length; w++) u = q2(e2, h2[w], k3), null !== u && (g2 = f(u, g2, w), null === m2 ? l3 = u : m2.sibling = u, m2 = u);
          I3 && tg(e2, w);
          return l3;
        }
        for (u = d(e2, u); w < h2.length; w++) x = y2(u, e2, w, h2[w], k3), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g2 = f(x, g2, w), null === m2 ? l3 = x : m2.sibling = x, m2 = x);
        a && u.forEach(function(a2) {
          return b2(e2, a2);
        });
        I3 && tg(e2, w);
        return l3;
      }
      function t(e2, g2, h2, k3) {
        var l3 = Ka(h2);
        if ("function" !== typeof l3) throw Error(p(150));
        h2 = l3.call(h2);
        if (null == h2) throw Error(p(151));
        for (var u = l3 = null, m2 = g2, w = g2 = 0, x = null, n2 = h2.next(); null !== m2 && !n2.done; w++, n2 = h2.next()) {
          m2.index > w ? (x = m2, m2 = null) : x = m2.sibling;
          var t2 = r(e2, m2, n2.value, k3);
          if (null === t2) {
            null === m2 && (m2 = x);
            break;
          }
          a && m2 && null === t2.alternate && b2(e2, m2);
          g2 = f(t2, g2, w);
          null === u ? l3 = t2 : u.sibling = t2;
          u = t2;
          m2 = x;
        }
        if (n2.done) return c2(
          e2,
          m2
        ), I3 && tg(e2, w), l3;
        if (null === m2) {
          for (; !n2.done; w++, n2 = h2.next()) n2 = q2(e2, n2.value, k3), null !== n2 && (g2 = f(n2, g2, w), null === u ? l3 = n2 : u.sibling = n2, u = n2);
          I3 && tg(e2, w);
          return l3;
        }
        for (m2 = d(e2, m2); !n2.done; w++, n2 = h2.next()) n2 = y2(m2, e2, w, n2.value, k3), null !== n2 && (a && null !== n2.alternate && m2.delete(null === n2.key ? w : n2.key), g2 = f(n2, g2, w), null === u ? l3 = n2 : u.sibling = n2, u = n2);
        a && m2.forEach(function(a2) {
          return b2(e2, a2);
        });
        I3 && tg(e2, w);
        return l3;
      }
      function J3(a2, d2, f2, h2) {
        "object" === typeof f2 && null !== f2 && f2.type === ya && null === f2.key && (f2 = f2.props.children);
        if ("object" === typeof f2 && null !== f2) {
          switch (f2.$$typeof) {
            case va:
              a: {
                for (var k3 = f2.key, l3 = d2; null !== l3; ) {
                  if (l3.key === k3) {
                    k3 = f2.type;
                    if (k3 === ya) {
                      if (7 === l3.tag) {
                        c2(a2, l3.sibling);
                        d2 = e(l3, f2.props.children);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      }
                    } else if (l3.elementType === k3 || "object" === typeof k3 && null !== k3 && k3.$$typeof === Ha && Ng(k3) === l3.type) {
                      c2(a2, l3.sibling);
                      d2 = e(l3, f2.props);
                      d2.ref = Lg(a2, l3, f2);
                      d2.return = a2;
                      a2 = d2;
                      break a;
                    }
                    c2(a2, l3);
                    break;
                  } else b2(a2, l3);
                  l3 = l3.sibling;
                }
                f2.type === ya ? (d2 = Tg(f2.props.children, a2.mode, h2, f2.key), d2.return = a2, a2 = d2) : (h2 = Rg(f2.type, f2.key, f2.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f2), h2.return = a2, a2 = h2);
              }
              return g(a2);
            case wa:
              a: {
                for (l3 = f2.key; null !== d2; ) {
                  if (d2.key === l3) if (4 === d2.tag && d2.stateNode.containerInfo === f2.containerInfo && d2.stateNode.implementation === f2.implementation) {
                    c2(a2, d2.sibling);
                    d2 = e(d2, f2.children || []);
                    d2.return = a2;
                    a2 = d2;
                    break a;
                  } else {
                    c2(a2, d2);
                    break;
                  }
                  else b2(a2, d2);
                  d2 = d2.sibling;
                }
                d2 = Sg(f2, a2.mode, h2);
                d2.return = a2;
                a2 = d2;
              }
              return g(a2);
            case Ha:
              return l3 = f2._init, J3(a2, d2, l3(f2._payload), h2);
          }
          if (eb(f2)) return n(a2, d2, f2, h2);
          if (Ka(f2)) return t(a2, d2, f2, h2);
          Mg(a2, f2);
        }
        return "string" === typeof f2 && "" !== f2 || "number" === typeof f2 ? (f2 = "" + f2, null !== d2 && 6 === d2.tag ? (c2(a2, d2.sibling), d2 = e(d2, f2), d2.return = a2, a2 = d2) : (c2(a2, d2), d2 = Qg(f2, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c2(a2, d2);
      }
      return J3;
    }
    var Ug = Og(true);
    var Vg = Og(false);
    var Wg = Uf(null);
    var Xg = null;
    var Yg = null;
    var Zg = null;
    function $g() {
      Zg = Yg = Xg = null;
    }
    function ah(a) {
      var b2 = Wg.current;
      E3(Wg);
      a._currentValue = b2;
    }
    function bh(a, b2, c2) {
      for (; null !== a; ) {
        var d = a.alternate;
        (a.childLanes & b2) !== b2 ? (a.childLanes |= b2, null !== d && (d.childLanes |= b2)) : null !== d && (d.childLanes & b2) !== b2 && (d.childLanes |= b2);
        if (a === c2) break;
        a = a.return;
      }
    }
    function ch(a, b2) {
      Xg = a;
      Zg = Yg = null;
      a = a.dependencies;
      null !== a && null !== a.firstContext && (0 !== (a.lanes & b2) && (dh = true), a.firstContext = null);
    }
    function eh(a) {
      var b2 = a._currentValue;
      if (Zg !== a) if (a = { context: a, memoizedValue: b2, next: null }, null === Yg) {
        if (null === Xg) throw Error(p(308));
        Yg = a;
        Xg.dependencies = { lanes: 0, firstContext: a };
      } else Yg = Yg.next = a;
      return b2;
    }
    var fh = null;
    function gh(a) {
      null === fh ? fh = [a] : fh.push(a);
    }
    function hh(a, b2, c2, d) {
      var e = b2.interleaved;
      null === e ? (c2.next = c2, gh(b2)) : (c2.next = e.next, e.next = c2);
      b2.interleaved = c2;
      return ih(a, d);
    }
    function ih(a, b2) {
      a.lanes |= b2;
      var c2 = a.alternate;
      null !== c2 && (c2.lanes |= b2);
      c2 = a;
      for (a = a.return; null !== a; ) a.childLanes |= b2, c2 = a.alternate, null !== c2 && (c2.childLanes |= b2), c2 = a, a = a.return;
      return 3 === c2.tag ? c2.stateNode : null;
    }
    var jh = false;
    function kh(a) {
      a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
    }
    function lh(a, b2) {
      a = a.updateQueue;
      b2.updateQueue === a && (b2.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
    }
    function mh(a, b2) {
      return { eventTime: a, lane: b2, tag: 0, payload: null, callback: null, next: null };
    }
    function nh(a, b2, c2) {
      var d = a.updateQueue;
      if (null === d) return null;
      d = d.shared;
      if (0 !== (K3 & 2)) {
        var e = d.pending;
        null === e ? b2.next = b2 : (b2.next = e.next, e.next = b2);
        d.pending = b2;
        return ih(a, c2);
      }
      e = d.interleaved;
      null === e ? (b2.next = b2, gh(d)) : (b2.next = e.next, e.next = b2);
      d.interleaved = b2;
      return ih(a, c2);
    }
    function oh(a, b2, c2) {
      b2 = b2.updateQueue;
      if (null !== b2 && (b2 = b2.shared, 0 !== (c2 & 4194240))) {
        var d = b2.lanes;
        d &= a.pendingLanes;
        c2 |= d;
        b2.lanes = c2;
        Cc(a, c2);
      }
    }
    function ph(a, b2) {
      var c2 = a.updateQueue, d = a.alternate;
      if (null !== d && (d = d.updateQueue, c2 === d)) {
        var e = null, f = null;
        c2 = c2.firstBaseUpdate;
        if (null !== c2) {
          do {
            var g = { eventTime: c2.eventTime, lane: c2.lane, tag: c2.tag, payload: c2.payload, callback: c2.callback, next: null };
            null === f ? e = f = g : f = f.next = g;
            c2 = c2.next;
          } while (null !== c2);
          null === f ? e = f = b2 : f = f.next = b2;
        } else e = f = b2;
        c2 = { baseState: d.baseState, firstBaseUpdate: e, lastBaseUpdate: f, shared: d.shared, effects: d.effects };
        a.updateQueue = c2;
        return;
      }
      a = c2.lastBaseUpdate;
      null === a ? c2.firstBaseUpdate = b2 : a.next = b2;
      c2.lastBaseUpdate = b2;
    }
    function qh(a, b2, c2, d) {
      var e = a.updateQueue;
      jh = false;
      var f = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
      if (null !== h) {
        e.shared.pending = null;
        var k2 = h, l2 = k2.next;
        k2.next = null;
        null === g ? f = l2 : g.next = l2;
        g = k2;
        var m = a.alternate;
        null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l2 : h.next = l2, m.lastBaseUpdate = k2));
      }
      if (null !== f) {
        var q2 = e.baseState;
        g = 0;
        m = l2 = k2 = null;
        h = f;
        do {
          var r = h.lane, y2 = h.eventTime;
          if ((d & r) === r) {
            null !== m && (m = m.next = {
              eventTime: y2,
              lane: 0,
              tag: h.tag,
              payload: h.payload,
              callback: h.callback,
              next: null
            });
            a: {
              var n = a, t = h;
              r = b2;
              y2 = c2;
              switch (t.tag) {
                case 1:
                  n = t.payload;
                  if ("function" === typeof n) {
                    q2 = n.call(y2, q2, r);
                    break a;
                  }
                  q2 = n;
                  break a;
                case 3:
                  n.flags = n.flags & -65537 | 128;
                case 0:
                  n = t.payload;
                  r = "function" === typeof n ? n.call(y2, q2, r) : n;
                  if (null === r || void 0 === r) break a;
                  q2 = A2({}, q2, r);
                  break a;
                case 2:
                  jh = true;
              }
            }
            null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e.effects, null === r ? e.effects = [h] : r.push(h));
          } else y2 = { eventTime: y2, lane: r, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m ? (l2 = m = y2, k2 = q2) : m = m.next = y2, g |= r;
          h = h.next;
          if (null === h) if (h = e.shared.pending, null === h) break;
          else r = h, h = r.next, r.next = null, e.lastBaseUpdate = r, e.shared.pending = null;
        } while (1);
        null === m && (k2 = q2);
        e.baseState = k2;
        e.firstBaseUpdate = l2;
        e.lastBaseUpdate = m;
        b2 = e.shared.interleaved;
        if (null !== b2) {
          e = b2;
          do
            g |= e.lane, e = e.next;
          while (e !== b2);
        } else null === f && (e.shared.lanes = 0);
        rh |= g;
        a.lanes = g;
        a.memoizedState = q2;
      }
    }
    function sh(a, b2, c2) {
      a = b2.effects;
      b2.effects = null;
      if (null !== a) for (b2 = 0; b2 < a.length; b2++) {
        var d = a[b2], e = d.callback;
        if (null !== e) {
          d.callback = null;
          d = c2;
          if ("function" !== typeof e) throw Error(p(191, e));
          e.call(d);
        }
      }
    }
    var th = {};
    var uh = Uf(th);
    var vh = Uf(th);
    var wh = Uf(th);
    function xh(a) {
      if (a === th) throw Error(p(174));
      return a;
    }
    function yh(a, b2) {
      G3(wh, b2);
      G3(vh, a);
      G3(uh, th);
      a = b2.nodeType;
      switch (a) {
        case 9:
        case 11:
          b2 = (b2 = b2.documentElement) ? b2.namespaceURI : lb(null, "");
          break;
        default:
          a = 8 === a ? b2.parentNode : b2, b2 = a.namespaceURI || null, a = a.tagName, b2 = lb(b2, a);
      }
      E3(uh);
      G3(uh, b2);
    }
    function zh() {
      E3(uh);
      E3(vh);
      E3(wh);
    }
    function Ah(a) {
      xh(wh.current);
      var b2 = xh(uh.current);
      var c2 = lb(b2, a.type);
      b2 !== c2 && (G3(vh, a), G3(uh, c2));
    }
    function Bh(a) {
      vh.current === a && (E3(uh), E3(vh));
    }
    var L2 = Uf(0);
    function Ch(a) {
      for (var b2 = a; null !== b2; ) {
        if (13 === b2.tag) {
          var c2 = b2.memoizedState;
          if (null !== c2 && (c2 = c2.dehydrated, null === c2 || "$?" === c2.data || "$!" === c2.data)) return b2;
        } else if (19 === b2.tag && void 0 !== b2.memoizedProps.revealOrder) {
          if (0 !== (b2.flags & 128)) return b2;
        } else if (null !== b2.child) {
          b2.child.return = b2;
          b2 = b2.child;
          continue;
        }
        if (b2 === a) break;
        for (; null === b2.sibling; ) {
          if (null === b2.return || b2.return === a) return null;
          b2 = b2.return;
        }
        b2.sibling.return = b2.return;
        b2 = b2.sibling;
      }
      return null;
    }
    var Dh = [];
    function Eh() {
      for (var a = 0; a < Dh.length; a++) Dh[a]._workInProgressVersionPrimary = null;
      Dh.length = 0;
    }
    var Fh = ua.ReactCurrentDispatcher;
    var Gh = ua.ReactCurrentBatchConfig;
    var Hh = 0;
    var M2 = null;
    var N2 = null;
    var O3 = null;
    var Ih = false;
    var Jh = false;
    var Kh = 0;
    var Lh = 0;
    function P3() {
      throw Error(p(321));
    }
    function Mh(a, b2) {
      if (null === b2) return false;
      for (var c2 = 0; c2 < b2.length && c2 < a.length; c2++) if (!He2(a[c2], b2[c2])) return false;
      return true;
    }
    function Nh(a, b2, c2, d, e, f) {
      Hh = f;
      M2 = b2;
      b2.memoizedState = null;
      b2.updateQueue = null;
      b2.lanes = 0;
      Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
      a = c2(d, e);
      if (Jh) {
        f = 0;
        do {
          Jh = false;
          Kh = 0;
          if (25 <= f) throw Error(p(301));
          f += 1;
          O3 = N2 = null;
          b2.updateQueue = null;
          Fh.current = Qh;
          a = c2(d, e);
        } while (Jh);
      }
      Fh.current = Rh;
      b2 = null !== N2 && null !== N2.next;
      Hh = 0;
      O3 = N2 = M2 = null;
      Ih = false;
      if (b2) throw Error(p(300));
      return a;
    }
    function Sh() {
      var a = 0 !== Kh;
      Kh = 0;
      return a;
    }
    function Th() {
      var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
      null === O3 ? M2.memoizedState = O3 = a : O3 = O3.next = a;
      return O3;
    }
    function Uh() {
      if (null === N2) {
        var a = M2.alternate;
        a = null !== a ? a.memoizedState : null;
      } else a = N2.next;
      var b2 = null === O3 ? M2.memoizedState : O3.next;
      if (null !== b2) O3 = b2, N2 = a;
      else {
        if (null === a) throw Error(p(310));
        N2 = a;
        a = { memoizedState: N2.memoizedState, baseState: N2.baseState, baseQueue: N2.baseQueue, queue: N2.queue, next: null };
        null === O3 ? M2.memoizedState = O3 = a : O3 = O3.next = a;
      }
      return O3;
    }
    function Vh(a, b2) {
      return "function" === typeof b2 ? b2(a) : b2;
    }
    function Wh(a) {
      var b2 = Uh(), c2 = b2.queue;
      if (null === c2) throw Error(p(311));
      c2.lastRenderedReducer = a;
      var d = N2, e = d.baseQueue, f = c2.pending;
      if (null !== f) {
        if (null !== e) {
          var g = e.next;
          e.next = f.next;
          f.next = g;
        }
        d.baseQueue = e = f;
        c2.pending = null;
      }
      if (null !== e) {
        f = e.next;
        d = d.baseState;
        var h = g = null, k2 = null, l2 = f;
        do {
          var m = l2.lane;
          if ((Hh & m) === m) null !== k2 && (k2 = k2.next = { lane: 0, action: l2.action, hasEagerState: l2.hasEagerState, eagerState: l2.eagerState, next: null }), d = l2.hasEagerState ? l2.eagerState : a(d, l2.action);
          else {
            var q2 = {
              lane: m,
              action: l2.action,
              hasEagerState: l2.hasEagerState,
              eagerState: l2.eagerState,
              next: null
            };
            null === k2 ? (h = k2 = q2, g = d) : k2 = k2.next = q2;
            M2.lanes |= m;
            rh |= m;
          }
          l2 = l2.next;
        } while (null !== l2 && l2 !== f);
        null === k2 ? g = d : k2.next = h;
        He2(d, b2.memoizedState) || (dh = true);
        b2.memoizedState = d;
        b2.baseState = g;
        b2.baseQueue = k2;
        c2.lastRenderedState = d;
      }
      a = c2.interleaved;
      if (null !== a) {
        e = a;
        do
          f = e.lane, M2.lanes |= f, rh |= f, e = e.next;
        while (e !== a);
      } else null === e && (c2.lanes = 0);
      return [b2.memoizedState, c2.dispatch];
    }
    function Xh(a) {
      var b2 = Uh(), c2 = b2.queue;
      if (null === c2) throw Error(p(311));
      c2.lastRenderedReducer = a;
      var d = c2.dispatch, e = c2.pending, f = b2.memoizedState;
      if (null !== e) {
        c2.pending = null;
        var g = e = e.next;
        do
          f = a(f, g.action), g = g.next;
        while (g !== e);
        He2(f, b2.memoizedState) || (dh = true);
        b2.memoizedState = f;
        null === b2.baseQueue && (b2.baseState = f);
        c2.lastRenderedState = f;
      }
      return [f, d];
    }
    function Yh() {
    }
    function Zh(a, b2) {
      var c2 = M2, d = Uh(), e = b2(), f = !He2(d.memoizedState, e);
      f && (d.memoizedState = e, dh = true);
      d = d.queue;
      $h(ai.bind(null, c2, d, a), [a]);
      if (d.getSnapshot !== b2 || f || null !== O3 && O3.memoizedState.tag & 1) {
        c2.flags |= 2048;
        bi(9, ci.bind(null, c2, d, e, b2), void 0, null);
        if (null === Q4) throw Error(p(349));
        0 !== (Hh & 30) || di(c2, b2, e);
      }
      return e;
    }
    function di(a, b2, c2) {
      a.flags |= 16384;
      a = { getSnapshot: b2, value: c2 };
      b2 = M2.updateQueue;
      null === b2 ? (b2 = { lastEffect: null, stores: null }, M2.updateQueue = b2, b2.stores = [a]) : (c2 = b2.stores, null === c2 ? b2.stores = [a] : c2.push(a));
    }
    function ci(a, b2, c2, d) {
      b2.value = c2;
      b2.getSnapshot = d;
      ei(b2) && fi(a);
    }
    function ai(a, b2, c2) {
      return c2(function() {
        ei(b2) && fi(a);
      });
    }
    function ei(a) {
      var b2 = a.getSnapshot;
      a = a.value;
      try {
        var c2 = b2();
        return !He2(a, c2);
      } catch (d) {
        return true;
      }
    }
    function fi(a) {
      var b2 = ih(a, 1);
      null !== b2 && gi(b2, a, 1, -1);
    }
    function hi(a) {
      var b2 = Th();
      "function" === typeof a && (a = a());
      b2.memoizedState = b2.baseState = a;
      a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
      b2.queue = a;
      a = a.dispatch = ii.bind(null, M2, a);
      return [b2.memoizedState, a];
    }
    function bi(a, b2, c2, d) {
      a = { tag: a, create: b2, destroy: c2, deps: d, next: null };
      b2 = M2.updateQueue;
      null === b2 ? (b2 = { lastEffect: null, stores: null }, M2.updateQueue = b2, b2.lastEffect = a.next = a) : (c2 = b2.lastEffect, null === c2 ? b2.lastEffect = a.next = a : (d = c2.next, c2.next = a, a.next = d, b2.lastEffect = a));
      return a;
    }
    function ji() {
      return Uh().memoizedState;
    }
    function ki(a, b2, c2, d) {
      var e = Th();
      M2.flags |= a;
      e.memoizedState = bi(1 | b2, c2, void 0, void 0 === d ? null : d);
    }
    function li(a, b2, c2, d) {
      var e = Uh();
      d = void 0 === d ? null : d;
      var f = void 0;
      if (null !== N2) {
        var g = N2.memoizedState;
        f = g.destroy;
        if (null !== d && Mh(d, g.deps)) {
          e.memoizedState = bi(b2, c2, f, d);
          return;
        }
      }
      M2.flags |= a;
      e.memoizedState = bi(1 | b2, c2, f, d);
    }
    function mi(a, b2) {
      return ki(8390656, 8, a, b2);
    }
    function $h(a, b2) {
      return li(2048, 8, a, b2);
    }
    function ni(a, b2) {
      return li(4, 2, a, b2);
    }
    function oi(a, b2) {
      return li(4, 4, a, b2);
    }
    function pi(a, b2) {
      if ("function" === typeof b2) return a = a(), b2(a), function() {
        b2(null);
      };
      if (null !== b2 && void 0 !== b2) return a = a(), b2.current = a, function() {
        b2.current = null;
      };
    }
    function qi(a, b2, c2) {
      c2 = null !== c2 && void 0 !== c2 ? c2.concat([a]) : null;
      return li(4, 4, pi.bind(null, b2, a), c2);
    }
    function ri() {
    }
    function si(a, b2) {
      var c2 = Uh();
      b2 = void 0 === b2 ? null : b2;
      var d = c2.memoizedState;
      if (null !== d && null !== b2 && Mh(b2, d[1])) return d[0];
      c2.memoizedState = [a, b2];
      return a;
    }
    function ti(a, b2) {
      var c2 = Uh();
      b2 = void 0 === b2 ? null : b2;
      var d = c2.memoizedState;
      if (null !== d && null !== b2 && Mh(b2, d[1])) return d[0];
      a = a();
      c2.memoizedState = [a, b2];
      return a;
    }
    function ui(a, b2, c2) {
      if (0 === (Hh & 21)) return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c2;
      He2(c2, b2) || (c2 = yc(), M2.lanes |= c2, rh |= c2, a.baseState = true);
      return b2;
    }
    function vi(a, b2) {
      var c2 = C2;
      C2 = 0 !== c2 && 4 > c2 ? c2 : 4;
      a(true);
      var d = Gh.transition;
      Gh.transition = {};
      try {
        a(false), b2();
      } finally {
        C2 = c2, Gh.transition = d;
      }
    }
    function wi() {
      return Uh().memoizedState;
    }
    function xi(a, b2, c2) {
      var d = yi(a);
      c2 = { lane: d, action: c2, hasEagerState: false, eagerState: null, next: null };
      if (zi(a)) Ai(b2, c2);
      else if (c2 = hh(a, b2, c2, d), null !== c2) {
        var e = R2();
        gi(c2, a, d, e);
        Bi(c2, b2, d);
      }
    }
    function ii(a, b2, c2) {
      var d = yi(a), e = { lane: d, action: c2, hasEagerState: false, eagerState: null, next: null };
      if (zi(a)) Ai(b2, e);
      else {
        var f = a.alternate;
        if (0 === a.lanes && (null === f || 0 === f.lanes) && (f = b2.lastRenderedReducer, null !== f)) try {
          var g = b2.lastRenderedState, h = f(g, c2);
          e.hasEagerState = true;
          e.eagerState = h;
          if (He2(h, g)) {
            var k2 = b2.interleaved;
            null === k2 ? (e.next = e, gh(b2)) : (e.next = k2.next, k2.next = e);
            b2.interleaved = e;
            return;
          }
        } catch (l2) {
        } finally {
        }
        c2 = hh(a, b2, e, d);
        null !== c2 && (e = R2(), gi(c2, a, d, e), Bi(c2, b2, d));
      }
    }
    function zi(a) {
      var b2 = a.alternate;
      return a === M2 || null !== b2 && b2 === M2;
    }
    function Ai(a, b2) {
      Jh = Ih = true;
      var c2 = a.pending;
      null === c2 ? b2.next = b2 : (b2.next = c2.next, c2.next = b2);
      a.pending = b2;
    }
    function Bi(a, b2, c2) {
      if (0 !== (c2 & 4194240)) {
        var d = b2.lanes;
        d &= a.pendingLanes;
        c2 |= d;
        b2.lanes = c2;
        Cc(a, c2);
      }
    }
    var Rh = { readContext: eh, useCallback: P3, useContext: P3, useEffect: P3, useImperativeHandle: P3, useInsertionEffect: P3, useLayoutEffect: P3, useMemo: P3, useReducer: P3, useRef: P3, useState: P3, useDebugValue: P3, useDeferredValue: P3, useTransition: P3, useMutableSource: P3, useSyncExternalStore: P3, useId: P3, unstable_isNewReconciler: false };
    var Oh = { readContext: eh, useCallback: function(a, b2) {
      Th().memoizedState = [a, void 0 === b2 ? null : b2];
      return a;
    }, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b2, c2) {
      c2 = null !== c2 && void 0 !== c2 ? c2.concat([a]) : null;
      return ki(
        4194308,
        4,
        pi.bind(null, b2, a),
        c2
      );
    }, useLayoutEffect: function(a, b2) {
      return ki(4194308, 4, a, b2);
    }, useInsertionEffect: function(a, b2) {
      return ki(4, 2, a, b2);
    }, useMemo: function(a, b2) {
      var c2 = Th();
      b2 = void 0 === b2 ? null : b2;
      a = a();
      c2.memoizedState = [a, b2];
      return a;
    }, useReducer: function(a, b2, c2) {
      var d = Th();
      b2 = void 0 !== c2 ? c2(b2) : b2;
      d.memoizedState = d.baseState = b2;
      a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b2 };
      d.queue = a;
      a = a.dispatch = xi.bind(null, M2, a);
      return [d.memoizedState, a];
    }, useRef: function(a) {
      var b2 = Th();
      a = { current: a };
      return b2.memoizedState = a;
    }, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
      return Th().memoizedState = a;
    }, useTransition: function() {
      var a = hi(false), b2 = a[0];
      a = vi.bind(null, a[1]);
      Th().memoizedState = a;
      return [b2, a];
    }, useMutableSource: function() {
    }, useSyncExternalStore: function(a, b2, c2) {
      var d = M2, e = Th();
      if (I3) {
        if (void 0 === c2) throw Error(p(407));
        c2 = c2();
      } else {
        c2 = b2();
        if (null === Q4) throw Error(p(349));
        0 !== (Hh & 30) || di(d, b2, c2);
      }
      e.memoizedState = c2;
      var f = { value: c2, getSnapshot: b2 };
      e.queue = f;
      mi(ai.bind(
        null,
        d,
        f,
        a
      ), [a]);
      d.flags |= 2048;
      bi(9, ci.bind(null, d, f, c2, b2), void 0, null);
      return c2;
    }, useId: function() {
      var a = Th(), b2 = Q4.identifierPrefix;
      if (I3) {
        var c2 = sg;
        var d = rg;
        c2 = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c2;
        b2 = ":" + b2 + "R" + c2;
        c2 = Kh++;
        0 < c2 && (b2 += "H" + c2.toString(32));
        b2 += ":";
      } else c2 = Lh++, b2 = ":" + b2 + "r" + c2.toString(32) + ":";
      return a.memoizedState = b2;
    }, unstable_isNewReconciler: false };
    var Ph = {
      readContext: eh,
      useCallback: si,
      useContext: eh,
      useEffect: $h,
      useImperativeHandle: qi,
      useInsertionEffect: ni,
      useLayoutEffect: oi,
      useMemo: ti,
      useReducer: Wh,
      useRef: ji,
      useState: function() {
        return Wh(Vh);
      },
      useDebugValue: ri,
      useDeferredValue: function(a) {
        var b2 = Uh();
        return ui(b2, N2.memoizedState, a);
      },
      useTransition: function() {
        var a = Wh(Vh)[0], b2 = Uh().memoizedState;
        return [a, b2];
      },
      useMutableSource: Yh,
      useSyncExternalStore: Zh,
      useId: wi,
      unstable_isNewReconciler: false
    };
    var Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
      return Xh(Vh);
    }, useDebugValue: ri, useDeferredValue: function(a) {
      var b2 = Uh();
      return null === N2 ? b2.memoizedState = a : ui(b2, N2.memoizedState, a);
    }, useTransition: function() {
      var a = Xh(Vh)[0], b2 = Uh().memoizedState;
      return [a, b2];
    }, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
    function Ci(a, b2) {
      if (a && a.defaultProps) {
        b2 = A2({}, b2);
        a = a.defaultProps;
        for (var c2 in a) void 0 === b2[c2] && (b2[c2] = a[c2]);
        return b2;
      }
      return b2;
    }
    function Di(a, b2, c2, d) {
      b2 = a.memoizedState;
      c2 = c2(d, b2);
      c2 = null === c2 || void 0 === c2 ? b2 : A2({}, b2, c2);
      a.memoizedState = c2;
      0 === a.lanes && (a.updateQueue.baseState = c2);
    }
    var Ei = { isMounted: function(a) {
      return (a = a._reactInternals) ? Vb(a) === a : false;
    }, enqueueSetState: function(a, b2, c2) {
      a = a._reactInternals;
      var d = R2(), e = yi(a), f = mh(d, e);
      f.payload = b2;
      void 0 !== c2 && null !== c2 && (f.callback = c2);
      b2 = nh(a, f, e);
      null !== b2 && (gi(b2, a, e, d), oh(b2, a, e));
    }, enqueueReplaceState: function(a, b2, c2) {
      a = a._reactInternals;
      var d = R2(), e = yi(a), f = mh(d, e);
      f.tag = 1;
      f.payload = b2;
      void 0 !== c2 && null !== c2 && (f.callback = c2);
      b2 = nh(a, f, e);
      null !== b2 && (gi(b2, a, e, d), oh(b2, a, e));
    }, enqueueForceUpdate: function(a, b2) {
      a = a._reactInternals;
      var c2 = R2(), d = yi(a), e = mh(c2, d);
      e.tag = 2;
      void 0 !== b2 && null !== b2 && (e.callback = b2);
      b2 = nh(a, e, d);
      null !== b2 && (gi(b2, a, d, c2), oh(b2, a, d));
    } };
    function Fi(a, b2, c2, d, e, f, g) {
      a = a.stateNode;
      return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f, g) : b2.prototype && b2.prototype.isPureReactComponent ? !Ie2(c2, d) || !Ie2(e, f) : true;
    }
    function Gi(a, b2, c2) {
      var d = false, e = Vf;
      var f = b2.contextType;
      "object" === typeof f && null !== f ? f = eh(f) : (e = Zf(b2) ? Xf : H3.current, d = b2.contextTypes, f = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
      b2 = new b2(c2, f);
      a.memoizedState = null !== b2.state && void 0 !== b2.state ? b2.state : null;
      b2.updater = Ei;
      a.stateNode = b2;
      b2._reactInternals = a;
      d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f);
      return b2;
    }
    function Hi(a, b2, c2, d) {
      a = b2.state;
      "function" === typeof b2.componentWillReceiveProps && b2.componentWillReceiveProps(c2, d);
      "function" === typeof b2.UNSAFE_componentWillReceiveProps && b2.UNSAFE_componentWillReceiveProps(c2, d);
      b2.state !== a && Ei.enqueueReplaceState(b2, b2.state, null);
    }
    function Ii(a, b2, c2, d) {
      var e = a.stateNode;
      e.props = c2;
      e.state = a.memoizedState;
      e.refs = {};
      kh(a);
      var f = b2.contextType;
      "object" === typeof f && null !== f ? e.context = eh(f) : (f = Zf(b2) ? Xf : H3.current, e.context = Yf(a, f));
      e.state = a.memoizedState;
      f = b2.getDerivedStateFromProps;
      "function" === typeof f && (Di(a, b2, f, c2), e.state = a.memoizedState);
      "function" === typeof b2.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b2 = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b2 !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c2, e, d), e.state = a.memoizedState);
      "function" === typeof e.componentDidMount && (a.flags |= 4194308);
    }
    function Ji(a, b2) {
      try {
        var c2 = "", d = b2;
        do
          c2 += Pa(d), d = d.return;
        while (d);
        var e = c2;
      } catch (f) {
        e = "\nError generating stack: " + f.message + "\n" + f.stack;
      }
      return { value: a, source: b2, stack: e, digest: null };
    }
    function Ki(a, b2, c2) {
      return { value: a, source: null, stack: null != c2 ? c2 : null, digest: null != b2 ? b2 : null };
    }
    function Li(a, b2) {
      try {
        console.error(b2.value);
      } catch (c2) {
        setTimeout(function() {
          throw c2;
        });
      }
    }
    var Mi = "function" === typeof WeakMap ? WeakMap : Map;
    function Ni(a, b2, c2) {
      c2 = mh(-1, c2);
      c2.tag = 3;
      c2.payload = { element: null };
      var d = b2.value;
      c2.callback = function() {
        Oi || (Oi = true, Pi = d);
        Li(a, b2);
      };
      return c2;
    }
    function Qi(a, b2, c2) {
      c2 = mh(-1, c2);
      c2.tag = 3;
      var d = a.type.getDerivedStateFromError;
      if ("function" === typeof d) {
        var e = b2.value;
        c2.payload = function() {
          return d(e);
        };
        c2.callback = function() {
          Li(a, b2);
        };
      }
      var f = a.stateNode;
      null !== f && "function" === typeof f.componentDidCatch && (c2.callback = function() {
        Li(a, b2);
        "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
        var c3 = b2.stack;
        this.componentDidCatch(b2.value, { componentStack: null !== c3 ? c3 : "" });
      });
      return c2;
    }
    function Si(a, b2, c2) {
      var d = a.pingCache;
      if (null === d) {
        d = a.pingCache = new Mi();
        var e = /* @__PURE__ */ new Set();
        d.set(b2, e);
      } else e = d.get(b2), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b2, e));
      e.has(c2) || (e.add(c2), a = Ti.bind(null, a, b2, c2), b2.then(a, a));
    }
    function Ui(a) {
      do {
        var b2;
        if (b2 = 13 === a.tag) b2 = a.memoizedState, b2 = null !== b2 ? null !== b2.dehydrated ? true : false : true;
        if (b2) return a;
        a = a.return;
      } while (null !== a);
      return null;
    }
    function Vi(a, b2, c2, d, e) {
      if (0 === (a.mode & 1)) return a === b2 ? a.flags |= 65536 : (a.flags |= 128, c2.flags |= 131072, c2.flags &= -52805, 1 === c2.tag && (null === c2.alternate ? c2.tag = 17 : (b2 = mh(-1, 1), b2.tag = 2, nh(c2, b2, 1))), c2.lanes |= 1), a;
      a.flags |= 65536;
      a.lanes = e;
      return a;
    }
    var Wi = ua.ReactCurrentOwner;
    var dh = false;
    function Xi(a, b2, c2, d) {
      b2.child = null === a ? Vg(b2, null, c2, d) : Ug(b2, a.child, c2, d);
    }
    function Yi(a, b2, c2, d, e) {
      c2 = c2.render;
      var f = b2.ref;
      ch(b2, e);
      d = Nh(a, b2, c2, d, f, e);
      c2 = Sh();
      if (null !== a && !dh) return b2.updateQueue = a.updateQueue, b2.flags &= -2053, a.lanes &= ~e, Zi(a, b2, e);
      I3 && c2 && vg(b2);
      b2.flags |= 1;
      Xi(a, b2, d, e);
      return b2.child;
    }
    function $i(a, b2, c2, d, e) {
      if (null === a) {
        var f = c2.type;
        if ("function" === typeof f && !aj(f) && void 0 === f.defaultProps && null === c2.compare && void 0 === c2.defaultProps) return b2.tag = 15, b2.type = f, bj(a, b2, f, d, e);
        a = Rg(c2.type, null, d, b2, b2.mode, e);
        a.ref = b2.ref;
        a.return = b2;
        return b2.child = a;
      }
      f = a.child;
      if (0 === (a.lanes & e)) {
        var g = f.memoizedProps;
        c2 = c2.compare;
        c2 = null !== c2 ? c2 : Ie2;
        if (c2(g, d) && a.ref === b2.ref) return Zi(a, b2, e);
      }
      b2.flags |= 1;
      a = Pg(f, d);
      a.ref = b2.ref;
      a.return = b2;
      return b2.child = a;
    }
    function bj(a, b2, c2, d, e) {
      if (null !== a) {
        var f = a.memoizedProps;
        if (Ie2(f, d) && a.ref === b2.ref) if (dh = false, b2.pendingProps = d = f, 0 !== (a.lanes & e)) 0 !== (a.flags & 131072) && (dh = true);
        else return b2.lanes = a.lanes, Zi(a, b2, e);
      }
      return cj(a, b2, c2, d, e);
    }
    function dj(a, b2, c2) {
      var d = b2.pendingProps, e = d.children, f = null !== a ? a.memoizedState : null;
      if ("hidden" === d.mode) if (0 === (b2.mode & 1)) b2.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G3(ej, fj), fj |= c2;
      else {
        if (0 === (c2 & 1073741824)) return a = null !== f ? f.baseLanes | c2 : c2, b2.lanes = b2.childLanes = 1073741824, b2.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b2.updateQueue = null, G3(ej, fj), fj |= a, null;
        b2.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
        d = null !== f ? f.baseLanes : c2;
        G3(ej, fj);
        fj |= d;
      }
      else null !== f ? (d = f.baseLanes | c2, b2.memoizedState = null) : d = c2, G3(ej, fj), fj |= d;
      Xi(a, b2, e, c2);
      return b2.child;
    }
    function gj(a, b2) {
      var c2 = b2.ref;
      if (null === a && null !== c2 || null !== a && a.ref !== c2) b2.flags |= 512, b2.flags |= 2097152;
    }
    function cj(a, b2, c2, d, e) {
      var f = Zf(c2) ? Xf : H3.current;
      f = Yf(b2, f);
      ch(b2, e);
      c2 = Nh(a, b2, c2, d, f, e);
      d = Sh();
      if (null !== a && !dh) return b2.updateQueue = a.updateQueue, b2.flags &= -2053, a.lanes &= ~e, Zi(a, b2, e);
      I3 && d && vg(b2);
      b2.flags |= 1;
      Xi(a, b2, c2, e);
      return b2.child;
    }
    function hj(a, b2, c2, d, e) {
      if (Zf(c2)) {
        var f = true;
        cg(b2);
      } else f = false;
      ch(b2, e);
      if (null === b2.stateNode) ij(a, b2), Gi(b2, c2, d), Ii(b2, c2, d, e), d = true;
      else if (null === a) {
        var g = b2.stateNode, h = b2.memoizedProps;
        g.props = h;
        var k2 = g.context, l2 = c2.contextType;
        "object" === typeof l2 && null !== l2 ? l2 = eh(l2) : (l2 = Zf(c2) ? Xf : H3.current, l2 = Yf(b2, l2));
        var m = c2.getDerivedStateFromProps, q2 = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
        q2 || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k2 !== l2) && Hi(b2, g, d, l2);
        jh = false;
        var r = b2.memoizedState;
        g.state = r;
        qh(b2, d, g, e);
        k2 = b2.memoizedState;
        h !== d || r !== k2 || Wf.current || jh ? ("function" === typeof m && (Di(b2, c2, m, d), k2 = b2.memoizedState), (h = jh || Fi(b2, c2, h, d, r, k2, l2)) ? (q2 || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b2.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b2.flags |= 4194308), b2.memoizedProps = d, b2.memoizedState = k2), g.props = d, g.state = k2, g.context = l2, d = h) : ("function" === typeof g.componentDidMount && (b2.flags |= 4194308), d = false);
      } else {
        g = b2.stateNode;
        lh(a, b2);
        h = b2.memoizedProps;
        l2 = b2.type === b2.elementType ? h : Ci(b2.type, h);
        g.props = l2;
        q2 = b2.pendingProps;
        r = g.context;
        k2 = c2.contextType;
        "object" === typeof k2 && null !== k2 ? k2 = eh(k2) : (k2 = Zf(c2) ? Xf : H3.current, k2 = Yf(b2, k2));
        var y2 = c2.getDerivedStateFromProps;
        (m = "function" === typeof y2 || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q2 || r !== k2) && Hi(b2, g, d, k2);
        jh = false;
        r = b2.memoizedState;
        g.state = r;
        qh(b2, d, g, e);
        var n = b2.memoizedState;
        h !== q2 || r !== n || Wf.current || jh ? ("function" === typeof y2 && (Di(b2, c2, y2, d), n = b2.memoizedState), (l2 = jh || Fi(b2, c2, l2, d, r, n, k2) || false) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k2), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k2)), "function" === typeof g.componentDidUpdate && (b2.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b2.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b2.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b2.flags |= 1024), b2.memoizedProps = d, b2.memoizedState = n), g.props = d, g.state = n, g.context = k2, d = l2) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b2.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b2.flags |= 1024), d = false);
      }
      return jj(a, b2, c2, d, f, e);
    }
    function jj(a, b2, c2, d, e, f) {
      gj(a, b2);
      var g = 0 !== (b2.flags & 128);
      if (!d && !g) return e && dg(b2, c2, false), Zi(a, b2, f);
      d = b2.stateNode;
      Wi.current = b2;
      var h = g && "function" !== typeof c2.getDerivedStateFromError ? null : d.render();
      b2.flags |= 1;
      null !== a && g ? (b2.child = Ug(b2, a.child, null, f), b2.child = Ug(b2, null, h, f)) : Xi(a, b2, h, f);
      b2.memoizedState = d.state;
      e && dg(b2, c2, true);
      return b2.child;
    }
    function kj(a) {
      var b2 = a.stateNode;
      b2.pendingContext ? ag(a, b2.pendingContext, b2.pendingContext !== b2.context) : b2.context && ag(a, b2.context, false);
      yh(a, b2.containerInfo);
    }
    function lj(a, b2, c2, d, e) {
      Ig();
      Jg(e);
      b2.flags |= 256;
      Xi(a, b2, c2, d);
      return b2.child;
    }
    var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
    function nj(a) {
      return { baseLanes: a, cachePool: null, transitions: null };
    }
    function oj(a, b2, c2) {
      var d = b2.pendingProps, e = L2.current, f = false, g = 0 !== (b2.flags & 128), h;
      (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e & 2));
      if (h) f = true, b2.flags &= -129;
      else if (null === a || null !== a.memoizedState) e |= 1;
      G3(L2, e & 1);
      if (null === a) {
        Eg(b2);
        a = b2.memoizedState;
        if (null !== a && (a = a.dehydrated, null !== a)) return 0 === (b2.mode & 1) ? b2.lanes = 1 : "$!" === a.data ? b2.lanes = 8 : b2.lanes = 1073741824, null;
        g = d.children;
        a = d.fallback;
        return f ? (d = b2.mode, f = b2.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f ? (f.childLanes = 0, f.pendingProps = g) : f = pj(g, d, 0, null), a = Tg(a, d, c2, null), f.return = b2, a.return = b2, f.sibling = a, b2.child = f, b2.child.memoizedState = nj(c2), b2.memoizedState = mj, a) : qj(b2, g);
      }
      e = a.memoizedState;
      if (null !== e && (h = e.dehydrated, null !== h)) return rj(a, b2, g, d, h, e, c2);
      if (f) {
        f = d.fallback;
        g = b2.mode;
        e = a.child;
        h = e.sibling;
        var k2 = { mode: "hidden", children: d.children };
        0 === (g & 1) && b2.child !== e ? (d = b2.child, d.childLanes = 0, d.pendingProps = k2, b2.deletions = null) : (d = Pg(e, k2), d.subtreeFlags = e.subtreeFlags & 14680064);
        null !== h ? f = Pg(h, f) : (f = Tg(f, g, c2, null), f.flags |= 2);
        f.return = b2;
        d.return = b2;
        d.sibling = f;
        b2.child = d;
        d = f;
        f = b2.child;
        g = a.child.memoizedState;
        g = null === g ? nj(c2) : { baseLanes: g.baseLanes | c2, cachePool: null, transitions: g.transitions };
        f.memoizedState = g;
        f.childLanes = a.childLanes & ~c2;
        b2.memoizedState = mj;
        return d;
      }
      f = a.child;
      a = f.sibling;
      d = Pg(f, { mode: "visible", children: d.children });
      0 === (b2.mode & 1) && (d.lanes = c2);
      d.return = b2;
      d.sibling = null;
      null !== a && (c2 = b2.deletions, null === c2 ? (b2.deletions = [a], b2.flags |= 16) : c2.push(a));
      b2.child = d;
      b2.memoizedState = null;
      return d;
    }
    function qj(a, b2) {
      b2 = pj({ mode: "visible", children: b2 }, a.mode, 0, null);
      b2.return = a;
      return a.child = b2;
    }
    function sj(a, b2, c2, d) {
      null !== d && Jg(d);
      Ug(b2, a.child, null, c2);
      a = qj(b2, b2.pendingProps.children);
      a.flags |= 2;
      b2.memoizedState = null;
      return a;
    }
    function rj(a, b2, c2, d, e, f, g) {
      if (c2) {
        if (b2.flags & 256) return b2.flags &= -257, d = Ki(Error(p(422))), sj(a, b2, g, d);
        if (null !== b2.memoizedState) return b2.child = a.child, b2.flags |= 128, null;
        f = d.fallback;
        e = b2.mode;
        d = pj({ mode: "visible", children: d.children }, e, 0, null);
        f = Tg(f, e, g, null);
        f.flags |= 2;
        d.return = b2;
        f.return = b2;
        d.sibling = f;
        b2.child = d;
        0 !== (b2.mode & 1) && Ug(b2, a.child, null, g);
        b2.child.memoizedState = nj(g);
        b2.memoizedState = mj;
        return f;
      }
      if (0 === (b2.mode & 1)) return sj(a, b2, g, null);
      if ("$!" === e.data) {
        d = e.nextSibling && e.nextSibling.dataset;
        if (d) var h = d.dgst;
        d = h;
        f = Error(p(419));
        d = Ki(f, d, void 0);
        return sj(a, b2, g, d);
      }
      h = 0 !== (g & a.childLanes);
      if (dh || h) {
        d = Q4;
        if (null !== d) {
          switch (g & -g) {
            case 4:
              e = 2;
              break;
            case 16:
              e = 8;
              break;
            case 64:
            case 128:
            case 256:
            case 512:
            case 1024:
            case 2048:
            case 4096:
            case 8192:
            case 16384:
            case 32768:
            case 65536:
            case 131072:
            case 262144:
            case 524288:
            case 1048576:
            case 2097152:
            case 4194304:
            case 8388608:
            case 16777216:
            case 33554432:
            case 67108864:
              e = 32;
              break;
            case 536870912:
              e = 268435456;
              break;
            default:
              e = 0;
          }
          e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
          0 !== e && e !== f.retryLane && (f.retryLane = e, ih(a, e), gi(d, a, e, -1));
        }
        tj();
        d = Ki(Error(p(421)));
        return sj(a, b2, g, d);
      }
      if ("$?" === e.data) return b2.flags |= 128, b2.child = a.child, b2 = uj.bind(null, a), e._reactRetry = b2, null;
      a = f.treeContext;
      yg = Lf(e.nextSibling);
      xg = b2;
      I3 = true;
      zg = null;
      null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b2);
      b2 = qj(b2, d.children);
      b2.flags |= 4096;
      return b2;
    }
    function vj(a, b2, c2) {
      a.lanes |= b2;
      var d = a.alternate;
      null !== d && (d.lanes |= b2);
      bh(a.return, b2, c2);
    }
    function wj(a, b2, c2, d, e) {
      var f = a.memoizedState;
      null === f ? a.memoizedState = { isBackwards: b2, rendering: null, renderingStartTime: 0, last: d, tail: c2, tailMode: e } : (f.isBackwards = b2, f.rendering = null, f.renderingStartTime = 0, f.last = d, f.tail = c2, f.tailMode = e);
    }
    function xj(a, b2, c2) {
      var d = b2.pendingProps, e = d.revealOrder, f = d.tail;
      Xi(a, b2, d.children, c2);
      d = L2.current;
      if (0 !== (d & 2)) d = d & 1 | 2, b2.flags |= 128;
      else {
        if (null !== a && 0 !== (a.flags & 128)) a: for (a = b2.child; null !== a; ) {
          if (13 === a.tag) null !== a.memoizedState && vj(a, c2, b2);
          else if (19 === a.tag) vj(a, c2, b2);
          else if (null !== a.child) {
            a.child.return = a;
            a = a.child;
            continue;
          }
          if (a === b2) break a;
          for (; null === a.sibling; ) {
            if (null === a.return || a.return === b2) break a;
            a = a.return;
          }
          a.sibling.return = a.return;
          a = a.sibling;
        }
        d &= 1;
      }
      G3(L2, d);
      if (0 === (b2.mode & 1)) b2.memoizedState = null;
      else switch (e) {
        case "forwards":
          c2 = b2.child;
          for (e = null; null !== c2; ) a = c2.alternate, null !== a && null === Ch(a) && (e = c2), c2 = c2.sibling;
          c2 = e;
          null === c2 ? (e = b2.child, b2.child = null) : (e = c2.sibling, c2.sibling = null);
          wj(b2, false, e, c2, f);
          break;
        case "backwards":
          c2 = null;
          e = b2.child;
          for (b2.child = null; null !== e; ) {
            a = e.alternate;
            if (null !== a && null === Ch(a)) {
              b2.child = e;
              break;
            }
            a = e.sibling;
            e.sibling = c2;
            c2 = e;
            e = a;
          }
          wj(b2, true, c2, null, f);
          break;
        case "together":
          wj(b2, false, null, null, void 0);
          break;
        default:
          b2.memoizedState = null;
      }
      return b2.child;
    }
    function ij(a, b2) {
      0 === (b2.mode & 1) && null !== a && (a.alternate = null, b2.alternate = null, b2.flags |= 2);
    }
    function Zi(a, b2, c2) {
      null !== a && (b2.dependencies = a.dependencies);
      rh |= b2.lanes;
      if (0 === (c2 & b2.childLanes)) return null;
      if (null !== a && b2.child !== a.child) throw Error(p(153));
      if (null !== b2.child) {
        a = b2.child;
        c2 = Pg(a, a.pendingProps);
        b2.child = c2;
        for (c2.return = b2; null !== a.sibling; ) a = a.sibling, c2 = c2.sibling = Pg(a, a.pendingProps), c2.return = b2;
        c2.sibling = null;
      }
      return b2.child;
    }
    function yj(a, b2, c2) {
      switch (b2.tag) {
        case 3:
          kj(b2);
          Ig();
          break;
        case 5:
          Ah(b2);
          break;
        case 1:
          Zf(b2.type) && cg(b2);
          break;
        case 4:
          yh(b2, b2.stateNode.containerInfo);
          break;
        case 10:
          var d = b2.type._context, e = b2.memoizedProps.value;
          G3(Wg, d._currentValue);
          d._currentValue = e;
          break;
        case 13:
          d = b2.memoizedState;
          if (null !== d) {
            if (null !== d.dehydrated) return G3(L2, L2.current & 1), b2.flags |= 128, null;
            if (0 !== (c2 & b2.child.childLanes)) return oj(a, b2, c2);
            G3(L2, L2.current & 1);
            a = Zi(a, b2, c2);
            return null !== a ? a.sibling : null;
          }
          G3(L2, L2.current & 1);
          break;
        case 19:
          d = 0 !== (c2 & b2.childLanes);
          if (0 !== (a.flags & 128)) {
            if (d) return xj(a, b2, c2);
            b2.flags |= 128;
          }
          e = b2.memoizedState;
          null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
          G3(L2, L2.current);
          if (d) break;
          else return null;
        case 22:
        case 23:
          return b2.lanes = 0, dj(a, b2, c2);
      }
      return Zi(a, b2, c2);
    }
    var zj;
    var Aj;
    var Bj;
    var Cj;
    zj = function(a, b2) {
      for (var c2 = b2.child; null !== c2; ) {
        if (5 === c2.tag || 6 === c2.tag) a.appendChild(c2.stateNode);
        else if (4 !== c2.tag && null !== c2.child) {
          c2.child.return = c2;
          c2 = c2.child;
          continue;
        }
        if (c2 === b2) break;
        for (; null === c2.sibling; ) {
          if (null === c2.return || c2.return === b2) return;
          c2 = c2.return;
        }
        c2.sibling.return = c2.return;
        c2 = c2.sibling;
      }
    };
    Aj = function() {
    };
    Bj = function(a, b2, c2, d) {
      var e = a.memoizedProps;
      if (e !== d) {
        a = b2.stateNode;
        xh(uh.current);
        var f = null;
        switch (c2) {
          case "input":
            e = Ya(a, e);
            d = Ya(a, d);
            f = [];
            break;
          case "select":
            e = A2({}, e, { value: void 0 });
            d = A2({}, d, { value: void 0 });
            f = [];
            break;
          case "textarea":
            e = gb(a, e);
            d = gb(a, d);
            f = [];
            break;
          default:
            "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
        }
        ub(c2, d);
        var g;
        c2 = null;
        for (l2 in e) if (!d.hasOwnProperty(l2) && e.hasOwnProperty(l2) && null != e[l2]) if ("style" === l2) {
          var h = e[l2];
          for (g in h) h.hasOwnProperty(g) && (c2 || (c2 = {}), c2[g] = "");
        } else "dangerouslySetInnerHTML" !== l2 && "children" !== l2 && "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && "autoFocus" !== l2 && (ea.hasOwnProperty(l2) ? f || (f = []) : (f = f || []).push(l2, null));
        for (l2 in d) {
          var k2 = d[l2];
          h = null != e ? e[l2] : void 0;
          if (d.hasOwnProperty(l2) && k2 !== h && (null != k2 || null != h)) if ("style" === l2) if (h) {
            for (g in h) !h.hasOwnProperty(g) || k2 && k2.hasOwnProperty(g) || (c2 || (c2 = {}), c2[g] = "");
            for (g in k2) k2.hasOwnProperty(g) && h[g] !== k2[g] && (c2 || (c2 = {}), c2[g] = k2[g]);
          } else c2 || (f || (f = []), f.push(
            l2,
            c2
          )), c2 = k2;
          else "dangerouslySetInnerHTML" === l2 ? (k2 = k2 ? k2.__html : void 0, h = h ? h.__html : void 0, null != k2 && h !== k2 && (f = f || []).push(l2, k2)) : "children" === l2 ? "string" !== typeof k2 && "number" !== typeof k2 || (f = f || []).push(l2, "" + k2) : "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && (ea.hasOwnProperty(l2) ? (null != k2 && "onScroll" === l2 && D2("scroll", a), f || h === k2 || (f = [])) : (f = f || []).push(l2, k2));
        }
        c2 && (f = f || []).push("style", c2);
        var l2 = f;
        if (b2.updateQueue = l2) b2.flags |= 4;
      }
    };
    Cj = function(a, b2, c2, d) {
      c2 !== d && (b2.flags |= 4);
    };
    function Dj(a, b2) {
      if (!I3) switch (a.tailMode) {
        case "hidden":
          b2 = a.tail;
          for (var c2 = null; null !== b2; ) null !== b2.alternate && (c2 = b2), b2 = b2.sibling;
          null === c2 ? a.tail = null : c2.sibling = null;
          break;
        case "collapsed":
          c2 = a.tail;
          for (var d = null; null !== c2; ) null !== c2.alternate && (d = c2), c2 = c2.sibling;
          null === d ? b2 || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
      }
    }
    function S3(a) {
      var b2 = null !== a.alternate && a.alternate.child === a.child, c2 = 0, d = 0;
      if (b2) for (var e = a.child; null !== e; ) c2 |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
      else for (e = a.child; null !== e; ) c2 |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
      a.subtreeFlags |= d;
      a.childLanes = c2;
      return b2;
    }
    function Ej(a, b2, c2) {
      var d = b2.pendingProps;
      wg(b2);
      switch (b2.tag) {
        case 2:
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return S3(b2), null;
        case 1:
          return Zf(b2.type) && $f(), S3(b2), null;
        case 3:
          d = b2.stateNode;
          zh();
          E3(Wf);
          E3(H3);
          Eh();
          d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
          if (null === a || null === a.child) Gg(b2) ? b2.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b2.flags & 256) || (b2.flags |= 1024, null !== zg && (Fj(zg), zg = null));
          Aj(a, b2);
          S3(b2);
          return null;
        case 5:
          Bh(b2);
          var e = xh(wh.current);
          c2 = b2.type;
          if (null !== a && null != b2.stateNode) Bj(a, b2, c2, d, e), a.ref !== b2.ref && (b2.flags |= 512, b2.flags |= 2097152);
          else {
            if (!d) {
              if (null === b2.stateNode) throw Error(p(166));
              S3(b2);
              return null;
            }
            a = xh(uh.current);
            if (Gg(b2)) {
              d = b2.stateNode;
              c2 = b2.type;
              var f = b2.memoizedProps;
              d[Of] = b2;
              d[Pf] = f;
              a = 0 !== (b2.mode & 1);
              switch (c2) {
                case "dialog":
                  D2("cancel", d);
                  D2("close", d);
                  break;
                case "iframe":
                case "object":
                case "embed":
                  D2("load", d);
                  break;
                case "video":
                case "audio":
                  for (e = 0; e < lf.length; e++) D2(lf[e], d);
                  break;
                case "source":
                  D2("error", d);
                  break;
                case "img":
                case "image":
                case "link":
                  D2(
                    "error",
                    d
                  );
                  D2("load", d);
                  break;
                case "details":
                  D2("toggle", d);
                  break;
                case "input":
                  Za(d, f);
                  D2("invalid", d);
                  break;
                case "select":
                  d._wrapperState = { wasMultiple: !!f.multiple };
                  D2("invalid", d);
                  break;
                case "textarea":
                  hb(d, f), D2("invalid", d);
              }
              ub(c2, f);
              e = null;
              for (var g in f) if (f.hasOwnProperty(g)) {
                var h = f[g];
                "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f.suppressHydrationWarning && Af(
                  d.textContent,
                  h,
                  a
                ), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D2("scroll", d);
              }
              switch (c2) {
                case "input":
                  Va(d);
                  db(d, f, true);
                  break;
                case "textarea":
                  Va(d);
                  jb(d);
                  break;
                case "select":
                case "option":
                  break;
                default:
                  "function" === typeof f.onClick && (d.onclick = Bf);
              }
              d = e;
              b2.updateQueue = d;
              null !== d && (b2.flags |= 4);
            } else {
              g = 9 === e.nodeType ? e : e.ownerDocument;
              "http://www.w3.org/1999/xhtml" === a && (a = kb(c2));
              "http://www.w3.org/1999/xhtml" === a ? "script" === c2 ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c2, { is: d.is }) : (a = g.createElement(c2), "select" === c2 && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c2);
              a[Of] = b2;
              a[Pf] = d;
              zj(a, b2, false, false);
              b2.stateNode = a;
              a: {
                g = vb(c2, d);
                switch (c2) {
                  case "dialog":
                    D2("cancel", a);
                    D2("close", a);
                    e = d;
                    break;
                  case "iframe":
                  case "object":
                  case "embed":
                    D2("load", a);
                    e = d;
                    break;
                  case "video":
                  case "audio":
                    for (e = 0; e < lf.length; e++) D2(lf[e], a);
                    e = d;
                    break;
                  case "source":
                    D2("error", a);
                    e = d;
                    break;
                  case "img":
                  case "image":
                  case "link":
                    D2(
                      "error",
                      a
                    );
                    D2("load", a);
                    e = d;
                    break;
                  case "details":
                    D2("toggle", a);
                    e = d;
                    break;
                  case "input":
                    Za(a, d);
                    e = Ya(a, d);
                    D2("invalid", a);
                    break;
                  case "option":
                    e = d;
                    break;
                  case "select":
                    a._wrapperState = { wasMultiple: !!d.multiple };
                    e = A2({}, d, { value: void 0 });
                    D2("invalid", a);
                    break;
                  case "textarea":
                    hb(a, d);
                    e = gb(a, d);
                    D2("invalid", a);
                    break;
                  default:
                    e = d;
                }
                ub(c2, e);
                h = e;
                for (f in h) if (h.hasOwnProperty(f)) {
                  var k2 = h[f];
                  "style" === f ? sb(a, k2) : "dangerouslySetInnerHTML" === f ? (k2 = k2 ? k2.__html : void 0, null != k2 && nb(a, k2)) : "children" === f ? "string" === typeof k2 ? ("textarea" !== c2 || "" !== k2) && ob(a, k2) : "number" === typeof k2 && ob(a, "" + k2) : "suppressContentEditableWarning" !== f && "suppressHydrationWarning" !== f && "autoFocus" !== f && (ea.hasOwnProperty(f) ? null != k2 && "onScroll" === f && D2("scroll", a) : null != k2 && ta(a, f, k2, g));
                }
                switch (c2) {
                  case "input":
                    Va(a);
                    db(a, d, false);
                    break;
                  case "textarea":
                    Va(a);
                    jb(a);
                    break;
                  case "option":
                    null != d.value && a.setAttribute("value", "" + Sa(d.value));
                    break;
                  case "select":
                    a.multiple = !!d.multiple;
                    f = d.value;
                    null != f ? fb(a, !!d.multiple, f, false) : null != d.defaultValue && fb(
                      a,
                      !!d.multiple,
                      d.defaultValue,
                      true
                    );
                    break;
                  default:
                    "function" === typeof e.onClick && (a.onclick = Bf);
                }
                switch (c2) {
                  case "button":
                  case "input":
                  case "select":
                  case "textarea":
                    d = !!d.autoFocus;
                    break a;
                  case "img":
                    d = true;
                    break a;
                  default:
                    d = false;
                }
              }
              d && (b2.flags |= 4);
            }
            null !== b2.ref && (b2.flags |= 512, b2.flags |= 2097152);
          }
          S3(b2);
          return null;
        case 6:
          if (a && null != b2.stateNode) Cj(a, b2, a.memoizedProps, d);
          else {
            if ("string" !== typeof d && null === b2.stateNode) throw Error(p(166));
            c2 = xh(wh.current);
            xh(uh.current);
            if (Gg(b2)) {
              d = b2.stateNode;
              c2 = b2.memoizedProps;
              d[Of] = b2;
              if (f = d.nodeValue !== c2) {
                if (a = xg, null !== a) switch (a.tag) {
                  case 3:
                    Af(d.nodeValue, c2, 0 !== (a.mode & 1));
                    break;
                  case 5:
                    true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c2, 0 !== (a.mode & 1));
                }
              }
              f && (b2.flags |= 4);
            } else d = (9 === c2.nodeType ? c2 : c2.ownerDocument).createTextNode(d), d[Of] = b2, b2.stateNode = d;
          }
          S3(b2);
          return null;
        case 13:
          E3(L2);
          d = b2.memoizedState;
          if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
            if (I3 && null !== yg && 0 !== (b2.mode & 1) && 0 === (b2.flags & 128)) Hg(), Ig(), b2.flags |= 98560, f = false;
            else if (f = Gg(b2), null !== d && null !== d.dehydrated) {
              if (null === a) {
                if (!f) throw Error(p(318));
                f = b2.memoizedState;
                f = null !== f ? f.dehydrated : null;
                if (!f) throw Error(p(317));
                f[Of] = b2;
              } else Ig(), 0 === (b2.flags & 128) && (b2.memoizedState = null), b2.flags |= 4;
              S3(b2);
              f = false;
            } else null !== zg && (Fj(zg), zg = null), f = true;
            if (!f) return b2.flags & 65536 ? b2 : null;
          }
          if (0 !== (b2.flags & 128)) return b2.lanes = c2, b2;
          d = null !== d;
          d !== (null !== a && null !== a.memoizedState) && d && (b2.child.flags |= 8192, 0 !== (b2.mode & 1) && (null === a || 0 !== (L2.current & 1) ? 0 === T2 && (T2 = 3) : tj()));
          null !== b2.updateQueue && (b2.flags |= 4);
          S3(b2);
          return null;
        case 4:
          return zh(), Aj(a, b2), null === a && sf(b2.stateNode.containerInfo), S3(b2), null;
        case 10:
          return ah(b2.type._context), S3(b2), null;
        case 17:
          return Zf(b2.type) && $f(), S3(b2), null;
        case 19:
          E3(L2);
          f = b2.memoizedState;
          if (null === f) return S3(b2), null;
          d = 0 !== (b2.flags & 128);
          g = f.rendering;
          if (null === g) if (d) Dj(f, false);
          else {
            if (0 !== T2 || null !== a && 0 !== (a.flags & 128)) for (a = b2.child; null !== a; ) {
              g = Ch(a);
              if (null !== g) {
                b2.flags |= 128;
                Dj(f, false);
                d = g.updateQueue;
                null !== d && (b2.updateQueue = d, b2.flags |= 4);
                b2.subtreeFlags = 0;
                d = c2;
                for (c2 = b2.child; null !== c2; ) f = c2, a = d, f.flags &= 14680066, g = f.alternate, null === g ? (f.childLanes = 0, f.lanes = a, f.child = null, f.subtreeFlags = 0, f.memoizedProps = null, f.memoizedState = null, f.updateQueue = null, f.dependencies = null, f.stateNode = null) : (f.childLanes = g.childLanes, f.lanes = g.lanes, f.child = g.child, f.subtreeFlags = 0, f.deletions = null, f.memoizedProps = g.memoizedProps, f.memoizedState = g.memoizedState, f.updateQueue = g.updateQueue, f.type = g.type, a = g.dependencies, f.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c2 = c2.sibling;
                G3(L2, L2.current & 1 | 2);
                return b2.child;
              }
              a = a.sibling;
            }
            null !== f.tail && B3() > Gj && (b2.flags |= 128, d = true, Dj(f, false), b2.lanes = 4194304);
          }
          else {
            if (!d) if (a = Ch(g), null !== a) {
              if (b2.flags |= 128, d = true, c2 = a.updateQueue, null !== c2 && (b2.updateQueue = c2, b2.flags |= 4), Dj(f, true), null === f.tail && "hidden" === f.tailMode && !g.alternate && !I3) return S3(b2), null;
            } else 2 * B3() - f.renderingStartTime > Gj && 1073741824 !== c2 && (b2.flags |= 128, d = true, Dj(f, false), b2.lanes = 4194304);
            f.isBackwards ? (g.sibling = b2.child, b2.child = g) : (c2 = f.last, null !== c2 ? c2.sibling = g : b2.child = g, f.last = g);
          }
          if (null !== f.tail) return b2 = f.tail, f.rendering = b2, f.tail = b2.sibling, f.renderingStartTime = B3(), b2.sibling = null, c2 = L2.current, G3(L2, d ? c2 & 1 | 2 : c2 & 1), b2;
          S3(b2);
          return null;
        case 22:
        case 23:
          return Hj(), d = null !== b2.memoizedState, null !== a && null !== a.memoizedState !== d && (b2.flags |= 8192), d && 0 !== (b2.mode & 1) ? 0 !== (fj & 1073741824) && (S3(b2), b2.subtreeFlags & 6 && (b2.flags |= 8192)) : S3(b2), null;
        case 24:
          return null;
        case 25:
          return null;
      }
      throw Error(p(156, b2.tag));
    }
    function Ij(a, b2) {
      wg(b2);
      switch (b2.tag) {
        case 1:
          return Zf(b2.type) && $f(), a = b2.flags, a & 65536 ? (b2.flags = a & -65537 | 128, b2) : null;
        case 3:
          return zh(), E3(Wf), E3(H3), Eh(), a = b2.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b2.flags = a & -65537 | 128, b2) : null;
        case 5:
          return Bh(b2), null;
        case 13:
          E3(L2);
          a = b2.memoizedState;
          if (null !== a && null !== a.dehydrated) {
            if (null === b2.alternate) throw Error(p(340));
            Ig();
          }
          a = b2.flags;
          return a & 65536 ? (b2.flags = a & -65537 | 128, b2) : null;
        case 19:
          return E3(L2), null;
        case 4:
          return zh(), null;
        case 10:
          return ah(b2.type._context), null;
        case 22:
        case 23:
          return Hj(), null;
        case 24:
          return null;
        default:
          return null;
      }
    }
    var Jj = false;
    var U2 = false;
    var Kj = "function" === typeof WeakSet ? WeakSet : Set;
    var V2 = null;
    function Lj(a, b2) {
      var c2 = a.ref;
      if (null !== c2) if ("function" === typeof c2) try {
        c2(null);
      } catch (d) {
        W2(a, b2, d);
      }
      else c2.current = null;
    }
    function Mj(a, b2, c2) {
      try {
        c2();
      } catch (d) {
        W2(a, b2, d);
      }
    }
    var Nj = false;
    function Oj(a, b2) {
      Cf = dd;
      a = Me3();
      if (Ne3(a)) {
        if ("selectionStart" in a) var c2 = { start: a.selectionStart, end: a.selectionEnd };
        else a: {
          c2 = (c2 = a.ownerDocument) && c2.defaultView || window;
          var d = c2.getSelection && c2.getSelection();
          if (d && 0 !== d.rangeCount) {
            c2 = d.anchorNode;
            var e = d.anchorOffset, f = d.focusNode;
            d = d.focusOffset;
            try {
              c2.nodeType, f.nodeType;
            } catch (F2) {
              c2 = null;
              break a;
            }
            var g = 0, h = -1, k2 = -1, l2 = 0, m = 0, q2 = a, r = null;
            b: for (; ; ) {
              for (var y2; ; ) {
                q2 !== c2 || 0 !== e && 3 !== q2.nodeType || (h = g + e);
                q2 !== f || 0 !== d && 3 !== q2.nodeType || (k2 = g + d);
                3 === q2.nodeType && (g += q2.nodeValue.length);
                if (null === (y2 = q2.firstChild)) break;
                r = q2;
                q2 = y2;
              }
              for (; ; ) {
                if (q2 === a) break b;
                r === c2 && ++l2 === e && (h = g);
                r === f && ++m === d && (k2 = g);
                if (null !== (y2 = q2.nextSibling)) break;
                q2 = r;
                r = q2.parentNode;
              }
              q2 = y2;
            }
            c2 = -1 === h || -1 === k2 ? null : { start: h, end: k2 };
          } else c2 = null;
        }
        c2 = c2 || { start: 0, end: 0 };
      } else c2 = null;
      Df = { focusedElem: a, selectionRange: c2 };
      dd = false;
      for (V2 = b2; null !== V2; ) if (b2 = V2, a = b2.child, 0 !== (b2.subtreeFlags & 1028) && null !== a) a.return = b2, V2 = a;
      else for (; null !== V2; ) {
        b2 = V2;
        try {
          var n = b2.alternate;
          if (0 !== (b2.flags & 1024)) switch (b2.tag) {
            case 0:
            case 11:
            case 15:
              break;
            case 1:
              if (null !== n) {
                var t = n.memoizedProps, J3 = n.memoizedState, x = b2.stateNode, w = x.getSnapshotBeforeUpdate(b2.elementType === b2.type ? t : Ci(b2.type, t), J3);
                x.__reactInternalSnapshotBeforeUpdate = w;
              }
              break;
            case 3:
              var u = b2.stateNode.containerInfo;
              1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
              break;
            case 5:
            case 6:
            case 4:
            case 17:
              break;
            default:
              throw Error(p(163));
          }
        } catch (F2) {
          W2(b2, b2.return, F2);
        }
        a = b2.sibling;
        if (null !== a) {
          a.return = b2.return;
          V2 = a;
          break;
        }
        V2 = b2.return;
      }
      n = Nj;
      Nj = false;
      return n;
    }
    function Pj(a, b2, c2) {
      var d = b2.updateQueue;
      d = null !== d ? d.lastEffect : null;
      if (null !== d) {
        var e = d = d.next;
        do {
          if ((e.tag & a) === a) {
            var f = e.destroy;
            e.destroy = void 0;
            void 0 !== f && Mj(b2, c2, f);
          }
          e = e.next;
        } while (e !== d);
      }
    }
    function Qj(a, b2) {
      b2 = b2.updateQueue;
      b2 = null !== b2 ? b2.lastEffect : null;
      if (null !== b2) {
        var c2 = b2 = b2.next;
        do {
          if ((c2.tag & a) === a) {
            var d = c2.create;
            c2.destroy = d();
          }
          c2 = c2.next;
        } while (c2 !== b2);
      }
    }
    function Rj(a) {
      var b2 = a.ref;
      if (null !== b2) {
        var c2 = a.stateNode;
        switch (a.tag) {
          case 5:
            a = c2;
            break;
          default:
            a = c2;
        }
        "function" === typeof b2 ? b2(a) : b2.current = a;
      }
    }
    function Sj(a) {
      var b2 = a.alternate;
      null !== b2 && (a.alternate = null, Sj(b2));
      a.child = null;
      a.deletions = null;
      a.sibling = null;
      5 === a.tag && (b2 = a.stateNode, null !== b2 && (delete b2[Of], delete b2[Pf], delete b2[of], delete b2[Qf], delete b2[Rf]));
      a.stateNode = null;
      a.return = null;
      a.dependencies = null;
      a.memoizedProps = null;
      a.memoizedState = null;
      a.pendingProps = null;
      a.stateNode = null;
      a.updateQueue = null;
    }
    function Tj(a) {
      return 5 === a.tag || 3 === a.tag || 4 === a.tag;
    }
    function Uj(a) {
      a: for (; ; ) {
        for (; null === a.sibling; ) {
          if (null === a.return || Tj(a.return)) return null;
          a = a.return;
        }
        a.sibling.return = a.return;
        for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
          if (a.flags & 2) continue a;
          if (null === a.child || 4 === a.tag) continue a;
          else a.child.return = a, a = a.child;
        }
        if (!(a.flags & 2)) return a.stateNode;
      }
    }
    function Vj(a, b2, c2) {
      var d = a.tag;
      if (5 === d || 6 === d) a = a.stateNode, b2 ? 8 === c2.nodeType ? c2.parentNode.insertBefore(a, b2) : c2.insertBefore(a, b2) : (8 === c2.nodeType ? (b2 = c2.parentNode, b2.insertBefore(a, c2)) : (b2 = c2, b2.appendChild(a)), c2 = c2._reactRootContainer, null !== c2 && void 0 !== c2 || null !== b2.onclick || (b2.onclick = Bf));
      else if (4 !== d && (a = a.child, null !== a)) for (Vj(a, b2, c2), a = a.sibling; null !== a; ) Vj(a, b2, c2), a = a.sibling;
    }
    function Wj(a, b2, c2) {
      var d = a.tag;
      if (5 === d || 6 === d) a = a.stateNode, b2 ? c2.insertBefore(a, b2) : c2.appendChild(a);
      else if (4 !== d && (a = a.child, null !== a)) for (Wj(a, b2, c2), a = a.sibling; null !== a; ) Wj(a, b2, c2), a = a.sibling;
    }
    var X2 = null;
    var Xj = false;
    function Yj(a, b2, c2) {
      for (c2 = c2.child; null !== c2; ) Zj(a, b2, c2), c2 = c2.sibling;
    }
    function Zj(a, b2, c2) {
      if (lc && "function" === typeof lc.onCommitFiberUnmount) try {
        lc.onCommitFiberUnmount(kc, c2);
      } catch (h) {
      }
      switch (c2.tag) {
        case 5:
          U2 || Lj(c2, b2);
        case 6:
          var d = X2, e = Xj;
          X2 = null;
          Yj(a, b2, c2);
          X2 = d;
          Xj = e;
          null !== X2 && (Xj ? (a = X2, c2 = c2.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c2) : a.removeChild(c2)) : X2.removeChild(c2.stateNode));
          break;
        case 18:
          null !== X2 && (Xj ? (a = X2, c2 = c2.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c2) : 1 === a.nodeType && Kf(a, c2), bd(a)) : Kf(X2, c2.stateNode));
          break;
        case 4:
          d = X2;
          e = Xj;
          X2 = c2.stateNode.containerInfo;
          Xj = true;
          Yj(a, b2, c2);
          X2 = d;
          Xj = e;
          break;
        case 0:
        case 11:
        case 14:
        case 15:
          if (!U2 && (d = c2.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
            e = d = d.next;
            do {
              var f = e, g = f.destroy;
              f = f.tag;
              void 0 !== g && (0 !== (f & 2) ? Mj(c2, b2, g) : 0 !== (f & 4) && Mj(c2, b2, g));
              e = e.next;
            } while (e !== d);
          }
          Yj(a, b2, c2);
          break;
        case 1:
          if (!U2 && (Lj(c2, b2), d = c2.stateNode, "function" === typeof d.componentWillUnmount)) try {
            d.props = c2.memoizedProps, d.state = c2.memoizedState, d.componentWillUnmount();
          } catch (h) {
            W2(c2, b2, h);
          }
          Yj(a, b2, c2);
          break;
        case 21:
          Yj(a, b2, c2);
          break;
        case 22:
          c2.mode & 1 ? (U2 = (d = U2) || null !== c2.memoizedState, Yj(a, b2, c2), U2 = d) : Yj(a, b2, c2);
          break;
        default:
          Yj(a, b2, c2);
      }
    }
    function ak(a) {
      var b2 = a.updateQueue;
      if (null !== b2) {
        a.updateQueue = null;
        var c2 = a.stateNode;
        null === c2 && (c2 = a.stateNode = new Kj());
        b2.forEach(function(b3) {
          var d = bk.bind(null, a, b3);
          c2.has(b3) || (c2.add(b3), b3.then(d, d));
        });
      }
    }
    function ck(a, b2) {
      var c2 = b2.deletions;
      if (null !== c2) for (var d = 0; d < c2.length; d++) {
        var e = c2[d];
        try {
          var f = a, g = b2, h = g;
          a: for (; null !== h; ) {
            switch (h.tag) {
              case 5:
                X2 = h.stateNode;
                Xj = false;
                break a;
              case 3:
                X2 = h.stateNode.containerInfo;
                Xj = true;
                break a;
              case 4:
                X2 = h.stateNode.containerInfo;
                Xj = true;
                break a;
            }
            h = h.return;
          }
          if (null === X2) throw Error(p(160));
          Zj(f, g, e);
          X2 = null;
          Xj = false;
          var k2 = e.alternate;
          null !== k2 && (k2.return = null);
          e.return = null;
        } catch (l2) {
          W2(e, b2, l2);
        }
      }
      if (b2.subtreeFlags & 12854) for (b2 = b2.child; null !== b2; ) dk(b2, a), b2 = b2.sibling;
    }
    function dk(a, b2) {
      var c2 = a.alternate, d = a.flags;
      switch (a.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          ck(b2, a);
          ek(a);
          if (d & 4) {
            try {
              Pj(3, a, a.return), Qj(3, a);
            } catch (t) {
              W2(a, a.return, t);
            }
            try {
              Pj(5, a, a.return);
            } catch (t) {
              W2(a, a.return, t);
            }
          }
          break;
        case 1:
          ck(b2, a);
          ek(a);
          d & 512 && null !== c2 && Lj(c2, c2.return);
          break;
        case 5:
          ck(b2, a);
          ek(a);
          d & 512 && null !== c2 && Lj(c2, c2.return);
          if (a.flags & 32) {
            var e = a.stateNode;
            try {
              ob(e, "");
            } catch (t) {
              W2(a, a.return, t);
            }
          }
          if (d & 4 && (e = a.stateNode, null != e)) {
            var f = a.memoizedProps, g = null !== c2 ? c2.memoizedProps : f, h = a.type, k2 = a.updateQueue;
            a.updateQueue = null;
            if (null !== k2) try {
              "input" === h && "radio" === f.type && null != f.name && ab(e, f);
              vb(h, g);
              var l2 = vb(h, f);
              for (g = 0; g < k2.length; g += 2) {
                var m = k2[g], q2 = k2[g + 1];
                "style" === m ? sb(e, q2) : "dangerouslySetInnerHTML" === m ? nb(e, q2) : "children" === m ? ob(e, q2) : ta(e, m, q2, l2);
              }
              switch (h) {
                case "input":
                  bb(e, f);
                  break;
                case "textarea":
                  ib(e, f);
                  break;
                case "select":
                  var r = e._wrapperState.wasMultiple;
                  e._wrapperState.wasMultiple = !!f.multiple;
                  var y2 = f.value;
                  null != y2 ? fb(e, !!f.multiple, y2, false) : r !== !!f.multiple && (null != f.defaultValue ? fb(
                    e,
                    !!f.multiple,
                    f.defaultValue,
                    true
                  ) : fb(e, !!f.multiple, f.multiple ? [] : "", false));
              }
              e[Pf] = f;
            } catch (t) {
              W2(a, a.return, t);
            }
          }
          break;
        case 6:
          ck(b2, a);
          ek(a);
          if (d & 4) {
            if (null === a.stateNode) throw Error(p(162));
            e = a.stateNode;
            f = a.memoizedProps;
            try {
              e.nodeValue = f;
            } catch (t) {
              W2(a, a.return, t);
            }
          }
          break;
        case 3:
          ck(b2, a);
          ek(a);
          if (d & 4 && null !== c2 && c2.memoizedState.isDehydrated) try {
            bd(b2.containerInfo);
          } catch (t) {
            W2(a, a.return, t);
          }
          break;
        case 4:
          ck(b2, a);
          ek(a);
          break;
        case 13:
          ck(b2, a);
          ek(a);
          e = a.child;
          e.flags & 8192 && (f = null !== e.memoizedState, e.stateNode.isHidden = f, !f || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B3()));
          d & 4 && ak(a);
          break;
        case 22:
          m = null !== c2 && null !== c2.memoizedState;
          a.mode & 1 ? (U2 = (l2 = U2) || m, ck(b2, a), U2 = l2) : ck(b2, a);
          ek(a);
          if (d & 8192) {
            l2 = null !== a.memoizedState;
            if ((a.stateNode.isHidden = l2) && !m && 0 !== (a.mode & 1)) for (V2 = a, m = a.child; null !== m; ) {
              for (q2 = V2 = m; null !== V2; ) {
                r = V2;
                y2 = r.child;
                switch (r.tag) {
                  case 0:
                  case 11:
                  case 14:
                  case 15:
                    Pj(4, r, r.return);
                    break;
                  case 1:
                    Lj(r, r.return);
                    var n = r.stateNode;
                    if ("function" === typeof n.componentWillUnmount) {
                      d = r;
                      c2 = r.return;
                      try {
                        b2 = d, n.props = b2.memoizedProps, n.state = b2.memoizedState, n.componentWillUnmount();
                      } catch (t) {
                        W2(d, c2, t);
                      }
                    }
                    break;
                  case 5:
                    Lj(r, r.return);
                    break;
                  case 22:
                    if (null !== r.memoizedState) {
                      gk(q2);
                      continue;
                    }
                }
                null !== y2 ? (y2.return = r, V2 = y2) : gk(q2);
              }
              m = m.sibling;
            }
            a: for (m = null, q2 = a; ; ) {
              if (5 === q2.tag) {
                if (null === m) {
                  m = q2;
                  try {
                    e = q2.stateNode, l2 ? (f = e.style, "function" === typeof f.setProperty ? f.setProperty("display", "none", "important") : f.display = "none") : (h = q2.stateNode, k2 = q2.memoizedProps.style, g = void 0 !== k2 && null !== k2 && k2.hasOwnProperty("display") ? k2.display : null, h.style.display = rb("display", g));
                  } catch (t) {
                    W2(a, a.return, t);
                  }
                }
              } else if (6 === q2.tag) {
                if (null === m) try {
                  q2.stateNode.nodeValue = l2 ? "" : q2.memoizedProps;
                } catch (t) {
                  W2(a, a.return, t);
                }
              } else if ((22 !== q2.tag && 23 !== q2.tag || null === q2.memoizedState || q2 === a) && null !== q2.child) {
                q2.child.return = q2;
                q2 = q2.child;
                continue;
              }
              if (q2 === a) break a;
              for (; null === q2.sibling; ) {
                if (null === q2.return || q2.return === a) break a;
                m === q2 && (m = null);
                q2 = q2.return;
              }
              m === q2 && (m = null);
              q2.sibling.return = q2.return;
              q2 = q2.sibling;
            }
          }
          break;
        case 19:
          ck(b2, a);
          ek(a);
          d & 4 && ak(a);
          break;
        case 21:
          break;
        default:
          ck(
            b2,
            a
          ), ek(a);
      }
    }
    function ek(a) {
      var b2 = a.flags;
      if (b2 & 2) {
        try {
          a: {
            for (var c2 = a.return; null !== c2; ) {
              if (Tj(c2)) {
                var d = c2;
                break a;
              }
              c2 = c2.return;
            }
            throw Error(p(160));
          }
          switch (d.tag) {
            case 5:
              var e = d.stateNode;
              d.flags & 32 && (ob(e, ""), d.flags &= -33);
              var f = Uj(a);
              Wj(a, f, e);
              break;
            case 3:
            case 4:
              var g = d.stateNode.containerInfo, h = Uj(a);
              Vj(a, h, g);
              break;
            default:
              throw Error(p(161));
          }
        } catch (k2) {
          W2(a, a.return, k2);
        }
        a.flags &= -3;
      }
      b2 & 4096 && (a.flags &= -4097);
    }
    function hk(a, b2, c2) {
      V2 = a;
      ik(a, b2, c2);
    }
    function ik(a, b2, c2) {
      for (var d = 0 !== (a.mode & 1); null !== V2; ) {
        var e = V2, f = e.child;
        if (22 === e.tag && d) {
          var g = null !== e.memoizedState || Jj;
          if (!g) {
            var h = e.alternate, k2 = null !== h && null !== h.memoizedState || U2;
            h = Jj;
            var l2 = U2;
            Jj = g;
            if ((U2 = k2) && !l2) for (V2 = e; null !== V2; ) g = V2, k2 = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k2 ? (k2.return = g, V2 = k2) : jk(e);
            for (; null !== f; ) V2 = f, ik(f, b2, c2), f = f.sibling;
            V2 = e;
            Jj = h;
            U2 = l2;
          }
          kk(a, b2, c2);
        } else 0 !== (e.subtreeFlags & 8772) && null !== f ? (f.return = e, V2 = f) : kk(a, b2, c2);
      }
    }
    function kk(a) {
      for (; null !== V2; ) {
        var b2 = V2;
        if (0 !== (b2.flags & 8772)) {
          var c2 = b2.alternate;
          try {
            if (0 !== (b2.flags & 8772)) switch (b2.tag) {
              case 0:
              case 11:
              case 15:
                U2 || Qj(5, b2);
                break;
              case 1:
                var d = b2.stateNode;
                if (b2.flags & 4 && !U2) if (null === c2) d.componentDidMount();
                else {
                  var e = b2.elementType === b2.type ? c2.memoizedProps : Ci(b2.type, c2.memoizedProps);
                  d.componentDidUpdate(e, c2.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                }
                var f = b2.updateQueue;
                null !== f && sh(b2, f, d);
                break;
              case 3:
                var g = b2.updateQueue;
                if (null !== g) {
                  c2 = null;
                  if (null !== b2.child) switch (b2.child.tag) {
                    case 5:
                      c2 = b2.child.stateNode;
                      break;
                    case 1:
                      c2 = b2.child.stateNode;
                  }
                  sh(b2, g, c2);
                }
                break;
              case 5:
                var h = b2.stateNode;
                if (null === c2 && b2.flags & 4) {
                  c2 = h;
                  var k2 = b2.memoizedProps;
                  switch (b2.type) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      k2.autoFocus && c2.focus();
                      break;
                    case "img":
                      k2.src && (c2.src = k2.src);
                  }
                }
                break;
              case 6:
                break;
              case 4:
                break;
              case 12:
                break;
              case 13:
                if (null === b2.memoizedState) {
                  var l2 = b2.alternate;
                  if (null !== l2) {
                    var m = l2.memoizedState;
                    if (null !== m) {
                      var q2 = m.dehydrated;
                      null !== q2 && bd(q2);
                    }
                  }
                }
                break;
              case 19:
              case 17:
              case 21:
              case 22:
              case 23:
              case 25:
                break;
              default:
                throw Error(p(163));
            }
            U2 || b2.flags & 512 && Rj(b2);
          } catch (r) {
            W2(b2, b2.return, r);
          }
        }
        if (b2 === a) {
          V2 = null;
          break;
        }
        c2 = b2.sibling;
        if (null !== c2) {
          c2.return = b2.return;
          V2 = c2;
          break;
        }
        V2 = b2.return;
      }
    }
    function gk(a) {
      for (; null !== V2; ) {
        var b2 = V2;
        if (b2 === a) {
          V2 = null;
          break;
        }
        var c2 = b2.sibling;
        if (null !== c2) {
          c2.return = b2.return;
          V2 = c2;
          break;
        }
        V2 = b2.return;
      }
    }
    function jk(a) {
      for (; null !== V2; ) {
        var b2 = V2;
        try {
          switch (b2.tag) {
            case 0:
            case 11:
            case 15:
              var c2 = b2.return;
              try {
                Qj(4, b2);
              } catch (k2) {
                W2(b2, c2, k2);
              }
              break;
            case 1:
              var d = b2.stateNode;
              if ("function" === typeof d.componentDidMount) {
                var e = b2.return;
                try {
                  d.componentDidMount();
                } catch (k2) {
                  W2(b2, e, k2);
                }
              }
              var f = b2.return;
              try {
                Rj(b2);
              } catch (k2) {
                W2(b2, f, k2);
              }
              break;
            case 5:
              var g = b2.return;
              try {
                Rj(b2);
              } catch (k2) {
                W2(b2, g, k2);
              }
          }
        } catch (k2) {
          W2(b2, b2.return, k2);
        }
        if (b2 === a) {
          V2 = null;
          break;
        }
        var h = b2.sibling;
        if (null !== h) {
          h.return = b2.return;
          V2 = h;
          break;
        }
        V2 = b2.return;
      }
    }
    var lk = Math.ceil;
    var mk = ua.ReactCurrentDispatcher;
    var nk = ua.ReactCurrentOwner;
    var ok = ua.ReactCurrentBatchConfig;
    var K3 = 0;
    var Q4 = null;
    var Y2 = null;
    var Z4 = 0;
    var fj = 0;
    var ej = Uf(0);
    var T2 = 0;
    var pk = null;
    var rh = 0;
    var qk = 0;
    var rk = 0;
    var sk = null;
    var tk = null;
    var fk = 0;
    var Gj = Infinity;
    var uk = null;
    var Oi = false;
    var Pi = null;
    var Ri = null;
    var vk = false;
    var wk = null;
    var xk = 0;
    var yk = 0;
    var zk = null;
    var Ak = -1;
    var Bk = 0;
    function R2() {
      return 0 !== (K3 & 6) ? B3() : -1 !== Ak ? Ak : Ak = B3();
    }
    function yi(a) {
      if (0 === (a.mode & 1)) return 1;
      if (0 !== (K3 & 2) && 0 !== Z4) return Z4 & -Z4;
      if (null !== Kg.transition) return 0 === Bk && (Bk = yc()), Bk;
      a = C2;
      if (0 !== a) return a;
      a = window.event;
      a = void 0 === a ? 16 : jd(a.type);
      return a;
    }
    function gi(a, b2, c2, d) {
      if (50 < yk) throw yk = 0, zk = null, Error(p(185));
      Ac(a, c2, d);
      if (0 === (K3 & 2) || a !== Q4) a === Q4 && (0 === (K3 & 2) && (qk |= c2), 4 === T2 && Ck(a, Z4)), Dk(a, d), 1 === c2 && 0 === K3 && 0 === (b2.mode & 1) && (Gj = B3() + 500, fg && jg());
    }
    function Dk(a, b2) {
      var c2 = a.callbackNode;
      wc(a, b2);
      var d = uc(a, a === Q4 ? Z4 : 0);
      if (0 === d) null !== c2 && bc(c2), a.callbackNode = null, a.callbackPriority = 0;
      else if (b2 = d & -d, a.callbackPriority !== b2) {
        null != c2 && bc(c2);
        if (1 === b2) 0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
          0 === (K3 & 6) && jg();
        }), c2 = null;
        else {
          switch (Dc(d)) {
            case 1:
              c2 = fc;
              break;
            case 4:
              c2 = gc;
              break;
            case 16:
              c2 = hc;
              break;
            case 536870912:
              c2 = jc;
              break;
            default:
              c2 = hc;
          }
          c2 = Fk(c2, Gk.bind(null, a));
        }
        a.callbackPriority = b2;
        a.callbackNode = c2;
      }
    }
    function Gk(a, b2) {
      Ak = -1;
      Bk = 0;
      if (0 !== (K3 & 6)) throw Error(p(327));
      var c2 = a.callbackNode;
      if (Hk() && a.callbackNode !== c2) return null;
      var d = uc(a, a === Q4 ? Z4 : 0);
      if (0 === d) return null;
      if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b2) b2 = Ik(a, d);
      else {
        b2 = d;
        var e = K3;
        K3 |= 2;
        var f = Jk();
        if (Q4 !== a || Z4 !== b2) uk = null, Gj = B3() + 500, Kk(a, b2);
        do
          try {
            Lk();
            break;
          } catch (h) {
            Mk(a, h);
          }
        while (1);
        $g();
        mk.current = f;
        K3 = e;
        null !== Y2 ? b2 = 0 : (Q4 = null, Z4 = 0, b2 = T2);
      }
      if (0 !== b2) {
        2 === b2 && (e = xc(a), 0 !== e && (d = e, b2 = Nk(a, e)));
        if (1 === b2) throw c2 = pk, Kk(a, 0), Ck(a, d), Dk(a, B3()), c2;
        if (6 === b2) Ck(a, d);
        else {
          e = a.current.alternate;
          if (0 === (d & 30) && !Ok(e) && (b2 = Ik(a, d), 2 === b2 && (f = xc(a), 0 !== f && (d = f, b2 = Nk(a, f))), 1 === b2)) throw c2 = pk, Kk(a, 0), Ck(a, d), Dk(a, B3()), c2;
          a.finishedWork = e;
          a.finishedLanes = d;
          switch (b2) {
            case 0:
            case 1:
              throw Error(p(345));
            case 2:
              Pk(a, tk, uk);
              break;
            case 3:
              Ck(a, d);
              if ((d & 130023424) === d && (b2 = fk + 500 - B3(), 10 < b2)) {
                if (0 !== uc(a, 0)) break;
                e = a.suspendedLanes;
                if ((e & d) !== d) {
                  R2();
                  a.pingedLanes |= a.suspendedLanes & e;
                  break;
                }
                a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b2);
                break;
              }
              Pk(a, tk, uk);
              break;
            case 4:
              Ck(a, d);
              if ((d & 4194240) === d) break;
              b2 = a.eventTimes;
              for (e = -1; 0 < d; ) {
                var g = 31 - oc(d);
                f = 1 << g;
                g = b2[g];
                g > e && (e = g);
                d &= ~f;
              }
              d = e;
              d = B3() - d;
              d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
              if (10 < d) {
                a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
                break;
              }
              Pk(a, tk, uk);
              break;
            case 5:
              Pk(a, tk, uk);
              break;
            default:
              throw Error(p(329));
          }
        }
      }
      Dk(a, B3());
      return a.callbackNode === c2 ? Gk.bind(null, a) : null;
    }
    function Nk(a, b2) {
      var c2 = sk;
      a.current.memoizedState.isDehydrated && (Kk(a, b2).flags |= 256);
      a = Ik(a, b2);
      2 !== a && (b2 = tk, tk = c2, null !== b2 && Fj(b2));
      return a;
    }
    function Fj(a) {
      null === tk ? tk = a : tk.push.apply(tk, a);
    }
    function Ok(a) {
      for (var b2 = a; ; ) {
        if (b2.flags & 16384) {
          var c2 = b2.updateQueue;
          if (null !== c2 && (c2 = c2.stores, null !== c2)) for (var d = 0; d < c2.length; d++) {
            var e = c2[d], f = e.getSnapshot;
            e = e.value;
            try {
              if (!He2(f(), e)) return false;
            } catch (g) {
              return false;
            }
          }
        }
        c2 = b2.child;
        if (b2.subtreeFlags & 16384 && null !== c2) c2.return = b2, b2 = c2;
        else {
          if (b2 === a) break;
          for (; null === b2.sibling; ) {
            if (null === b2.return || b2.return === a) return true;
            b2 = b2.return;
          }
          b2.sibling.return = b2.return;
          b2 = b2.sibling;
        }
      }
      return true;
    }
    function Ck(a, b2) {
      b2 &= ~rk;
      b2 &= ~qk;
      a.suspendedLanes |= b2;
      a.pingedLanes &= ~b2;
      for (a = a.expirationTimes; 0 < b2; ) {
        var c2 = 31 - oc(b2), d = 1 << c2;
        a[c2] = -1;
        b2 &= ~d;
      }
    }
    function Ek(a) {
      if (0 !== (K3 & 6)) throw Error(p(327));
      Hk();
      var b2 = uc(a, 0);
      if (0 === (b2 & 1)) return Dk(a, B3()), null;
      var c2 = Ik(a, b2);
      if (0 !== a.tag && 2 === c2) {
        var d = xc(a);
        0 !== d && (b2 = d, c2 = Nk(a, d));
      }
      if (1 === c2) throw c2 = pk, Kk(a, 0), Ck(a, b2), Dk(a, B3()), c2;
      if (6 === c2) throw Error(p(345));
      a.finishedWork = a.current.alternate;
      a.finishedLanes = b2;
      Pk(a, tk, uk);
      Dk(a, B3());
      return null;
    }
    function Qk(a, b2) {
      var c2 = K3;
      K3 |= 1;
      try {
        return a(b2);
      } finally {
        K3 = c2, 0 === K3 && (Gj = B3() + 500, fg && jg());
      }
    }
    function Rk(a) {
      null !== wk && 0 === wk.tag && 0 === (K3 & 6) && Hk();
      var b2 = K3;
      K3 |= 1;
      var c2 = ok.transition, d = C2;
      try {
        if (ok.transition = null, C2 = 1, a) return a();
      } finally {
        C2 = d, ok.transition = c2, K3 = b2, 0 === (K3 & 6) && jg();
      }
    }
    function Hj() {
      fj = ej.current;
      E3(ej);
    }
    function Kk(a, b2) {
      a.finishedWork = null;
      a.finishedLanes = 0;
      var c2 = a.timeoutHandle;
      -1 !== c2 && (a.timeoutHandle = -1, Gf(c2));
      if (null !== Y2) for (c2 = Y2.return; null !== c2; ) {
        var d = c2;
        wg(d);
        switch (d.tag) {
          case 1:
            d = d.type.childContextTypes;
            null !== d && void 0 !== d && $f();
            break;
          case 3:
            zh();
            E3(Wf);
            E3(H3);
            Eh();
            break;
          case 5:
            Bh(d);
            break;
          case 4:
            zh();
            break;
          case 13:
            E3(L2);
            break;
          case 19:
            E3(L2);
            break;
          case 10:
            ah(d.type._context);
            break;
          case 22:
          case 23:
            Hj();
        }
        c2 = c2.return;
      }
      Q4 = a;
      Y2 = a = Pg(a.current, null);
      Z4 = fj = b2;
      T2 = 0;
      pk = null;
      rk = qk = rh = 0;
      tk = sk = null;
      if (null !== fh) {
        for (b2 = 0; b2 < fh.length; b2++) if (c2 = fh[b2], d = c2.interleaved, null !== d) {
          c2.interleaved = null;
          var e = d.next, f = c2.pending;
          if (null !== f) {
            var g = f.next;
            f.next = e;
            d.next = g;
          }
          c2.pending = d;
        }
        fh = null;
      }
      return a;
    }
    function Mk(a, b2) {
      do {
        var c2 = Y2;
        try {
          $g();
          Fh.current = Rh;
          if (Ih) {
            for (var d = M2.memoizedState; null !== d; ) {
              var e = d.queue;
              null !== e && (e.pending = null);
              d = d.next;
            }
            Ih = false;
          }
          Hh = 0;
          O3 = N2 = M2 = null;
          Jh = false;
          Kh = 0;
          nk.current = null;
          if (null === c2 || null === c2.return) {
            T2 = 1;
            pk = b2;
            Y2 = null;
            break;
          }
          a: {
            var f = a, g = c2.return, h = c2, k2 = b2;
            b2 = Z4;
            h.flags |= 32768;
            if (null !== k2 && "object" === typeof k2 && "function" === typeof k2.then) {
              var l2 = k2, m = h, q2 = m.tag;
              if (0 === (m.mode & 1) && (0 === q2 || 11 === q2 || 15 === q2)) {
                var r = m.alternate;
                r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
              }
              var y2 = Ui(g);
              if (null !== y2) {
                y2.flags &= -257;
                Vi(y2, g, h, f, b2);
                y2.mode & 1 && Si(f, l2, b2);
                b2 = y2;
                k2 = l2;
                var n = b2.updateQueue;
                if (null === n) {
                  var t = /* @__PURE__ */ new Set();
                  t.add(k2);
                  b2.updateQueue = t;
                } else n.add(k2);
                break a;
              } else {
                if (0 === (b2 & 1)) {
                  Si(f, l2, b2);
                  tj();
                  break a;
                }
                k2 = Error(p(426));
              }
            } else if (I3 && h.mode & 1) {
              var J3 = Ui(g);
              if (null !== J3) {
                0 === (J3.flags & 65536) && (J3.flags |= 256);
                Vi(J3, g, h, f, b2);
                Jg(Ji(k2, h));
                break a;
              }
            }
            f = k2 = Ji(k2, h);
            4 !== T2 && (T2 = 2);
            null === sk ? sk = [f] : sk.push(f);
            f = g;
            do {
              switch (f.tag) {
                case 3:
                  f.flags |= 65536;
                  b2 &= -b2;
                  f.lanes |= b2;
                  var x = Ni(f, k2, b2);
                  ph(f, x);
                  break a;
                case 1:
                  h = k2;
                  var w = f.type, u = f.stateNode;
                  if (0 === (f.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
                    f.flags |= 65536;
                    b2 &= -b2;
                    f.lanes |= b2;
                    var F2 = Qi(f, h, b2);
                    ph(f, F2);
                    break a;
                  }
              }
              f = f.return;
            } while (null !== f);
          }
          Sk(c2);
        } catch (na) {
          b2 = na;
          Y2 === c2 && null !== c2 && (Y2 = c2 = c2.return);
          continue;
        }
        break;
      } while (1);
    }
    function Jk() {
      var a = mk.current;
      mk.current = Rh;
      return null === a ? Rh : a;
    }
    function tj() {
      if (0 === T2 || 3 === T2 || 2 === T2) T2 = 4;
      null === Q4 || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q4, Z4);
    }
    function Ik(a, b2) {
      var c2 = K3;
      K3 |= 2;
      var d = Jk();
      if (Q4 !== a || Z4 !== b2) uk = null, Kk(a, b2);
      do
        try {
          Tk();
          break;
        } catch (e) {
          Mk(a, e);
        }
      while (1);
      $g();
      K3 = c2;
      mk.current = d;
      if (null !== Y2) throw Error(p(261));
      Q4 = null;
      Z4 = 0;
      return T2;
    }
    function Tk() {
      for (; null !== Y2; ) Uk(Y2);
    }
    function Lk() {
      for (; null !== Y2 && !cc(); ) Uk(Y2);
    }
    function Uk(a) {
      var b2 = Vk(a.alternate, a, fj);
      a.memoizedProps = a.pendingProps;
      null === b2 ? Sk(a) : Y2 = b2;
      nk.current = null;
    }
    function Sk(a) {
      var b2 = a;
      do {
        var c2 = b2.alternate;
        a = b2.return;
        if (0 === (b2.flags & 32768)) {
          if (c2 = Ej(c2, b2, fj), null !== c2) {
            Y2 = c2;
            return;
          }
        } else {
          c2 = Ij(c2, b2);
          if (null !== c2) {
            c2.flags &= 32767;
            Y2 = c2;
            return;
          }
          if (null !== a) a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
          else {
            T2 = 6;
            Y2 = null;
            return;
          }
        }
        b2 = b2.sibling;
        if (null !== b2) {
          Y2 = b2;
          return;
        }
        Y2 = b2 = a;
      } while (null !== b2);
      0 === T2 && (T2 = 5);
    }
    function Pk(a, b2, c2) {
      var d = C2, e = ok.transition;
      try {
        ok.transition = null, C2 = 1, Wk(a, b2, c2, d);
      } finally {
        ok.transition = e, C2 = d;
      }
      return null;
    }
    function Wk(a, b2, c2, d) {
      do
        Hk();
      while (null !== wk);
      if (0 !== (K3 & 6)) throw Error(p(327));
      c2 = a.finishedWork;
      var e = a.finishedLanes;
      if (null === c2) return null;
      a.finishedWork = null;
      a.finishedLanes = 0;
      if (c2 === a.current) throw Error(p(177));
      a.callbackNode = null;
      a.callbackPriority = 0;
      var f = c2.lanes | c2.childLanes;
      Bc(a, f);
      a === Q4 && (Y2 = Q4 = null, Z4 = 0);
      0 === (c2.subtreeFlags & 2064) && 0 === (c2.flags & 2064) || vk || (vk = true, Fk(hc, function() {
        Hk();
        return null;
      }));
      f = 0 !== (c2.flags & 15990);
      if (0 !== (c2.subtreeFlags & 15990) || f) {
        f = ok.transition;
        ok.transition = null;
        var g = C2;
        C2 = 1;
        var h = K3;
        K3 |= 4;
        nk.current = null;
        Oj(a, c2);
        dk(c2, a);
        Oe2(Df);
        dd = !!Cf;
        Df = Cf = null;
        a.current = c2;
        hk(c2, a, e);
        dc();
        K3 = h;
        C2 = g;
        ok.transition = f;
      } else a.current = c2;
      vk && (vk = false, wk = a, xk = e);
      f = a.pendingLanes;
      0 === f && (Ri = null);
      mc(c2.stateNode, d);
      Dk(a, B3());
      if (null !== b2) for (d = a.onRecoverableError, c2 = 0; c2 < b2.length; c2++) e = b2[c2], d(e.value, { componentStack: e.stack, digest: e.digest });
      if (Oi) throw Oi = false, a = Pi, Pi = null, a;
      0 !== (xk & 1) && 0 !== a.tag && Hk();
      f = a.pendingLanes;
      0 !== (f & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
      jg();
      return null;
    }
    function Hk() {
      if (null !== wk) {
        var a = Dc(xk), b2 = ok.transition, c2 = C2;
        try {
          ok.transition = null;
          C2 = 16 > a ? 16 : a;
          if (null === wk) var d = false;
          else {
            a = wk;
            wk = null;
            xk = 0;
            if (0 !== (K3 & 6)) throw Error(p(331));
            var e = K3;
            K3 |= 4;
            for (V2 = a.current; null !== V2; ) {
              var f = V2, g = f.child;
              if (0 !== (V2.flags & 16)) {
                var h = f.deletions;
                if (null !== h) {
                  for (var k2 = 0; k2 < h.length; k2++) {
                    var l2 = h[k2];
                    for (V2 = l2; null !== V2; ) {
                      var m = V2;
                      switch (m.tag) {
                        case 0:
                        case 11:
                        case 15:
                          Pj(8, m, f);
                      }
                      var q2 = m.child;
                      if (null !== q2) q2.return = m, V2 = q2;
                      else for (; null !== V2; ) {
                        m = V2;
                        var r = m.sibling, y2 = m.return;
                        Sj(m);
                        if (m === l2) {
                          V2 = null;
                          break;
                        }
                        if (null !== r) {
                          r.return = y2;
                          V2 = r;
                          break;
                        }
                        V2 = y2;
                      }
                    }
                  }
                  var n = f.alternate;
                  if (null !== n) {
                    var t = n.child;
                    if (null !== t) {
                      n.child = null;
                      do {
                        var J3 = t.sibling;
                        t.sibling = null;
                        t = J3;
                      } while (null !== t);
                    }
                  }
                  V2 = f;
                }
              }
              if (0 !== (f.subtreeFlags & 2064) && null !== g) g.return = f, V2 = g;
              else b: for (; null !== V2; ) {
                f = V2;
                if (0 !== (f.flags & 2048)) switch (f.tag) {
                  case 0:
                  case 11:
                  case 15:
                    Pj(9, f, f.return);
                }
                var x = f.sibling;
                if (null !== x) {
                  x.return = f.return;
                  V2 = x;
                  break b;
                }
                V2 = f.return;
              }
            }
            var w = a.current;
            for (V2 = w; null !== V2; ) {
              g = V2;
              var u = g.child;
              if (0 !== (g.subtreeFlags & 2064) && null !== u) u.return = g, V2 = u;
              else b: for (g = w; null !== V2; ) {
                h = V2;
                if (0 !== (h.flags & 2048)) try {
                  switch (h.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Qj(9, h);
                  }
                } catch (na) {
                  W2(h, h.return, na);
                }
                if (h === g) {
                  V2 = null;
                  break b;
                }
                var F2 = h.sibling;
                if (null !== F2) {
                  F2.return = h.return;
                  V2 = F2;
                  break b;
                }
                V2 = h.return;
              }
            }
            K3 = e;
            jg();
            if (lc && "function" === typeof lc.onPostCommitFiberRoot) try {
              lc.onPostCommitFiberRoot(kc, a);
            } catch (na) {
            }
            d = true;
          }
          return d;
        } finally {
          C2 = c2, ok.transition = b2;
        }
      }
      return false;
    }
    function Xk(a, b2, c2) {
      b2 = Ji(c2, b2);
      b2 = Ni(a, b2, 1);
      a = nh(a, b2, 1);
      b2 = R2();
      null !== a && (Ac(a, 1, b2), Dk(a, b2));
    }
    function W2(a, b2, c2) {
      if (3 === a.tag) Xk(a, a, c2);
      else for (; null !== b2; ) {
        if (3 === b2.tag) {
          Xk(b2, a, c2);
          break;
        } else if (1 === b2.tag) {
          var d = b2.stateNode;
          if ("function" === typeof b2.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
            a = Ji(c2, a);
            a = Qi(b2, a, 1);
            b2 = nh(b2, a, 1);
            a = R2();
            null !== b2 && (Ac(b2, 1, a), Dk(b2, a));
            break;
          }
        }
        b2 = b2.return;
      }
    }
    function Ti(a, b2, c2) {
      var d = a.pingCache;
      null !== d && d.delete(b2);
      b2 = R2();
      a.pingedLanes |= a.suspendedLanes & c2;
      Q4 === a && (Z4 & c2) === c2 && (4 === T2 || 3 === T2 && (Z4 & 130023424) === Z4 && 500 > B3() - fk ? Kk(a, 0) : rk |= c2);
      Dk(a, b2);
    }
    function Yk(a, b2) {
      0 === b2 && (0 === (a.mode & 1) ? b2 = 1 : (b2 = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
      var c2 = R2();
      a = ih(a, b2);
      null !== a && (Ac(a, b2, c2), Dk(a, c2));
    }
    function uj(a) {
      var b2 = a.memoizedState, c2 = 0;
      null !== b2 && (c2 = b2.retryLane);
      Yk(a, c2);
    }
    function bk(a, b2) {
      var c2 = 0;
      switch (a.tag) {
        case 13:
          var d = a.stateNode;
          var e = a.memoizedState;
          null !== e && (c2 = e.retryLane);
          break;
        case 19:
          d = a.stateNode;
          break;
        default:
          throw Error(p(314));
      }
      null !== d && d.delete(b2);
      Yk(a, c2);
    }
    var Vk;
    Vk = function(a, b2, c2) {
      if (null !== a) if (a.memoizedProps !== b2.pendingProps || Wf.current) dh = true;
      else {
        if (0 === (a.lanes & c2) && 0 === (b2.flags & 128)) return dh = false, yj(a, b2, c2);
        dh = 0 !== (a.flags & 131072) ? true : false;
      }
      else dh = false, I3 && 0 !== (b2.flags & 1048576) && ug(b2, ng, b2.index);
      b2.lanes = 0;
      switch (b2.tag) {
        case 2:
          var d = b2.type;
          ij(a, b2);
          a = b2.pendingProps;
          var e = Yf(b2, H3.current);
          ch(b2, c2);
          e = Nh(null, b2, d, a, e, c2);
          var f = Sh();
          b2.flags |= 1;
          "object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b2.tag = 1, b2.memoizedState = null, b2.updateQueue = null, Zf(d) ? (f = true, cg(b2)) : f = false, b2.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b2), e.updater = Ei, b2.stateNode = e, e._reactInternals = b2, Ii(b2, d, a, c2), b2 = jj(null, b2, d, true, f, c2)) : (b2.tag = 0, I3 && f && vg(b2), Xi(null, b2, e, c2), b2 = b2.child);
          return b2;
        case 16:
          d = b2.elementType;
          a: {
            ij(a, b2);
            a = b2.pendingProps;
            e = d._init;
            d = e(d._payload);
            b2.type = d;
            e = b2.tag = Zk(d);
            a = Ci(d, a);
            switch (e) {
              case 0:
                b2 = cj(null, b2, d, a, c2);
                break a;
              case 1:
                b2 = hj(null, b2, d, a, c2);
                break a;
              case 11:
                b2 = Yi(null, b2, d, a, c2);
                break a;
              case 14:
                b2 = $i(null, b2, d, Ci(d.type, a), c2);
                break a;
            }
            throw Error(p(
              306,
              d,
              ""
            ));
          }
          return b2;
        case 0:
          return d = b2.type, e = b2.pendingProps, e = b2.elementType === d ? e : Ci(d, e), cj(a, b2, d, e, c2);
        case 1:
          return d = b2.type, e = b2.pendingProps, e = b2.elementType === d ? e : Ci(d, e), hj(a, b2, d, e, c2);
        case 3:
          a: {
            kj(b2);
            if (null === a) throw Error(p(387));
            d = b2.pendingProps;
            f = b2.memoizedState;
            e = f.element;
            lh(a, b2);
            qh(b2, d, null, c2);
            var g = b2.memoizedState;
            d = g.element;
            if (f.isDehydrated) if (f = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b2.updateQueue.baseState = f, b2.memoizedState = f, b2.flags & 256) {
              e = Ji(Error(p(423)), b2);
              b2 = lj(a, b2, d, c2, e);
              break a;
            } else if (d !== e) {
              e = Ji(Error(p(424)), b2);
              b2 = lj(a, b2, d, c2, e);
              break a;
            } else for (yg = Lf(b2.stateNode.containerInfo.firstChild), xg = b2, I3 = true, zg = null, c2 = Vg(b2, null, d, c2), b2.child = c2; c2; ) c2.flags = c2.flags & -3 | 4096, c2 = c2.sibling;
            else {
              Ig();
              if (d === e) {
                b2 = Zi(a, b2, c2);
                break a;
              }
              Xi(a, b2, d, c2);
            }
            b2 = b2.child;
          }
          return b2;
        case 5:
          return Ah(b2), null === a && Eg(b2), d = b2.type, e = b2.pendingProps, f = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f && Ef(d, f) && (b2.flags |= 32), gj(a, b2), Xi(a, b2, g, c2), b2.child;
        case 6:
          return null === a && Eg(b2), null;
        case 13:
          return oj(a, b2, c2);
        case 4:
          return yh(b2, b2.stateNode.containerInfo), d = b2.pendingProps, null === a ? b2.child = Ug(b2, null, d, c2) : Xi(a, b2, d, c2), b2.child;
        case 11:
          return d = b2.type, e = b2.pendingProps, e = b2.elementType === d ? e : Ci(d, e), Yi(a, b2, d, e, c2);
        case 7:
          return Xi(a, b2, b2.pendingProps, c2), b2.child;
        case 8:
          return Xi(a, b2, b2.pendingProps.children, c2), b2.child;
        case 12:
          return Xi(a, b2, b2.pendingProps.children, c2), b2.child;
        case 10:
          a: {
            d = b2.type._context;
            e = b2.pendingProps;
            f = b2.memoizedProps;
            g = e.value;
            G3(Wg, d._currentValue);
            d._currentValue = g;
            if (null !== f) if (He2(f.value, g)) {
              if (f.children === e.children && !Wf.current) {
                b2 = Zi(a, b2, c2);
                break a;
              }
            } else for (f = b2.child, null !== f && (f.return = b2); null !== f; ) {
              var h = f.dependencies;
              if (null !== h) {
                g = f.child;
                for (var k2 = h.firstContext; null !== k2; ) {
                  if (k2.context === d) {
                    if (1 === f.tag) {
                      k2 = mh(-1, c2 & -c2);
                      k2.tag = 2;
                      var l2 = f.updateQueue;
                      if (null !== l2) {
                        l2 = l2.shared;
                        var m = l2.pending;
                        null === m ? k2.next = k2 : (k2.next = m.next, m.next = k2);
                        l2.pending = k2;
                      }
                    }
                    f.lanes |= c2;
                    k2 = f.alternate;
                    null !== k2 && (k2.lanes |= c2);
                    bh(
                      f.return,
                      c2,
                      b2
                    );
                    h.lanes |= c2;
                    break;
                  }
                  k2 = k2.next;
                }
              } else if (10 === f.tag) g = f.type === b2.type ? null : f.child;
              else if (18 === f.tag) {
                g = f.return;
                if (null === g) throw Error(p(341));
                g.lanes |= c2;
                h = g.alternate;
                null !== h && (h.lanes |= c2);
                bh(g, c2, b2);
                g = f.sibling;
              } else g = f.child;
              if (null !== g) g.return = f;
              else for (g = f; null !== g; ) {
                if (g === b2) {
                  g = null;
                  break;
                }
                f = g.sibling;
                if (null !== f) {
                  f.return = g.return;
                  g = f;
                  break;
                }
                g = g.return;
              }
              f = g;
            }
            Xi(a, b2, e.children, c2);
            b2 = b2.child;
          }
          return b2;
        case 9:
          return e = b2.type, d = b2.pendingProps.children, ch(b2, c2), e = eh(e), d = d(e), b2.flags |= 1, Xi(a, b2, d, c2), b2.child;
        case 14:
          return d = b2.type, e = Ci(d, b2.pendingProps), e = Ci(d.type, e), $i(a, b2, d, e, c2);
        case 15:
          return bj(a, b2, b2.type, b2.pendingProps, c2);
        case 17:
          return d = b2.type, e = b2.pendingProps, e = b2.elementType === d ? e : Ci(d, e), ij(a, b2), b2.tag = 1, Zf(d) ? (a = true, cg(b2)) : a = false, ch(b2, c2), Gi(b2, d, e), Ii(b2, d, e, c2), jj(null, b2, d, true, a, c2);
        case 19:
          return xj(a, b2, c2);
        case 22:
          return dj(a, b2, c2);
      }
      throw Error(p(156, b2.tag));
    };
    function Fk(a, b2) {
      return ac(a, b2);
    }
    function $k(a, b2, c2, d) {
      this.tag = a;
      this.key = c2;
      this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
      this.index = 0;
      this.ref = null;
      this.pendingProps = b2;
      this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
      this.mode = d;
      this.subtreeFlags = this.flags = 0;
      this.deletions = null;
      this.childLanes = this.lanes = 0;
      this.alternate = null;
    }
    function Bg(a, b2, c2, d) {
      return new $k(a, b2, c2, d);
    }
    function aj(a) {
      a = a.prototype;
      return !(!a || !a.isReactComponent);
    }
    function Zk(a) {
      if ("function" === typeof a) return aj(a) ? 1 : 0;
      if (void 0 !== a && null !== a) {
        a = a.$$typeof;
        if (a === Da) return 11;
        if (a === Ga) return 14;
      }
      return 2;
    }
    function Pg(a, b2) {
      var c2 = a.alternate;
      null === c2 ? (c2 = Bg(a.tag, b2, a.key, a.mode), c2.elementType = a.elementType, c2.type = a.type, c2.stateNode = a.stateNode, c2.alternate = a, a.alternate = c2) : (c2.pendingProps = b2, c2.type = a.type, c2.flags = 0, c2.subtreeFlags = 0, c2.deletions = null);
      c2.flags = a.flags & 14680064;
      c2.childLanes = a.childLanes;
      c2.lanes = a.lanes;
      c2.child = a.child;
      c2.memoizedProps = a.memoizedProps;
      c2.memoizedState = a.memoizedState;
      c2.updateQueue = a.updateQueue;
      b2 = a.dependencies;
      c2.dependencies = null === b2 ? null : { lanes: b2.lanes, firstContext: b2.firstContext };
      c2.sibling = a.sibling;
      c2.index = a.index;
      c2.ref = a.ref;
      return c2;
    }
    function Rg(a, b2, c2, d, e, f) {
      var g = 2;
      d = a;
      if ("function" === typeof a) aj(a) && (g = 1);
      else if ("string" === typeof a) g = 5;
      else a: switch (a) {
        case ya:
          return Tg(c2.children, e, f, b2);
        case za:
          g = 8;
          e |= 8;
          break;
        case Aa:
          return a = Bg(12, c2, b2, e | 2), a.elementType = Aa, a.lanes = f, a;
        case Ea:
          return a = Bg(13, c2, b2, e), a.elementType = Ea, a.lanes = f, a;
        case Fa:
          return a = Bg(19, c2, b2, e), a.elementType = Fa, a.lanes = f, a;
        case Ia:
          return pj(c2, e, f, b2);
        default:
          if ("object" === typeof a && null !== a) switch (a.$$typeof) {
            case Ba:
              g = 10;
              break a;
            case Ca:
              g = 9;
              break a;
            case Da:
              g = 11;
              break a;
            case Ga:
              g = 14;
              break a;
            case Ha:
              g = 16;
              d = null;
              break a;
          }
          throw Error(p(130, null == a ? a : typeof a, ""));
      }
      b2 = Bg(g, c2, b2, e);
      b2.elementType = a;
      b2.type = d;
      b2.lanes = f;
      return b2;
    }
    function Tg(a, b2, c2, d) {
      a = Bg(7, a, d, b2);
      a.lanes = c2;
      return a;
    }
    function pj(a, b2, c2, d) {
      a = Bg(22, a, d, b2);
      a.elementType = Ia;
      a.lanes = c2;
      a.stateNode = { isHidden: false };
      return a;
    }
    function Qg(a, b2, c2) {
      a = Bg(6, a, null, b2);
      a.lanes = c2;
      return a;
    }
    function Sg(a, b2, c2) {
      b2 = Bg(4, null !== a.children ? a.children : [], a.key, b2);
      b2.lanes = c2;
      b2.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
      return b2;
    }
    function al(a, b2, c2, d, e) {
      this.tag = b2;
      this.containerInfo = a;
      this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
      this.timeoutHandle = -1;
      this.callbackNode = this.pendingContext = this.context = null;
      this.callbackPriority = 0;
      this.eventTimes = zc(0);
      this.expirationTimes = zc(-1);
      this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
      this.entanglements = zc(0);
      this.identifierPrefix = d;
      this.onRecoverableError = e;
      this.mutableSourceEagerHydrationData = null;
    }
    function bl(a, b2, c2, d, e, f, g, h, k2) {
      a = new al(a, b2, c2, h, k2);
      1 === b2 ? (b2 = 1, true === f && (b2 |= 8)) : b2 = 0;
      f = Bg(3, null, null, b2);
      a.current = f;
      f.stateNode = a;
      f.memoizedState = { element: d, isDehydrated: c2, cache: null, transitions: null, pendingSuspenseBoundaries: null };
      kh(f);
      return a;
    }
    function cl(a, b2, c2) {
      var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
      return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b2, implementation: c2 };
    }
    function dl(a) {
      if (!a) return Vf;
      a = a._reactInternals;
      a: {
        if (Vb(a) !== a || 1 !== a.tag) throw Error(p(170));
        var b2 = a;
        do {
          switch (b2.tag) {
            case 3:
              b2 = b2.stateNode.context;
              break a;
            case 1:
              if (Zf(b2.type)) {
                b2 = b2.stateNode.__reactInternalMemoizedMergedChildContext;
                break a;
              }
          }
          b2 = b2.return;
        } while (null !== b2);
        throw Error(p(171));
      }
      if (1 === a.tag) {
        var c2 = a.type;
        if (Zf(c2)) return bg(a, c2, b2);
      }
      return b2;
    }
    function el(a, b2, c2, d, e, f, g, h, k2) {
      a = bl(c2, d, true, a, e, f, g, h, k2);
      a.context = dl(null);
      c2 = a.current;
      d = R2();
      e = yi(c2);
      f = mh(d, e);
      f.callback = void 0 !== b2 && null !== b2 ? b2 : null;
      nh(c2, f, e);
      a.current.lanes = e;
      Ac(a, e, d);
      Dk(a, d);
      return a;
    }
    function fl(a, b2, c2, d) {
      var e = b2.current, f = R2(), g = yi(e);
      c2 = dl(c2);
      null === b2.context ? b2.context = c2 : b2.pendingContext = c2;
      b2 = mh(f, g);
      b2.payload = { element: a };
      d = void 0 === d ? null : d;
      null !== d && (b2.callback = d);
      a = nh(e, b2, g);
      null !== a && (gi(a, e, g, f), oh(a, e, g));
      return g;
    }
    function gl(a) {
      a = a.current;
      if (!a.child) return null;
      switch (a.child.tag) {
        case 5:
          return a.child.stateNode;
        default:
          return a.child.stateNode;
      }
    }
    function hl(a, b2) {
      a = a.memoizedState;
      if (null !== a && null !== a.dehydrated) {
        var c2 = a.retryLane;
        a.retryLane = 0 !== c2 && c2 < b2 ? c2 : b2;
      }
    }
    function il(a, b2) {
      hl(a, b2);
      (a = a.alternate) && hl(a, b2);
    }
    function jl() {
      return null;
    }
    var kl = "function" === typeof reportError ? reportError : function(a) {
      console.error(a);
    };
    function ll(a) {
      this._internalRoot = a;
    }
    ml.prototype.render = ll.prototype.render = function(a) {
      var b2 = this._internalRoot;
      if (null === b2) throw Error(p(409));
      fl(a, b2, null, null);
    };
    ml.prototype.unmount = ll.prototype.unmount = function() {
      var a = this._internalRoot;
      if (null !== a) {
        this._internalRoot = null;
        var b2 = a.containerInfo;
        Rk(function() {
          fl(null, a, null, null);
        });
        b2[uf] = null;
      }
    };
    function ml(a) {
      this._internalRoot = a;
    }
    ml.prototype.unstable_scheduleHydration = function(a) {
      if (a) {
        var b2 = Hc();
        a = { blockedOn: null, target: a, priority: b2 };
        for (var c2 = 0; c2 < Qc.length && 0 !== b2 && b2 < Qc[c2].priority; c2++) ;
        Qc.splice(c2, 0, a);
        0 === c2 && Vc(a);
      }
    };
    function nl(a) {
      return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
    }
    function ol(a) {
      return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
    }
    function pl() {
    }
    function ql(a, b2, c2, d, e) {
      if (e) {
        if ("function" === typeof d) {
          var f = d;
          d = function() {
            var a2 = gl(g);
            f.call(a2);
          };
        }
        var g = el(b2, d, a, 0, null, false, false, "", pl);
        a._reactRootContainer = g;
        a[uf] = g.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        Rk();
        return g;
      }
      for (; e = a.lastChild; ) a.removeChild(e);
      if ("function" === typeof d) {
        var h = d;
        d = function() {
          var a2 = gl(k2);
          h.call(a2);
        };
      }
      var k2 = bl(a, 0, false, null, null, false, false, "", pl);
      a._reactRootContainer = k2;
      a[uf] = k2.current;
      sf(8 === a.nodeType ? a.parentNode : a);
      Rk(function() {
        fl(b2, k2, c2, d);
      });
      return k2;
    }
    function rl(a, b2, c2, d, e) {
      var f = c2._reactRootContainer;
      if (f) {
        var g = f;
        if ("function" === typeof e) {
          var h = e;
          e = function() {
            var a2 = gl(g);
            h.call(a2);
          };
        }
        fl(b2, g, a, e);
      } else g = ql(c2, b2, a, e, d);
      return gl(g);
    }
    Ec = function(a) {
      switch (a.tag) {
        case 3:
          var b2 = a.stateNode;
          if (b2.current.memoizedState.isDehydrated) {
            var c2 = tc(b2.pendingLanes);
            0 !== c2 && (Cc(b2, c2 | 1), Dk(b2, B3()), 0 === (K3 & 6) && (Gj = B3() + 500, jg()));
          }
          break;
        case 13:
          Rk(function() {
            var b3 = ih(a, 1);
            if (null !== b3) {
              var c3 = R2();
              gi(b3, a, 1, c3);
            }
          }), il(a, 1);
      }
    };
    Fc = function(a) {
      if (13 === a.tag) {
        var b2 = ih(a, 134217728);
        if (null !== b2) {
          var c2 = R2();
          gi(b2, a, 134217728, c2);
        }
        il(a, 134217728);
      }
    };
    Gc = function(a) {
      if (13 === a.tag) {
        var b2 = yi(a), c2 = ih(a, b2);
        if (null !== c2) {
          var d = R2();
          gi(c2, a, b2, d);
        }
        il(a, b2);
      }
    };
    Hc = function() {
      return C2;
    };
    Ic = function(a, b2) {
      var c2 = C2;
      try {
        return C2 = a, b2();
      } finally {
        C2 = c2;
      }
    };
    yb = function(a, b2, c2) {
      switch (b2) {
        case "input":
          bb(a, c2);
          b2 = c2.name;
          if ("radio" === c2.type && null != b2) {
            for (c2 = a; c2.parentNode; ) c2 = c2.parentNode;
            c2 = c2.querySelectorAll("input[name=" + JSON.stringify("" + b2) + '][type="radio"]');
            for (b2 = 0; b2 < c2.length; b2++) {
              var d = c2[b2];
              if (d !== a && d.form === a.form) {
                var e = Db(d);
                if (!e) throw Error(p(90));
                Wa(d);
                bb(d, e);
              }
            }
          }
          break;
        case "textarea":
          ib(a, c2);
          break;
        case "select":
          b2 = c2.value, null != b2 && fb(a, !!c2.multiple, b2, false);
      }
    };
    Gb = Qk;
    Hb = Rk;
    var sl = { usingClientEntryPoint: false, Events: [Cb, ue3, Db, Eb, Fb, Qk] };
    var tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
    var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
      a = Zb(a);
      return null === a ? null : a.stateNode;
    }, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
    if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
      vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!vl.isDisabled && vl.supportsFiber) try {
        kc = vl.inject(ul), lc = vl;
      } catch (a) {
      }
    }
    var vl;
    exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
    exports.createPortal = function(a, b2) {
      var c2 = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
      if (!nl(b2)) throw Error(p(200));
      return cl(a, b2, null, c2);
    };
    exports.createRoot = function(a, b2) {
      if (!nl(a)) throw Error(p(299));
      var c2 = false, d = "", e = kl;
      null !== b2 && void 0 !== b2 && (true === b2.unstable_strictMode && (c2 = true), void 0 !== b2.identifierPrefix && (d = b2.identifierPrefix), void 0 !== b2.onRecoverableError && (e = b2.onRecoverableError));
      b2 = bl(a, 1, false, null, null, c2, false, d, e);
      a[uf] = b2.current;
      sf(8 === a.nodeType ? a.parentNode : a);
      return new ll(b2);
    };
    exports.findDOMNode = function(a) {
      if (null == a) return null;
      if (1 === a.nodeType) return a;
      var b2 = a._reactInternals;
      if (void 0 === b2) {
        if ("function" === typeof a.render) throw Error(p(188));
        a = Object.keys(a).join(",");
        throw Error(p(268, a));
      }
      a = Zb(b2);
      a = null === a ? null : a.stateNode;
      return a;
    };
    exports.flushSync = function(a) {
      return Rk(a);
    };
    exports.hydrate = function(a, b2, c2) {
      if (!ol(b2)) throw Error(p(200));
      return rl(null, a, b2, true, c2);
    };
    exports.hydrateRoot = function(a, b2, c2) {
      if (!nl(a)) throw Error(p(405));
      var d = null != c2 && c2.hydratedSources || null, e = false, f = "", g = kl;
      null !== c2 && void 0 !== c2 && (true === c2.unstable_strictMode && (e = true), void 0 !== c2.identifierPrefix && (f = c2.identifierPrefix), void 0 !== c2.onRecoverableError && (g = c2.onRecoverableError));
      b2 = el(b2, null, a, 1, null != c2 ? c2 : null, e, false, f, g);
      a[uf] = b2.current;
      sf(a);
      if (d) for (a = 0; a < d.length; a++) c2 = d[a], e = c2._getVersion, e = e(c2._source), null == b2.mutableSourceEagerHydrationData ? b2.mutableSourceEagerHydrationData = [c2, e] : b2.mutableSourceEagerHydrationData.push(
        c2,
        e
      );
      return new ml(b2);
    };
    exports.render = function(a, b2, c2) {
      if (!ol(b2)) throw Error(p(200));
      return rl(null, a, b2, false, c2);
    };
    exports.unmountComponentAtNode = function(a) {
      if (!ol(a)) throw Error(p(40));
      return a._reactRootContainer ? (Rk(function() {
        rl(null, null, a, false, function() {
          a._reactRootContainer = null;
          a[uf] = null;
        });
      }), true) : false;
    };
    exports.unstable_batchedUpdates = Qk;
    exports.unstable_renderSubtreeIntoContainer = function(a, b2, c2, d) {
      if (!ol(c2)) throw Error(p(200));
      if (null == a || void 0 === a._reactInternals) throw Error(p(38));
      return rl(a, b2, c2, false, d);
    };
    exports.version = "18.3.1-next-f1338f8080-20240426";
  }
});

// ../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/index.js
var require_react_dom = __commonJS({
  "../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/index.js"(exports, module) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (false) {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (true) {
      checkDCE();
      module.exports = require_react_dom_production_min();
    } else {
      module.exports = null;
    }
  }
});

// ../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/client.js
var require_client = __commonJS({
  "../../common/temp/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/client.js"(exports) {
    "use strict";
    var m = require_react_dom();
    if (true) {
      exports.createRoot = m.createRoot;
      exports.hydrateRoot = m.hydrateRoot;
    } else {
      i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
      exports.createRoot = function(c2, o) {
        i.usingClientEntryPoint = true;
        try {
          return m.createRoot(c2, o);
        } finally {
          i.usingClientEntryPoint = false;
        }
      };
      exports.hydrateRoot = function(c2, h, o) {
        i.usingClientEntryPoint = true;
        try {
          return m.hydrateRoot(c2, h, o);
        } finally {
          i.usingClientEntryPoint = false;
        }
      };
    }
    var i;
  }
});

// ../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react-jsx-runtime.production.min.js
var require_react_jsx_runtime_production_min = __commonJS({
  "../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/cjs/react-jsx-runtime.production.min.js"(exports) {
    "use strict";
    var f = require_react();
    var k2 = /* @__PURE__ */ Symbol.for("react.element");
    var l2 = /* @__PURE__ */ Symbol.for("react.fragment");
    var m = Object.prototype.hasOwnProperty;
    var n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
    var p = { key: true, ref: true, __self: true, __source: true };
    function q2(c2, a, g) {
      var b2, d = {}, e = null, h = null;
      void 0 !== g && (e = "" + g);
      void 0 !== a.key && (e = "" + a.key);
      void 0 !== a.ref && (h = a.ref);
      for (b2 in a) m.call(a, b2) && !p.hasOwnProperty(b2) && (d[b2] = a[b2]);
      if (c2 && c2.defaultProps) for (b2 in a = c2.defaultProps, a) void 0 === d[b2] && (d[b2] = a[b2]);
      return { $$typeof: k2, type: c2, key: e, ref: h, props: d, _owner: n.current };
    }
    exports.Fragment = l2;
    exports.jsx = q2;
    exports.jsxs = q2;
  }
});

// ../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "../../common/temp/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_jsx_runtime_production_min();
    } else {
      module.exports = null;
    }
  }
});

// src/client/app.tsx
var import_react5 = __toESM(require_react(), 1);
var import_client = __toESM(require_client(), 1);

// src/client/LogViewer.tsx
var import_react4 = __toESM(require_react(), 1);

// ../../common/temp/node_modules/.pnpm/@svar-ui+react-grid@2.5.2_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@svar-ui/react-grid/dist/index.es.js
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
var import_react3 = __toESM(require_react(), 1);

// ../../common/temp/node_modules/.pnpm/@svar-ui+react-core@2.4.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@svar-ui/react-core/dist/index.es.js
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var import_react2 = __toESM(require_react(), 1);

// ../../common/temp/node_modules/.pnpm/@svar-ui+lib-react@1.2.2/node_modules/@svar-ui/lib-react/dist/index.js
var import_react = __toESM(require_react(), 1);

// ../../common/temp/node_modules/.pnpm/@svar-ui+lib-dom@0.11.1/node_modules/@svar-ui/lib-dom/dist/index.js
function locate(el, attr = "data-id") {
  let node = el;
  if (!node.tagName && el.target)
    node = el.target;
  while (node) {
    if (node.getAttribute) {
      const id3 = node.getAttribute(attr);
      if (id3) return node;
    }
    node = node.parentNode;
  }
  return null;
}
function locateAttr(el, attr = "data-id") {
  const node = locate(el, attr);
  if (node) return node.getAttribute(attr);
  return null;
}
function locateID(el, attr = "data-id") {
  const node = locate(el, attr);
  if (node) {
    return id(node.getAttribute(attr));
  }
  return null;
}
function id(value) {
  if (typeof value === "string") {
    const t = value * 1;
    if (!isNaN(t)) return t;
  }
  return value;
}
function getEnv() {
  return {
    detect: () => true,
    addEvent: function(node, event, handler) {
      node.addEventListener(event, handler);
      return () => node.removeEventListener(event, handler);
    },
    addGlobalEvent: function(event, handler) {
      document.addEventListener(event, handler);
      return () => document.removeEventListener(event, handler);
    },
    getTopNode: function() {
      return window.document.body;
    }
  };
}
var env = getEnv();
function setEnv(update) {
  Object.assign(env, update);
}
function delegateEvent(node, handlers, event) {
  function handleEvent(ev) {
    const node2 = locate(ev);
    if (!node2) return;
    const id3 = id(node2.dataset.id);
    if (typeof handlers === "function") return handlers(id3, ev);
    let action;
    let test = ev.target;
    while (test != node2) {
      action = test.dataset ? test.dataset.action : null;
      if (action) {
        if (handlers[action]) {
          handlers[action](id3, ev);
          return;
        }
      }
      test = test.parentNode;
    }
    if (handlers[event]) handlers[event](id3, ev);
  }
  env.addEvent(node, event, handleEvent);
}
function delegateClick(node, handlers) {
  delegateEvent(node, handlers, "click");
  if (handlers.dblclick) delegateEvent(node, handlers.dblclick, "dblclick");
}
function remove(items, node) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i] === node) {
      items.splice(i, 1);
      break;
    }
  }
}
var activationDate = /* @__PURE__ */ new Date();
var skipNext = false;
var outsideHandlers = [];
var outsideListners = [];
var handleOutsideClick = (event) => {
  if (skipNext) {
    skipNext = false;
    return;
  }
  for (let i = outsideListners.length - 1; i >= 0; i--) {
    const { node, date, props } = outsideListners[i];
    if (date > activationDate) continue;
    if (!node.contains(event.target) && node !== event.target) {
      if (props.callback) props.callback(event);
      if (props.modal || event.defaultPrevented) break;
    }
  }
};
var handleMouseDown = (event) => {
  activationDate = /* @__PURE__ */ new Date();
  skipNext = true;
  for (let i = outsideListners.length - 1; i >= 0; i--) {
    const { node } = outsideListners[i];
    if (!node.contains(event.target) && node !== event.target) {
      skipNext = false;
      break;
    }
  }
};
function clickOutside(node, props) {
  if (!outsideHandlers.length) {
    outsideHandlers = [
      env.addGlobalEvent("click", handleOutsideClick, node),
      env.addGlobalEvent("contextmenu", handleOutsideClick, node),
      env.addGlobalEvent("mousedown", handleMouseDown, node)
    ];
  }
  if (typeof props !== "object") {
    props = { callback: props };
  }
  const pack = { node, date: /* @__PURE__ */ new Date(), props };
  outsideListners.push(pack);
  return {
    destroy() {
      remove(outsideListners, pack);
      if (!outsideListners.length) {
        outsideHandlers.forEach((e) => e());
        outsideHandlers = [];
      }
    }
  };
}
var id2 = (/* @__PURE__ */ new Date()).valueOf();
function uid() {
  id2 += 1;
  return id2;
}
function toFixed(num) {
  if (num < 10) return "0" + num;
  return num.toString();
}
function toFixedMs(num) {
  const temp = toFixed(num);
  return temp.length == 2 ? "0" + temp : temp;
}
function getDuodecade(year) {
  const start = Math.floor(year / 11) * 11;
  return {
    start,
    end: start + 11
  };
}
function getWeekNumber(ndate, weekStart = 1) {
  let nday = ndate.getDay();
  if (nday === 0) {
    nday = 7;
  }
  nday = (nday - weekStart + 7) % 7;
  const first_thursday = new Date(ndate.valueOf());
  first_thursday.setDate(ndate.getDate() + (3 - nday));
  const year_number = first_thursday.getFullYear();
  const ordinal_date = Math.floor(
    (first_thursday.getTime() - new Date(year_number, 0, 1).getTime()) / 864e5
  );
  return 1 + Math.floor(ordinal_date / 7);
}
var emptyAmPm = ["", ""];
function date2str(mask, date, locale2) {
  switch (mask) {
    case "%d":
      return toFixed(date.getDate());
    case "%m":
      return toFixed(date.getMonth() + 1);
    case "%j":
      return date.getDate();
    case "%n":
      return date.getMonth() + 1;
    case "%y":
      return toFixed(date.getFullYear() % 100);
    case "%Y":
      return date.getFullYear();
    case "%D":
      return locale2.dayShort[date.getDay()];
    case "%l":
      return locale2.dayFull[date.getDay()];
    case "%M":
      return locale2.monthShort[date.getMonth()];
    case "%F":
      return locale2.monthFull[date.getMonth()];
    case "%h":
      return toFixed((date.getHours() + 11) % 12 + 1);
    case "%g":
      return (date.getHours() + 11) % 12 + 1;
    case "%G":
      return date.getHours();
    case "%H":
      return toFixed(date.getHours());
    case "%i":
      return toFixed(date.getMinutes());
    case "%a":
      return ((date.getHours() > 11 ? locale2.pm : locale2.am) || emptyAmPm)[0];
    case "%A":
      return ((date.getHours() > 11 ? locale2.pm : locale2.am) || emptyAmPm)[1];
    case "%s":
      return toFixed(date.getSeconds());
    case "%S":
      return toFixedMs(date.getMilliseconds());
    case "%W":
      return toFixed(getWeekNumber(date));
    case "%w":
      return toFixed(getWeekNumber(date, locale2.weekStart ?? 1));
    case "%c": {
      let str = date.getFullYear() + "";
      str += "-" + toFixed(date.getMonth() + 1);
      str += "-" + toFixed(date.getDate());
      str += "T";
      str += toFixed(date.getHours());
      str += ":" + toFixed(date.getMinutes());
      str += ":" + toFixed(date.getSeconds());
      return str;
    }
    case "%Q":
      return Math.floor(date.getMonth() / 3) + 1;
    default:
      return mask;
  }
}
var formatFlags = /%[a-zA-Z]/g;
function dateToString(format, locale2) {
  if (typeof format == "function") return format;
  return function(date) {
    if (!date) return "";
    if (!date.getMonth) date = new Date(date);
    return format.replace(
      formatFlags,
      (s) => date2str(s, date, locale2)
    );
  };
}
function isObject(a) {
  return a && typeof a === "object" && !Array.isArray(a);
}
function extend(a, b2) {
  for (const key in b2) {
    const from = b2[key];
    if (isObject(a[key]) && isObject(from)) {
      a[key] = extend(
        { ...a[key] },
        b2[key]
      );
    } else {
      a[key] = b2[key];
    }
  }
  return a;
}
function locale(words) {
  return {
    getGroup(group) {
      const block = words[group];
      return (key) => {
        return block ? block[key] || key : key;
      };
    },
    getRaw() {
      return words;
    },
    extend(values, optional) {
      if (!values) return this;
      let data2;
      if (optional) {
        data2 = extend({ ...values }, words);
      } else {
        data2 = extend({ ...words }, values);
      }
      return locale(data2);
    }
  };
}

// ../../common/temp/node_modules/.pnpm/@svar-ui+lib-react@1.2.2/node_modules/@svar-ui/lib-react/dist/index.js
function useWritableProp(propValue) {
  const [value, setValue] = (0, import_react.useState)(propValue);
  const prevPropRef = (0, import_react.useRef)(propValue);
  (0, import_react.useEffect)(() => {
    if (prevPropRef.current !== propValue) {
      if (Array.isArray(prevPropRef.current) && Array.isArray(propValue) && prevPropRef.current.length === 0 && propValue.length === 0)
        return;
      prevPropRef.current = propValue;
      setValue(propValue);
    }
  }, [propValue]);
  return [value, setValue];
}
function useWritable(writable2, initialValue, name) {
  const [state, setState] = (0, import_react.useState)(() => initialValue);
  if (!writable2) console.warn(`Writable ${name} is not defined`);
  (0, import_react.useEffect)(() => {
    if (!writable2) return;
    const unsubscribe = writable2.subscribe((newValue) => {
      setState(() => newValue);
    });
    return unsubscribe;
  }, [writable2]);
  return state;
}
function useStore(store, name) {
  const s = store.getState();
  const r = store.getReactiveState();
  return useWritable(r[name], s[name], name);
}
function useWritableWithCounter(writable2, initialValue) {
  const state = (0, import_react.useRef)(initialValue);
  state.current = initialValue;
  const [counter, setCounter] = (0, import_react.useState)(1);
  (0, import_react.useEffect)(() => {
    const unsubscribe = writable2.subscribe((newValue) => {
      state.current = newValue;
      setCounter((v2) => v2 + 1);
    });
    return unsubscribe;
  }, [writable2]);
  return [state.current, counter];
}
function useStoreWithCounter(store, name) {
  const s = store.getState();
  const r = store.getReactiveState();
  return useWritableWithCounter(r[name], s[name]);
}
function snippet(name, arg) {
  if (typeof name === "function") {
    if (typeof arg === "object") {
      return name(arg);
    } else {
      return name();
    }
  }
  return name;
}
function styleObject(text) {
  const out = {};
  text.split(";").forEach((x) => {
    const [k2, v2] = x.split(":");
    if (v2) {
      let n = k2.trim();
      if (n.indexOf("-")) n = n.replace(/-([a-z])/g, (_, c2) => c2.toUpperCase());
      out[n] = v2.trim();
    }
  });
  return out;
}
function writable(value) {
  let _value = value;
  let listeners = [];
  const subscribe = (cb) => {
    listeners.push(cb);
    cb(_value);
  };
  const unsubscribe = (cb) => {
    listeners = listeners.filter((l2) => l2 !== cb);
  };
  const update = (cb) => {
    _value = cb(_value);
    listeners.forEach((l2) => l2(_value));
  };
  const set = (v2) => {
    _value = v2;
    listeners.forEach((l2) => l2(_value));
  };
  return {
    subscribe,
    unsubscribe,
    set,
    update
  };
}
function delegateEvent2(node, handlers, event) {
  function handleEvent(ev) {
    const node2 = locate(ev);
    if (!node2) return;
    const id$1 = id(node2.dataset.id);
    if (typeof handlers === "function") return handlers(id$1, ev);
    let action;
    let test = ev.target;
    while (test != node2) {
      action = test.dataset ? test.dataset.action : null;
      if (action) {
        if (handlers[action]) {
          handlers[action](id$1, ev);
          return;
        }
      }
      test = test.parentNode;
    }
    if (handlers[event]) handlers[event](id$1, ev);
  }
  return env.addEvent(node, event, handleEvent);
}
function delegateClick2(node, handlers) {
  const result = [delegateEvent2(node, handlers, "click")];
  if (handlers.dblclick)
    result.push(delegateEvent2(node, handlers.dblclick, "dblclick"));
  return () => {
    result.forEach((r) => r());
  };
}

// ../../common/temp/node_modules/.pnpm/@svar-ui+core-locales@2.4.0/node_modules/@svar-ui/core-locales/locales/en.js
var lang = "en-US";
var calendar = {
  monthFull: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  monthShort: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ],
  dayFull: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ],
  dayShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  hours: "Hours",
  minutes: "Minutes",
  done: "Done",
  clear: "Clear",
  today: "Today",
  am: ["am", "AM"],
  pm: ["pm", "PM"],
  weekStart: 0,
  clockFormat: 24
};
var core = {
  ok: "OK",
  cancel: "Cancel",
  select: "Select",
  "No data": "No data",
  "Rows per page": "Rows per page",
  "Total pages": "Total pages"
};
var formats = {
  timeFormat: "%H:%i",
  dateFormat: "%m/%d/%Y",
  monthYearFormat: "%F %Y",
  yearFormat: "%Y"
};
var data = {
  core,
  calendar,
  formats,
  lang
};
var en_default = data;

// ../../common/temp/node_modules/.pnpm/@svar-ui+react-core@2.4.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@svar-ui/react-core/dist/index.es.js
var import_react_dom = __toESM(require_react_dom(), 1);
var re = (0, import_react2.createContext)("willow");
var Me = (0, import_react2.createContext)({});
var G = (0, import_react2.createContext)(null);
var se = (0, import_react2.createContext)(null);
var Dt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fieldId: se,
  helpers: Me,
  i18n: G,
  theme: re
}, Symbol.toStringTag, { value: "Module" }));
function z(e) {
  const n = (0, import_react2.useContext)(se), [t] = (0, import_react2.useState)(() => e || n && n() || uid());
  return t;
}
function ee({
  type: e = "",
  css: n = "",
  icon: t = "",
  disabled: c2 = false,
  title: r = "",
  text: i = "",
  children: o,
  onClick: s
}) {
  const a = (0, import_react2.useMemo)(() => {
    let w = e ? e.split(" ").filter((f) => f !== "").map((f) => "wx-" + f).join(" ") : "";
    return n + (n ? " " : "") + w;
  }, [e, n]), u = (w) => {
    s && s(w);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      title: r,
      className: `wx-2ZWgb4 wx-button ${a} ${t && !o ? "wx-icon" : ""}`,
      disabled: c2,
      onClick: u,
      children: [
        t && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "wx-2ZWgb4 " + t }),
        o || i || " "
      ]
    }
  );
}
function te({
  position: e = "bottom",
  align: n = "start",
  autoFit: t = true,
  onCancel: c2,
  width: r = "100%",
  children: i
}) {
  const o = (0, import_react2.useRef)(null), [s, a] = useWritableProp(e), [u, w] = useWritableProp(n);
  return (0, import_react2.useEffect)(() => {
    if (t) {
      const f = o.current;
      if (f) {
        const x = f.getBoundingClientRect(), m = env.getTopNode(f).getBoundingClientRect();
        x.right >= m.right && w("end"), x.bottom >= m.bottom && a("top");
      }
    }
  }, [t]), (0, import_react2.useEffect)(() => {
    if (o.current) {
      const f = (x) => {
        c2 && c2(x);
      };
      return clickOutside(o.current, f).destroy;
    }
  }, [c2]), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: o,
      className: `wx-32GZ52 wx-dropdown wx-${s}-${u}`,
      style: { width: r },
      children: i
    }
  );
}
function Z() {
  return locale(en_default);
}
function je() {
  let e = null, n = false, t, c2, r, i;
  const o = (x, m, p, d) => {
    t = x, c2 = m, r = p, i = d;
  }, s = (x) => {
    e = x, n = e !== null, r(e);
  }, a = (x, m) => {
    if (x !== null && t) {
      const p = t.querySelectorAll(".wx-list > .wx-item")[x];
      p && (p.scrollIntoView({ block: "nearest" }), m && m.preventDefault());
    }
  }, u = (x, m) => {
    const p = x === null ? null : Math.max(0, Math.min(e + x, c2.length - 1));
    p !== e && (s(p), t ? a(p, m) : requestAnimationFrame(() => a(p, m)));
  };
  return { move: (x) => {
    const m = locateID(x), p = c2.findIndex((d) => d.id == m);
    p !== e && s(p);
  }, keydown: (x, m) => {
    switch (x.code) {
      case "Enter":
        n ? i() : s(0);
        break;
      case "Space":
        n || s(0);
        break;
      case "Escape":
        r(e = null);
        break;
      case "Tab":
        r(e = null);
        break;
      case "ArrowDown":
        u(n ? 1 : m || 0, x);
        break;
      case "ArrowUp":
        u(n ? -1 : m || 0, x);
        break;
    }
  }, init: o, navigate: u };
}
function we({
  items: e = [],
  children: n,
  onSelect: t,
  onReady: c2
}) {
  const r = (0, import_react2.useRef)(), i = (0, import_react2.useRef)(je()), [o, s] = (0, import_react2.useState)(null), a = (0, import_react2.useRef)(o), u = ((0, import_react2.useContext)(G) || Z()).getGroup("core"), w = (x) => {
    x && x.stopPropagation(), t && t({ id: e[a.current]?.id });
  };
  (0, import_react2.useEffect)(() => {
    i.current.init(
      r.current,
      e,
      (x) => {
        s(x), a.current = x;
      },
      w
    );
  }, [e, r.current]), (0, import_react2.useEffect)(() => {
    c2 && c2(i.current);
  }, []);
  const f = (0, import_react2.useCallback)(() => {
    i.current.navigate(null);
  }, [i]);
  return o === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(te, { onCancel: f, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: "wx-233fr7 wx-list",
      ref: r,
      onClick: w,
      onMouseMove: i.current.move,
      children: e.length ? e.map((x, m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: `wx-233fr7 wx-item ${m === o ? "wx-focus" : ""}`,
          "data-id": x.id,
          children: n ? snippet(n, { option: x }) : x.label
        },
        x.id
      )) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-233fr7 wx-no-data", children: u("No data") })
    }
  ) });
}
function fe({
  value: e = "",
  id: n,
  readonly: t = false,
  focus: c2 = false,
  select: r = false,
  type: i = "text",
  placeholder: o = "",
  disabled: s = false,
  error: a = false,
  inputStyle: u = {},
  title: w = "",
  css: f = "",
  icon: x = "",
  clear: m = false,
  onChange: p
}) {
  const d = z(n), [h, v2] = useWritableProp(e), N2 = (0, import_react2.useRef)(null), R2 = (0, import_react2.useMemo)(
    () => x && f.indexOf("wx-icon-left") === -1 ? "wx-icon-right " + f : f,
    [x, f]
  ), g = (0, import_react2.useMemo)(
    () => x && f.indexOf("wx-icon-left") !== -1,
    [x, f]
  );
  (0, import_react2.useEffect)(() => {
    const b2 = setTimeout(() => {
      c2 && N2.current && N2.current.focus(), r && N2.current && N2.current.select();
    }, 1);
    return () => clearTimeout(b2);
  }, [c2, r]);
  const T2 = (0, import_react2.useCallback)(
    (b2) => {
      const k2 = b2.target.value;
      v2(k2), p && p({ value: k2, input: true });
    },
    [p]
  ), M2 = (0, import_react2.useCallback)(
    (b2) => p && p({ value: b2.target.value }),
    [p]
  );
  function S3(b2) {
    b2.stopPropagation(), v2(""), p && p({ value: "" });
  }
  let D2 = i;
  return i !== "password" && i !== "number" && (D2 = "text"), (0, import_react2.useEffect)(() => {
    const b2 = M2, k2 = N2.current;
    return k2.addEventListener("change", b2), () => {
      k2 && k2.removeEventListener("change", b2);
    };
  }, [M2]), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: `wx-hQ64J4 wx-text ${R2} ${a ? "wx-error" : ""} ${s ? "wx-disabled" : ""} ${m ? "wx-clear" : ""}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "wx-hQ64J4 wx-input",
            ref: N2,
            id: d,
            readOnly: t,
            disabled: s,
            placeholder: o,
            type: D2,
            style: u,
            title: w,
            value: h,
            onInput: T2
          }
        ),
        m && !s && h ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "wx-hQ64J4 wx-icon wxi-close", onClick: S3 }),
          g && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: `wx-hQ64J4 wx-icon ${x}` })
        ] }) : x ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: `wx-hQ64J4 wx-icon ${x}` }) : null
      ]
    }
  );
}
function Je({ date: e, type: n, part: t, onShift: c2 }) {
  const { calendar: r, formats: i } = (0, import_react2.useContext)(G).getRaw(), o = e.getFullYear(), s = (0, import_react2.useMemo)(() => {
    switch (n) {
      case "month":
        return dateToString(i.monthYearFormat, r)(e);
      case "year":
        return dateToString(i.yearFormat, r)(e);
      case "duodecade": {
        const { start: u, end: w } = getDuodecade(o), f = dateToString(i.yearFormat, r);
        return `${f(new Date(u, 0, 1))} - ${f(new Date(w, 11, 31))}`;
      }
      default:
        return "";
    }
  }, [e, n, o, r, i]);
  function a() {
    c2 && c2({ diff: 0, type: n });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wx-8HQVQV wx-header", children: [
    t !== "right" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "i",
      {
        className: "wx-8HQVQV wx-pager wxi-angle-left",
        onClick: () => c2 && c2({ diff: -1, type: n })
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wx-8HQVQV wx-spacer" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wx-8HQVQV wx-label", onClick: a, children: s }),
    t !== "left" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "i",
      {
        className: "wx-8HQVQV wx-pager wxi-angle-right",
        onClick: () => c2 && c2({ diff: 1, type: n })
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wx-8HQVQV wx-spacer" })
  ] });
}
function xe({ onClick: e, children: n }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "wx-3s8W4d wx-button", onClick: e, children: n });
}
function Ge({
  value: e,
  current: n,
  part: t = "",
  markers: c2 = null,
  onCancel: r,
  onChange: i
}) {
  const o = ((0, import_react2.useContext)(G) || Z()).getRaw().calendar, s = (o.weekStart || 7) % 7, a = o.dayShort.slice(s).concat(o.dayShort.slice(0, s)), u = (g, T2, M2) => new Date(
    g.getFullYear(),
    g.getMonth() + (T2 || 0),
    g.getDate() + (M2 || 0)
  );
  let w = t !== "normal";
  function f(g) {
    const T2 = g.getDay();
    return T2 === 0 || T2 === 6;
  }
  function x() {
    const g = u(n, 0, 1 - n.getDate());
    return g.setDate(g.getDate() - (g.getDay() - (s - 7)) % 7), g;
  }
  function m() {
    const g = u(n, 1, -n.getDate());
    return g.setDate(g.getDate() + (6 - g.getDay() + s) % 7), g;
  }
  const p = (0, import_react2.useRef)(0);
  function d(g, T2) {
    T2.timeStamp !== p.current && (p.current = T2.timeStamp, T2.stopPropagation(), i && i(new Date(new Date(g))), r && r());
  }
  const h = (0, import_react2.useMemo)(() => t == "normal" ? [e ? u(e).valueOf() : 0] : e ? [
    e.start ? u(e.start).valueOf() : 0,
    e.end ? u(e.end).valueOf() : 0
  ] : [0, 0], [t, e]), v2 = (0, import_react2.useMemo)(() => {
    const g = x(), T2 = m(), M2 = n.getMonth();
    let S3 = [];
    for (let D2 = g; D2 <= T2; D2.setDate(D2.getDate() + 1)) {
      const b2 = {
        day: D2.getDate(),
        in: D2.getMonth() === M2,
        date: D2.valueOf()
      };
      let k2 = "";
      if (k2 += b2.in ? "" : " wx-inactive", k2 += h.indexOf(b2.date) > -1 ? " wx-selected" : "", w) {
        const F2 = b2.date == h[0], A2 = b2.date == h[1];
        F2 && !A2 ? k2 += " wx-left" : A2 && !F2 && (k2 += " wx-right"), b2.date > h[0] && b2.date < h[1] && (k2 += " wx-inrange");
      }
      if (k2 += f(D2) ? " wx-weekend" : "", c2) {
        const F2 = c2(D2);
        F2 && (k2 += " " + F2);
      }
      S3.push({ ...b2, css: k2 });
    }
    return S3;
  }, [n, h, w, c2]), N2 = (0, import_react2.useRef)(null);
  let R2 = (0, import_react2.useRef)({});
  return R2.current.click = d, (0, import_react2.useEffect)(() => {
    delegateClick(N2.current, R2.current);
  }, []), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-398RBS wx-weekdays", children: a.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-398RBS wx-weekday", children: g }, g)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-398RBS wx-days", ref: N2, children: v2.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: `wx-398RBS wx-day ${g.css} ${g.in ? "" : "wx-out"}`,
        "data-id": g.date,
        children: g.day
      },
      g.date
    )) })
  ] });
}
function Qe({
  value: e,
  current: n,
  part: t,
  onCancel: c2,
  onChange: r,
  onShift: i
}) {
  const [o, s] = useWritableProp(e || /* @__PURE__ */ new Date()), [a, u] = useWritableProp(n || /* @__PURE__ */ new Date()), w = (0, import_react2.useContext)(G).getRaw().calendar, f = w.monthShort || [], x = (0, import_react2.useMemo)(() => a.getMonth(), [a]), m = (0, import_react2.useCallback)(
    (h, v2) => {
      if (h != null) {
        v2.stopPropagation();
        const N2 = new Date(a);
        N2.setMonth(h), u(N2), i && i({ current: N2 });
      }
      t === "normal" && s(new Date(a)), c2 && c2();
    },
    [a, t, i, c2]
  ), p = (0, import_react2.useCallback)(() => {
    const h = new Date(Re(o, t) || a);
    h.setMonth(a.getMonth()), h.setFullYear(a.getFullYear()), r && r(h);
  }, [o, a, t, r]), d = (0, import_react2.useCallback)(
    (h) => {
      const v2 = h.target.closest("[data-id]");
      if (v2) {
        const N2 = parseInt(v2.getAttribute("data-id"), 10);
        m(N2, h);
      }
    },
    [m]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-34U8T8 wx-months", onClick: d, children: f.map((h, v2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: "wx-34U8T8 wx-month" + (x === v2 ? " wx-current" : ""),
        "data-id": v2,
        children: h
      },
      v2
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-34U8T8 wx-buttons", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(xe, { onClick: p, children: w.done }) })
  ] });
}
var ie = "wx-1XEF33";
var _e = ({ value: e, current: n, onCancel: t, onChange: c2, onShift: r, part: i }) => {
  const o = (0, import_react2.useContext)(G).getRaw().calendar, [s, a] = useWritableProp(n), [u, w] = useWritableProp(e), f = (0, import_react2.useMemo)(() => s.getFullYear(), [s]), x = (0, import_react2.useMemo)(() => {
    const { start: v2, end: N2 } = getDuodecade(f), R2 = [];
    for (let g = v2; g <= N2; ++g)
      R2.push(g);
    return R2;
  }, [f]), m = {
    click: p
  };
  function p(v2, N2) {
    if (v2) {
      N2.stopPropagation();
      const R2 = new Date(s);
      R2.setFullYear(v2), a(R2), r && r({ current: R2 });
    }
    i === "normal" && w(new Date(s)), t && t();
  }
  function d() {
    const v2 = new Date(Re(u, i) || s);
    v2.setFullYear(s.getFullYear()), c2 && c2(v2);
  }
  const h = (0, import_react2.useRef)(null);
  return (0, import_react2.useEffect)(() => {
    h.current && delegateClick(h.current, m);
  }, []), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ie + " wx-years", ref: h, children: x.map((v2, N2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: ie + ` wx-year ${f == v2 ? "wx-current" : ""} ${N2 === 0 ? "wx-prev-decade" : ""} ${N2 === 11 ? "wx-next-decade" : ""}`,
        "data-id": v2,
        children: v2
      },
      N2
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: ie + " wx-buttons", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(xe, { onClick: d, children: o.done }) })
  ] });
};
var ge = {
  month: {
    component: Ge,
    next: ze,
    prev: Ue
  },
  year: {
    component: Qe,
    next: Ze,
    prev: Ke
  },
  duodecade: {
    component: _e,
    next: Xe,
    prev: qe
  }
};
function Ue(e) {
  return e = new Date(e), e.setMonth(e.getMonth() - 1), e;
}
function ze(e) {
  return e = new Date(e), e.setMonth(e.getMonth() + 1), e;
}
function Ke(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() - 1), e;
}
function Ze(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() + 1), e;
}
function qe(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() - 10), e;
}
function Xe(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() + 10), e;
}
function Re(e, n) {
  let t;
  if (n === "normal") t = e;
  else {
    const { start: c2, end: r } = e;
    n === "left" ? t = c2 : n == "right" ? t = r : t = c2 && r;
  }
  return t;
}
var et = ["clear", "today"];
function tt(e) {
  if (e === "done") return -1;
  if (e === "clear") return null;
  if (e === "today") return /* @__PURE__ */ new Date();
}
function ce({
  value: e,
  current: n,
  onCurrentChange: t,
  part: c2 = "normal",
  markers: r = null,
  buttons: i,
  onShift: o,
  onChange: s
}) {
  const a = (0, import_react2.useContext)(G).getGroup("calendar"), [u, w] = (0, import_react2.useState)("month"), f = Array.isArray(i) ? i : i ? et : [], x = (v2, N2) => {
    v2.preventDefault(), s && s({ value: N2 });
  }, m = () => {
    u === "duodecade" ? w("year") : u === "year" && w("month");
  }, p = (v2) => {
    const { diff: N2, current: R2 } = v2;
    if (N2 === 0) {
      u === "month" ? w("year") : u === "year" && w("duodecade");
      return;
    }
    if (N2) {
      const g = ge[u];
      t(N2 > 0 ? g.next(n) : g.prev(n));
    } else R2 && t(R2);
    o && o();
  }, d = (v2) => {
    w("month"), s && s({ select: true, value: v2 });
  }, h = (0, import_react2.useMemo)(() => ge[u].component, [u]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: `wx-2Gr4AS wx-calendar ${c2 !== "normal" && c2 !== "both" ? "wx-part" : ""}`,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wx-2Gr4AS wx-wrap", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Je, { date: n, part: c2, type: u, onShift: p }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            h,
            {
              value: e,
              current: n,
              onCurrentChange: t,
              part: c2,
              markers: r,
              onCancel: m,
              onChange: d,
              onShift: p
            }
          ),
          u === "month" && f.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-2Gr4AS wx-buttons", children: f.map((v2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-2Gr4AS wx-button-item", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            xe,
            {
              onClick: (N2) => x(N2, tt(v2)),
              children: a(v2)
            }
          ) }, v2)) })
        ] })
      ] })
    }
  );
}
function ue(e) {
  let { words: n = null, optional: t = false, children: c2 } = e, r = (0, import_react2.useContext)(G);
  const i = (0, import_react2.useMemo)(() => {
    let o = r;
    return (!o || !o.extend) && (o = locale(en_default)), n !== null && (o = o.extend(n, t)), o;
  }, [n, t, r]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(G.Provider, { value: i, children: c2 });
}
function Ne(e, n, t, c2) {
  if (!e || c2) {
    const r = n ? new Date(n) : /* @__PURE__ */ new Date();
    r.setDate(1), t(r);
  } else if (e.getDate() !== 1) {
    const r = new Date(e);
    r.setDate(1), t(r);
  }
}
var nt = ["clear", "today"];
function lt({
  value: e,
  current: n,
  markers: t = null,
  buttons: c2 = nt,
  onChange: r
}) {
  const [i, o] = useWritableProp(e), [s, a] = useWritableProp(n);
  (0, import_react2.useEffect)(() => {
    Ne(s, i, a, false);
  }, [i, s]);
  const u = (0, import_react2.useCallback)(
    (f) => {
      const x = f.value;
      x ? (o(new Date(x)), Ne(s, new Date(x), a, true)) : o(null), r && r({ value: x ? new Date(x) : null });
    },
    [r, s]
  ), w = (0, import_react2.useCallback)(
    (f) => {
      a(f);
    },
    [a]
  );
  return s ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ue, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    ce,
    {
      value: i,
      current: s,
      markers: t,
      buttons: c2,
      onChange: u,
      onCurrentChange: w
    }
  ) }) : null;
}
function Et({
  value: e = "",
  options: n = [],
  textOptions: t = null,
  placeholder: c2 = "",
  disabled: r = false,
  error: i = false,
  title: o = "",
  textField: s = "label",
  clear: a = false,
  children: u,
  onChange: w
}) {
  const f = (0, import_react2.useRef)(null), x = (0, import_react2.useRef)(null);
  let [m, p] = useWritableProp(e);
  function d(g) {
    f.current = g.navigate, x.current = g.keydown;
  }
  const h = (0, import_react2.useMemo)(() => m || m === 0 ? (t || n).find((g) => g.id === m) : null, [m, t, n]), v2 = (0, import_react2.useCallback)(
    ({ id: g }) => {
      (g || g === 0) && (p(g), f.current(null), w && w({ value: g }));
    },
    [p, w]
  ), N2 = (0, import_react2.useCallback)(
    (g) => {
      g.stopPropagation(), p(""), w && w({ value: "" });
    },
    [p, w]
  ), R2 = (0, import_react2.useCallback)(() => n.findIndex((g) => g.id === m), [n, m]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: `wx-2YgblL wx-richselect ${i ? "wx-2YgblL wx-error" : ""} ${r ? "wx-2YgblL wx-disabled" : ""} ${u ? "" : "wx-2YgblL wx-nowrap"}`,
      title: o,
      onClick: () => f.current(R2()),
      onKeyDown: (g) => x.current(g, R2()),
      tabIndex: 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-2YgblL wx-label", children: h ? u ? u(h) : h[s] : c2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wx-2YgblL wx-placeholder", children: c2 }) : "\xA0" }),
        a && !r && m ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "wx-2YgblL wx-icon wxi-close", onClick: N2 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "wx-2YgblL wx-icon wxi-angle-down" }),
        !r && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(we, { items: n, onReady: d, onSelect: v2, children: ({ option: g }) => u ? u(g) : g[s] })
      ]
    }
  );
}
function ut({ notice: e = {} }) {
  function n() {
    e.remove && e.remove();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: `wx-11sNg5 wx-notice wx-${e.type ? e.type : ""}`,
      role: "status",
      "aria-live": "polite",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-11sNg5 wx-text", children: e.text }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-11sNg5 wx-button", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "wx-11sNg5 wxi-close", onClick: n }) })
      ]
    }
  );
}
function dt({ data: e = [] }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-3nwoO9 wx-notices", children: e.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ut, { notice: n }, n.id)) });
}
function wt({
  title: e = "",
  buttons: n = ["cancel", "ok"],
  header: t,
  children: c2,
  footer: r,
  onConfirm: i,
  onCancel: o
}) {
  const s = ((0, import_react2.useContext)(G) || Z()).getGroup("core"), a = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    a.current?.focus();
  }, []);
  function u(f) {
    switch (f.code) {
      case "Enter": {
        const x = f.target.tagName;
        if (x === "TEXTAREA" || x === "BUTTON") return;
        i && i({ event: f });
        break;
      }
      case "Escape":
        o && o({ event: f });
        break;
    }
  }
  function w(f, x) {
    const m = { event: f, button: x };
    x === "cancel" ? o && o(m) : i && i(m);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: "wx-1FxkZa wx-modal",
      ref: a,
      tabIndex: 0,
      onKeyDown: u,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wx-1FxkZa wx-window", children: [
        t || (e ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-1FxkZa wx-header", children: e }) : null),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: c2 }),
        r || n && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-1FxkZa wx-buttons", children: n.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-1FxkZa wx-button", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ee,
          {
            type: `block ${f === "ok" ? "primary" : "secondary"}`,
            onClick: (x) => w(x, f),
            children: s(f)
          }
        ) }, f)) })
      ] })
    }
  );
}
function ft({ children: e }, n) {
  const [t, c2] = (0, import_react2.useState)(null), [r, i] = (0, import_react2.useState)([]);
  return (0, import_react2.useImperativeHandle)(
    n,
    () => ({
      showModal: (o) => {
        const s = { ...o };
        return c2(s), new Promise((a, u) => {
          s.resolve = (w) => {
            c2(null), a(w);
          }, s.reject = (w) => {
            c2(null), u(w);
          };
        });
      },
      showNotice: (o) => {
        o = { ...o }, o.id = o.id || uid(), o.remove = () => i((s) => s.filter((a) => a.id !== o.id)), o.expire != -1 && setTimeout(o.remove, o.expire || 5100), i((s) => [...s, o]);
      }
    }),
    []
  ), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    e,
    t && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      wt,
      {
        title: t.title,
        buttons: t.buttons,
        onConfirm: t.resolve,
        onCancel: t.reject,
        children: t.message
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(dt, { data: r })
  ] });
}
var xt = (0, import_react2.forwardRef)(ft);
var be = new Date(0, 0, 0, 0, 0);
function Se() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, {});
}
function Kt(e) {
  const { fonts: n = true, children: t } = e;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(re.Provider, { value: "willow", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    t && t && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-theme wx-willow-theme", children: t }),
    n && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "link",
        {
          rel: "preconnect",
          href: "https://cdn.svar.dev",
          crossOrigin: "true"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Se, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "link",
        {
          rel: "stylesheet",
          href: "https://cdn.svar.dev/fonts/wxi/wx-icons.css"
        }
      )
    ] })
  ] }) });
}
function Zt(e) {
  const { fonts: n = true, children: t } = e;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(re.Provider, { value: "willow-dark", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    t && t && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wx-theme wx-willow-dark-theme", children: t }),
    n && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "link",
        {
          rel: "preconnect",
          href: "https://cdn.svar.dev",
          crossOrigin: "true"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Se, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "link",
        {
          rel: "stylesheet",
          href: "https://cdn.svar.dev/fonts/wxi/wx-icons.css"
        }
      )
    ] })
  ] }) });
}
setEnv(env);

// ../../common/temp/node_modules/.pnpm/@svar-ui+grid-locales@2.5.0/node_modules/@svar-ui/grid-locales/locales/en.js
var en_default2 = {
  grid: {
    "Add before": "Add before",
    "Add after": "Add after",
    Copy: "Copy",
    Cut: "Cut",
    Paste: "Paste",
    Delete: "Delete",
    "New row": "New row",
    "Move up": "Move up",
    "Move down": "Move down",
    Undo: "Undo",
    Redo: "Redo"
  }
};

// ../../common/temp/node_modules/.pnpm/@svar-ui+lib-state@1.9.6/node_modules/@svar-ui/lib-state/dist/index.js
var iid = (/* @__PURE__ */ new Date()).valueOf();
var EventBusRouter = class {
  constructor(dispatch) {
    this._nextHandler = null;
    this._dispatch = dispatch;
    this.exec = this.exec.bind(this);
  }
  async exec(name, ev) {
    this._dispatch(name, ev);
    if (this._nextHandler) await this._nextHandler.exec(name, ev);
    return ev;
  }
  setNext(next) {
    return this._nextHandler = next;
  }
};

// ../../common/temp/node_modules/.pnpm/@svar-ui+grid-store@2.5.0/node_modules/@svar-ui/grid-store/dist/index.js
var F = (/* @__PURE__ */ new Date()).valueOf();
function U(r, e) {
  if (Object.keys(r).length !== Object.keys(e).length) return false;
  for (const o in e) {
    const t = r[o], i = e[o];
    if (!k(t, i)) return false;
  }
  return true;
}
function k(r, e) {
  if (typeof r == "number" || typeof r == "string" || typeof r == "boolean" || r === null) return r === e;
  if (typeof r != typeof e || (r === null || e === null) && r !== e || r instanceof Date && e instanceof Date && r.getTime() !== e.getTime()) return false;
  if (typeof r == "object") if (Array.isArray(r) && Array.isArray(e)) {
    if (r.length !== e.length) return false;
    for (let o = r.length - 1; o >= 0; o--) if (!k(r[o], e[o])) return false;
    return true;
  } else return U(r, e);
  return r === e;
}
function I(r) {
  if (typeof r != "object" || r === null) return r;
  if (r instanceof Date) return new Date(r);
  if (r instanceof Array) return r.map(I);
  const e = {};
  for (const o in r) e[o] = I(r[o]);
  return e;
}
var D = 2;
var K = class {
  constructor(r) {
    r && (this._writable = r.writable, this._async = r.async), this._values = {}, this._state = {};
  }
  setState(r, e = 0) {
    const o = {};
    return this._wrapProperties(r, this._state, this._values, "", o, e), o;
  }
  getState() {
    return this._values;
  }
  getReactive() {
    return this._state;
  }
  _wrapProperties(r, e, o, t, i, s) {
    for (const a in r) {
      const n = e[a], l2 = o[a], c2 = r[a];
      if (n && (l2 === c2 && typeof c2 != "object" || c2 instanceof Date && l2 instanceof Date && l2.getTime() === c2.getTime())) continue;
      const d = t + (t ? "." : "") + a;
      n ? (n.__parse(c2, d, i, s) && (o[a] = c2), s & D ? i[d] = n.__trigger : n.__trigger()) : (c2 && c2.__reactive ? e[a] = this._wrapNested(c2, c2, d, i) : e[a] = this._wrapWritable(c2), o[a] = c2), i[d] = i[d] || null;
    }
  }
  _wrapNested(r, e, o, t) {
    const i = this._wrapWritable(r);
    return this._wrapProperties(r, i, e, o, t, 0), i.__parse = (s, a, n, l2) => (this._wrapProperties(s, i, e, a, n, l2), false), i;
  }
  _wrapWritable(r) {
    const e = [], o = function() {
      for (let t = 0; t < e.length; t++) e[t](r);
    };
    return { subscribe: (t) => (e.push(t), this._async ? setTimeout(t, 1, r) : t(r), () => {
      const i = e.indexOf(t);
      i >= 0 && e.splice(i, 1);
    }), __trigger: () => {
      e.length && (this._async ? setTimeout(o, 1) : o());
    }, __parse: function(t) {
      return r = t, true;
    } };
  }
};
var B2 = class {
  constructor(r, e, o, t) {
    typeof r == "function" ? this._setter = r : this._setter = r.setState.bind(r), this._routes = e, this._parsers = o, this._prev = {}, this._triggers = /* @__PURE__ */ new Map(), this._sources = /* @__PURE__ */ new Map(), this._routes.forEach((i) => {
      i.in.forEach((s) => {
        const a = this._triggers.get(s) || [];
        a.push(i), this._triggers.set(s, a);
      }), i.out.forEach((s) => {
        const a = this._sources.get(s) || {};
        i.in.forEach((n) => a[n] = true), this._sources.set(s, a);
      });
    }), this._routes.forEach((i) => {
      i.length = Math.max(...i.in.map((s) => H2(s, this._sources, 1)));
    }), this._bus = t;
  }
  init(r) {
    const e = {};
    for (const o in r) if (this._prev[o] !== r[o]) {
      const t = this._parsers[o];
      e[o] = t ? t(r[o]) : r[o];
    }
    this._prev = this._prev ? { ...this._prev, ...r } : { ...r }, this.setState(e), this._bus && this._bus.exec("init-state", e);
  }
  setStateAsync(r) {
    const e = this._setter(r, D);
    return this._async ? Object.assign(this._async.signals, e) : this._async = { signals: e, timer: setTimeout(this._applyState.bind(this), 1) }, e;
  }
  _applyState() {
    const r = this._async;
    if (r) {
      this._async = null, this._triggerUpdates(r.signals, []);
      for (const e in r.signals) {
        const o = r.signals[e];
        o && o();
      }
    }
  }
  setState(r, e = []) {
    const o = this._setter(r);
    return this._triggerUpdates(o, e), o;
  }
  _triggerUpdates(r, e) {
    const o = Object.keys(r), t = !e.length;
    e = e || [];
    for (let i = 0; i < o.length; i++) {
      const s = o[i], a = this._triggers.get(s);
      a && a.forEach((n) => {
        e.indexOf(n) == -1 && e.push(n);
      });
    }
    t && this._execNext(e);
  }
  _execNext(r) {
    for (; r.length; ) {
      r.sort((o, t) => o.length < t.length ? 1 : -1);
      const e = r[r.length - 1];
      r.splice(r.length - 1), e.exec(r);
    }
  }
};
function H2(r, e, o) {
  const t = e.get(r);
  if (!t) return o;
  const i = Object.keys(t).map((s) => H2(s, e, o + 1));
  return Math.max(...i);
}
var X = class {
  constructor() {
    this._nextHandler = null, this._handlers = {}, this._tag = /* @__PURE__ */ new WeakMap(), this.exec = this.exec.bind(this);
  }
  on(r, e, o) {
    let t = this._handlers[r];
    t ? o && o.intercept ? t.unshift(e) : t.push(e) : t = this._handlers[r] = [e], o && o.tag && this._tag.set(e, o.tag);
  }
  intercept(r, e, o) {
    this.on(r, e, { ...o, intercept: true });
  }
  detach(r) {
    for (const e in this._handlers) {
      const o = this._handlers[e];
      for (let t = o.length - 1; t >= 0; t--) this._tag.get(o[t]) === r && o.splice(t, 1);
    }
  }
  async exec(r, e) {
    const o = this._handlers[r];
    if (o) for (let t = 0; t < o.length; t++) {
      const i = o[t](e);
      if (i === false || i && i.then && await i === false) return;
    }
    return this._nextHandler && await this._nextHandler.exec(r, e), e;
  }
  setNext(r) {
    return this._nextHandler = r;
  }
};
function q(r) {
  return (e) => e[r];
}
function Y(r) {
  return (e, o) => e[r] = o;
}
function S(r, e) {
  return (e.getter || q(e.id))(r);
}
function M(r, e, o) {
  return (e.setter || Y(e.id))(r, o);
}
function P2(r, e) {
  const o = document.createElement("a");
  o.href = URL.createObjectURL(r), o.download = e, document.body.appendChild(o), o.click(), document.body.removeChild(o);
}
function b(r, e) {
  let o = S(r, e) ?? "";
  return e.template && (o = e.template(o, r, e)), e.optionsMap && (Array.isArray(o) ? o = o.map((t) => e.optionsMap.get(t)) : o = e.optionsMap.get(o)), typeof o > "u" ? "" : o + "";
}
function G2(r, e) {
  const o = /\n|"|;|,/;
  let t = "";
  const i = e.rows || `
`, s = e.cols || "	", a = r._columns, n = r.flatData;
  e.header !== false && a[0].header && (t = z2("header", a, t, s, i));
  for (let l2 = 0; l2 < n.length; l2++) {
    const c2 = [];
    for (let d = 0; d < a.length; d++) {
      let h = b(n[l2], a[d]);
      o.test(h) && (h = '"' + h.replace(/"/g, '""') + '"'), c2.push(h);
    }
    t += (t ? i : "") + c2.join(s);
  }
  return e.footer !== false && a[0].footer && (t = z2("footer", a, t, s, i)), t;
}
function z2(r, e, o, t, i) {
  const s = /\n|"|;|,/;
  for (let a = 0; a < e[0][r].length; a++) {
    const n = [];
    for (let l2 = 0; l2 < e.length; l2++) {
      let c2 = (e[l2][r][a].text || "") + "";
      s.test(c2) && (c2 = '"' + c2.replace(/"/g, '""') + '"'), n.push(c2);
    }
    o += (o ? i : "") + n.join(t);
  }
  return o;
}
function J2(r, e, o) {
  const t = [], i = [], s = [];
  let a = [];
  const n = r._columns, l2 = r.flatData, c2 = r._sizes;
  for (const h of n) s.push({ width: h.flexgrow ? c2.columnWidth : h.width });
  let d = 0;
  e.header !== false && n[0].header && (A("header", n, t, i, d, e, o), a = a.concat(c2.headerRowHeights.map((h) => ({ height: h }))), d += n[0].header.length);
  for (let h = 0; h < l2.length; h++) {
    const u = [];
    for (let f = 0; f < n.length; f++) {
      const p = l2[h], g = n[f], w = S(p, g) ?? "";
      let x = b(p, g), m;
      e.cellStyle && (m = e.cellStyle(w, p, g)), e.cellTemplate && (x = e.cellTemplate(w, p, g) ?? x);
      const y2 = L(x, 2, m, o);
      u.push(y2);
    }
    t.push(u), a.push({ height: c2.rowHeight });
  }
  return d += l2.length, e.footer !== false && n[0].footer && (A("footer", n, t, i, d, e, o), a = a.concat(c2.footerRowHeights.map((h) => ({ height: h })))), { cells: t, merged: i, rowSizes: a, colSizes: s, styles: o };
}
function A(r, e, o, t, i, s, a) {
  for (let n = 0; n < e[0][r].length; n++) {
    const l2 = [];
    for (let c2 = 0; c2 < e.length; c2++) {
      const d = e[c2][r][n], h = d.colspan ? d.colspan - 1 : 0, u = d.rowspan ? d.rowspan - 1 : 0;
      (h || u) && t.push({ from: { row: n + i, column: c2 }, to: { row: n + i + u, column: c2 + h } });
      let f = d.text ?? "", p;
      s.headerCellStyle && (p = s.headerCellStyle(f, d, e[c2], r)), s.headerCellTemplate && (f = s.headerCellTemplate(f, d, e[c2], r) ?? f);
      let g;
      r == "header" ? n == e[0][r].length - 1 ? g = 1 : g = 0 : n ? g = 4 : g = 3;
      const w = L(f, g, p, a);
      l2.push(w);
    }
    o.push(l2);
  }
}
function L(r, e, o, t) {
  let i = e;
  if (r && r instanceof Date && (r = ee2(r), o = o || {}, o.format = o.format || "dd/mm/yyyy"), o) {
    o = { ...t[e], ...o };
    const s = t.findIndex((a) => k(a, o));
    s < 0 ? (t.push(o), i = t.length - 1) : i = s;
  }
  return { v: r + "", s: i };
}
function Q2(r) {
  const e = { material: "#000000", willow: "#000000", "willow-dark": "#ffffff" }, o = { material: "none", willow: "none", "willow-dark": "#2a2b2d" }, t = { material: "#fafafb", willow: "#f2f3f7", "willow-dark": "#20262b" }, i = { material: "0.5px solid #dfdfdf", willow: "0.5px solid #e6e6e6", "willow-dark": "0.5px solid #384047" }, s = { material: "#dfdfdf", willow: "#e6e6e6", "willow-dark": "#384047" }, a = e[r], n = "0.5px solid " + s[r], l2 = { verticalAlign: "center", align: "left" }, c2 = { fontWeight: "bold", color: a, background: t[r], ...l2, borderBottom: n, borderRight: n };
  return { cell: { color: a, background: o[r], borderBottom: i[r], borderRight: i[r], ...l2 }, header: { ...c2 }, footer: { ...c2 } };
}
function ee2(r) {
  return r ? 25569 + (r.getTime() - r.getTimezoneOffset() * 6e4) / (86400 * 1e3) : null;
}
var te2 = "portrait";
var oe = 100;
var ie2 = "a4";
var se2 = { a3: { width: 11.7, height: 16.5 }, a4: { width: 8.27, height: 11.7 }, letter: { width: 8.5, height: 11 } };
function re2(r, e) {
  const o = [];
  let t = [], i = 0;
  const s = r.filter((n) => !n.hidden), a = ae2(e);
  return s.forEach((n, l2) => {
    i + n.width <= a ? (i += n.width, t.push(n)) : (t.length && o.push(t), t = [n], i = n.width), l2 === s.length - 1 && t.length && o.push(t);
  }), o;
}
function ne(r, e, o) {
  const t = [];
  return r.forEach((i, s) => {
    const a = i[e];
    for (let n = 0; n < o.length; n++) {
      t[n] || (t[n] = []);
      const l2 = { ...a[n] };
      if (t[n][s] !== null) {
        if (!s && !l2.rowspan && !l2.colspan) {
          let c2 = 1, d = r[s + c2][e][n], h = l2.width;
          for (; !d.rowspan && !d.colspan; ) c2++, d = r[s + c2][e][n], h += d.width;
          l2.colspan = c2, l2.width = h, l2.height = o[n];
        }
        if (t[n].push(l2), !l2.collapsed && l2.colspan > 1) {
          let c2 = l2.colspan - 1;
          if (l2.colspan + s > r.length) {
            const d = l2.colspan - (l2.colspan + s - r.length);
            l2.colspan = d, l2.width = r.slice(s, s + c2 + 1).reduce((h, u) => h + u.width, 0), d > 1 && (c2 = d - 1);
          }
          for (let d = 0; d < c2; d++) t[n].push(null);
        }
        if (l2.rowspan > 1) {
          const c2 = l2.rowspan;
          for (let d = 1; d < c2; d++) t[n + d] || (t[n + d] = []), t[n + d].push(null);
        }
      }
    }
    if (i.collapsed) for (let n = 0; n < t.length; n++) {
      const l2 = t[n], c2 = l2[s];
      if (c2 && c2.collapsed) {
        if (l2[s] = null, !n) break;
      } else {
        const d = c2 || l2.findLast((h) => h?.colspan >= 1);
        d && (d.colspan = d.colspan - 1, d.width = d.width - i.width);
      }
    }
  }), t.map((i) => i.filter((s) => s && s.colspan !== 0));
}
function ae2(r) {
  const { mode: e, ppi: o, paper: t } = r, { width: i, height: s } = se2[t];
  return le(e === "portrait" ? i : s, o);
}
function le(r, e) {
  return r * e;
}
function ce2(r = {}) {
  const { mode: e, ppi: o, paper: t } = r;
  return { mode: e || te2, ppi: o || oe, paper: t || ie2 };
}
function de(r, e) {
  return r.flexgrow ? `min-width:${e}px;width:auto` : `width:${r.width}px; max-width:${r.width}px; height:${r.height}px`;
}
function he(r, e, o) {
  let t = r[o.id];
  if (o.filter.type === "richselect" && t) {
    const i = o.filter.config?.options || e.find(({ id: s }) => s == o.id).options;
    i && (t = i.find(({ id: s }) => s == t).label);
  }
  return t ?? "";
}
var N = ["resize-column", "hide-column", "update-cell"];
var ue2 = ["delete-row", "update-row", "update-cell"];
var fe2 = ["move-item"];
var ge2 = ["resize-column", "move-item"];
var pe = class {
  undo = [];
  redo = [];
  progress = {};
  in;
  getState;
  setState;
  _previousValues = {};
  constructor(e, o, t) {
    this.in = e, this.getState = o, this.setState = t, this.setHandlers(), this.resetStateHistory();
  }
  getHandlers() {
    return { "add-row": { handler: (e) => ({ action: "delete-row", data: { id: e.id }, source: { action: "add-row", data: e } }) }, "delete-row": { handler: (e) => {
      const { id: o } = e, { data: t } = this.getPrev(), i = t.findIndex((s) => s.id == o);
      return { action: "add-row", data: { id: o, row: t[i], before: i < t.length - 1 ? t[i + 1].id : void 0 }, source: { action: "delete-row", data: e } };
    } }, "update-cell": { handler: (e) => {
      const { id: o, column: t } = e, i = this.getRow(o), s = this.getColumn(t), a = S(i, s);
      return k(a, e.value) ? null : { action: "update-cell", data: { id: o, column: t, value: a }, source: { action: "update-cell", data: e } };
    } }, "update-row": { handler: (e) => {
      const { id: o, row: t } = e, i = this.getRow(o);
      for (const s in t) Object.keys(i).includes(s) || (i[s] = void 0);
      return { action: "update-row", data: { id: o, row: i }, source: { action: "update-row", data: e } };
    } }, "copy-row": { handler: (e) => {
      const { id: o } = e, { data: t } = this.getState(), i = t.findIndex((a) => a.id == o), s = t[i];
      return { action: "delete-row", data: { id: o }, source: { action: "add-row", data: { id: o, row: s, before: i < t.length - 1 ? t[i + 1].id : void 0 } } };
    } }, "resize-column": { handler: (e) => {
      const { id: o, width: t } = e, i = this.getColumn(o), { _sizes: s } = this.getState();
      return { action: "resize-column", data: { id: o, width: i.width ?? s.columnWidth }, source: { action: "resize-column", data: { id: o, width: t } } };
    } }, "hide-column": { handler: (e) => {
      const { id: o } = e, t = this.getColumn(o);
      return { action: "hide-column", data: { id: o, mode: t.hidden }, source: { action: "hide-column", data: e } };
    } }, "collapse-column": { handler: (e) => {
      const { id: o, row: t, mode: i } = e;
      return { action: "collapse-column", data: { id: o, row: t, mode: typeof i == "boolean" ? !i : i }, source: { action: "collapse-column", data: e } };
    } }, "move-item": { handler: (e) => {
      const { id: o, target: t, mode: i } = e, { flatData: s } = this.getPrev(), a = s.findIndex((n) => n.id == o);
      return { action: "move-item", data: { id: o, target: s[a + (a ? -1 : 1)].id, mode: a ? "after" : "before" }, source: { action: "move-item", data: { id: o, target: t, mode: i } } };
    } }, "open-row": { handler: (e) => {
      const { id: o, nested: t } = e;
      return { action: "close-row", data: { id: o, nested: t }, source: { action: "open-row", data: e } };
    } }, "close-row": { handler: (e) => {
      const { id: o, nested: t } = e;
      return { action: "open-row", data: { id: o, nested: t }, source: { action: "close-row", data: e } };
    } } };
  }
  resetHistory() {
    this.undo = [], this.redo = [], this.progress = {}, this.resetStateHistory();
  }
  getPrev() {
    return this._previousValues;
  }
  setHandlers() {
    const e = this.getHandlers();
    for (const o in e) this.in.intercept(o, (t) => {
      if (!(t.eventSource === "undo" || t.eventSource === "redo" || t.skipUndo)) {
        if (ge2.includes(o)) {
          (t.inProgress && !this.progress[o] || typeof t.inProgress != "boolean") && (fe2.includes(o) && this.setPrev("flatData"), N.includes(o) && this.setPrev("columns")), this.progress[o] = t.inProgress;
          return;
        }
        ue2.includes(o) && this.setPrev("data"), N.includes(o) && this.setPrev("columns");
      }
    }), this.in.on(o, (t) => {
      if (t.eventSource === "undo" || t.eventSource === "redo" || t.skipUndo || t.inProgress) return;
      const i = e[o].handler(t);
      i && this.addToHistory(i);
    });
  }
  setPrev(e) {
    this._previousValues[e] = I(this.getState()[e]);
  }
  addToHistory(e) {
    this.undo.push(e), this.redo = [], this.setStateHistory();
  }
  handleUndo() {
    if (!this.undo.length) return;
    const e = this.undo.pop();
    this.redo.push({ ...e.source, source: e }), this.in.exec(e.action, { ...e.data, eventSource: "undo" }), this.setStateHistory();
  }
  handleRedo() {
    if (!this.redo.length) return;
    const e = this.redo.pop();
    this.undo.push({ ...e.source, source: e }), this.in.exec(e.action, { ...e.data, eventSource: "redo" }), this.setStateHistory();
  }
  resetStateHistory() {
    this.setState({ history: { undo: 0, redo: 0 } });
  }
  setStateHistory() {
    this.setState({ history: { undo: this.undo.length, redo: this.redo.length } });
  }
  getRow(e) {
    const { data: o } = this.getPrev();
    return this.getState().tree ? this.getTreeRow(o, e) : o.find((t) => t.id == e);
  }
  getTreeRow(e, o) {
    for (let t = 0; t < e.length; t++) {
      if (e[t].id == o) return e[t];
      if (e[t].data) {
        const i = this.getTreeRow(e[t].data, o);
        if (i) return i;
      }
    }
    return null;
  }
  getColumn(e) {
    const { columns: o } = this.getPrev();
    return o.find((t) => t.id == e);
  }
};
function O() {
  let r = true;
  return r = false, r;
}
function $2(r, e) {
  return typeof r > "u" || r === null ? -1 : typeof e > "u" || e === null ? 1 : r === e ? 0 : r > e ? 1 : -1;
}
function me(r, e) {
  return -$2(r, e);
}
function xe2(r, e) {
  if (typeof e.sort == "function") return function(t, i) {
    const s = e.sort(t, i);
    return r === "asc" ? s : -s;
  };
  const o = r === "asc" ? $2 : me;
  return function(t, i) {
    return o(S(t, e), S(i, e));
  };
}
function ye(r, e) {
  if (!r || !r.length) return;
  const o = r.map((t) => {
    const i = e.find((s) => s.id == t.key);
    return xe2(t.order, i);
  });
  return r.length === 1 ? o[0] : function(t, i) {
    for (let s = 0; s < o.length; s++) {
      const a = o[s](t, i);
      if (a !== 0) return a;
    }
    return 0;
  };
}
var C = 28;
var _e2 = 20;
function Se2() {
  if (typeof document > "u") return "willow";
  const r = document.querySelector('[class^="wx"][class$="theme"]');
  return r ? r.className.substring(3, r.className.length - 6) : "willow";
}
function R(r, e, o, t, i) {
  const s = document.createElement("div"), a = document.createElement("div"), n = document.body;
  i = i ? `${i}px` : "auto";
  let l2, c2;
  a.className = e, s.classList.add(`wx-${o}-theme`), s.style.cssText = `height:auto;position:absolute;top:0px;left:100px;overflow:hidden;width=${i};white-space:nowrap;`, s.appendChild(a), n.appendChild(s), typeof r != "object" && (r = [r]);
  for (let d = 0; d < r.length; d++) {
    a.innerText = r[d] + "";
    const h = s.getBoundingClientRect(), u = Math.ceil(h.width) + (t && t.length ? t[d] : 0), f = Math.ceil(h.height);
    l2 = Math.max(l2 || 0, u), c2 = Math.max(c2 || 0, f);
  }
  return s.remove(), { width: l2, height: c2 };
}
function j(r, e, o, t, i) {
  const s = [];
  for (let a = 0; a < r.length; a++) {
    const n = r[a][e], l2 = n.length;
    for (let c2 = 0; c2 < l2; c2++) {
      const { text: d, vertical: h, collapsed: u, rowspan: f, css: p } = n[c2];
      if (!d) {
        s[c2] = Math.max(s[c2] || 0, t);
        continue;
      }
      let g = 0;
      if (h && !u) {
        let w = `wx-measure-cell-${e}`;
        if (w += p ? ` ${p}` : "", g = R(d, w, i).width, (f > 1 || !n[c2 + 1]) && o > c2 + 1) {
          const x = f || o - c2, m = s.slice(c2, c2 + x).reduce((y2, _) => y2 + _, 0);
          if (m < g) {
            const y2 = Math.ceil((g - m) / x);
            for (let _ = c2; _ < c2 + x; _++) s[_] = (s[_] || t) + y2;
          }
          continue;
        }
      }
      s[c2] = Math.max(s[c2] || t, g);
    }
  }
  return s;
}
function be2(r, e, o) {
  const t = [], i = [];
  let s = "wx-measure-cell-body";
  s += r.css ? ` ${r.css}` : "";
  for (let a = 0; a < e.length; a++) {
    const n = e[a], l2 = b(n, r);
    l2 && (t.push(l2), r.treetoggle ? i.push(e[a].$level * C + (e[a].$count ? C : 0) + (r.draggable ? C : 0)) : r.draggable && i.push(C));
  }
  return R(t, s, o, i).width;
}
function ve(r, e) {
  const o = "wx-measure-cell-header", t = r.sort ? _e2 : 0;
  let i = r.header;
  if (typeof i == "string") return R(i, o, e).width + t;
  let s;
  Array.isArray(i) || (i = [i]);
  for (let a = 0; a < i.length; a++) {
    const n = i[a], l2 = typeof n == "string" ? n : n.text, c2 = o + (typeof n == "string" ? "" : ` ${n.css}`);
    let d = R(l2, c2, e).width;
    a === i.length - 1 && (d += t), s = Math.max(s || 0, d);
  }
  return s;
}
var ke = { text: (r, e) => r ? r.toString().toLowerCase().indexOf(e.toLowerCase()) !== -1 : !e, richselect: (r, e) => typeof e != "number" && !e ? true : r == e };
function Ce2(r) {
  return ke[r];
}
var Re2 = class extends K {
  in;
  _router;
  _branches;
  _xlsxWorker;
  _historyManager;
  constructor(e) {
    super({ writable: e, async: false });
    const o = { rowHeight: 37, columnWidth: 160, headerHeight: 36, footerHeight: 36 };
    this._router = new B2(super.setState.bind(this), [{ in: ["columns", "sizes", "_skin"], out: ["_columns", "_sizes"], exec: (i) => {
      const { columns: s, sizes: a, _skin: n } = this.getState(), l2 = this.copyColumns(s), c2 = l2.reduce((u, f) => Math.max(f.header.length, u), 0), d = l2.reduce((u, f) => Math.max(f.footer.length, u), 0);
      l2.forEach(this.setCollapsibleColumns);
      const h = this.normalizeSizes(l2, a, c2, d, n);
      for (let u = 0; u < l2.length; u++) this.normalizeColumns(l2, u, "header", c2, h), this.normalizeColumns(l2, u, "footer", d, h);
      this.setState({ _columns: l2, _sizes: h }, i);
    } }, { in: ["data", "tree", "_filterIds"], out: ["flatData", "_rowHeightFromData"], exec: (i) => {
      const { data: s, tree: a, dynamic: n, _filterIds: l2 } = this.getState(), c2 = l2 && new Set(l2), d = a ? this.flattenRows(s, [], l2) : c2 ? s.filter((u) => c2.has(u.id)) : s, h = !n && d.some((u) => u.rowHeight);
      this.setState({ flatData: d, _rowHeightFromData: h }, i);
    } }], { sizes: (i) => ({ ...o, ...i }) });
    const t = this.in = new X();
    t.on("close-editor", ({ ignore: i }) => {
      const { editor: s } = this.getState();
      s && (i || t.exec("update-cell", s), this.setState({ editor: null }));
    }), t.on("open-editor", ({ id: i, column: s }) => {
      let a = this.getState().editor;
      a && t.exec("close-editor", {});
      const n = this.getRow(i), l2 = s ? this.getColumn(s) : this.getNextEditor(n);
      if (l2?.editor) {
        let c2 = l2.editor;
        if (typeof c2 == "function" && (c2 = c2(n, l2)), !c2) return;
        a = { column: l2.id, id: i, value: S(n, l2) ?? "", renderedValue: b(n, l2) }, typeof c2 == "object" && c2.config && (a.config = c2.config, c2.config.options && (a.options = c2.config.options)), l2.options && !a.options && (a.options = l2.options), this.setState({ editor: a });
      }
    }), t.on("editor", ({ value: i }) => {
      const s = this.getState().editor;
      s && (s.value = i, this.setState({ editor: s }));
    }), t.on("add-row", (i) => {
      const s = this.getState();
      let { data: a } = s;
      const { select: n, _filterIds: l2 } = s, { row: c2, before: d, after: h, select: u } = i;
      if (i.id = c2.id = i.id || c2.id || E2(), d || h) {
        const p = d || h, g = a.findIndex((w) => w.id === p);
        a = [...a], a.splice(g + (h ? 1 : 0), 0, i.row);
      } else a = [...a, i.row];
      const f = { data: a };
      l2 && (f._filterIds = [...l2, i.id]), this.setState(f), !(typeof u == "boolean" && !u) && (u || n) && t.exec("select-row", { id: c2.id, show: true });
    }), t.on("delete-row", (i) => {
      const { data: s, selectedRows: a, focusCell: n, editor: l2 } = this.getState(), { id: c2 } = i, d = { data: s.filter((h) => h.id !== c2) };
      this.isSelected(c2) && (d.selectedRows = a.filter((h) => h !== c2)), l2?.id == c2 && (d.editor = null), this.setState(d), n?.row === c2 && this.in.exec("focus-cell", { eventSource: "delete-row" });
    }), t.on("update-cell", (i) => {
      const s = this.getState();
      let { data: a } = s;
      a = [...a];
      const { tree: n } = s, { id: l2, column: c2, value: d } = i, h = this.getColumn(c2);
      if (n) {
        const u = { ...this._branches[l2] };
        M(u, h, d);
        const f = this.updateTreeRow(u);
        u.$parent === 0 && (a = f);
      } else {
        const u = a.findIndex((p) => p.id == l2), f = { ...a[u] };
        M(f, h, d), a[u] = f;
      }
      this.setState({ data: a });
    }), t.on("update-row", (i) => {
      let { data: s } = this.getState();
      const { id: a, row: n } = i, l2 = s.findIndex((c2) => c2.id == a);
      s = [...s], s[l2] = { ...s[l2], ...n }, this.setState({ data: s });
    }), t.on("select-row", ({ id: i, toggle: s, range: a, mode: n, show: l2, column: c2 }) => {
      const d = this.getState(), { focusCell: h } = d;
      let { selectedRows: u } = d;
      if (u.length || (a = s = false), a) {
        const { data: f } = this.getState();
        let p = f.findIndex((w) => w.id == u[u.length - 1]), g = f.findIndex((w) => w.id == i);
        p > g && ([p, g] = [g, p]), f.slice(p, g + 1).forEach((w) => {
          u.indexOf(w.id) === -1 && u.push(w.id);
        });
      } else if (s && this.isSelected(i)) {
        if (n === true) return;
        u = u.filter((f) => f !== i);
      } else if (s) {
        if (n === false) return;
        u.push(i);
      } else u = [i];
      this.setState({ selectedRows: [...u] }), h?.row !== i && this.in.exec("focus-cell", { eventSource: "select-row" }), l2 && this.in.exec("scroll", { row: i, column: c2 });
    }), this.in.on("focus-cell", (i) => {
      const { row: s, column: a, eventSource: n } = i, { _columns: l2, split: c2 } = this.getState();
      s && a ? (this.setState({ focusCell: { row: s, column: a } }), n !== "click" && ((!c2.left || l2.findIndex((d) => d.id == i.column) >= c2.left) && (!c2.right || l2.findIndex((d) => d.id == i.column) < l2.length - c2.right) ? this.in.exec("scroll", { row: s, column: a }) : this.in.exec("scroll", { row: s }))) : this.setState({ focusCell: null });
    }), t.on("resize-column", (i) => {
      const { id: s, auto: a, maxRows: n, inProgress: l2 } = i;
      if (l2 === false) return;
      let c2 = i.width || 0;
      const d = [...this.getState().columns], h = d.find((u) => u.id == s);
      if (a) {
        if (a == "data" || a === true) {
          const { flatData: u, _skin: f } = this.getState();
          let p = u.length;
          n && (p = Math.min(n, p));
          const g = u.slice(0, p);
          c2 = be2(h, g, f);
        }
        if (a == "header" || a === true) {
          const { _skin: u } = this.getState();
          c2 = Math.max(ve(h, u), c2);
        }
      }
      h.width = Math.max(17, c2), delete h.flexgrow, this.setState({ columns: d });
    }), t.on("hide-column", (i) => {
      const { id: s, mode: a } = i, n = [...this.getState().columns], l2 = n.find((d) => d.id == s), c2 = n.reduce((d, h) => d + (h.hidden ? 0 : 1), 0);
      !a || c2 > 1 ? (l2.hidden = !l2.hidden, this.setState({ columns: n })) : i.skipUndo = true;
    }), t.on("sort-rows", (i) => {
      const { key: s, add: a, sort: n } = i, l2 = this.getState(), { columns: c2, data: d, tree: h } = l2;
      if (n) {
        const m = [...d];
        m.sort(n), this.setState({ data: m });
        return;
      }
      const { order: u = "asc" } = i;
      let f = l2.sortMarks;
      const p = Object.keys(f), g = p.length;
      !a || !g || g === 1 && f[s] ? f = { [s]: { order: u } } : (g === 1 && (f[p[0]] = { ...f[p[0]], index: 0 }), f = { ...f, [s]: { order: u, index: typeof a == "number" ? a : f[s]?.index ?? g } });
      const w = Object.keys(f).sort((m, y2) => f[m].index - f[y2].index).map((m) => ({ key: m, order: f[m].order }));
      this.setState({ sortMarks: f });
      const x = ye(w, c2);
      if (x) {
        const m = [...d];
        h ? this.sortTree(m, x) : m.sort(x), this.setState({ data: m });
      }
    }), t.on("filter-rows", (i) => {
      const { value: s, key: a, filter: n } = i;
      if (!Object.keys(i).length) {
        this.setState({ filterValues: {}, _filterIds: null });
        return;
      }
      const l2 = this.getState(), { data: c2, tree: d } = l2;
      let h = l2.filterValues;
      const u = {};
      a && (h = { ...h, [a]: s }, u.filterValues = h);
      const f = n ?? this.createFilter(h);
      let p = [];
      d ? p = this.filterTree(c2, f, p) : c2.forEach((g) => {
        f(g) && p.push(g.id);
      }), u._filterIds = p, this.setState(u);
    }), t.on("collapse-column", (i) => {
      const { id: s, row: a, mode: n } = i, l2 = [...this.getState().columns], c2 = this.getColumn(s).header, d = Array.isArray(c2) ? c2[a] : c2;
      typeof d == "object" && (d.collapsed = n ?? !d.collapsed, this.setState({ columns: l2 }));
    }), t.on("move-item", (i) => {
      const { id: s, inProgress: a } = i;
      let { target: n, mode: l2 = "after" } = i;
      const { data: c2, flatData: d, tree: h } = this.getState(), u = d.findIndex((g) => g.id == s);
      let f;
      if (l2 === "up" || l2 === "down") {
        if (l2 === "up") {
          if (u === 0) return;
          f = u - 1, l2 = "before";
        } else if (l2 === "down") {
          if (u === d.length - 1) return;
          f = u + 1, l2 = "after";
        }
        n = d[f] && d[f].id;
      } else f = d.findIndex((g) => g.id == n);
      if (u === -1 || f === -1 || a === false) return;
      let p;
      h ? p = this.moveItem(s, n, c2, l2) : p = this.moveItem(s, n, c2, l2), this.setState({ data: h ? this.normalizeTreeRows(p) : p });
    }), t.on("copy-row", (i) => {
      const { id: s, target: a, mode: n = "after" } = i, l2 = this.getState(), { flatData: c2, _filterIds: d } = l2;
      let { data: h } = l2;
      const u = this.getRow(s);
      if (!u) return;
      const f = { ...u, id: E2() };
      i.id = f.id;
      const p = c2.findIndex((w) => w.id == a);
      if (p === -1) return;
      h.splice(p + (n === "after" ? 1 : 0), 0, f), h = [...h];
      const g = { data: h };
      d && (g._filterIds = [...d, f.id]), this.setState(g);
    }), t.on("open-row", (i) => {
      const { id: s, nested: a } = i;
      this.toggleBranch(s, true, a);
    }), t.on("close-row", (i) => {
      const { id: s, nested: a } = i;
      this.toggleBranch(s, false, a);
    }), t.on("export-data", (i) => new Promise((s, a) => {
      const n = i.format || "csv", l2 = `${i.fileName || "data"}.${n}`;
      if (n == "csv") {
        const c2 = G2(this.getState(), i.csv || {});
        i.download !== false ? P2(new Blob(["\uFEFF" + c2], { type: "text/csv" }), l2) : i.result = c2, s(true);
      } else if (n == "xlsx") {
        let c2 = i.excel?.styles;
        !c2 && c2 !== false && (c2 = Q2(this.getState()._skin));
        const d = c2, h = d ? [{ ...d.header }, { ...d.lastHeaderCell || d.header }, { ...d.cell }, { ...d.firstFooterCell || d.footer }, { ...d.footer }] : Array(5).fill({}), { cells: u, merged: f, rowSizes: p, colSizes: g, styles: w } = J2(this.getState(), i.excel || {}, h), x = i.cdn || "https://cdn.dhtmlx.com/libs/json2excel/1.3.2/worker.js";
        this.getXlsxWorker(x).then((m) => {
          m.onmessage = (y2) => {
            if (y2.data.type == "ready") {
              const _ = y2.data.blob;
              i.download !== false ? P2(_, l2) : i.result = _, s(true);
            }
          }, m.postMessage({ type: "convert", data: { data: [{ name: i.sheetName || "data", cells: u, cols: g, rows: p, merged: f }], styles: w } });
        });
      } else a();
    })), t.on("search-rows", (i) => {
      const { search: s, columns: a } = i, n = this.searchRows(s, a);
      this.setState({ search: { value: s, rows: n } });
    }), t.on("hotkey", ({ key: i, event: s, isInput: a }) => {
      switch (i) {
        case "arrowup": {
          const { flatData: n, focusCell: l2, select: c2 } = this.getState();
          if (s.preventDefault(), a) return;
          const d = l2 ? l2.column : this._getFirstVisibleColumn()?.id, h = l2 ? this.getPrevRow(l2.row)?.id : n[n.length - 1]?.id;
          d && h && (this.in.exec("focus-cell", { row: h, column: d, eventSource: "key" }), c2 && this.in.exec("select-row", { id: h }));
          break;
        }
        case "arrowdown": {
          const { flatData: n, focusCell: l2, select: c2 } = this.getState();
          if (s.preventDefault(), a) return;
          const d = l2 ? l2.column : this._getFirstVisibleColumn()?.id, h = l2 ? this.getNextRow(l2.row)?.id : n[0]?.id;
          d && h && (this.in.exec("focus-cell", { row: h, column: d, eventSource: "key" }), c2 && this.in.exec("select-row", { id: h }));
          break;
        }
        case "arrowright": {
          const { focusCell: n } = this.getState();
          if (a) return;
          if (s.preventDefault(), n) {
            const l2 = this.getNextColumn(n.column, true)?.id;
            l2 && this.in.exec("focus-cell", { row: n.row, column: l2, eventSource: "key" });
          }
          break;
        }
        case "arrowleft": {
          const { focusCell: n } = this.getState();
          if (a) return;
          if (s.preventDefault(), n) {
            const l2 = this.getPrevColumn(n.column, true)?.id;
            l2 && this.in.exec("focus-cell", { row: n.row, column: l2, eventSource: "key" });
          }
          break;
        }
        case "tab": {
          const { editor: n, focusCell: l2, select: c2 } = this.getState();
          if (n) {
            s.preventDefault();
            const d = n.column;
            let h = n.id, u = this.getNextEditor(this.getRow(h), this.getColumn(d));
            if (!u) {
              const f = this.getNextRow(h);
              f && (h = f.id, u = this.getNextEditor(f));
            }
            u && (this.in.exec("open-editor", { id: h, column: u.id }), this.in.exec("focus-cell", { row: h, column: u.id, eventSource: "key" }), c2 && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          } else l2 && this.in.exec("focus-cell", { eventSource: "key" });
          break;
        }
        case "shift+tab": {
          const { editor: n, focusCell: l2, select: c2 } = this.getState();
          if (n) {
            s.preventDefault();
            const d = n.column;
            let h = n.id, u = this.getPrevEditor(this.getRow(h), this.getColumn(d));
            if (!u) {
              const f = this.getPrevRow(h);
              f && (h = f.id, u = this.getPrevEditor(f));
            }
            u && (this.in.exec("open-editor", { id: h, column: u.id }), this.in.exec("focus-cell", { row: h, column: u.id, eventSource: "key" }), c2 && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          } else l2 && this.in.exec("focus-cell", { eventSource: "key" });
          break;
        }
        case "escape": {
          const { editor: n } = this.getState();
          n && (this.in.exec("close-editor", { ignore: true }), this.in.exec("focus-cell", { row: n.id, column: n.column, eventSource: "key" }));
          break;
        }
        case "f2": {
          const { editor: n, focusCell: l2 } = this.getState();
          !n && l2 && this.in.exec("open-editor", { id: l2.row, column: l2.column });
          break;
        }
        case "enter": {
          const { focusCell: n, tree: l2 } = this.getState();
          if (!a && l2 && n && this.getColumn(n.column).treetoggle) {
            const c2 = this.getRow(n.row);
            if (!c2.data) return;
            this.in.exec(c2.open ? "close-row" : "open-row", { id: n.row, nested: true });
          }
          break;
        }
        case "home": {
          const { editor: n, focusCell: l2 } = this.getState();
          if (!n && l2) {
            s.preventDefault();
            const c2 = this._getFirstVisibleColumn()?.id;
            this.in.exec("focus-cell", { row: l2.row, column: c2, eventSource: "key" });
          }
          break;
        }
        case "ctrl+home": {
          const { editor: n, focusCell: l2, flatData: c2, select: d } = this.getState();
          if (!n && l2) {
            s.preventDefault();
            const h = c2[0]?.id, u = this._getFirstVisibleColumn()?.id;
            h && u && (this.in.exec("focus-cell", { row: h, column: u, eventSource: "key" }), d && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          }
          break;
        }
        case "end": {
          const { editor: n, focusCell: l2 } = this.getState();
          if (!n && l2) {
            s.preventDefault();
            const c2 = this._getLastVisibleColumn()?.id, d = l2.row;
            this.in.exec("focus-cell", { row: d, column: c2, eventSource: "key" });
          }
          break;
        }
        case "ctrl+end": {
          const { editor: n, focusCell: l2, flatData: c2, select: d } = this.getState();
          if (!n && l2) {
            s.preventDefault();
            const h = c2.at(-1).id, u = this._getLastVisibleColumn()?.id;
            h && u && (this.in.exec("focus-cell", { row: h, column: u, eventSource: "key" }), d && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          }
          break;
        }
        case "ctrl+z": {
          this.in.exec("undo", {});
          break;
        }
        case "ctrl+y": {
          this.in.exec("redo", {});
          break;
        }
      }
    }), t.on("scroll", (i) => {
      const { _columns: s, split: a, _sizes: n, flatData: l2, dynamic: c2, _rowHeightFromData: d } = this.getState();
      let h = -1, u = -1, f = 0, p = 0;
      if (i.column) {
        h = 0;
        const g = s.findIndex((w) => w.id == i.column);
        f = s[g].width;
        for (let w = a.left ?? 0; w < g; w++) {
          const x = s[w];
          x.hidden || (h += x.width);
        }
      }
      if (i.row && !c2) {
        const g = l2.findIndex((w) => w.id == i.row);
        g >= 0 && (d ? (u = l2.slice(0, g).reduce((w, x) => w + (x.rowHeight || n.rowHeight), 0), p = l2[g].rowHeight) : u = n.rowHeight * g);
      }
      this.setState({ scroll: { top: u, left: h, width: f, height: p || n.rowHeight } });
    }), t.on("print", (i) => {
      const s = ce2(i);
      this.setState({ _print: s }), this.setStateAsync({ _print: null });
    }), t.on("undo", () => {
      this._historyManager?.handleUndo();
    }), t.on("redo", () => {
      this._historyManager?.handleRedo();
    }), this.initOnce();
  }
  getXlsxWorker(e) {
    if (!this._xlsxWorker) {
      const o = window.URL.createObjectURL(new Blob([`importScripts('${e}');`], { type: "text/javascript" }));
      this._xlsxWorker = new Promise((t) => {
        const i = new Worker(o);
        i.addEventListener("message", (s) => {
          s.data.type === "init" && t(i);
        });
      });
    }
    return this._xlsxWorker;
  }
  initOnce() {
    const e = { sortMarks: {}, _filterIds: null, data: [], filterValues: {}, scroll: null, editor: null, focusCell: null, _print: null, history: { undo: 0, redo: 0 }, search: null };
    this._router.init(e);
  }
  init(e) {
    e.hasOwnProperty("_skin") && !e._skin && (e._skin = Se2()), e.columns && e.columns.forEach((o) => {
      o.options && (o.optionsMap = new Map(o.options.map((t) => [t.id, t.label])));
    }), k(this.getState().data, e.data) || (e.tree ? (this._branches = { 0: { data: e.data } }, e.data = this.normalizeTreeRows(e.data)) : e.data = this.normalizeRows(e.data), this.setState({ _filterIds: null, filterValues: {}, sortMarks: {}, search: null }), this._historyManager && this._historyManager.resetHistory()), O() && (e.tree && (e.undo = false, e.reorder = false), e.split?.right && (e.split.right = 0)), e.undo && !this._historyManager && (this._historyManager = new pe(this.in, this.getState.bind(this), this.setState.bind(this))), this._router.init({ ...e });
  }
  setState(e, o) {
    return this._router.setState(e, o);
  }
  setStateAsync(e) {
    this._router.setStateAsync(e);
  }
  getRow(e) {
    const { tree: o } = this.getState();
    return o ? this._branches[e] : this.getState().data.find((t) => t.id == e);
  }
  getRowIndex(e, o) {
    return o || (o = this.getState().flatData), o.findIndex((t) => t.id == e);
  }
  getNextRow(e) {
    const o = this.getState().flatData, t = this.getRowIndex(e, o);
    return o[t + 1];
  }
  getPrevRow(e) {
    const o = this.getState().flatData, t = this.getRowIndex(e, o);
    return o[t - 1];
  }
  getColumn(e) {
    return this.getState().columns.find((o) => o.id == e);
  }
  getNextColumn(e, o) {
    const t = this.getState()._columns, i = t.findIndex((s) => s.id == e);
    return o ? this._getFirstVisibleColumn(i + 1) : t[i + 1];
  }
  getPrevColumn(e, o) {
    const t = this.getState()._columns, i = t.findIndex((s) => s.id == e);
    return o ? this._getLastVisibleColumn(i - 1) : t[i - 1];
  }
  _getFirstVisibleColumn(e) {
    const o = this.getState()._columns;
    let t = e ?? 0;
    for (; t < o.length && (o[t]?.hidden || o[t]?.collapsed); ) t++;
    return o[t];
  }
  _getLastVisibleColumn(e) {
    const o = this.getState()._columns;
    let t = e ?? o.length - 1;
    for (; t < o.length && (o[t]?.hidden || o[t]?.collapsed); ) t--;
    return o[t];
  }
  isCellEditable(e, o) {
    const { editor: t, hidden: i } = o;
    return !t || i ? false : typeof t == "function" ? t(e, o) : true;
  }
  getNextEditor(e, o) {
    let t = this.getState().columns;
    if (o) {
      const i = t.findIndex((s) => s.id == o.id);
      t = t.slice(i + 1);
    }
    return t.find((i) => this.isCellEditable(e, i));
  }
  getPrevEditor(e, o) {
    let t = this.getState().columns;
    if (o) {
      const i = t.findLastIndex((s) => s.id == o.id);
      t = t.slice(0, i);
    }
    return t.findLast((i) => this.isCellEditable(e, i));
  }
  toggleBranch(e, o, t) {
    let i = this._branches[e], { data: s } = this.getState();
    if (s = [...s], e !== 0) {
      i = { ...i, open: o };
      const a = this.updateTreeRow(i);
      i.$parent === 0 && (s = a);
    }
    t && i.data?.length && i.data.forEach((a) => {
      const n = this.toggleKids(a, o, t);
      e === 0 && (s = n);
    }), this.setState({ data: s });
  }
  toggleKids(e, o, t) {
    e = { ...e, open: o };
    const i = this.updateTreeRow(e);
    return t && e.data?.length && e.data.forEach((s) => {
      this.toggleKids(s, o, t);
    }), i;
  }
  updateTreeRow(e) {
    const o = e.id;
    this._branches[o] = e;
    const t = this._branches[e.$parent], i = t.data.findIndex((s) => s.id == o);
    return t.data = [...t.data], t.data[i] = e, t.data;
  }
  isSelected(e) {
    return this.getState().selectedRows.indexOf(e) !== -1;
  }
  findAndRemove(e, o) {
    for (let t = 0; t < e.length; t++) {
      if (e[t].id == o) return e.splice(t, 1)[0];
      if (e[t].data) {
        const i = [...e[t].data], s = this.findAndRemove(i, o);
        if (s) return e[t] = { ...e[t], data: i }, s;
      }
    }
    return null;
  }
  insertItem(e, o, t, i) {
    for (let s = 0; s < e.length; s++) {
      if (e[s].id == o) {
        const a = e[s], n = i === "before" ? s : s + 1;
        if (a.data) {
          if (i === "before") {
            const l2 = s > 0 ? e[s - 1] : null;
            return l2?.data && l2.open ? e[s - 1] = { ...l2, data: [...l2.data, t] } : e.splice(n, 0, t), true;
          } else if (a.open) return e[s] = { ...a, data: [t, ...a.data] }, true;
        }
        return e.splice(n, 0, t), true;
      }
      if (e[s].data && (e[s] = { ...e[s], data: [...e[s].data] }, this.insertItem(e[s].data, o, t, i))) return true;
    }
    return false;
  }
  moveItem(e, o, t, i) {
    const s = [...t], a = this.findAndRemove(s, e);
    return this.insertItem(s, o, a, i), s;
  }
  copyColumns(e) {
    const o = [];
    for (let t = 0; t < e.length; t++) {
      const i = { ...e[t] };
      this.copyHeaderFooter(i, "header"), this.copyHeaderFooter(i, "footer"), o[t] = i;
    }
    return o;
  }
  copyHeaderFooter(e, o) {
    let t = e[o];
    t = Array.isArray(t) ? [...t] : [t], t.forEach((i, s) => {
      t[s] = typeof i == "string" ? { text: i } : { ...i };
    }), e[o] = t;
  }
  setCollapsibleColumns(e, o, t) {
    let i = e.header;
    for (let s = 0; s < i.length; s++) {
      const a = i[s];
      if (a.collapsible && a.collapsed) {
        if (a.collapsible !== "first") {
          e.collapsed = true, e.width = 36, a.vertical = true;
          const l2 = i.length - s;
          i = i.slice(0, s + 1), i[s].rowspan = l2;
        }
        const n = a.colspan;
        if (n) {
          const l2 = i[s + 1];
          let c2 = 1;
          l2 && l2.colspan && !l2.collapsed && (c2 = l2.colspan);
          for (let d = c2; d < n; d++) {
            const h = t[o + d];
            h && (h.hidden = true);
          }
        }
      }
    }
  }
  normalizeColumns(e, o, t, i, s) {
    const a = e[o];
    a.width || (a.width = a.flexgrow ? 17 : s.columnWidth), a._colindex = o + 1;
    const n = a[t], l2 = s[`${t}RowHeights`];
    for (let c2 = 0; c2 < i; c2++) {
      const d = n[c2];
      d.id = a.id, c2 === n.length - 1 && (d.rowspan = d.rowspan ? Math.min(d.rowspan, i - c2) : i - c2);
      for (let h = 1; h < d.rowspan; h++) {
        n.splice(c2 + h, 0, { _hidden: true });
        for (let u = 1; u < d.colspan; u++) e[o + u][t].splice(c2 + h, 0, {});
      }
      if (d.rowspan) {
        const h = (d.rowspan === i ? l2 : l2.slice(c2, d.rowspan + c2)).reduce((u, f) => u + f, 0);
        d.height = h, c2 + d.rowspan != i && d.height--;
      }
      if (d.colspan) {
        let h = a.width, u = a.flexgrow || 0;
        const f = d.colspan;
        for (let p = 1; p < f; p++) {
          const g = e[o + p];
          g && (g.hidden ? d.colspan -= 1 : g.flexgrow ? u += g.flexgrow : h += g.width || s.columnWidth), u ? d.flexgrow = u : d.width = h;
        }
      } else d.width = a.width, d.flexgrow = a.flexgrow;
      t === "header" && d.filter && typeof d.filter == "string" && (d.filter = { type: d.filter });
    }
    n.length > i && (n.length = i), a[t] = n;
  }
  normalizeRows(e) {
    for (let o = 0; o < e.length; o++) e[o].id || (e[o].id = E2());
    return e;
  }
  normalizeTreeRows(e, o, t) {
    return e.forEach((i) => {
      i.id || (i.id = E2()), i.$level = o || 0, i.$parent = t || 0, this._branches[i.id] = i, i.data && (i.data.length ? (i.$count = i.data.length, this.normalizeTreeRows(i.data, i.$level + 1, i.id)) : (delete i.data, delete i.$count, delete i.open));
    }), e;
  }
  sortTree(e, o) {
    e.sort(o), e.forEach((t) => {
      t.data && this.sortTree(t.data, o);
    });
  }
  filterTree(e, o, t) {
    return e.forEach((i) => {
      o(i) && t.push(i.id), i.data && this.filterTree(i.data, o, t);
    }), t;
  }
  flattenRows(e, o, t) {
    const i = o;
    return e.forEach((s) => {
      (!t || t.includes(s.id)) && i.push(s), s.data?.length && s.open !== false && this.flattenRows(s.data, i, t);
    }), i;
  }
  createFilter(e) {
    const { _columns: o } = this.getState(), t = [];
    for (const i in e) {
      const { config: s, type: a } = o.find((l2) => l2.id == i).header.find((l2) => l2.filter).filter, n = e[i];
      t.push((l2) => s?.handler ? s.handler(l2[i], n) : Ce2(a)(l2[i], n));
    }
    return (i) => {
      for (let s = 0; s < t.length; s++) if (!t[s](i)) return false;
      return true;
    };
  }
  searchRows(e, o) {
    e = e.trim().toLowerCase();
    const t = {};
    if (!e) return t;
    const { flatData: i, columns: s } = this.getState(), a = o ? s.filter((n) => o[n.id]) : s;
    return i.forEach((n) => {
      const l2 = {};
      a.forEach((c2) => {
        const d = b(n, c2);
        String(d).toLowerCase().includes(e) && (l2[c2.id] = true);
      }), Object.keys(l2).length && (t[n.id] = l2);
    }), t;
  }
  normalizeSizes(e, o, t, i, s) {
    const a = j(e, "header", t, o.headerHeight, s), n = j(e, "footer", i, o.footerHeight, s), l2 = a.reduce((d, h) => d + h, 0), c2 = n.reduce((d, h) => d + h, 0);
    return { ...o, headerRowHeights: a, footerRowHeights: n, headerHeight: l2, footerHeight: c2 };
  }
};
var Ee = (/* @__PURE__ */ new Date()).valueOf();
function E2() {
  return "temp://" + Ee++;
}
function Ie(r, e = "data-id") {
  let o = r;
  for (!o.tagName && r.target && (o = r.target); o; ) {
    if (o.getAttribute && o.getAttribute(e)) return o;
    o = o.parentNode;
  }
  return null;
}
(/* @__PURE__ */ new Date()).valueOf();
var Te = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
  }
  configure(r, e) {
    this.node = e;
    for (const o in r) if (r[o]) {
      const t = o.toLowerCase().replace(/[ ]/g, ""), i = r[o];
      this.store.set(t, i);
    }
  }
};
var v = [];
var De = { subscribe: (r) => {
  He();
  const e = new Te();
  return v.push(e), r(e), () => {
    const o = v.findIndex((t) => t === e);
    o >= 0 && v.splice(o, 1);
  };
} };
var V = false;
function He() {
  V || (V = true, document.addEventListener("keydown", (r) => {
    if (v.length && (r.ctrlKey || r.altKey || r.metaKey || r.shiftKey || r.key.length > 1 || r.key === " ")) {
      const e = [];
      r.ctrlKey && e.push("ctrl"), r.altKey && e.push("alt"), r.metaKey && e.push("meta"), r.shiftKey && e.push("shift");
      let o = r.code.replace("Key", "").toLocaleLowerCase();
      r.key === " " && (o = "space"), e.push(o);
      const t = e.join("+");
      for (let i = v.length - 1; i >= 0; i--) {
        const s = v[i], a = s.store.get(t) || s.store.get(o);
        a && s.node.contains(r.target) && a(r, { key: t, evKey: o });
      }
    }
  }));
}
var Me2 = { tab: true, "shift+tab": true, arrowup: true, arrowdown: true, arrowright: true, arrowleft: true, enter: true, escape: true, f2: true, home: true, end: true, "ctrl+home": true, "ctrl+end": true, "ctrl+z": true, "ctrl+y": true };
function Pe(r, { keys: e, exec: o }) {
  if (!e) return;
  function t(a) {
    const n = a.target;
    return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || Ie(n, "data-header-id")?.classList.contains("wx-filter") || !!n.closest(".wx-cell.wx-editor");
  }
  const i = {};
  for (const a in e) {
    const n = e[a];
    typeof n < "u" && (typeof n == "function" ? i[a] = n : n && (i[a] = (l2) => {
      const c2 = t(l2);
      o({ key: a, event: l2, isInput: c2 });
    }));
  }
  const s = De.subscribe((a) => {
    a.configure(i, r);
  });
  return { destroy: () => {
    s();
  } };
}
function ze2(r, e) {
  let o = null;
  e.scroll.subscribe((t) => {
    if (!t || t === o) return;
    o = t;
    const { left: i, top: s, height: a, width: n } = t, l2 = e.getHeight(), c2 = e.getWidth(), d = e.getScrollMargin();
    if (s >= 0) {
      const h = r.scrollTop;
      s < h ? r.scrollTop = s : s + a > h + l2 && (r.scrollTop = s - l2 + a);
    }
    if (i >= 0) {
      const h = r.scrollLeft;
      i < h ? r.scrollLeft = i : i + n > h + c2 - d && (r.scrollLeft = i - c2 + n + d);
    }
  });
}

// ../../common/temp/node_modules/.pnpm/@svar-ui+react-grid@2.5.2_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@svar-ui/react-grid/dist/index.es.js
var oe2 = (0, import_react3.createContext)(null);
function yn(n, e) {
  const t = new ResizeObserver((r) => {
    requestAnimationFrame(() => e(r[0].contentRect));
  });
  return t.observe(n.parentNode), {
    destroy() {
      t.disconnect();
    }
  };
}
var pt = 5;
var bn = 700;
function vn(n) {
  return id(n.getAttribute("data-id"));
}
function Pe2(n) {
  const e = n.getBoundingClientRect(), t = document.body, r = e.top + t.scrollTop - t.clientTop || 0, u = e.left + t.scrollLeft - t.clientLeft || 0;
  return {
    y: Math.round(r),
    x: Math.round(u),
    width: n.offsetWidth,
    height: n.offsetHeight
  };
}
function Ze2(n, e) {
  const t = Pe2(e);
  return { x: n.clientX - t.x, y: n.clientY - t.y };
}
function Cn(n, e) {
  const t = e.current;
  let r = null, u, x, a = false, b2 = false;
  const d = document.createElement("DIV");
  d.className = "wx-drag-zone", d.setAttribute("tabindex", -1);
  function f() {
    clearTimeout(u), u = null;
  }
  function h(i) {
    const k2 = locate(i);
    k2 && (r = {
      container: d,
      sourceNode: i.target,
      from: vn(k2),
      pos: Ze2(i, n)
    }, x = r.pos, s(i));
  }
  function s(i) {
    if (!r) return;
    const k2 = r.pos = Ze2(i, n);
    if (!a) {
      if (!b2 && !i?.target?.getAttribute("draggable-data") && Math.abs(x.x - k2.x) < pt && Math.abs(x.y - k2.y) < pt)
        return;
      if (D2(i) === false) return R2();
    }
    if (b2) {
      const U2 = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft, J3 = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      r.targetNode = document.elementFromPoint(
        i.pageX - U2,
        i.pageY - J3
      );
    } else r.targetNode = i.target;
    t.move && t.move(i, r), d.style.left = -(r.offset ? r.offset.x : 0) + "px", d.style.top = r.pos.y + (r.offset ? r.offset.y : 0) + "px";
  }
  function v2(i) {
    d.parentNode && d.parentNode.removeChild(d), d.innerHTML = "", a && t.end && t.end(i, r), r = x = null, R2();
  }
  function E3(i) {
    t.getReorder && !t.getReorder() || i.button === 0 && (T2(i), window.addEventListener("mousemove", C2), window.addEventListener("mouseup", l2), h(i));
  }
  function C2(i) {
    s(i);
  }
  function l2(i) {
    v2(i);
  }
  function m(i) {
    if (t.getReorder && !t.getReorder()) return;
    u = setTimeout(() => {
      b2 = true, h(i.touches[0]);
    }, bn), T2(i);
    function k2() {
      u && f(), i.target.removeEventListener("touchmove", g), i.target.removeEventListener("touchend", k2), v2(i);
    }
    i.target.addEventListener("touchmove", g), i.target.addEventListener("touchend", k2), n.addEventListener("contextmenu", w);
  }
  function g(i) {
    a ? (i.preventDefault(), s(i.touches[0])) : u && f();
  }
  function w(i) {
    if (a || u)
      return i.preventDefault(), false;
  }
  function y2(i) {
    i.preventDefault();
  }
  function T2(i) {
    if (!t.getDraggableInfo) return;
    const { hasDraggable: k2 } = t.getDraggableInfo();
    (!k2 || i.target.getAttribute("draggable-data")) && (document.body.style.userSelect = "none", document.body.style.webkitUserSelect = "none");
  }
  function D2(i) {
    if (a = true, t.start) {
      if (t.start(i, r) === false) return false;
      n.appendChild(d), document.body.style.cursor = "move";
    }
  }
  function R2(i) {
    a = b2 = false, document.body.style.cursor = "", document.body.style.userSelect = "", document.body.style.webkitUserSelect = "", window.removeEventListener("mousemove", C2), window.removeEventListener("mouseup", l2), i && (n.removeEventListener("mousedown", E3), n.removeEventListener("touchstart", m), n.removeEventListener("dragstart", y2));
  }
  return n.addEventListener("mousedown", E3), n.addEventListener("touchstart", m), n.addEventListener("dragstart", y2), {
    destroy() {
      R2(true);
    }
  };
}
var Sn = 4e-3;
function Rn() {
  return {
    dirX: 0,
    dirY: 0,
    scrollSpeedFactor: 1
  };
}
function Nn(n, e, t, r) {
  const { node: u, left: x, top: a, bottom: b2, sense: d, xScroll: f, yScroll: h } = r, s = Ze2(n, u);
  t.scrollState || (t.scrollState = Rn());
  let v2 = 0, E3 = 0;
  s.x < x + d ? v2 = -1 : s.x > e.width - d && (v2 = 1), s.y < a + Math.round(d / 2) ? E3 = -1 : s.y > e.height - b2 - Math.round(d / 2) && (E3 = 1), (t.scrollState.dirX !== v2 || t.scrollState.dirY !== E3) && (Et2(t), t.scrollState.dirX = v2, t.scrollState.dirY = E3), (f && t.scrollState.dirX !== 0 || h && t.scrollState.dirY !== 0) && Dn(t, r, {
    x: t.scrollState.dirX,
    y: t.scrollState.dirY
  });
}
function Dn(n, e, t) {
  n.autoScrollTimer || (n.autoScrollTimer = setTimeout(() => {
    n.activeAutoScroll = setInterval(
      Tn,
      15,
      n,
      e,
      t
    );
  }, 250));
}
function Et2(n) {
  n.scrollSpeedFactor = 1, n.autoScrollTimer && (n.autoScrollTimer = clearTimeout(n.autoScrollTimer), n.activeAutoScroll = clearInterval(n.activeAutoScroll));
}
function Tn(n, e, t) {
  const { x: r, y: u } = t;
  n.scrollSpeedFactor += Sn, r !== 0 && Ln(n, e, r), u !== 0 && En(n, e, u);
}
function En(n, e, t) {
  const r = e.node.scrollTop;
  Lt(
    r + Math.round(e.sense / 3) * n.scrollSpeedFactor * t,
    "scrollTop",
    e
  );
}
function Ln(n, e, t) {
  const r = e.node.scrollLeft;
  Lt(
    r + Math.round(e.sense / 3) * n.scrollSpeedFactor * t,
    "scrollLeft",
    e
  );
}
function Lt(n, e, t) {
  t.node[e] = n;
}
function We(n, e, t, r, u, x) {
  const a = {};
  return n && (a.width = `${n}px`, a.minWidth = `${n}px`), e && (a.flexGrow = e), x && (a.height = `${x}px`), t && (a.position = "sticky", t.left && (a.left = `${r}px`), t.right && (a.right = `${u}px`)), a;
}
function Ht(n, e, t) {
  let r = "";
  if (n.fixed)
    for (const u in n.fixed)
      r += n.fixed[u] === -1 ? "wx-shadow " : "wx-fixed ";
  return r += e.rowspan > 1 ? "wx-rowspan " : "", r += e.colspan > 1 ? "wx-colspan " : "", r += e.vertical ? "wx-vertical " : "", r += t ? t(n) + " " : "", r;
}
function Hn(n) {
  const {
    row: e,
    column: t,
    cellStyle: r = null,
    columnStyle: u = null,
    children: x
  } = n, [a, b2] = useWritableProp(n.focusable), d = (0, import_react3.useContext)(oe2), f = useStore(d, "focusCell"), h = useStore(d, "search"), s = useStore(d, "reorder"), v2 = (0, import_react3.useMemo)(
    () => h?.rows[e.id] && h.rows[e.id][t.id],
    [h, e.id, t.id]
  ), E3 = (0, import_react3.useMemo)(
    () => We(
      t.width,
      t.flexgrow,
      t.fixed,
      t.left,
      t.right
    ),
    [t.width, t.flexgrow, t.fixed, t.left, t.right]
  );
  function C2(R2, i) {
    let k2 = "wx-cell";
    return k2 += t.fixed ? " " + (t.fixed === -1 ? "wx-shadow" : "wx-fixed") : "", k2 += R2 ? " " + R2(t) : "", k2 += i ? " " + i(e, t) : "", k2 += t.treetoggle ? " wx-tree-cell" : "", k2;
  }
  const l2 = (0, import_react3.useMemo)(
    () => C2(u, r),
    [u, r, t, e]
  ), m = (0, import_react3.useMemo)(() => typeof t.draggable == "function" ? t.draggable(e, t) !== false : t.draggable, [t, e]), g = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    g.current && a && f?.row === e.id && f?.column === t.id && g.current.focus();
  }, [f, a, e.id, t.id]);
  const w = (0, import_react3.useCallback)(() => {
    a && d.exec("focus-cell", {
      row: e.id,
      column: t.id,
      eventSource: "focus"
    });
  }, [d, a, e.id, t.id]);
  (0, import_react3.useEffect)(() => () => {
    a && f && (d.exec("focus-cell", { eventSource: "destroy" }), b2(false));
  }, [d, b2]);
  function y2(R2) {
    const i = new RegExp(`(${h.value.trim()})`, "gi");
    return String(R2).split(i).map((U2) => ({ text: U2, highlight: i.test(U2) }));
  }
  const T2 = (0, import_react3.useMemo)(() => {
    const R2 = t.fixed && t.fixed.left === -1 || t.fixed.right === -1, i = t.fixed && t.fixed.right;
    return [
      l2,
      R2 ? "wx-shadow" : "",
      i ? "wx-fixed-right" : ""
    ].filter(Boolean).join(" ");
  }, [l2, t]), D2 = t.cell;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: "wx-TSCaXsGV " + T2,
      ref: g,
      onFocus: w,
      style: E3,
      "data-row-id": e.id,
      "data-col-id": t.id,
      tabIndex: a ? "0" : "-1",
      role: "gridcell",
      "aria-colindex": t._colindex,
      "aria-readonly": t.editor ? void 0 : true,
      children: [
        s && t.draggable ? m ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "i",
          {
            "draggable-data": "true",
            className: "wx-TSCaXsGV wx-draggable wxi-drag"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { className: "wx-TSCaXsGV wx-draggable-stub" }) : null,
        t.treetoggle ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { marginLeft: `${e.$level * 28}px` } }),
          e.$count ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "i",
            {
              "data-action": "toggle-row",
              className: `wx-TSCaXsGV wx-table-tree-toggle wxi-menu-${e.open !== false ? "down" : "right"}`
            }
          ) : null
        ] }) : null,
        D2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          D2,
          {
            api: d,
            row: e,
            column: t,
            onAction: ({ action: R2, data: i }) => d.exec(R2, i)
          }
        ) : x ? x() : v2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: y2(b(e, t)).map(
          ({ highlight: R2, text: i }, k2) => R2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("mark", { className: "wx-TSCaXsGV wx-search", children: i }, k2) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: i }, k2)
        ) }) : b(e, t)
      ]
    }
  );
}
function wt2(n, e) {
  let t, r;
  function u(b2) {
    t = b2.clientX, n.style.opacity = 1, document.body.style.cursor = "ew-resize", document.body.style.userSelect = "none", window.addEventListener("mousemove", x), window.addEventListener("mouseup", a), e && e.down && e.down(n);
  }
  function x(b2) {
    r = b2.clientX - t, e && e.move && e.move(r);
  }
  function a() {
    n.style.opacity = "", document.body.style.cursor = "", document.body.style.userSelect = "", e && e.up && e.up(r), window.removeEventListener("mousemove", x), window.removeEventListener("mouseup", a);
  }
  return n.addEventListener("mousedown", u), {
    destroy() {
      n.removeEventListener("mousedown", u);
    }
  };
}
function kn({ filter: n, column: e, action: t, filterValue: r }) {
  function u({ value: x }) {
    t({ value: x, key: e.id });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    fe,
    {
      ...n.config ?? {},
      value: r,
      onChange: u
    }
  );
}
function $n({ filter: n, column: e, action: t, filterValue: r }) {
  const u = (0, import_react3.useContext)(oe2), x = useStore(u, "flatData"), a = (0, import_react3.useMemo)(
    () => n?.config?.options || e?.options || d(),
    [n, e, x]
  ), b2 = (0, import_react3.useMemo)(() => n?.config?.template, [n]);
  function d() {
    const s = [];
    return x.forEach((v2) => {
      const E3 = S(v2, e);
      s.includes(E3) || s.push(E3);
    }), s.map((v2) => ({ id: v2, label: v2 }));
  }
  function f({ value: s }) {
    t({ value: s, key: e.id });
  }
  function h(s) {
    s.key !== "Tab" && s.preventDefault();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { width: "100%" }, onKeyDown: h, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    Et,
    {
      placeholder: "",
      clear: true,
      ...n?.config ?? {},
      options: a,
      value: r,
      onChange: f,
      children: (s) => b2 ? b2(s) : s.label
    }
  ) });
}
var Mn = {
  text: kn,
  richselect: $n
};
function An({ filter: n, column: e }) {
  const t = (0, import_react3.useContext)(oe2), r = useStore(t, "filterValues");
  function u(a) {
    t.exec("filter-rows", a);
  }
  const x = (0, import_react3.useMemo)(() => Mn[n.type], [n.type]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    x,
    {
      filter: n,
      column: e,
      action: u,
      filterValue: r[e.id]
    }
  );
}
function In(n) {
  const {
    cell: e,
    column: t,
    row: r,
    lastRow: u,
    sortRow: x,
    columnStyle: a,
    bodyHeight: b2,
    hasSplit: d
  } = n, f = (0, import_react3.useContext)(oe2), h = useStore(f, "sortMarks"), s = (0, import_react3.useMemo)(() => h ? h[t.id] : void 0, [h, t.id]), v2 = (0, import_react3.useRef)(), E3 = (0, import_react3.useCallback)(
    (H3) => {
      v2.current = e.flexgrow ? H3.parentNode.clientWidth : e.width;
    },
    [e.flexgrow, e.width]
  ), C2 = (0, import_react3.useCallback)(
    (H3, $3) => {
      f.exec("resize-column", {
        id: e.id,
        width: Math.max(1, (v2.current || 0) + H3),
        inProgress: $3
      });
    },
    [f, e.id]
  ), l2 = (0, import_react3.useCallback)((H3) => C2(H3, true), [C2]), m = (0, import_react3.useCallback)((H3) => C2(H3, false), [C2]), g = (0, import_react3.useCallback)(
    (H3) => {
      if (!t.sort || e.filter) return;
      let $3 = s?.order;
      $3 && ($3 = $3 === "asc" ? "desc" : "asc"), f.exec("sort-rows", { key: e.id, add: H3.ctrlKey, order: $3 });
    },
    [f, e.id, e.filter, t.sort, s?.order]
  ), w = (0, import_react3.useCallback)(
    (H3) => {
      H3 && H3.stopPropagation(), f.exec("collapse-column", { id: e.id, row: r });
    },
    [f, e.id, r]
  ), y2 = (0, import_react3.useCallback)(
    (H3) => {
      H3.key === "Enter" && w();
    },
    [w]
  ), T2 = (0, import_react3.useCallback)(
    (H3) => {
      H3.key === "Enter" && !e.filter && g(H3);
    },
    [g, e.filter]
  ), D2 = (0, import_react3.useMemo)(
    () => e.collapsed && t.collapsed,
    [e.collapsed, t.collapsed]
  ), R2 = (0, import_react3.useMemo)(
    () => D2 && !d && e.collapsible !== "header",
    [D2, d, e.collapsible]
  ), i = (0, import_react3.useMemo)(
    () => R2 ? { top: -b2 / 2, position: "absolute" } : {},
    [R2, b2]
  ), k2 = (0, import_react3.useMemo)(
    () => We(
      e.width,
      e.flexgrow,
      t.fixed,
      t.left,
      e.right ?? t.right,
      e.height + (D2 && R2 ? b2 : 0)
    ),
    [
      e.width,
      e.flexgrow,
      t.fixed,
      t.left,
      e.right,
      t.right,
      e.height,
      D2,
      R2,
      b2
    ]
  ), U2 = (0, import_react3.useMemo)(
    () => Ht(t, e, a),
    [t, e, a]
  ), J3 = (0, import_react3.useCallback)(() => Object.fromEntries(
    Object.entries(e).filter(([H3]) => H3 !== "cell")
  ), [e]), te3 = `wx-cell ${U2} ${e.css || ""} wx-collapsed`, V2 = [
    "wx-cell",
    U2,
    e.css || "",
    e.filter ? "wx-filter" : "",
    t.fixed && t.fixed.right ? "wx-fixed-right" : ""
  ].filter(Boolean).join(" "), j2 = (0, import_react3.useRef)(null);
  return (0, import_react3.useEffect)(() => {
    const H3 = j2.current;
    if (!H3) return;
    const $3 = wt2(H3, { down: E3, move: l2, up: m });
    return () => {
      typeof $3 == "function" && $3();
    };
  }, [E3, l2, m, wt2]), D2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: "wx-RsQD74qC " + te3,
      style: k2,
      role: "button",
      "aria-label": `Expand column ${e.text || ""}`,
      "aria-expanded": !e.collapsed,
      tabIndex: 0,
      onKeyDown: y2,
      onClick: w,
      "data-header-id": t.id,
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-RsQD74qC wx-text", style: i, children: e.text || "" })
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: "wx-RsQD74qC " + V2,
      style: k2,
      onClick: g,
      "data-header-id": t.id,
      tabIndex: !e._hidden && t.sort && !e.filter ? 0 : void 0,
      role: "columnheader",
      "aria-colindex": e._colindex,
      "aria-colspan": e.colspan > 1 ? e.colspan : void 0,
      "aria-rowspan": e.rowspan > 1 ? e.rowspan : void 0,
      "aria-sort": !s?.order || e.filter ? "none" : s?.order === "asc" ? "ascending" : "descending",
      onKeyDown: T2,
      children: [
        e.collapsible ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            className: "wx-RsQD74qC wx-collapse",
            role: "button",
            "aria-label": e.collapsed ? "Expand column" : "Collapse column",
            "aria-expanded": !e.collapsed,
            tabIndex: 0,
            onKeyDown: y2,
            onClick: w,
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "i",
              {
                className: `wx-RsQD74qC wxi-angle-${e.collapsed ? "down" : "right"}`
              }
            )
          }
        ) : null,
        e.cell ? (() => {
          const H3 = e.cell;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            H3,
            {
              api: f,
              cell: J3(),
              column: t,
              row: r,
              onAction: ({ action: $3, data: Ee2 }) => f.exec($3, Ee2)
            }
          );
        })() : e.filter ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(An, { filter: e.filter, column: t }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-RsQD74qC wx-text", children: e.text || "" }),
        t.resize && u && !e._hidden ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            className: "wx-RsQD74qC wx-grip",
            role: "presentation",
            "aria-label": "Resize column",
            ref: j2,
            onClick: (H3) => H3.stopPropagation(),
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", {})
          }
        ) : null,
        x ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-RsQD74qC wx-sort", children: s ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          typeof s.index < "u" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-RsQD74qC wx-order", children: s.index + 1 }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "i",
            {
              className: `wx-RsQD74qC wxi-arrow-${s.order === "asc" ? "up" : "down"}`
            }
          )
        ] }) : null }) : null
      ]
    }
  );
}
function Vn({ cell: n, column: e, row: t, columnStyle: r }) {
  const u = (0, import_react3.useContext)(oe2), x = (0, import_react3.useMemo)(
    () => We(
      n?.width,
      n?.flexgrow,
      e?.fixed,
      e?.left,
      n?.right ?? e?.right,
      n?.height
    ),
    [
      n?.width,
      n?.flexgrow,
      e?.fixed,
      e?.left,
      n?.right,
      e?.right,
      n?.height
    ]
  ), a = (0, import_react3.useMemo)(
    () => Ht(e, n, r),
    [e, n, r]
  ), b2 = (0, import_react3.useCallback)(() => Object.fromEntries(
    Object.entries(n || {}).filter(([f]) => f !== "cell")
  ), [n]), d = `wx-6Sdi3Dfd wx-cell ${a || ""} ${n?.css || ""}` + (e?.fixed && e?.fixed.right ? " wx-fixed-right" : "");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: d, style: x, children: !e?.collapsed && !n?.collapsed ? n?.cell ? import_react3.default.createElement(n.cell, {
    api: u,
    cell: b2(),
    column: e,
    row: t,
    onAction: ({ action: f, data: h }) => u.exec(f, h)
  }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-6Sdi3Dfd wx-text", children: n?.text || "" }) : null });
}
function xt2({
  deltaLeft: n,
  contentWidth: e,
  columns: t,
  type: r = "header",
  columnStyle: u,
  bodyHeight: x
}) {
  const a = (0, import_react3.useContext)(oe2), b2 = useStore(a, "_sizes"), d = useStore(a, "split"), f = (0, import_react3.useMemo)(() => b2?.[`${r}RowHeights`], [b2, r]), h = (0, import_react3.useMemo)(() => {
    let l2 = [];
    if (t && t.length) {
      const m = t[0][r].length;
      for (let g = 0; g < m; g++) {
        let w = 0;
        l2.push([]), t.forEach((y2, T2) => {
          const D2 = { ...y2[r][g] };
          if (w || l2[g].push(D2), D2.colspan > 1) {
            if (w = D2.colspan - 1, !O() && y2.right) {
              let R2 = y2.right;
              for (let i = 1; i < D2.colspan; i++)
                R2 -= t[T2 + i].width;
              D2.right = R2;
            }
          } else w && w--;
        });
      }
    }
    return l2;
  }, [t, r]), s = (0, import_react3.useMemo)(() => d?.left || d?.right, [d]);
  function v2(l2) {
    return t.find((m) => m.id === l2);
  }
  function E3(l2, m) {
    let g = m;
    return l2.rowspan && (g += l2.rowspan - 1), g === h.length - 1;
  }
  function C2(l2, m, g) {
    if (!g.sort) return false;
    for (let w = h.length - 1; w >= 0; w--) {
      const y2 = g.header[w];
      if (!y2.filter && !y2._hidden) return m === w;
    }
    return E3(l2, m);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: `wx-sAsPVaUK wx-${r}`,
      style: { paddingLeft: `${n}px`, width: `${e}px` },
      role: "rowgroup",
      children: h.map((l2, m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: r === "header" ? "wx-sAsPVaUK wx-h-row" : "wx-sAsPVaUK wx-f-row",
          style: { height: `${f?.[m]}px`, display: "flex" },
          role: "row",
          children: l2.map((g) => {
            const w = v2(g.id);
            return r === "header" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              In,
              {
                cell: g,
                columnStyle: u,
                column: w,
                row: m,
                lastRow: E3(g, m),
                bodyHeight: x,
                sortRow: C2(g, m, w),
                hasSplit: s
              },
              g.id
            ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              Vn,
              {
                cell: g,
                columnStyle: u,
                column: v2(g.id),
                row: m
              },
              g.id
            );
          })
        },
        m
      ))
    }
  );
}
function zn({ overlay: n }) {
  const e = (0, import_react3.useContext)(oe2);
  function t(u) {
    return typeof u == "function";
  }
  const r = n;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-1ty666CQ wx-overlay", children: t(n) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(r, { onAction: ({ action: u, data: x }) => e.exec(u, x) }) : n });
}
function On(n) {
  const { actions: e, editor: t } = n, [r, u] = (0, import_react3.useState)(t?.value || ""), x = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    x.current && x.current.focus();
  }, []);
  function a() {
    x.current && (u(x.current.value), e.updateValue(x.current.value));
  }
  function b2({ key: d }) {
    d === "Enter" && e.save();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "input",
    {
      className: "wx-e7Ao5ejY wx-text",
      onInput: a,
      onKeyDown: b2,
      ref: x,
      type: "text",
      value: r
    }
  );
}
function Pn({ actions: n, editor: e, onAction: t }) {
  const [r, u] = (0, import_react3.useState)(e?.value), [x, a] = (0, import_react3.useState)(e?.renderedValue), [b2, d] = (0, import_react3.useState)(e?.options || []), f = (0, import_react3.useMemo)(() => e?.config?.template, [e]), h = (0, import_react3.useMemo)(() => e?.config?.cell, [e]), s = (0, import_react3.useMemo)(() => (b2 || []).findIndex((w) => w.id === r), [b2, r]), v2 = (0, import_react3.useRef)(null), E3 = (0, import_react3.useRef)(null), C2 = (0, import_react3.useCallback)(
    (w) => {
      v2.current = w.navigate, E3.current = w.keydown, v2.current(s);
    },
    [s, v2]
  ), l2 = (0, import_react3.useCallback)(
    (w) => {
      const y2 = w?.target?.value ?? "";
      a(y2);
      const T2 = y2 ? (e?.options || []).filter(
        (D2) => (D2.label || "").toLowerCase().includes(y2.toLowerCase())
      ) : e?.options || [];
      d(T2), T2.length ? v2.current(-1 / 0) : v2.current(null);
    },
    [e]
  ), m = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    m.current && m.current.focus();
  }, []), (0, import_react3.useEffect)(() => {
    u(e?.value), a(e?.renderedValue), d(e?.options || []);
  }, [e]);
  const g = (0, import_react3.useCallback)(
    ({ id: w }) => {
      n.updateValue(w), n.save();
    },
    [n]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        className: "wx-0UYfSd1x wx-input",
        ref: m,
        value: x ?? "",
        onChange: l2,
        onKeyDown: (w) => E3.current ? E3.current(w, s) : void 0
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      we,
      {
        items: b2,
        onReady: C2,
        onSelect: g,
        children: ({ option: w }) => f ? f(w) : h ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(h, { data: w, onAction: t }) : w.label
      }
    )
  ] });
}
function Kn({ actions: n, editor: e, onAction: t }) {
  const [r] = (0, import_react3.useState)(() => e.value || /* @__PURE__ */ new Date()), [u] = (0, import_react3.useState)(() => e.config?.template), [x] = (0, import_react3.useState)(() => e.config?.cell);
  function a({ value: d }) {
    n.updateValue(d), n.save();
  }
  const b2 = (0, import_react3.useRef)(null);
  return (0, import_react3.useEffect)(() => {
    b2.current && b2.current.focus(), typeof window < "u" && window.getSelection && window.getSelection().removeAllRanges();
  }, []), /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: "wx-lNWNYUb6 wx-value",
        ref: b2,
        tabIndex: 0,
        onClick: () => n.cancel(),
        onKeyDown: (d) => d.preventDefault(),
        children: u ? u(r) : x ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(x, { data: e.value, onAction: t }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wx-lNWNYUb6 wx-text", children: e.renderedValue })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(te, { width: "auto", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      lt,
      {
        value: r,
        onChange: a,
        buttons: e.config?.buttons
      }
    ) })
  ] });
}
function Wn(n) {
  const { actions: e, editor: t } = n, r = n.onAction ?? n.onaction, u = t.config || {}, [x] = (0, import_react3.useState)(
    t.options.find((l2) => l2.id === t.value)
  ), [a] = (0, import_react3.useState)(t.value), [b2] = (0, import_react3.useState)(t.options), d = (0, import_react3.useMemo)(
    () => b2.findIndex((l2) => l2.id === a),
    [b2, a]
  );
  function f({ id: l2 }) {
    e.updateValue(l2), e.save();
  }
  let h;
  const [s, v2] = (0, import_react3.useState)();
  function E3(l2) {
    h = l2.navigate, v2(() => l2.keydown), h(d);
  }
  const C2 = (0, import_react3.useRef)(null);
  return (0, import_react3.useEffect)(() => {
    C2.current && C2.current.focus(), typeof window < "u" && window.getSelection && window.getSelection().removeAllRanges();
  }, []), /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        ref: C2,
        className: "wx-ywGRk611 wx-value",
        tabIndex: 0,
        onClick: () => e.cancel(),
        onKeyDown: (l2) => {
          s(l2, d), l2.preventDefault();
        },
        children: u.template ? u.template(x) : u.cell ? (() => {
          const l2 = u.cell;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(l2, { data: x, onAction: r });
        })() : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wx-ywGRk611 wx-text", children: t.renderedValue })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(we, { items: b2, onReady: E3, onSelect: f, children: ({ option: l2 }) => u.template ? u.template(l2) : u.cell ? (() => {
      const m = u.cell;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(m, { data: l2, onAction: r });
    })() : l2.label })
  ] });
}
var _n = {
  text: On,
  combo: Pn,
  datepicker: Kn,
  richselect: Wn
};
function Fn({ column: n, row: e }) {
  const t = (0, import_react3.useContext)(oe2), r = useStore(t, "editor"), u = (0, import_react3.useCallback)(
    (C2, l2) => {
      t.exec("close-editor", { ignore: C2 }), l2 && t.exec("focus-cell", {
        ...l2,
        eventSource: "click"
      });
    },
    [t]
  ), x = (0, import_react3.useCallback)(
    (C2) => {
      const l2 = C2 ? null : { row: r?.id, column: r?.column };
      u(false, l2);
    },
    [r, u]
  ), a = (0, import_react3.useCallback)(() => {
    u(true, { row: r?.id, column: r?.column });
  }, [r, u]), b2 = (0, import_react3.useCallback)(
    (C2) => {
      t.exec("editor", { value: C2 });
    },
    [t]
  ), d = (0, import_react3.useCallback)(
    (C2) => {
      C2.key === "Enter" && r && a();
    },
    [r, a]
  ), f = (0, import_react3.useMemo)(
    () => We(
      n.width,
      n.flexgrow,
      n.fixed,
      n.left,
      n.right
    ),
    [n.width, n.flexgrow, n.fixed, n.left, n.right]
  ), h = (0, import_react3.useMemo)(() => {
    let C2 = n.editor;
    typeof C2 == "function" && (C2 = C2(e, n));
    let l2 = typeof C2 == "string" ? C2 : C2.type;
    return _n[l2];
  }, [n, e]), s = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    if (!s.current) return;
    const C2 = clickOutside(s.current, () => x(true));
    return () => {
      typeof C2 == "function" && C2();
    };
  }, [x]), (0, import_react3.useEffect)(() => {
    s.current && typeof f == "string" && s.current.setAttribute("style", f);
  }, [f]);
  const v2 = typeof e.$parent < "u" ? "gridcell" : "cell", E3 = typeof e.$parent < "u" ? !n.editor : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: "wx-8l724t2g wx-cell wx-editor",
      ref: s,
      style: typeof f == "object" && f !== null ? f : void 0,
      role: v2,
      "aria-readonly": E3,
      tabIndex: -1,
      onClick: (C2) => C2.stopPropagation(),
      onDoubleClick: (C2) => C2.stopPropagation(),
      onKeyDown: d,
      children: h ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        h,
        {
          editor: r,
          actions: { save: x, cancel: a, updateValue: b2 },
          onAction: ({ action: C2, data: l2 }) => t.exec(C2, l2)
        }
      ) : null
    }
  );
}
function mt(n) {
  const { columns: e, type: t, columnStyle: r } = n, u = (0, import_react3.useContext)(oe2), { filterValues: x, _columns: a, _sizes: b2 } = u.getState();
  function d(f) {
    return r ? " " + r(f) : "";
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: e.map((f, h) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { children: f.map((s) => {
    const v2 = a.find((l2) => l2.id == s.id), E3 = `wx-print-cell-${t}${d(v2)}${s.filter ? " wx-print-cell-filter" : ""}${s.vertical ? " wx-vertical" : ""}`, C2 = s.cell;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "th",
      {
        style: styleObject(de(s, b2.columnWidth)),
        className: "wx-Gy81xq2u " + E3,
        rowSpan: s.rowspan,
        colSpan: s.colspan,
        children: C2 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          C2,
          {
            api: u,
            cell: Object.fromEntries(
              Object.entries(s).filter(([l2]) => l2 !== "cell")
            ),
            column: v2,
            row: h
          }
        ) : s.filter ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-Gy81xq2u wx-print-filter", children: he(x, a, s) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-Gy81xq2u wx-text", children: s.text ?? "" })
      },
      s.id
    );
  }) }, h)) });
}
function Xn(n) {
  const { columns: e, rowStyle: t, columnStyle: r, cellStyle: u, header: x, footer: a, reorder: b2 } = n, d = (0, import_react3.useContext)(oe2), { flatData: f, _sizes: h } = d.getState(), s = x && ne(e, "header", h.headerRowHeights), v2 = a && ne(e, "footer", h.footerRowHeights);
  function E3(l2, m) {
    let g = "";
    return g += r ? " " + r(m) : "", g += u ? " " + u(l2, m) : "", g;
  }
  function C2(l2, m) {
    return typeof m.draggable == "function" ? m.draggable(l2, m) !== false : m.draggable;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "table",
    {
      className: `wx-8NTMLH0z wx-print-grid ${e.some((l2) => l2.flexgrow) ? "wx-flex-columns" : ""}`,
      children: [
        x ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          mt,
          {
            columns: s,
            type: "header",
            columnStyle: r
          }
        ) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: f.map((l2, m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "tr",
          {
            className: "wx-8NTMLH0z wx-row" + (t ? " " + t(l2) : ""),
            style: { height: `${l2.rowHeight || h.rowHeight}px` },
            children: e.map(
              (g) => g.collapsed ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "td",
                {
                  className: `wx-8NTMLH0z wx-print-cell wx-cell ${E3(l2, g)}`,
                  style: styleObject(
                    de(g, h.columnWidth)
                  ),
                  children: [
                    b2 && g.draggable ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wx-8NTMLH0z wx-print-draggable", children: C2(l2, g) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { className: "wx-8NTMLH0z wxi-drag" }) : null }) : null,
                    g.treetoggle ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "span",
                        {
                          style: { marginLeft: l2.$level * 28 + "px" }
                        }
                      ),
                      l2.$count ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                        "i",
                        {
                          className: `wx-8NTMLH0z wx-print-grid-tree-toggle wxi-menu-${l2.open !== false ? "down" : "right"}`
                        }
                      ) : null
                    ] }) : null,
                    g.cell ? (() => {
                      const w = g.cell;
                      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(w, { api: d, row: l2, column: g });
                    })() : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: b(l2, g) })
                  ]
                },
                g.id
              )
            )
          },
          m
        )) }),
        a ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tfoot", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          mt,
          {
            columns: v2,
            type: "footer",
            columnStyle: r
          }
        ) }) : null
      ]
    }
  );
}
function Yn(n) {
  const { config: e, ...t } = n, r = (0, import_react3.useContext)(oe2), { _skin: u, _columns: x } = r.getState(), a = (0, import_react3.useMemo)(() => re2(x, e), []), b2 = (0, import_react3.useRef)(null);
  return (0, import_react3.useEffect)(() => {
    const d = document.body;
    d.classList.add("wx-print");
    const f = b2.current;
    if (!f) return;
    const h = f.cloneNode(true);
    d.appendChild(h);
    const s = `@media print { @page { size: ${e.paper} ${e.mode}; }`, v2 = document.createElement("style");
    v2.setAttribute("type", "text/css"), v2.setAttribute("media", "print"), document.getElementsByTagName("head")[0].appendChild(v2), v2.appendChild(document.createTextNode(s)), window.print(), v2.remove(), d.classList.remove("wx-print"), h.remove();
  }, []), /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: `wx-4zwCKA7C wx-${u}-theme wx-print-container`,
      ref: b2,
      children: a.map((d, f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-4zwCKA7C wx-print-grid-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Xn, { columns: d, ...t }) }, f))
    }
  );
}
function jn(n) {
  const {
    header: e,
    footer: t,
    overlay: r,
    multiselect: u,
    onreorder: x,
    rowStyle: a,
    columnStyle: b2,
    cellStyle: d,
    autoRowHeight: f,
    resize: h,
    clientWidth: s,
    clientHeight: v2,
    responsiveLevel: E3,
    hotkeys: C2
  } = n, l2 = (0, import_react3.useContext)(oe2), m = useStore(l2, "dynamic"), g = useStore(l2, "_columns"), w = useStore(l2, "flatData"), y2 = useStore(l2, "split"), T2 = useStore(l2, "_sizes"), [D2, R2] = useStoreWithCounter(l2, "selectedRows"), i = useStore(l2, "select"), k2 = useStore(l2, "editor"), U2 = useStore(l2, "tree"), J3 = useStore(l2, "focusCell"), te3 = useStore(l2, "_print"), V2 = useStore(l2, "undo"), j2 = useStore(l2, "reorder"), H3 = useStore(l2, "_rowHeightFromData"), [$3, Ee2] = (0, import_react3.useState)(0);
  (0, import_react3.useEffect)(() => {
    Ee2(Pt());
  }, []);
  const [ve2, _e3] = (0, import_react3.useState)(0), [ge3, Le2] = (0, import_react3.useState)(0), ce3 = (0, import_react3.useMemo)(() => (g || []).some((o) => !o.hidden && o.flexgrow), [g]), P3 = (0, import_react3.useMemo)(() => T2?.rowHeight || 0, [T2]), ee3 = (0, import_react3.useRef)(null), [He2, Ce3] = (0, import_react3.useState)(null), [pe2, Se3] = (0, import_react3.useState)(null), ne2 = (0, import_react3.useMemo)(() => {
    let o = [], p = 0;
    return y2 && y2.left && (o = (g || []).slice(0, y2.left).filter((N2) => !N2.hidden).map((N2) => ({ ...N2 })), o.forEach((N2) => {
      N2.fixed = { left: 1 }, N2.left = p, p += N2.width;
    }), o.length && (o[o.length - 1].fixed = { left: -1 })), { columns: o, width: p };
  }, [y2, g]), _ = (0, import_react3.useMemo)(() => {
    let o = [], p = 0;
    if (y2 && y2.right) {
      o = (g || []).slice(y2.right * -1).filter((N2) => !N2.hidden).map((N2) => ({ ...N2 }));
      for (let N2 = o.length - 1; N2 >= 0; N2--) {
        const M2 = o[N2];
        M2.fixed = { right: 1 }, M2.right = p, p += M2.width;
      }
      o.length && (o[0].fixed = { right: -1 });
    }
    return { columns: o, width: p };
  }, [y2, g]), B3 = (0, import_react3.useMemo)(() => {
    const o = (g || []).slice(y2?.left || 0, (g || []).length - (y2?.right ?? 0)).filter((p) => !p.hidden);
    return o.forEach((p) => {
      p.fixed = 0;
    }), o;
  }, [g, y2]), z3 = (0, import_react3.useMemo)(() => (g || []).reduce((o, p) => (p.hidden || (o += p.width), o), 0), [g]), ae3 = 1;
  function Me3(o, p, N2) {
    let M2 = p, X2 = o;
    if (B3.length) {
      let A2 = B3.length;
      for (let L2 = o; L2 >= 0; L2--)
        B3[L2][N2].forEach((q2) => {
          q2.colspan > 1 && L2 > o - q2.colspan && L2 < A2 && (A2 = L2);
        });
      if (A2 !== B3.length && A2 < o) {
        for (let L2 = A2; L2 < o; L2++)
          M2 -= B3[L2].width;
        X2 = A2;
      }
    }
    return { index: X2, delta: M2 };
  }
  const re3 = (0, import_react3.useMemo)(() => {
    let o, p, N2;
    const M2 = ve2, X2 = ve2 + (s || 0);
    let A2 = 0, L2 = 0, Y2 = 0, q2 = 0;
    B3.forEach((fe3, Te2) => {
      M2 > Y2 && (A2 = Te2, q2 = Y2), Y2 = Y2 + fe3.width, X2 > Y2 && (L2 = Te2 + ae3);
    });
    const ie3 = { header: 0, footer: 0 };
    for (let fe3 = L2; fe3 >= A2; fe3--)
      ["header", "footer"].forEach((Te2) => {
        B3[fe3] && B3[fe3][Te2].forEach((Ft) => {
          const qe2 = Ft.colspan;
          if (qe2 && qe2 > 1) {
            const at = qe2 - (L2 - fe3 + 1);
            at > 0 && (ie3[Te2] = Math.max(ie3[Te2], at));
          }
        });
      });
    const G3 = Me3(A2, q2, "header"), se3 = Me3(A2, q2, "footer"), Ue2 = G3.delta, $e2 = G3.index, ze3 = se3.delta, Oe2 = se3.index;
    return ce3 && z3 > (s || 0) ? o = p = N2 = [...ne2.columns, ...B3, ..._.columns] : (o = [
      ...ne2.columns,
      ...B3.slice(A2, L2 + 1),
      ..._.columns
    ], p = [
      ...ne2.columns,
      ...B3.slice($e2, L2 + ie3.header + 1),
      ..._.columns
    ], N2 = [
      ...ne2.columns,
      ...B3.slice(Oe2, L2 + ie3.footer + 1),
      ..._.columns
    ]), {
      data: o || [],
      header: p || [],
      footer: N2 || [],
      d: q2,
      df: ze3,
      dh: Ue2
    };
  }, [
    B3,
    ne2,
    _,
    ve2,
    s,
    ce3,
    z3
  ]), me2 = (0, import_react3.useMemo)(
    () => e && T2?.headerHeight || 0,
    [e, T2]
  ), ye2 = (0, import_react3.useMemo)(
    () => t && T2?.footerHeight || 0,
    [t, T2]
  ), we2 = (0, import_react3.useMemo)(() => s && v2 ? z3 >= s : false, [s, v2, z3]), Re3 = (0, import_react3.useMemo)(() => (v2 || 0) - me2 - ye2 - (we2 ? $3 : 0), [v2, me2, ye2, we2, $3]), tt2 = (0, import_react3.useMemo)(() => Math.ceil((Re3 || 0) / (P3 || 1)) + 1, [Re3, P3]), Fe2 = (0, import_react3.useRef)([]), [nt2, kt] = (0, import_react3.useState)(0), [ot, $t] = (0, import_react3.useState)(void 0), le2 = (0, import_react3.useMemo)(() => {
    let o = 0, p = 0;
    const N2 = 2;
    if (f) {
      let A2 = ge3;
      for (; A2 > 0; )
        A2 -= Fe2.current[o] || P3, o++;
      p = ge3 - A2;
      for (let L2 = Math.max(0, o - N2 - 1); L2 < o; L2++)
        p -= Fe2.current[o - L2] || P3;
      o = Math.max(0, o - N2);
    } else {
      if (H3) {
        let A2 = 0, L2 = 0;
        for (let G3 = 0; G3 < (w || []).length; G3++) {
          const se3 = w[G3].rowHeight || P3;
          if (L2 + se3 > ge3) {
            A2 = G3;
            break;
          }
          L2 += se3;
        }
        o = Math.max(0, A2 - N2);
        for (let G3 = 0; G3 < o; G3++)
          p += w[G3].rowHeight || P3;
        let Y2 = 0, q2 = 0;
        for (let G3 = A2 + 1; G3 < (w || []).length; G3++) {
          const se3 = w[G3].rowHeight || P3;
          if (Y2++, q2 + se3 > Re3)
            break;
          q2 += se3;
        }
        const ie3 = Math.min(
          m ? m.rowCount : (w || []).length,
          A2 + Y2 + N2
        );
        return { d: p, start: o, end: ie3 };
      }
      o = Math.floor(ge3 / (P3 || 1)), o = Math.max(0, o - N2), p = o * (P3 || 0);
    }
    const M2 = m ? m.rowCount : (w || []).length, X2 = Math.min(M2, o + (tt2 || 0) + N2);
    return { d: p, start: o, end: X2 };
  }, [f, H3, ge3, P3, m, w, tt2, Re3]), Xe2 = (0, import_react3.useMemo)(() => {
    const o = m ? m.rowCount : (w || []).length;
    if (f)
      return nt2 + le2.d + (o - (ot || 0)) * (P3 || 0);
    if (!H3)
      return o * (P3 || 0);
    let p = 0;
    for (let N2 = 0; N2 < o; N2++)
      p += w[N2]?.rowHeight || P3;
    return p;
  }, [
    m,
    w,
    P3,
    f,
    H3,
    nt2,
    le2.d,
    ot
  ]), de2 = (0, import_react3.useMemo)(() => s && v2 ? Xe2 + me2 + ye2 >= v2 - (z3 >= (s || 0) ? $3 : 0) : false, [
    s,
    v2,
    Xe2,
    me2,
    ye2,
    z3,
    $3
  ]), be3 = (0, import_react3.useMemo)(() => ce3 && z3 <= (s || 0) ? (s || 0) - 0 - (de2 ? $3 : 0) : z3, [ce3, z3, s, de2, $3, we2]), Ye = (0, import_react3.useMemo)(() => ce3 && z3 <= (s || 0) ? s || 0 : be3 < (s || 0) ? z3 + (de2 ? $3 : 0) : -1, [ce3, z3, s, be3, de2, $3]), je2 = (0, import_react3.useRef)({});
  (0, import_react3.useEffect)(() => {
    if (m && (je2.current.start !== le2.start || je2.current.end !== le2.end)) {
      const { start: o, end: p } = le2;
      je2.current = { start: o, end: p }, l2 && l2.exec && l2.exec("request-data", { row: { start: o, end: p } });
    }
  }, [m, le2, l2]);
  const ue3 = (0, import_react3.useMemo)(() => m ? w || [] : (w || []).slice(le2.start, le2.end), [m, w, le2]), ke2 = (0, import_react3.useMemo)(() => (D2 || []).filter(
    (o) => (ue3 || []).some((p) => p.id === o)
  ), [R2, ue3]), Be = (0, import_react3.useMemo)(() => le2.start, [le2.start]), Mt = (0, import_react3.useCallback)((o) => {
    Le2(o.target.scrollTop), _e3(o.target.scrollLeft);
  }, []), At = (0, import_react3.useCallback)((o) => {
    o.shiftKey && o.preventDefault(), ee3.current && ee3.current.focus && ee3.current.focus();
  }, []), rt = (0, import_react3.useCallback)(() => !!(g || []).find((o) => !!o.draggable), [g]), Ge2 = (0, import_react3.useRef)(null), Ne3 = (0, import_react3.useRef)(null), It = (0, import_react3.useRef)({
    dblclick: (o, p) => {
      const N2 = { id: o, column: locateAttr(p, "data-col-id") };
      l2.exec("open-editor", N2);
    },
    click: (o, p) => {
      if (p.target.closest("input") || Ge2.current) return;
      const N2 = locateAttr(p, "data-col-id");
      if (J3?.id !== o && l2.exec("focus-cell", {
        row: o,
        column: N2,
        eventSource: "click"
      }), i === false) return;
      const M2 = u && p.ctrlKey, X2 = u && p.shiftKey;
      (M2 || D2.length > 1 || !D2.includes(o)) && l2.exec("select-row", { id: o, toggle: M2, range: X2 });
    },
    "toggle-row": (o) => {
      const p = l2.getRow(o);
      l2.exec(p.open !== false ? "close-row" : "open-row", { id: o });
    },
    "ignore-click": () => false
  }), Ae2 = (0, import_react3.useMemo)(() => ({
    top: me2,
    bottom: ye2,
    left: ne2.width,
    xScroll: we2,
    yScroll: de2,
    sense: f && pe2 ? pe2.offsetHeight : Math.max(T2?.rowHeight || 0, 40),
    node: ee3.current && ee3.current.firstElementChild
  }), [
    me2,
    ye2,
    ne2.width,
    we2,
    de2,
    f,
    pe2,
    T2
  ]);
  function Vt(o, p) {
    const { container: N2, sourceNode: M2, from: X2 } = p;
    if (rt() && !M2.getAttribute("draggable-data"))
      return false;
    Ce3(X2), l2.getRow(X2).open && l2.exec("close-row", { id: X2, nested: true });
    const L2 = locate(M2, "data-id"), Y2 = L2.cloneNode(true);
    Y2.classList.remove("wx-selected"), Y2.querySelectorAll("[tabindex]").forEach((se3) => se3.setAttribute("tabindex", "-1")), N2.appendChild(Y2), Se3(Y2);
    const q2 = ve2 - re3.d, ie3 = de2 ? $3 : 0;
    N2.style.width = Math.min(
      (s || 0) - ie3,
      ce3 && z3 <= (s || 0) ? be3 : be3 - ie3
    ) + q2 + "px";
    const G3 = Pe2(L2);
    p.offset = {
      x: q2,
      y: -Math.round(G3.height / 2)
    }, Ne3.current || (Ne3.current = o.clientY);
  }
  function zt2(o, p) {
    const { from: N2 } = p, M2 = p.pos, X2 = Pe2(ee3.current);
    M2.x = X2.x;
    const A2 = Ae2.top;
    if (M2.y < A2) M2.y = A2;
    else {
      const L2 = X2.height - (we2 && $3 > 0 ? $3 : Math.round(Ae2.sense / 2)) - Ae2.bottom;
      M2.y > L2 && (M2.y = L2);
    }
    if (ee3.current.contains(p.targetNode)) {
      const L2 = locate(p.targetNode, "data-id"), Y2 = id(L2?.getAttribute("data-id"));
      if (Y2 && Y2 !== N2) {
        p.to = Y2;
        const q2 = f ? pe2?.offsetHeight : T2?.rowHeight;
        if (pe2 && (ge3 === 0 || M2.y > A2 + q2 - 1)) {
          const ie3 = L2.getBoundingClientRect(), se3 = Pe2(pe2).y, Ue2 = ie3.y, $e2 = se3 > Ue2 ? -1 : 1, ze3 = $e2 === 1 ? "after" : "before", Oe2 = Math.abs(l2.getRowIndex(N2) - l2.getRowIndex(Y2)), fe3 = Oe2 !== 1 ? ze3 === "before" ? "after" : "before" : ze3;
          if (Oe2 === 1 && ($e2 === -1 && o.clientY > Ne3.current || $e2 === 1 && o.clientY < Ne3.current))
            return;
          Ne3.current = o.clientY, l2.exec("move-item", {
            id: N2,
            target: Y2,
            mode: fe3,
            inProgress: true
          });
        }
      }
      x && x({ event: o, context: p });
    }
    Nn(o, X2, p, Ae2);
  }
  function Ot(o, p) {
    const { from: N2, to: M2 } = p;
    l2.exec("move-item", {
      id: N2,
      target: M2,
      inProgress: false
    }), Ge2.current = setTimeout(() => {
      Ge2.current = 0;
    }, 1), Ce3(null), Se3(null), Ne3.current = null, Et2(p);
  }
  function Pt() {
    const o = document.createElement("div");
    o.style.cssText = "position:absolute;left:-1000px;width:100px;padding:0px;margin:0px;min-height:100px;overflow-y:scroll;", document.body.appendChild(o);
    const p = o.offsetWidth - o.clientWidth;
    return document.body.removeChild(o), p;
  }
  const Kt2 = (0, import_react3.useMemo)(() => Ye > 0 ? { width: `${Ye}px` } : void 0, [Ye]), lt2 = (0, import_react3.useRef)(null);
  function Wt() {
    Promise.resolve().then(() => {
      let o = 0, p = Be;
      const N2 = lt2.current;
      N2 && (Array.from(N2.children).forEach((M2, X2) => {
        Fe2.current[Be + X2] = M2.offsetHeight, o += M2.offsetHeight, p++;
      }), kt(o), $t(p));
    });
  }
  (0, import_react3.useEffect)(() => {
    ue3 && f && Wt();
  }, [ue3, f, Be]);
  let [De2, Ie2] = (0, import_react3.useState)();
  (0, import_react3.useEffect)(() => {
    if (J3 && (!i || !ke2.length || ke2.includes(J3.row)))
      Ie2({ ...J3 });
    else if (ue3.length && re3.data.length) {
      if (!De2 || ke2.length && !ke2.includes(De2.row) || ue3.findIndex((o) => o.id == De2.row) === -1 || re3.data.findIndex(
        (o) => o.id == De2.column && !o.collapsed
      ) === -1) {
        const o = ke2[0] || ue3[0].id, p = re3.data.findIndex((N2) => !N2.collapsed);
        Ie2(p !== -1 ? { row: o, column: re3.data[p].id } : null);
      }
    } else Ie2(null);
  }, [J3]);
  const st = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    const o = ee3.current;
    if (!o) return;
    const p = yn(o, h);
    return () => {
      typeof p == "function" && p();
    };
  }, [h]);
  const it = (0, import_react3.useRef)({});
  Object.assign(it.current, {
    start: Vt,
    move: zt2,
    end: Ot,
    getReorder: () => j2,
    getDraggableInfo: () => ({ hasDraggable: rt() })
  }), (0, import_react3.useEffect)(() => {
    const o = ee3.current;
    return o ? Cn(o, it).destroy : void 0;
  }, [j2, ee3.current]), (0, import_react3.useEffect)(() => {
    const o = ee3.current;
    return o ? Pe(o, {
      keys: C2 !== false && {
        ...Me2,
        "ctrl+z": V2,
        "ctrl+y": V2,
        ...C2
      },
      exec: (N2) => l2.exec("hotkey", N2)
    }).destroy : void 0;
  }, [l2, V2, C2]);
  const Ve = (0, import_react3.useRef)({
    scroll: l2.getReactiveState().scroll
  });
  Ve.current.getWidth = () => (s || 0) - (de2 ? $3 : 0), Ve.current.getHeight = () => Re3, Ve.current.getScrollMargin = () => ne2.width + _.width, (0, import_react3.useEffect)(() => {
    ze2(st.current, Ve.current);
  }, []);
  const ct = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    const o = ct.current;
    if (!o) return;
    const p = [];
    return p.push(
      clickOutside(o, () => l2.exec("focus-cell", { eventSource: "click" })).destroy
    ), p.push(delegateClick2(o, It.current)), () => p.forEach((N2) => N2());
  }, []);
  const _t = `wx-grid ${E3 ? `wx-responsive-${E3}` : ""}`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: "wx-4VuBwK2D " + _t,
        style: {
          "--header-height": `${me2}px`,
          "--footer-height": `${ye2}px`,
          "--split-left-width": `${ne2.width}px`,
          "--split-right-width": `${_.width}px`
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            ref: ee3,
            className: "wx-4VuBwK2D wx-table-box",
            style: Kt2,
            role: U2 ? "treegrid" : "grid",
            "aria-colcount": re3.data.length,
            "aria-rowcount": ue3.length,
            "aria-multiselectable": U2 && u ? true : void 0,
            tabIndex: -1,
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "div",
              {
                ref: st,
                className: "wx-4VuBwK2D wx-scroll",
                style: {
                  overflowX: we2 ? "scroll" : "hidden",
                  overflowY: de2 ? "scroll" : "hidden"
                },
                onScroll: Mt,
                children: [
                  e ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wx-4VuBwK2D wx-header-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    xt2,
                    {
                      contentWidth: be3,
                      deltaLeft: re3.dh,
                      columns: re3.header,
                      columnStyle: b2,
                      bodyHeight: Re3 - +t
                    }
                  ) }) : null,
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                    "div",
                    {
                      ref: ct,
                      className: "wx-4VuBwK2D wx-body",
                      style: { width: `${be3}px`, height: `${Xe2}px` },
                      onMouseDown: (o) => At(o),
                      children: [
                        r ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(zn, { overlay: r }) : null,
                        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "div",
                          {
                            ref: lt2,
                            className: "wx-4VuBwK2D wx-data",
                            style: {
                              paddingTop: `${le2.d}px`,
                              paddingLeft: `${re3.d}px`
                            },
                            children: ue3.map((o, p) => {
                              const N2 = D2.indexOf(o.id) !== -1, M2 = He2 === o.id, X2 = "wx-row" + (f ? " wx-autoheight" : "") + (a ? " " + a(o) : "") + (N2 ? " wx-selected" : "") + (M2 ? " wx-inactive" : ""), A2 = f ? { minHeight: `${o.rowHeight || P3}px` } : { height: `${o.rowHeight || P3}px` };
                              return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                                "div",
                                {
                                  className: "wx-4VuBwK2D " + X2,
                                  "data-id": o.id,
                                  "data-context-id": o.id,
                                  style: A2,
                                  role: "row",
                                  "aria-rowindex": p,
                                  "aria-expanded": o.open,
                                  "aria-level": U2 ? o.$level + 1 : void 0,
                                  "aria-selected": U2 ? N2 : void 0,
                                  tabIndex: -1,
                                  children: re3.data.map((L2) => L2.collapsed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                                    "div",
                                    {
                                      className: "wx-4VuBwK2D wx-cell wx-collapsed"
                                    },
                                    L2.id
                                  ) : k2?.id === o.id && k2.column == L2.id ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Fn, { row: o, column: L2 }, L2.id) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                                    Hn,
                                    {
                                      row: o,
                                      column: L2,
                                      columnStyle: b2,
                                      cellStyle: d,
                                      reorder: j2,
                                      focusable: De2?.row === o.id && De2?.column == L2.id
                                    },
                                    L2.id
                                  ))
                                },
                                o.id
                              );
                            })
                          }
                        )
                      ]
                    }
                  ),
                  t && (w || []).length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    xt2,
                    {
                      type: "footer",
                      contentWidth: be3,
                      deltaLeft: re3.df,
                      columns: re3.footer,
                      columnStyle: b2
                    }
                  ) : null
                ]
              }
            )
          }
        )
      }
    ),
    te3 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Yn,
      {
        config: te3,
        rowStyle: a,
        columnStyle: b2,
        cellStyle: d,
        header: e,
        footer: t,
        reorder: j2
      }
    ) : null
  ] });
}
var Bn = (n) => n.split("-").map((e) => e ? e.charAt(0).toUpperCase() + e.slice(1) : "").join("");
var lo = (0, import_react3.forwardRef)(function({
  data: e = [],
  columns: t = [],
  rowStyle: r = null,
  columnStyle: u = null,
  cellStyle: x = null,
  selectedRows: a,
  select: b2 = true,
  multiselect: d = false,
  header: f = true,
  footer: h = false,
  dynamic: s = null,
  overlay: v2 = null,
  reorder: E3 = false,
  onReorder: C2 = null,
  autoRowHeight: l2 = false,
  sizes: m,
  split: g,
  tree: w = false,
  autoConfig: y2 = false,
  init: T2 = null,
  responsive: D2 = null,
  sortMarks: R2,
  undo: i = false,
  hotkeys: k2 = null,
  ...U2
}, J3) {
  const te3 = (0, import_react3.useRef)();
  te3.current = U2;
  const V2 = (0, import_react3.useMemo)(() => new Re2(writable), []), j2 = (0, import_react3.useMemo)(() => V2.in, [V2]), H3 = (0, import_react3.useRef)(null);
  H3.current === null && (H3.current = new EventBusRouter((_, B3) => {
    const z3 = "on" + Bn(_);
    te3.current && te3.current[z3] && te3.current[z3](B3);
  }), j2.setNext(H3.current));
  const $3 = (0, import_react3.useMemo)(
    () => ({
      getState: V2.getState.bind(V2),
      getReactiveState: V2.getReactive.bind(V2),
      getStores: () => ({ data: V2 }),
      exec: j2.exec,
      setNext: (_) => (H3.current = H3.current.setNext(_), H3.current),
      intercept: j2.intercept.bind(j2),
      on: j2.on.bind(j2),
      detach: j2.detach.bind(j2),
      getRow: V2.getRow.bind(V2),
      getRowIndex: V2.getRowIndex.bind(V2),
      getColumn: V2.getColumn.bind(V2)
    }),
    [V2, j2]
  ), [Ee2, ve2] = (0, import_react3.useState)(0), [_e3, ge3] = (0, import_react3.useState)(0), [Le2, ce3] = (0, import_react3.useState)(null), [P3, ee3] = (0, import_react3.useState)(null), He2 = (0, import_react3.useMemo)(() => {
    if (y2 && !t.length && e.length) {
      const _ = e[0], B3 = [];
      for (let z3 in _)
        if (z3 !== "id" && z3[0] !== "$") {
          let ae3 = {
            id: z3,
            header: z3[0].toUpperCase() + z3.slice(1)
          };
          typeof y2 == "object" && (ae3 = { ...ae3, ...y2 }), B3.push(ae3);
        }
      return B3;
    }
    return (P3 && P3.columns) ?? t;
  }, [y2, t, e, P3]), Ce3 = (0, import_react3.useMemo)(
    () => (P3 && P3.sizes) ?? m,
    [P3, m]
  ), pe2 = (0, import_react3.useCallback)(
    (_) => {
      if (ve2(_.width), ge3(_.height), D2) {
        const z3 = Object.keys(D2).map(Number).sort((ae3, Me3) => ae3 - Me3).find((ae3) => _.width <= ae3) ?? null;
        z3 !== Le2 && (ee3(D2[z3]), ce3(z3));
      }
    },
    [D2, Le2]
  ), Se3 = (0, import_react3.useContext)(Dt.theme), ne2 = (0, import_react3.useRef)(0);
  return (0, import_react3.useEffect)(() => {
    if (!ne2.current)
      T2 && T2($3);
    else {
      const _ = V2.getState();
      V2.init({
        data: e,
        columns: He2,
        split: g || _.split,
        sizes: Ce3 || _.sizes,
        selectedRows: a || _.selectedRows,
        dynamic: s,
        tree: w,
        sortMarks: R2 || _.sortMarks,
        undo: i,
        reorder: E3,
        _skin: Se3,
        _select: b2
      });
    }
    ne2.current++;
  }, [
    V2,
    e,
    He2,
    g,
    Ce3,
    a,
    s,
    w,
    R2,
    i,
    E3,
    Se3,
    b2,
    T2,
    $3
  ]), ne2.current === 0 && V2.init({
    data: e,
    columns: He2,
    split: g || { left: 0 },
    sizes: Ce3 || {},
    selectedRows: a || [],
    dynamic: s,
    tree: w,
    sortMarks: R2 || {},
    undo: i,
    reorder: E3,
    _skin: Se3,
    select: b2
  }), (0, import_react3.useImperativeHandle)(
    J3,
    () => ({
      ...$3
    }),
    [$3]
  ), /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(oe2.Provider, { value: $3, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ue, { words: en_default2, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    jn,
    {
      header: f,
      footer: h,
      overlay: v2,
      rowStyle: r,
      columnStyle: u,
      cellStyle: x,
      onReorder: C2,
      multiselect: d,
      autoRowHeight: l2,
      clientWidth: Ee2,
      clientHeight: _e3,
      responsiveLevel: Le2,
      resize: pe2,
      hotkeys: k2
    }
  ) }) });
});
function fo({ fonts: n = true, children: e }) {
  return e ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Kt, { fonts: n, children: e }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Kt, { fonts: n });
}
function ho({ fonts: n = true, children: e }) {
  return e ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Zt, { fonts: n, children: e }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Zt, { fonts: n });
}
setEnv(env);

// src/types.ts
var LEVEL_NAME = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal"
};

// src/client/LogViewer.tsx
var ViewerContext = (0, import_react4.createContext)({
  theme: {},
  searchText: "",
  clientConfig: null,
  onTraceFilter: () => {
  }
});
function formatTimestamp(time) {
  if (!time) return "";
  const d = new Date(time);
  return d.toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}
function timeAgo(time) {
  if (!time) return "";
  const diff = Date.now() - time;
  if (diff < 1e3) return "just now";
  if (diff < 6e4) return `${Math.floor(diff / 1e3)}s ago`;
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return `${Math.floor(diff / 864e5)}d ago`;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlightSearch(text, search) {
  if (!search) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(search)})`, "gi"));
  return parts.map(
    (part, i) => part.toLowerCase() === search.toLowerCase() ? import_react4.default.createElement(
      "mark",
      {
        key: i,
        style: {
          background: "#e3b341",
          color: "#000",
          padding: "0 1px",
          borderRadius: "2px"
        }
      },
      part
    ) : part
  );
}
function LevelCell({ row }) {
  const { theme } = (0, import_react4.useContext)(ViewerContext);
  const name = row.levelName ?? LEVEL_NAME[row.level ?? 30] ?? "unknown";
  const colors = theme.levels ?? {};
  const color = colors[name] ?? "#6b7280";
  return import_react4.default.createElement(
    "span",
    {
      style: {
        padding: "1px 6px",
        borderRadius: "3px",
        fontSize: "11px",
        fontWeight: "bold",
        textTransform: "uppercase",
        color: "#fff",
        background: color,
        display: "inline-block",
        minWidth: "45px",
        textAlign: "center"
      }
    },
    name
  );
}
function NameCell({ row }) {
  const { searchText } = (0, import_react4.useContext)(ViewerContext);
  return import_react4.default.createElement(
    "div",
    {
      style: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "12px"
      },
      title: row.name ?? ""
    },
    highlightSearch(row.name ?? "", searchText)
  );
}
function TraceLinkCell({
  row,
  onAction
}) {
  const { clientConfig } = (0, import_react4.useContext)(ViewerContext);
  if (!row.traceId) return null;
  const handleClick = (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      if (clientConfig?.traceUrlPattern) {
        const start = row.time ? row.time - 6e4 : Date.now() - 36e5;
        const end = row.time ? row.time + 6e4 : Date.now();
        const url = clientConfig.traceUrlPattern.replace("{traceId}", row.traceId).replace("{startTime}", String(start)).replace("{endTime}", String(end));
        window.open(url, "_blank");
      }
    } else {
      onAction({ action: "filter-trace", data: { traceId: row.traceId } });
    }
  };
  return import_react4.default.createElement(
    "span",
    {
      style: {
        cursor: "pointer",
        color: "#58a6ff",
        textDecoration: "underline",
        fontSize: "12px"
      },
      onClick: handleClick,
      title: "Click to filter, Ctrl+Click to open trace view"
    },
    row.traceId.substring(0, 16) + "\u2026"
  );
}
function MessageCell({ row }) {
  const { searchText, theme } = (0, import_react4.useContext)(ViewerContext);
  let messageContent = row.msg ?? "";
  if (row.msg) {
    try {
      JSON.parse(row.msg);
      messageContent = import_react4.default.createElement(SyntaxHighlight, { json: row.msg, theme });
    } catch {
      messageContent = highlightSearch(row.msg, searchText);
    }
  }
  return import_react4.default.createElement(
    "div",
    {
      style: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "12px"
      },
      title: row.msg ?? ""
    },
    messageContent,
    row.err ? import_react4.default.createElement(
      "span",
      { style: { color: theme.levels?.error ?? "#ef4444", marginLeft: "8px" } },
      ` [${row.err.type ?? "Error"}: ${row.err.message ?? ""}]`
    ) : null
  );
}
function HttpCell({ row }) {
  const statusColor = row.res ? (row.res.statusCode ?? 200) < 400 ? "#22c55e" : "#ef4444" : void 0;
  return import_react4.default.createElement(
    "div",
    { style: { display: "flex", gap: "8px", fontSize: "12px" } },
    row.req ? import_react4.default.createElement(
      "span",
      { title: JSON.stringify(row.req, null, 2) },
      `${row.req.method ?? "GET"} ${row.req.url ?? ""}`
    ) : null,
    row.res ? import_react4.default.createElement(
      "span",
      { title: JSON.stringify(row.res, null, 2) },
      import_react4.default.createElement(
        "span",
        { style: { color: statusColor, fontWeight: "bold" } },
        String(row.res.statusCode ?? "")
      ),
      row.res.responseTime ? ` ${row.res.responseTime}ms` : ""
    ) : null
  );
}
function SyntaxHighlight({
  json,
  theme
}) {
  const tokens = [];
  const syntax = theme.syntax ?? {};
  const pattern = /"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]:,]/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(json)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(json.substring(lastIndex, match.index));
    }
    const token = match[0];
    let color;
    if (token === "true" || token === "false") {
      color = syntax.boolean;
    } else if (token === "null") {
      color = syntax.null;
    } else if (token[0] === '"') {
      const afterToken = json.substring(pattern.lastIndex).trimStart();
      if (afterToken[0] === ":") {
        color = syntax.key;
      } else {
        color = syntax.string;
      }
    } else if (!isNaN(Number(token)) && token !== "") {
      color = syntax.number;
    }
    tokens.push(
      color ? import_react4.default.createElement("span", { key: lastIndex, style: { color } }, token) : token
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < json.length) {
    tokens.push(json.substring(lastIndex));
  }
  return import_react4.default.createElement(import_react4.default.Fragment, null, ...tokens);
}
function EntryModal({
  entry,
  isDark,
  onClose
}) {
  const [wrapText, setWrapText] = (0, import_react4.useState)(false);
  const { theme } = (0, import_react4.useContext)(ViewerContext);
  const jsonString = JSON.stringify(entry, null, 2);
  const sectionHeaderStyle = {
    fontSize: "13px",
    fontWeight: "bold",
    marginTop: "16px",
    marginBottom: "8px",
    color: isDark ? "#c9d1d9" : "#24292f"
  };
  const sectionStyle = {
    background: isDark ? "#0d1117" : "#f6f8fa",
    border: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "12px",
    fontSize: "12px",
    fontFamily: "monospace"
  };
  return import_react4.default.createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100
      },
      onClick: onClose
    },
    import_react4.default.createElement(
      "div",
      {
        style: {
          background: isDark ? "#161b22" : "#ffffff",
          border: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
          borderRadius: "8px",
          padding: "16px",
          maxWidth: "80vw",
          maxHeight: "80vh",
          overflow: "auto",
          minWidth: "600px"
        },
        onClick: (e) => e.stopPropagation()
      },
      import_react4.default.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", marginBottom: "12px" } },
        import_react4.default.createElement(
          "h3",
          { style: { fontSize: "14px", fontWeight: "bold" } },
          "Log Entry Details"
        ),
        import_react4.default.createElement(
          "div",
          { style: { display: "flex", gap: "8px", alignItems: "center" } },
          import_react4.default.createElement(
            "label",
            { style: { fontSize: "12px", cursor: "pointer" } },
            import_react4.default.createElement("input", {
              type: "checkbox",
              checked: wrapText,
              onChange: () => setWrapText((w) => !w),
              style: { marginRight: "4px" }
            }),
            "Wrap text"
          ),
          import_react4.default.createElement(
            "button",
            {
              onClick: onClose,
              style: {
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: "18px"
              }
            },
            "\xD7"
          )
        )
      ),
      // Exception section
      entry.err ? import_react4.default.createElement(
        "div",
        null,
        import_react4.default.createElement("div", { style: sectionHeaderStyle }, "Exception"),
        import_react4.default.createElement(
          "div",
          { style: sectionStyle },
          import_react4.default.createElement(
            "div",
            {
              style: {
                color: theme.levels?.error ?? "#ef4444",
                fontWeight: "bold",
                marginBottom: "8px"
              }
            },
            `${entry.err.type ?? "Error"}: ${entry.err.message ?? "No message"}`
          ),
          entry.err.stack ? import_react4.default.createElement(
            "div",
            { style: { whiteSpace: "pre-wrap", lineHeight: "1.5" } },
            entry.err.stack
          ) : null
        )
      ) : null,
      // HTTP Request section
      entry.req ? import_react4.default.createElement(
        "div",
        null,
        import_react4.default.createElement("div", { style: sectionHeaderStyle }, "HTTP Request"),
        import_react4.default.createElement(
          "div",
          { style: sectionStyle },
          import_react4.default.createElement(
            "div",
            { style: { fontWeight: "bold", marginBottom: "8px" } },
            `${entry.req.method ?? "GET"} ${entry.req.url ?? ""}`
          ),
          entry.req.headers ? import_react4.default.createElement(
            "div",
            null,
            import_react4.default.createElement(
              "div",
              { style: { fontWeight: "bold", marginTop: "8px", marginBottom: "4px" } },
              "Headers:"
            ),
            import_react4.default.createElement(
              "table",
              { style: { width: "100%", fontSize: "11px" } },
              import_react4.default.createElement(
                "tbody",
                null,
                ...Object.entries(entry.req.headers).map(
                  ([key, value]) => import_react4.default.createElement(
                    "tr",
                    { key },
                    import_react4.default.createElement(
                      "td",
                      {
                        style: {
                          padding: "2px 8px 2px 0",
                          verticalAlign: "top",
                          color: isDark ? "#79c0ff" : "#0969da"
                        }
                      },
                      key
                    ),
                    import_react4.default.createElement(
                      "td",
                      { style: { padding: "2px 0", verticalAlign: "top" } },
                      value
                    )
                  )
                )
              )
            )
          ) : null,
          entry.req.body ? import_react4.default.createElement(
            "div",
            null,
            import_react4.default.createElement(
              "div",
              { style: { fontWeight: "bold", marginTop: "8px", marginBottom: "4px" } },
              "Body:"
            ),
            import_react4.default.createElement(
              "pre",
              { style: { margin: 0, whiteSpace: "pre-wrap" } },
              typeof entry.req.body === "string" ? entry.req.body : import_react4.default.createElement(SyntaxHighlight, {
                json: JSON.stringify(entry.req.body, null, 2),
                theme
              })
            )
          ) : null
        )
      ) : null,
      // HTTP Response section
      entry.res ? import_react4.default.createElement(
        "div",
        null,
        import_react4.default.createElement("div", { style: sectionHeaderStyle }, "HTTP Response"),
        import_react4.default.createElement(
          "div",
          { style: sectionStyle },
          import_react4.default.createElement(
            "div",
            { style: { fontWeight: "bold", marginBottom: "8px" } },
            import_react4.default.createElement(
              "span",
              {
                style: {
                  color: (entry.res.statusCode ?? 200) < 400 ? "#22c55e" : "#ef4444"
                }
              },
              entry.res.statusCode ?? 200
            ),
            entry.res.responseTime ? ` (${entry.res.responseTime}ms)` : ""
          ),
          entry.res.headers ? import_react4.default.createElement(
            "div",
            null,
            import_react4.default.createElement(
              "div",
              { style: { fontWeight: "bold", marginTop: "8px", marginBottom: "4px" } },
              "Headers:"
            ),
            import_react4.default.createElement(
              "table",
              { style: { width: "100%", fontSize: "11px" } },
              import_react4.default.createElement(
                "tbody",
                null,
                ...Object.entries(entry.res.headers).map(
                  ([key, value]) => import_react4.default.createElement(
                    "tr",
                    { key },
                    import_react4.default.createElement(
                      "td",
                      {
                        style: {
                          padding: "2px 8px 2px 0",
                          verticalAlign: "top",
                          color: isDark ? "#79c0ff" : "#0969da"
                        }
                      },
                      key
                    ),
                    import_react4.default.createElement(
                      "td",
                      { style: { padding: "2px 0", verticalAlign: "top" } },
                      value
                    )
                  )
                )
              )
            )
          ) : null,
          entry.res.body ? import_react4.default.createElement(
            "div",
            null,
            import_react4.default.createElement(
              "div",
              { style: { fontWeight: "bold", marginTop: "8px", marginBottom: "4px" } },
              "Body:"
            ),
            import_react4.default.createElement(
              "pre",
              { style: { margin: 0, whiteSpace: "pre-wrap" } },
              typeof entry.res.body === "string" ? entry.res.body : import_react4.default.createElement(SyntaxHighlight, {
                json: JSON.stringify(entry.res.body, null, 2),
                theme
              })
            )
          ) : null
        )
      ) : null,
      // Raw JSON section
      import_react4.default.createElement("div", { style: sectionHeaderStyle }, "Raw Entry"),
      import_react4.default.createElement(
        "pre",
        {
          style: {
            whiteSpace: wrapText ? "pre-wrap" : "pre",
            wordBreak: wrapText ? "break-all" : void 0,
            fontFamily: "inherit",
            fontSize: "12px",
            overflow: "auto",
            maxHeight: "65vh",
            background: isDark ? "#0d1117" : "#f6f8fa",
            border: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
            borderRadius: "6px",
            padding: "12px"
          }
        },
        import_react4.default.createElement(SyntaxHighlight, { json: jsonString, theme })
      )
    )
  );
}
function LogViewer({
  config: configProp,
  theme: themeProp
}) {
  const [entries, setEntries] = (0, import_react4.useState)([]);
  const [clientConfig, setClientConfig] = (0, import_react4.useState)(null);
  const [connected, setConnected] = (0, import_react4.useState)(false);
  const [filters, setFilters] = (0, import_react4.useState)({});
  const [searchText, setSearchText] = (0, import_react4.useState)("");
  const [selectedEntry, setSelectedEntry] = (0, import_react4.useState)(null);
  const [autoScroll, setAutoScroll] = (0, import_react4.useState)(true);
  const wsRef = (0, import_react4.useRef)(null);
  const gridApiRef = (0, import_react4.useRef)(null);
  const lastIdRef = (0, import_react4.useRef)("");
  const entriesRef = (0, import_react4.useRef)([]);
  const uniqueServiceNames = (0, import_react4.useMemo)(() => {
    const names = /* @__PURE__ */ new Set();
    entries.forEach((e) => {
      if (e.name) names.add(e.name);
    });
    return Array.from(names).sort();
  }, [entries]);
  const theme = (0, import_react4.useMemo)(
    () => ({ ...clientConfig?.theme ?? {}, ...themeProp }),
    [clientConfig?.theme, themeProp]
  );
  const isDark = theme.mode === "dark";
  entriesRef.current = entries;
  (0, import_react4.useEffect)(() => {
    if (typeof configProp === "object" && configProp) {
      setClientConfig(configProp);
      return;
    }
    const configUrl = typeof configProp === "string" ? configProp : "/api/config";
    fetch(configUrl).then((r) => r.json()).then(setClientConfig).catch((err) => console.error("[blong-log] Failed to load config:", err));
  }, [configProp]);
  (0, import_react4.useEffect)(() => {
    if (!clientConfig) return;
    const wsUrl = clientConfig.wsUrl;
    let ws;
    let reconnectTimer;
    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setConnected(true);
        const msg = { type: "subscribe", filters };
        ws.send(JSON.stringify(msg));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === "entries") {
            setEntries((prev) => {
              const combined = [...prev, ...msg.entries];
              const seen = /* @__PURE__ */ new Set();
              const unique = combined.filter((e) => {
                if (seen.has(e.id)) return false;
                seen.add(e.id);
                return true;
              });
              unique.sort((a, b2) => a.id.localeCompare(b2.id));
              if (unique.length > 0) {
                lastIdRef.current = unique[unique.length - 1].id;
              }
              return unique;
            });
          } else if (msg.type === "entry") {
            setEntries((prev) => {
              const next = [...prev, msg.entry];
              lastIdRef.current = msg.entry.id;
              if (next.length > 1e4) return next.slice(-5e3);
              return next;
            });
          }
        } catch {
        }
      };
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3e3);
      };
      ws.onerror = () => {
        ws.close();
      };
      wsRef.current = ws;
    }
    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [clientConfig]);
  (0, import_react4.useEffect)(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg = { type: "subscribe", filters };
      wsRef.current.send(JSON.stringify(msg));
      setEntries([]);
    }
  }, [filters]);
  (0, import_react4.useEffect)(() => {
    if (autoScroll && lastIdRef.current && gridApiRef.current) {
      try {
        gridApiRef.current.exec("scroll", { row: lastIdRef.current });
      } catch {
      }
    }
  }, [entries, autoScroll]);
  const handleLevelChange = (0, import_react4.useCallback)((e) => {
    setFilters((f) => ({ ...f, level: e.target.value || void 0 }));
  }, []);
  const handleNameChange = (0, import_react4.useCallback)((e) => {
    setFilters((f) => ({ ...f, name: e.target.value || void 0 }));
  }, []);
  const handleHasErrorChange = (0, import_react4.useCallback)((e) => {
    setFilters((f) => ({ ...f, hasError: e.target.checked || void 0 }));
  }, []);
  const handleCustomPropertyChange = (0, import_react4.useCallback)(
    (propName, value) => {
      setFilters((f) => ({
        ...f,
        properties: value ? { ...f.properties ?? {}, [propName]: value } : (() => {
          const { [propName]: _, ...rest } = f.properties ?? {};
          return Object.keys(rest).length > 0 ? rest : void 0;
        })()
      }));
    },
    []
  );
  const handleTraceFilter = (0, import_react4.useCallback)((traceId) => {
    setFilters((f) => f.traceId === traceId ? { ...f, traceId: void 0 } : { ...f, traceId });
  }, []);
  const handleSearchChange = (0, import_react4.useCallback)((e) => {
    setSearchText(e.target.value);
  }, []);
  const handleSearchSubmit = (0, import_react4.useCallback)(
    (e) => {
      if (e.key === "Enter") {
        setFilters((f) => ({ ...f, search: searchText || void 0 }));
      }
    },
    [searchText]
  );
  const clearFilters = (0, import_react4.useCallback)(() => {
    setFilters({});
    setSearchText("");
  }, []);
  const displayEntries = (0, import_react4.useMemo)(() => {
    if (!searchText) return entries;
    const search = searchText.toLowerCase();
    return entries.filter((e) => JSON.stringify(e).toLowerCase().includes(search));
  }, [entries, searchText]);
  const columns = (0, import_react4.useMemo)(
    () => [
      {
        id: "time",
        header: "Time",
        width: 105,
        template: (_v, row) => formatTimestamp(row.time)
      },
      {
        id: "timeAgo",
        header: "Ago",
        width: 65,
        getter: (row) => row.time,
        template: (v2) => timeAgo(v2)
      },
      {
        id: "level",
        header: "Level",
        width: 75,
        cell: LevelCell
      },
      {
        id: "name",
        header: "Service",
        width: 130,
        cell: NameCell
      },
      {
        id: "traceId",
        header: "Trace ID",
        width: 155,
        cell: TraceLinkCell
      },
      {
        id: "msg",
        header: "Message",
        flexgrow: 1,
        cell: MessageCell
      },
      {
        id: "http",
        header: "HTTP",
        width: 200,
        getter: (row) => row.req ? `${row.req.method} ${row.req.url}` : "",
        cell: HttpCell
      }
    ],
    []
  );
  const initGrid = (0, import_react4.useCallback)(
    (api) => {
      gridApiRef.current = api;
      api.on("select-row", (ev) => {
        const entry = entriesRef.current.find((e) => e.id === ev.id);
        if (entry) setSelectedEntry(entry);
      });
    },
    []
    // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rowStyle = (0, import_react4.useCallback)(
    (row) => {
      if (filters.traceId && row.traceId === filters.traceId)
        return "blong-log-trace-highlight";
      return "";
    },
    [filters.traceId]
  );
  const handleFilterTrace = (0, import_react4.useCallback)(
    (ev) => {
      handleTraceFilter(ev.traceId);
    },
    [handleTraceFilter]
  );
  const contextValue = (0, import_react4.useMemo)(
    () => ({ theme, searchText, clientConfig, onTraceFilter: handleTraceFilter }),
    [theme, searchText, clientConfig, handleTraceFilter]
  );
  const toolbarStyle = {
    display: "flex",
    gap: "8px",
    padding: "8px 12px",
    borderBottom: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
    background: isDark ? "#161b22" : "#f6f8fa",
    alignItems: "center",
    flexWrap: "wrap"
  };
  const inputStyle = {
    padding: "4px 8px",
    border: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
    borderRadius: "4px",
    background: isDark ? "#0d1117" : "#ffffff",
    color: isDark ? "#c9d1d9" : "#24292f",
    fontSize: "12px",
    outline: "none"
  };
  const selectStyle = {
    padding: "4px 8px",
    border: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
    borderRadius: "4px",
    background: isDark ? "#0d1117" : "#ffffff",
    color: isDark ? "#c9d1d9" : "#24292f",
    fontSize: "12px"
  };
  const statusBarStyle = {
    display: "flex",
    gap: "12px",
    padding: "4px 12px",
    borderTop: `1px solid ${isDark ? "#30363d" : "#d0d7de"}`,
    background: isDark ? "#161b22" : "#f6f8fa",
    fontSize: "11px",
    color: isDark ? "#8b949e" : "#57606a",
    alignItems: "center"
  };
  const hasFilters = filters.level || filters.name || filters.traceId || filters.search || filters.hasError || filters.properties && Object.keys(filters.properties).length > 0;
  const ThemeWrapper = isDark ? ho : fo;
  return import_react4.default.createElement(
    ViewerContext.Provider,
    { value: contextValue },
    import_react4.default.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: isDark ? "#0d1117" : "#ffffff",
          color: isDark ? "#c9d1d9" : "#24292f"
        }
      },
      // Dynamic styles for trace highlight
      import_react4.default.createElement(
        "style",
        null,
        ".blong-log-trace-highlight:not(.selected) .cell { background: " + (isDark ? "#1c2128" : "#ddf4ff") + " !important; }"
      ),
      // Toolbar
      import_react4.default.createElement(
        "div",
        { style: toolbarStyle },
        import_react4.default.createElement(
          "select",
          { style: selectStyle, value: filters.level ?? "", onChange: handleLevelChange },
          import_react4.default.createElement("option", { value: "" }, "All Levels"),
          ...["trace", "debug", "info", "warn", "error", "fatal"].map(
            (l2) => import_react4.default.createElement("option", { key: l2, value: l2 }, l2.toUpperCase())
          )
        ),
        import_react4.default.createElement("input", {
          style: { ...inputStyle, width: "140px" },
          placeholder: "Service name...",
          value: filters.name ?? "",
          onChange: handleNameChange,
          list: "service-names-datalist"
        }),
        // Datalist for service name autocomplete
        import_react4.default.createElement(
          "datalist",
          { id: "service-names-datalist" },
          ...uniqueServiceNames.map(
            (name) => import_react4.default.createElement("option", { key: name, value: name })
          )
        ),
        import_react4.default.createElement(
          "label",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              fontSize: "12px",
              cursor: "pointer",
              userSelect: "none"
            }
          },
          import_react4.default.createElement("input", {
            type: "checkbox",
            checked: !!filters.hasError,
            onChange: handleHasErrorChange
          }),
          "Has Error"
        ),
        ...clientConfig?.properties.custom ? clientConfig.properties.custom.filter((p) => p.filterable).map(
          (prop) => prop.values ? (
            // Dropdown for predefined values
            import_react4.default.createElement(
              "select",
              {
                key: prop.name,
                style: selectStyle,
                value: filters.properties?.[prop.name] ?? "",
                onChange: (e) => handleCustomPropertyChange(prop.name, e.target.value)
              },
              import_react4.default.createElement(
                "option",
                { value: "" },
                `All ${prop.label}`
              ),
              ...prop.values.map(
                (val) => import_react4.default.createElement(
                  "option",
                  { key: val, value: val },
                  val
                )
              )
            )
          ) : (
            // Text input for free-form values
            import_react4.default.createElement("input", {
              key: prop.name,
              style: { ...inputStyle, width: "140px" },
              placeholder: `${prop.label}...`,
              value: filters.properties?.[prop.name] ?? "",
              onChange: (e) => handleCustomPropertyChange(prop.name, e.target.value)
            })
          )
        ) : [],
        filters.traceId ? import_react4.default.createElement(
          "span",
          {
            style: {
              padding: "1px 6px",
              borderRadius: "3px",
              fontSize: "11px",
              fontWeight: "bold",
              textTransform: "uppercase",
              background: "#1f6feb",
              color: "#fff",
              cursor: "pointer"
            },
            onClick: () => handleTraceFilter(filters.traceId),
            title: "Click to remove trace filter"
          },
          "Trace: " + filters.traceId.substring(0, 12) + "\u2026 \xD7"
        ) : null,
        import_react4.default.createElement("input", {
          style: { ...inputStyle, flex: 1, minWidth: "200px" },
          placeholder: "Search logs... (Enter to apply)",
          value: searchText,
          onChange: handleSearchChange,
          onKeyDown: handleSearchSubmit
        }),
        hasFilters ? import_react4.default.createElement(
          "button",
          {
            style: {
              ...inputStyle,
              cursor: "pointer",
              border: "1px solid #da3633",
              color: "#da3633"
            },
            onClick: clearFilters
          },
          "Clear"
        ) : null
      ),
      // SVAR Grid
      import_react4.default.createElement(
        "div",
        { style: { flex: 1, overflow: "hidden" } },
        import_react4.default.createElement(
          ThemeWrapper,
          null,
          import_react4.default.createElement(lo, {
            data: displayEntries,
            columns,
            select: true,
            rowStyle,
            init: initGrid,
            onFilterTrace: handleFilterTrace,
            sizes: { rowHeight: 28 }
          })
        )
      ),
      // Status bar
      import_react4.default.createElement(
        "div",
        { style: statusBarStyle },
        import_react4.default.createElement("span", {
          style: {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            display: "inline-block",
            background: connected ? "#22c55e" : "#ef4444"
          }
        }),
        import_react4.default.createElement("span", null, connected ? "Connected" : "Disconnected"),
        import_react4.default.createElement("span", null, displayEntries.length + " entries"),
        import_react4.default.createElement(
          "span",
          {
            style: { cursor: "pointer" },
            onClick: () => setAutoScroll((a) => !a),
            title: "Toggle auto-scroll"
          },
          autoScroll ? "\u2B07 Auto-scroll" : "\u23F8 Paused"
        )
      ),
      // Detail modal
      selectedEntry ? import_react4.default.createElement(EntryModal, {
        entry: selectedEntry,
        isDark,
        onClose: () => setSelectedEntry(null)
      }) : null
    )
  );
}

// src/client/app.tsx
var root = (0, import_client.createRoot)(document.getElementById("root"));
root.render(import_react5.default.createElement(LogViewer));
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.min.js:
  (**
   * @license React
   * scheduler.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.min.js:
  (**
   * @license React
   * react-dom.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
//# sourceMappingURL=app.js.map
