/// <reference types="vite/client" />

import "./styles/global.css";
import "./styles/title.css";
import "./styles/setup.css";
import "./styles/results.css";
import { startBrowserShell } from "./browser-shell/shell";
import { mountNativeLoadingSurface } from "./browser-shell/native-loading";
import "./styles/match.css";
import { mountFoundationMatch } from "./render/foundation-view";

const app = document.getElementById("app");
if (app === null) {
  throw new Error("missing #app root element");
}

const params = new URLSearchParams(window.location.search);
if (params.get("host") === "native") {
  mountNativeLoadingSurface(app);
} else if (params.get("match") === "foundation") {
  mountFoundationMatch(app);
} else {
  startBrowserShell(app, { demoMode: params.get("demo") === "vertical-slice" });
}
