const fs = require('fs')
const path = require('path')

// 首次使用时迁移旧数据；已有用户数据永远优先，不覆盖或清空。
function initializeLocalStore(userData, legacyDir) {
    const directory = path.join(userData, 'data')
    fs.mkdirSync(directory, { recursive: true })
    const files = {}
    for (const name of ['records', 'map_records', 'cats']) {
        const target = path.join(directory, `${name}.json`)
        if (!fs.existsSync(target)) {
            const source = path.join(legacyDir, `${name}.json`)
            const content = fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : '[]'
            if (!Array.isArray(JSON.parse(content))) throw new Error(`${name} 数据格式错误，未迁移`)
            fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' })
        }
        files[name] = target
    }
    return files
}

module.exports = { initializeLocalStore }
