import { u as o, j as e } from "./index-1fe56d63.js";
import i from "react";
import "react-dom";
import "styled-components";
const p = i.memo(function(r) {
  let { name: a, id: t, SVs: n, children: m } = o(r);
  return n.hidden ? null : /* @__PURE__ */ e.jsxs(e.Fragment, { children: [
    /* @__PURE__ */ e.jsx("a", { name: t }),
    "“",
    m,
    "”"
  ] });
});
export {
  p as default
};