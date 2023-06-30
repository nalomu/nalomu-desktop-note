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
import _ from 'lodash'
import EditorJS from '@editorjs/editorjs'
// @ts-ignore
import Header from '@editorjs/header'
// @ts-ignore
import RawTool from '@editorjs/raw'
// @ts-ignore
import SimpleImage from '@editorjs/simple-image'
// @ts-ignore
import List from '@editorjs/list'
// @ts-ignore
import Checklist from '@editorjs/checklist'
// @ts-ignore
import Quote from '@editorjs/quote'

declare interface IElectronAPI {
  getSettings: (param: any) => any
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
window.bridge.getSettings('mainWindow')
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
    // container.innerHTML = window.config.content || ''


    // container.oninput = () => {
    //   // window.bridge.contentChange(container.innerHTML)
    // }
    console.log(window.config.content)
    window.bridge.onConfigUpdate(function (event: any, arg: any) {

      const styles = objectMap(arg.index, (v: any, k: string) => [toDash(k), v])
      const styleTag = toStyleTag({ 'div.container#container': styles })
      $('#container-style').html(styleTag.html())
    })
    const editor = new EditorJS({
      holder: container,
      placeholder: '点击这里输入内容',
      data: window.config.content || {},
      tools: {
        header: {
          class: Header,
          shortcut: 'CMD+SHIFT+H'
        },
        raw: RawTool,
        image: SimpleImage,
        list: {
          class: List,
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered'
          }
        },
        checklist: {
          class: Checklist,
          inlineToolbar: true
        },
        quote: {
          class: Quote,
          inlineToolbar: true,
          shortcut: 'CMD+SHIFT+O',
          config: {
            quotePlaceholder: 'Enter a quote',
            captionPlaceholder: 'Quote\'s author'
          }
        }
      },
      onChange(api, event) {
        _.debounce(() => {
          editor.save().then((outputData) => {
            window.bridge.contentChange(outputData)
          }).catch((error) => {
            console.log('Saving failed: ', error)
          })
        }, 100)()
      }
    })

  })
})
