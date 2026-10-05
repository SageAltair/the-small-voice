import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
// Loaded from the entry point rather than from the settings page: a reading
// size or a high contrast choice has to be in place before the first paint, not
// after someone visits a page to switch it on.
import "./preferences.css";

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);