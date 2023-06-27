// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const contextBridge = require('electron').contextBridge
const ipcRenderer = require('electron').ipcRenderer

// Exposed protected methods in the render process
contextBridge.exposeInMainWorld(
  // Allowed 'ipcRenderer' methods
  'bridge', {
    // From main to render
    sendSettings: (handler: any) => {
      ipcRenderer.on('sendSettings', handler)
    },
    onConfigUpdate: (handler: any) => {
      ipcRenderer.on('config-update', handler)
    },
    contentChange: (content: any) => {
      ipcRenderer.send('content-change', content)
    },
    configChange: (config: any) => {
      ipcRenderer.send('config-change', config)
    },
    onConfigChangeReply: (handler: any) => {
      ipcRenderer.on('config-change-reply', handler)
    }

  }
)
