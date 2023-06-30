import './settings.css'
import '@simonwep/pickr/dist/themes/classic.min.css'

import $ from 'jquery'
import Pickr from '@simonwep/pickr'

window.bridge.getSettings('settings')
window.bridge.sendSettings((event: any, data: { config: any, assetsPath: string }) => {
  window.config = data.config
  window.assetsPath = data.assetsPath
  $(function () {
    let config = Object.assign(window.config, {})
    $('head').append(`<link rel="icon" href="${window.assetsPath}/favicon.ico">`)

    // Simple example, see optional options for more configuration.
    // import '@simonwep/pickr/dist/themes/classic.min.css';   // 'classic' theme
    // import Pickr from "@simonwep/pickr"
    let onselect: any = null
    let background = document.querySelector('#background') as HTMLElement
    let foreground = document.querySelector('#foreground') as HTMLElement
    let fontsize = document.querySelector('#fontsize') as HTMLElement
    let lineHeight = document.querySelector('#lineHeight') as HTMLElement
    let padding = document.querySelector('#padding') as HTMLElement
    let alwaysOnTop = document.querySelector('#alwaysOnTop') as HTMLInputElement
    let textAlign = document.querySelectorAll('input[name=align]')
    fontsize.setAttribute('value', config.index.fontSize.replace('px', ''))
    lineHeight.setAttribute('value', config.index.lineHeight)
    padding.setAttribute('value', config.index.padding.replace('px', ''))
    if (config.alwaysOnTop) {
      alwaysOnTop.setAttribute('checked', 'true')
    }
    textAlign.forEach(function (value: HTMLInputElement) {
      if (value.value === config.index['textAlign']) {
        value.setAttribute('checked', 'true')
        $(value).parent().addClass('checked')
      }
      value.onchange = function () {
        config.index['textAlign'] = value.value
        $('input[name=align]').parent().removeClass('checked')
        $(this).parent().addClass('checked')
      }
    })
    lineHeight.onchange = (e) => {
      config.index['lineHeight'] = (e.target as HTMLInputElement).value
    }
    padding.onchange = (e) => {
      config.index['padding'] = `${(e.target as HTMLInputElement).value}px`
    }
    fontsize.onchange = (e) => {
      config.index['fontSize'] = `${(e.target as HTMLInputElement).value}px`
    }
    alwaysOnTop.onchange = function () {
      console.log(alwaysOnTop.checked)
      config.alwaysOnTop = alwaysOnTop.checked
    }
    const pickr = Pickr.create({
      el: '.color-picker',
      theme: 'classic', // or 'monolith', or 'nano'
      swatches: [
        'rgba(244, 67, 54, 1)',
        'rgba(233, 30, 99, 0.95)',
        'rgba(156, 39, 176, 0.9)',
        'rgba(103, 58, 183, 0.85)',
        'rgba(63, 81, 181, 0.8)',
        'rgba(33, 150, 243, 0.75)',
        'rgba(3, 169, 244, 0.7)',
        'rgba(0, 188, 212, 0.7)',
        'rgba(0, 150, 136, 0.75)',
        'rgba(76, 175, 80, 0.8)',
        'rgba(139, 195, 74, 0.85)',
        'rgba(205, 220, 57, 0.9)',
        'rgba(255, 235, 59, 0.95)',
        'rgba(255, 193, 7, 1)'
      ],

      components: {

        // Main components
        preview: true,
        opacity: true,
        hue: true,

        // Input / output Options
        interaction: {
          hex: true,
          rgba: true,
          hsla: true,
          hsva: true,
          cmyk: true,
          input: true,
          clear: true,
          save: true
        }
      }
    })
    background.onclick = function () {
      console.log(onselect)
      pickr.setColor(config.index.background)
      onselect = 'background'
      pickr.show()
    }
    foreground.onclick = function () {
      console.log(onselect)
      pickr.setColor(config.index.color)
      onselect = 'color'
      pickr.show()
    }
    pickr.on('save', () => {
      if (onselect === null) {
        pickr.hide()
        return
      }
      let color = pickr.getColor().toRGBA()
      config.index[onselect] = `rgba(${color[0]},${color[1]},${color[2]},${color[3]})`
      console.log(config.index)
      pickr.hide()
    })
    let saveButton = document.getElementById('save')
    saveButton.onclick = () => {
      window.bridge.configChange(config)
      window.bridge.onConfigChangeReply(() => {
        window.close()
      })
    }

  })
})
