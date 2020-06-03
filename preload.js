const _config = require('electron').remote.getGlobal('sharedObject').config
window.assetsPath = require('electron').remote.getGlobal('sharedObject').assetsPath
window.config = _config
