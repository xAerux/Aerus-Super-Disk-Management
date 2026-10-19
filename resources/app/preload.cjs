const { contextBridge, ipcRenderer } = require("electron");

function markDesktop() {
  document.documentElement?.classList.add("aerus-desktop");
}

if (document.documentElement) markDesktop();
else document.addEventListener("DOMContentLoaded", markDesktop, { once: true });

contextBridge.exposeInMainWorld("aerus", {
  minimize() {
    ipcRenderer.send("aerus-min");
  },
  maximize() {
    ipcRenderer.send("aerus-max");
  },
  close() {
    ipcRenderer.send("aerus-close");
  },
});
