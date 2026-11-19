const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
for (const channel of ['get_cats', 'get_records', 'get_own_map_records']) ipcMain.handle(channel, () => [])
let saved = false
ipcMain.handle('save_cat_avatar_crop', (_event, data) => {
 const { nativeImage } = require('electron')
 const size = nativeImage.createFromDataURL(data).getSize()
 if (size.width !== 512 || size.height !== 512) throw Error('Invalid crop size')
 saved = true
 return 'test-cropped-avatar.jpg'
})
app.whenReady().then(async () => {
 try {
 const win = new BrowserWindow({show:false,width:500,height:760,webPreferences:{nodeIntegration:true,contextIsolation:false}})
 await win.loadFile(path.resolve('src/frontend/html/cats.html'))
 await win.webContents.executeJavaScript(`
 const fixture = document.createElement('canvas'); fixture.width=800; fixture.height=400;
 const ctx = fixture.getContext('2d'); ctx.fillStyle='#d5eeeb'; ctx.fillRect(0,0,800,400);
 ctx.fillStyle='#286469'; ctx.fillRect(300,100,200,200);
 window.cropResult = require('../js/cat_avatar_crop').cropCatAvatar(fixture.toDataURL()); void 0;
 `)
 await new Promise(r=>setTimeout(r,600))
 const result = await win.webContents.executeJavaScript(`({open:!!document.querySelector('dialog[open]'),overflow:document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth})`)
 if(!result.open || result.overflow) throw Error(JSON.stringify(result))
 fs.mkdirSync('artifacts/ui/avatar-crop',{recursive:true})
 fs.writeFileSync('artifacts/ui/avatar-crop/preview.png',(await win.webContents.capturePage()).toPNG())
 await win.webContents.executeJavaScript(`document.querySelector('[data-cancel]').click()`)
 if (await win.webContents.executeJavaScript('window.cropResult') !== null) throw Error('Cancel changed avatar')
 await win.webContents.executeJavaScript(`window.cropResult = require('../js/cat_avatar_crop').cropCatAvatar(fixture.toDataURL()); void 0`)
 await new Promise(r=>setTimeout(r,100))
 await win.webContents.executeJavaScript(`const slider=document.querySelector('dialog input');slider.value='2';slider.dispatchEvent(new Event('input'));document.querySelector('[data-save]').click()`)
 if (await win.webContents.executeJavaScript('window.cropResult') !== 'test-cropped-avatar.jpg' || !saved) throw Error('Crop was not saved')
 console.log('Crop opens, fits narrow window, cancels without changes, adjusts zoom, and exports a 512px avatar')
 app.exit(0)
 }catch(e){console.error(e);app.exit(1)}
})
