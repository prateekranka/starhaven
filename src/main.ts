/// <reference types="vite/client" />

import "./styles/global.css";
import "./styles/title.css";
import "./styles/setup.css";
import { startBrowserShell } from "./browser-shell/shell";
import { mountNativeLoadingSurface } from "./browser-shell/native-loading";

const app = document.getElementById("app");
if (app === null) {
  throw new Error("missing #app root element");
}

const params = new URLSearchParams(window.location.search);
if (params.get("host") === "native") {
  mountNativeLoadingSurface(app);
} else {
  startBrowserShell(app);
}
