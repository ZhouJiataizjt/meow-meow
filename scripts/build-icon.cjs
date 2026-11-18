// Rebuild the Windows icon from the supplied cat SVG using Chromium rendering.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.whenReady().then(async () => {
    try {
        const svg = fs.readFileSync(path.resolve('src/frontend/assets/猫咪.svg'), 'utf8')
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
        await win.loadURL('about:blank')
        const sizes = [16, 24, 32, 48, 64, 128, 256]
        const images = await win.webContents.executeJavaScript(`(async () => {
            const img = new Image();
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
            await img.decode();
            return ${JSON.stringify(sizes)}.map(size => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                canvas.getContext('2d').drawImage(img, 0, 0, size, size);
                return canvas.toDataURL('image/png').split(',')[1];
            });
        })()`)
        const header = Buffer.alloc(6 + sizes.length * 16)
        header.writeUInt16LE(1, 2)
        header.writeUInt16LE(sizes.length, 4)
        let offset = header.length
        const buffers = images.map((base64, i) => {
            const png = Buffer.from(base64, 'base64')
            const entry = 6 + i * 16
            header[entry] = header[entry + 1] = sizes[i] % 256
            header.writeUInt16LE(1, entry + 4)
            header.writeUInt16LE(32, entry + 6)
            header.writeUInt32LE(png.length, entry + 8)
            header.writeUInt32LE(offset, entry + 12)
            offset += png.length
            return png
        })
        fs.writeFileSync(path.resolve('src/frontend/assets/favicon.ico'), Buffer.concat([header, ...buffers]))
        console.log('Generated cat favicon.ico at 16–256px')
        app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
})
