// Render the real Electron UI with an isolated copy of the local data.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'meow-ui-')))
delete process.env.MEOW_ENABLE_CLOUD
process.env.MEOW_LOCAL_MODE = '1'
require('../src/frontend/js/main')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
    try {
        await delay(2000)
        const win = BrowserWindow.getAllWindows()[0]
        const output = path.resolve('artifacts/ui', process.env.MEOW_UI_STAGE || 'after')
        fs.mkdirSync(output, { recursive: true })
        const report = []
        for (const width of [1280, 760]) {
            win.setSize(width, 900)
            for (const route of ['map', 'cats', 'records', 'stats']) {
                await win.webContents.executeJavaScript(`appNavigate('${route}')`)
                await delay(route === 'map' ? 1800 : 500)
                const frame = win.webContents.mainFrame.frames[0]
                const metrics = await frame.executeJavaScript(`({viewportWidth:innerWidth, scroll:document.documentElement.scrollWidth, title:document.title})`)
                report.push({ width, route, ...metrics })
                fs.writeFileSync(path.join(output, `${route}-${width}.png`), (await win.webContents.capturePage()).toPNG())
            }
        }
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
        console.log(JSON.stringify(report))
        app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
})
