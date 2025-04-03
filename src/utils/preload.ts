// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

//
// 1. Define the shape of the API you expose to the renderer
//
interface Api {
  // ---------- PICK FOLDER ----------
  pickFolder: () => Promise<string | undefined>;

  // ---------- LOCAL UPDATES ----------
  getFolders: (basePath: string) => Promise<string[]>;
  checkUpdates: (folderPath: string, isDev: boolean) => Promise<unknown>;
  installUpdates: (folderPath: string, isDev: boolean) => Promise<unknown>;
  installSpecificUpdates: (
    folderPath: string,
    filterList: string[],
    isDev: boolean
  ) => Promise<unknown>;

  // ---------- GLOBAL UPDATES ----------
  checkGlobalUpdates: () => Promise<unknown>;
  installGlobalUpdates: () => Promise<unknown>;
  installSpecificGlobalUpdates: (deps: string[]) => Promise<unknown>;
}

//
// 2. Extend the Window interface to include this API
//
declare global {
  interface Window {
    api: Api;
  }
}

//
// 3. Expose the API methods to the renderer via contextBridge
//
contextBridge.exposeInMainWorld('api', {
  // ---------- PICK FOLDER ----------
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // ---------- LOCAL UPDATES ----------
  getFolders: (basePath: string) => ipcRenderer.invoke('get-folders', basePath),
  checkUpdates: (folderPath: string, isDev: boolean) =>
    ipcRenderer.invoke('check-updates', folderPath, isDev),
  installUpdates: (folderPath: string, isDev: boolean) =>
    ipcRenderer.invoke('install-updates', folderPath, isDev),
  installSpecificUpdates: (
    folderPath: string,
    filterList: string[],
    isDev: boolean
  ) => ipcRenderer.invoke('install-specific-updates', folderPath, filterList, isDev),

  // ---------- GLOBAL UPDATES ----------
  checkGlobalUpdates: () => ipcRenderer.invoke('check-global-updates'),
  installGlobalUpdates: () => ipcRenderer.invoke('install-global-updates'),
  installSpecificGlobalUpdates: (deps: string[]) =>
    ipcRenderer.invoke('install-specific-global-updates', deps),
} as Api);

// Ensure the file is treated as a module
export {};