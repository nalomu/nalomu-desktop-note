const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'
let mainWindow
let modal = null
let config
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
    'height': 70
  },
  'alwaysOnTop': true,
  'content': ''
}
let configFile = path.join(assetsPath, '/config.json')
let writeConfig = (data, callback) => {
  fs.writeFileSync(configFile, JSON.stringify(data))
  callback && callback()
}
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
global.sharedObject = {
  assetsPath,
  config
}


function createWindow() {
  // 创建浏览器窗口
  let options = Object.assign({
    webPreferences: {
      nodeIntegration: true,
      devTools: process.env.NODE_ENV === 'dev',
      preload: path.join(__dirname, 'preload.js') // use a preload script
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

  // 加载index.html文件
  mainWindow.loadFile('index.html')
    .then(() => { mainWindow.webContents.send('sendSettings', config); })
    .then(() => { mainWindow.show(); });
  mainWindow.on('resize', function() {
    config.size = mainWindow.getContentBounds()
    console.log(config.size)
  })
    // .once('ready-to-show', () => {
    // mainWindow.show()
    // mainWindow.openDevTools()
  // })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})
let tray = null

function openSettingsPanel() {
  const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'
  if (modal !== null) {
    modal.show()
    return
  }
  modal = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      devTools: process.env.NODE_ENV === 'dev',
      preload: path.join(__dirname, 'preload.js') // use a preload script
    },
    modal: true,
    parent: mainWindow,
    icon: path.join(assetsPath, 'favicon.ico'),
    skipTaskbar: false,
    show: false
  })
  modal.loadFile('settings.html')
  modal.setMenu(new Menu())
  modal.on('closed', function() {
    modal = null
  }).once('ready-to-show', () => modal.show())
  ipcMain.on('config-change', function(event, message) {
    config = Object.assign(config, message)
    mainWindow.setAlwaysOnTop(config.alwaysOnTop)
    mainWindow.webContents.send('config-update', config)
    event.reply('config-change-reply', 'ok')
  })
  if (process.env.NODE_ENV === 'dev') {
    modal.webContents.openDevTools()
  }
}

app.on('ready', () => {
  const assetsPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : 'assets'
  tray = new Tray(path.join(assetsPath, 'favicon.ico'))
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '设置',
      click: function() {
        openSettingsPanel()
      }
    },
    {
      label: '退出',
      click: function() {
        app.quit()
      }
    }
  ])
  tray.setToolTip('This is my application.')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    mainWindow.focus()
  })
}).on('before-quit', function() {
  console.log('before-quit')
  writeConfig(config,()=>{
    console.log('write config success')
  })
})
ipcMain.on('content-change', function(event, message) {
  console.log(message)
  config.content = message
})
