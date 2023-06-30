import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string

declare const SETTINGS_WINDOW_WEBPACK_ENTRY: string
declare const SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY: string
const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'

// 初始化变量
let mainWindow: BrowserWindow
let modal: BrowserWindow
let config: any
let defaultConfig = {
  'index': {
    'color': 'rgb(204,204,204)',
    'background': 'rgba(51,51,51,1)',
    'fontSize': '18px',
    'lineHeight': '1.4',
    'padding': '20px',
    'textAlign': 'center'
  },
  'size': {
    'width': 270,
    'height': 100
  },
  'alwaysOnTop': true,
  'content': ''
}
let configFile = path.join('./config.json')
let writeConfig = (data: any, callback?: () => any) => {
  fs.writeFileSync(configFile, JSON.stringify(data))
  callback && callback()
}

// 读取配置
function getConfig() {

  try {
    if (fs.existsSync(configFile))
      config = JSON.parse(fs.readFileSync(configFile).toString())
    else {
      config = {}
      writeConfig(defaultConfig)
    }
    config = Object.assign(defaultConfig, config)
  } catch (e) {
    console.error('failed to load config.json')
    config = defaultConfig
    writeConfig(config)
  }
}

getConfig()


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit()
}

const createWindow = (): void => {
  // Create the browser window.
  let options = Object.assign({
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY // use a preload script
    },
    skipTaskbar: true,
    transparent: true,
    frame: false,
    alwaysOnTop: config.alwaysOnTop,
    icon: path.join(assetsPath, 'favicon.ico'),
    show: false
  }, config.size)
  console.log(options)
  mainWindow = new BrowserWindow(options)

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
    .then(() => mainWindow.show())

  // Open the DevTools.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }
  // 当窗口变换大小时记录下来
  mainWindow.on('resize', function () {
    config.size = mainWindow.getContentBounds()
    console.log(config.size)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

let tray = null

function openSettingsPanel() {
  const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'
  if (modal) {
    modal.show()
    return
  }
  modal = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      // devTools: process.env.NODE_ENV === 'dev',
      preload: SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY // use a preload script
    },
    modal: true,
    parent: mainWindow,
    icon: path.join(assetsPath, 'favicon.ico'),
    skipTaskbar: false,
    show: false
  })
  modal.on('closed', function () {
    modal = null
  })
  modal.setMenu(new Menu())
  modal.loadURL(SETTINGS_WINDOW_WEBPACK_ENTRY)
    .then(() => modal.show())
  ipcMain.on('config-change', function (event, message) {
    config = Object.assign(config, message)
    mainWindow.setAlwaysOnTop(config.alwaysOnTop)
    mainWindow.webContents.send('config-update', config)
    event.reply('config-change-reply', 'ok')
  })
  // modal.webContents.openDevTools()
}

app.on('ready', () => {
  const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'
  tray = new Tray(path.join(assetsPath, 'favicon.ico'))
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '设置',
      click: function () {
        openSettingsPanel()
      }
    },
    {
      label: '退出',
      click: function () {
        app.quit()
      }
    }
  ])
  tray.setToolTip('This is my application.')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    mainWindow.focus()
  })
}).on('before-quit', function () {
  console.log('before-quit')
  writeConfig(config, () => {
    console.log('write config success')
  })
})
ipcMain.on('content-change', function (event, message) {
  console.log(message)
  config.content = message
  writeConfig(config, () => {
    console.log('write content success')
  })
})
ipcMain.on('getSettings', function (e, windowName) {
  getConfig()
  if (windowName === 'mainWindow') {
    mainWindow.webContents.send('sendSettings', { assetsPath, config })
  } else if (windowName === 'settings') {
    modal.webContents.send('sendSettings', { assetsPath, config })
  }
})
