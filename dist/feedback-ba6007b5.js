import { u as p, j as e, V as x, F as b } from "./index-1fe56d63.js";
import m, { useEffect as u } from "react";
import { f } from "./index.es-7d451cd6.js";
import o from "styled-components";
import "react-dom";
const g = o.aside`
  background-color: var(--canvas);
  margin: 0px 4px 12px 4px;
  padding: 1em;
  border: 2px solid var(--canvastext);
  border-top: 0px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
  //   &: focus {
  //   outline: 2px solid var(--canvastext);
  //   outline-offset: 2px;
  //  }
`, h = o.span`
  display: block;
  margin: 12px 4px 0px 4px;
  padding: 6px;
  border: 2px solid var(--canvastext);
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
  background-color: var(--mainGray);
  &: focus {
    outline: 2px solid var(--canvastext);
    outline-offset: 2px;
  }
`, S = m.memo(function(n) {
  let { name: y, id: i, SVs: r, children: s, actions: t, callAction: a } = p(n), d = (c) => {
    a({
      action: t.recordVisibilityChange,
      args: { isVisible: c }
    });
  };
  if (u(() => () => {
    a({
      action: t.recordVisibilityChange,
      args: { isVisible: !1 }
    });
  }, []), r.hidden)
    return null;
  let l = /* @__PURE__ */ e.jsx(b, { icon: f });
  return /* @__PURE__ */ e.jsx(x, { partialVisibility: !0, onChange: d, children: /* @__PURE__ */ e.jsxs(e.Fragment, { children: [
    /* @__PURE__ */ e.jsxs(h, { tabIndex: "0", children: [
      l,
      " Feedback"
    ] }),
    /* @__PURE__ */ e.jsxs(
      g,
      {
        id: i,
        children: [
          /* @__PURE__ */ e.jsx("a", { name: i }),
          r.feedbackText,
          s
        ]
      }
    )
  ] }) });
});
export {
  S as default
};