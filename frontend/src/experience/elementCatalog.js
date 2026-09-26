/**
 * Choice lists for the element properties panel.
 *
 * These live apart from the renderer on purpose: a component file may only
 * export components, otherwise React Fast Refresh cannot hot-swap it, and the
 * builder is the only thing that needs a list of shapes to offer.
 */
import * as ICONS from "lucide-react";

/** Shape choices offered in the properties panel. */
export const SHAPE_OPTIONS = [
  { value: "rectangle", label: "Rectangle" },
  { value: "rounded", label: "Rounded rectangle" },
  { value: "circle", label: "Circle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "triangle", label: "Triangle" },
  { value: "star", label: "Star" },
  { value: "line", label: "Line" },
  { value: "arrow", label: "Arrow" },
];

/** Icon choices for the icon element: name -> label, searchable. */
export const ICON_OPTIONS = Object.keys(ICONS)
  .filter((name) => /^[A-Z]/.test(name) && typeof ICONS[name] === "function" && name !== "default")
  .filter((name) => !/^(createLucideIcon|defaultProps)$/.test(name))
  .slice(0, 400)
  .map((name) => ({ value: name, label: name.replace(/([a-z])([A-Z])/g, "$1 $2") }));
