import { u as W, d as Y, e as j, j as P } from "./index-1fe56d63.js";
import U, { useContext as B, useRef as l, useEffect as _ } from "react";
import { BoardContext as N, LINE_LAYER_OFFSET as G } from "./graph-6d43a295.js";
import "react-dom";
import "styled-components";
import "./css-ab4d83ca.js";
const Z = U.memo(function y(M) {
  let { name: m, id: T, SVs: r, actions: s, sourceOfUpdate: H, callAction: d } = W(M);
  y.ignoreActionsWithoutCore = () => !0;
  const o = B(N);
  let e = l(null), f = l(null), k = l(null), S = l(!1), x = l(!1), p = l(!1), R = l(null), i = l(null), O = l(null), E = l(null), g = l(!1), v = l(!1);
  O.current = r.numericalEndpoint, E.current = r.numericalThroughpoint, g.current = r.fixed, v.current = !r.draggable || r.fixLocation || r.fixed;
  const w = Y(j);
  _(() => () => {
    Object.keys(e.current).length !== 0 && F(), o && o.off("move", D);
  }, []), _(() => {
    o && o.on("move", D);
  }, [o]);
  function A() {
    if (r.numericalEndpoint.length !== 2 || r.numericalThroughpoint.length !== 2) {
      e.current = null;
      return;
    }
    let c = w === "dark" ? r.selectedStyle.lineColorDarkMode : r.selectedStyle.lineColor;
    var u = {
      name: r.labelForGraph,
      visible: !r.hidden,
      withLabel: r.labelForGraph !== "",
      layer: 10 * r.layer + G,
      fixed: g.current,
      strokeColor: c,
      strokeOpacity: r.selectedStyle.lineOpacity,
      highlightStrokeColor: c,
      highlightStrokeOpacity: r.selectedStyle.lineOpacity * 0.5,
      strokeWidth: r.selectedStyle.lineWidth,
      highlightStrokeWidth: r.selectedStyle.lineWidth,
      dash: X(r.selectedStyle.lineStyle),
      highlight: !v.current,
      straightFirst: !1
    };
    u.label = {
      highlight: !1
    }, r.labelHasLatex && (u.label.useMathJax = !0), r.applyStyleToLabel ? u.label.strokeColor = c : u.label.strokeColor = "var(--canvastext)";
    let C = [[...r.numericalEndpoint], [...r.numericalThroughpoint]], n = o.create("line", C, u);
    n.isDraggable = !v.current, n.on("drag", function(t) {
      let b = t.type === "pointermove";
      if (!b || Math.abs(t.x - f.current[0]) > 0.1 || Math.abs(t.y - f.current[1]) > 0.1) {
        p.current = !0, i.current = [];
        for (let a = 0; a < 2; a++)
          if (b) {
            var h = o.origin.scrCoords;
            let L = (k.current[a][1] + t.x - f.current[0] - h[1]) / o.unitX, J = (h[2] - (k.current[a][2] + t.y - f.current[1])) / o.unitY;
            i.current.push([L, J]);
          } else
            i.current.push([
              n.point1.X(),
              n.point1.Y()
            ]), i.current.push([
              n.point2.X(),
              n.point2.Y()
            ]);
        d({
          action: s.moveRay,
          args: {
            endpointcoords: i.current[0],
            throughcoords: i.current[1],
            transient: !0,
            skippable: !0
          }
        });
      }
      e.current.point1.coords.setCoordinates(
        JXG.COORDS_BY_USER,
        O.current
      ), e.current.point2.coords.setCoordinates(
        JXG.COORDS_BY_USER,
        E.current
      );
    }), n.on("up", function(t) {
      p.current ? d({
        action: s.moveRay,
        args: {
          endpointcoords: i.current[0],
          throughcoords: i.current[1]
        }
      }) : !x.current && !g.current && d({
        action: s.rayClicked,
        args: { name: m }
        // send name so get original name if adapted
      }), S.current = !1;
    }), n.on("keyfocusout", function(t) {
      p.current && (d({
        action: s.moveRay,
        args: {
          point1coords: i.current[0],
          point2coords: i.current[1]
        }
      }), p.current = !1);
    }), n.on("down", function(t) {
      p.current = !1, f.current = [t.x, t.y], k.current = [
        [...n.point1.coords.scrCoords],
        [...n.point2.coords.scrCoords]
      ], S.current = !0, x.current = !1, g.current || d({
        action: s.rayFocused,
        args: { name: m }
        // send name so get original name if adapted
      });
    }), n.on("hit", function(t) {
      p.current = !1, d({
        action: s.rayFocused,
        args: { name: m }
        // send name so get original name if adapted
      });
    }), n.on("keydown", function(t) {
      t.key === "Enter" && (p.current && (d({
        action: s.moveRay,
        args: {
          point1coords: i.current[0],
          point2coords: i.current[1]
        }
      }), p.current = !1), d({
        action: s.rayClicked,
        args: { name: m }
        // send name so get original name if adapted
      }));
    }), R.current = r.labelForGraph !== "", e.current = n;
  }
  function D(c) {
    S.current && (Math.abs(c.x - f.current[0]) > 0.1 || Math.abs(c.y - f.current[1]) > 0.1) && (x.current = !0);
  }
  function F() {
    e.current.off("drag"), e.current.off("down"), e.current.off("hit"), e.current.off("up"), e.current.off("keyfocusout"), e.current.off("keydown"), o.removeObject(e.current), e.current = null;
  }
  if (o)
    if (e.current === null)
      A();
    else if (r.numericalEndpoint.length !== 2 || r.numericalThroughpoint.length !== 2)
      F();
    else {
      let c = !0;
      for (let a of [r.numericalEndpoint, r.numericalThroughpoint])
        Number.isFinite(a[0]) || (c = !1), Number.isFinite(a[1]) || (c = !1);
      e.current.point1.coords.setCoordinates(
        JXG.COORDS_BY_USER,
        r.numericalEndpoint
      ), e.current.point2.coords.setCoordinates(
        JXG.COORDS_BY_USER,
        r.numericalThroughpoint
      );
      let u = !r.hidden;
      if (c) {
        let a = e.current.visProp.visible !== u;
        e.current.visProp.visible = u, e.current.visPropCalc.visible = u, a && e.current.setAttribute({ visible: u });
      } else
        e.current.visProp.visible = !1, e.current.visPropCalc.visible = !1;
      e.current.visProp.fixed = g.current, e.current.visProp.highlight = !v.current, e.current.isDraggable = !v.current;
      let C = 10 * r.layer + G;
      e.current.visProp.layer !== C && e.current.setAttribute({ layer: C });
      let t = w === "dark" ? r.selectedStyle.lineColorDarkMode : r.selectedStyle.lineColor;
      e.current.visProp.strokecolor !== t && (e.current.visProp.strokecolor = t, e.current.visProp.highlightstrokecolor = t), e.current.visProp.strokewidth !== r.selectedStyle.lineWidth && (e.current.visProp.strokewidth = r.selectedStyle.lineWidth, e.current.visProp.highlightstrokewidth = r.selectedStyle.lineWidth), e.current.visProp.strokeopacity !== r.selectedStyle.lineOpacity && (e.current.visProp.strokeopacity = r.selectedStyle.lineOpacity, e.current.visProp.highlightstrokeopacity = r.selectedStyle.lineOpacity * 0.5);
      let b = X(r.selectedStyle.lineStyle);
      e.current.visProp.dash !== b && (e.current.visProp.dash = b), e.current.name = r.labelForGraph;
      let h = r.labelForGraph !== "";
      h != R.current && (e.current.setAttribute({ withlabel: h }), R.current = h), e.current.needsUpdate = !0, e.current.update(), e.current.hasLabel && (r.applyStyleToLabel ? e.current.label.visProp.strokecolor = t : e.current.label.visProp.strokecolor = "var(--canvastext)", e.current.label.needsUpdate = !0, e.current.label.update()), o.updateRenderer();
    }
  return r.hidden ? null : /* @__PURE__ */ P.jsx(P.Fragment, { children: /* @__PURE__ */ P.jsx("a", { name: T }) });
});
function X(y) {
  return y === "solid" ? 0 : y === "dashed" ? 2 : y === "dotted" ? 1 : 0;
}
export {
  Z as default
};