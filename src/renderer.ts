/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/latest/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css'
import $ from 'jquery'
import BalloonEditor from '@ckeditor/ckeditor5-build-balloon'
import '@ckeditor/ckeditor5-build-balloon/build/translations/zh-cn'


declare interface IElectronAPI {
  sendSettings: (param: any) => any
  onConfigUpdate: (param: any) => any
  contentChange: (param: any) => any
  configChange: (param: any) => any
  onConfigChangeReply: (param: any) => any
}

declare global {
  interface Window {
    bridge: IElectronAPI
    config: any
    assetsPath: string
  }
}

console.log('👋 This message is being logged by "renderer.js", included via webpack')


function appendPxIfNumber(value: number | string) {
  return (typeof value === 'number') ? '' + value + 'px' : value
}

function toStyleTag(rulesObj: any) {
  let combinedRules = ''
  for (let selector in rulesObj) {
    let cssObject = rulesObj[selector]
    let combinedProperties = ''
    for (let prop in cssObject) {
      let value = cssObject[prop]
      combinedProperties += `${prop}: ${appendPxIfNumber(value)};` + '\n'
    }
    combinedRules += ` ${selector} {${combinedProperties}}` + '\n'
  }
  return $(`<style>${combinedRules}</style>`)
}

const objectMap = (obj: Object, fn: any) =>
  Object.fromEntries(
    Object.entries(obj).map(
      ([k, v], i) => fn(v, k, i)
    )
  )


// 下划线转换驼峰
function toHump(name: string) {
  return name.replace(/\-(\w)/g, function (all, letter) {
    return letter.toUpperCase()
  })
}

// 驼峰转换下划线
function toDash(name: string) {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

window.config = {}
window.bridge.sendSettings((event: any, data: { config: any, assetsPath: string }) => {
  window.config = data.config
  window.assetsPath = data.assetsPath
  $(function () {
    let container = document.querySelector('.container') as HTMLElement
    let config = Object.assign(window.config.index, {})
    $('head').append(`<link rel="icon" href="${window.assetsPath}/favicon.ico">`)
    console.log(config)
    const styles = objectMap(config, (v: any, k: string) => [toDash(k), v])
    const styleTag = toStyleTag({ 'div.container#container': styles })
    styleTag.attr('id', 'container-style')
    $('head').append(styleTag)
    container.innerHTML = window.config.content || ''


    container.oninput = () => {
      window.bridge.contentChange(container.innerHTML)
    }
    window.bridge.onConfigUpdate(function (event: any, arg: any) {

      const styles = objectMap(arg.index, (v: any, k: string) => [toDash(k), v])
      const styleTag = toStyleTag({ 'div.container#container': styles })
      $('#container-style').html(styleTag.html())
    })
    BalloonEditor
      .create(container, {
        language: 'zh-cn',
      })
      .catch(error => {
        console.error(error)
      })


  })
})
