/* global Image, document */
const { ipcRenderer } = require('electron')

// All controls share the same source rectangle as the exported square.
async function cropCatAvatar(source) {
    const image = new Image()
    image.src = source
    await image.decode()
    return new Promise((resolve, reject) => {
        const dialog = document.createElement('dialog')
        dialog.setAttribute('aria-label', '裁剪猫咪头像')
        dialog.style.cssText = 'width:min(380px,calc(100vw - 48px));padding:24px;border:1px solid var(--border-color);border-radius:12px;color:var(--text-color);background:white;'
        dialog.innerHTML = `<h2 style="margin-top:0">裁剪猫咪头像</h2>
            <p>调整位置和缩放，让猫咪位于画面中央。</p>
            <canvas width="512" height="512" style="display:block;width:min(100%,240px);height:auto;margin:0 auto 16px;aspect-ratio:1;border-radius:50%" aria-label="圆形头像预览"></canvas>
            <label style="display:block">缩放 <input aria-label="头像缩放" type="range" min="1" max="4" step="0.01" value="1"></label>
            <label style="display:block">左右位置 <input aria-label="头像左右位置" type="range" min="0" max="1" step="0.01" value="0.5"></label>
            <label style="display:block">上下位置 <input aria-label="头像上下位置" type="range" min="0" max="1" step="0.01" value="0.5"></label>
            <p role="status"></p><div style="display:flex;justify-content:flex-end;gap:12px"><button type="button" data-cancel>取消</button><button type="button" data-save>使用此头像</button></div>`
        const canvas = dialog.querySelector('canvas')
        const controls = [...dialog.querySelectorAll('input')]
        const draw = () => {
            const side = Math.min(image.naturalWidth, image.naturalHeight) / Number(controls[0].value)
            const x = (image.naturalWidth - side) * Number(controls[1].value)
            const y = (image.naturalHeight - side) * Number(controls[2].value)
            const context = canvas.getContext('2d')
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, 512, 512)
            context.drawImage(image, x, y, side, side, 0, 0, 512, 512)
        }
        controls.forEach(control => control.addEventListener('input', draw))
        let result = null
        dialog.addEventListener('close', () => { dialog.remove(); resolve(result) }, { once: true })
        dialog.querySelector('[data-cancel]').onclick = () => dialog.close()
        dialog.querySelector('[data-save]').onclick = async event => {
            event.target.disabled = true
            try {
                result = await ipcRenderer.invoke('save_cat_avatar_crop', canvas.toDataURL('image/jpeg', 0.9))
                dialog.close()
            } catch (error) {
                dialog.querySelector('[role=status]').textContent = '保存失败：' + error.message
                event.target.disabled = false
            }
        }
        document.body.append(dialog)
        try { draw(); dialog.showModal() }
        catch (error) { dialog.remove(); reject(error) }
    })
}

module.exports = { cropCatAvatar }
