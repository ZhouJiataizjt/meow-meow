/* global document, window */
const { ipcRenderer } = require('electron')
const form = document.getElementById('ask-form')
const question = document.getElementById('question')
const submit = document.getElementById('ask')
const example = document.getElementById('recent')
const status = document.getElementById('assistant-status')
const result = document.getElementById('result')
const login = document.getElementById('assistant-login')

function showAnswer({ answer, sources }) {
    document.getElementById('answer').textContent = answer
    const list = document.getElementById('sources')
    list.replaceChildren()
    document.getElementById('evidence').hidden = !sources.length
    for (const record of sources) {
        const item = document.createElement('li')
        const details = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = `[${record.reference}] ${record.name || record.title || '观察记录'}`
        const metadata = document.createElement('small')
        metadata.textContent = [record.location, record.observedAt.replace('T', ' ')]
            .filter(Boolean).join(' · ')
        details.append(title, metadata)
        item.append(details)
        if (Number.isFinite(record.lat) && Number.isFinite(record.lng) && window.parent !== window) {
            const locate = document.createElement('button')
            locate.type = 'button'
            locate.textContent = '在地图上查看'
            locate.addEventListener('click', () => {
                window.parent.postMessage({ type: 'locate-record', record }, '*')
            })
            item.append(locate)
        }
        list.append(item)
    }
    result.hidden = false
}

example.addEventListener('click', () => {
    question.value = example.textContent
    question.focus()
})
login.addEventListener('click', async () => {
    await ipcRenderer.invoke('open_login_window')
})
form.addEventListener('submit', async event => {
    event.preventDefault()
    const value = question.value.trim()
    if (!value || submit.disabled) return
    submit.disabled = true
    example.disabled = true
    question.readOnly = true
    login.hidden = true
    result.hidden = true
    status.textContent = '正在查找公开观察并生成回答…'
    try {
        const reply = await ipcRenderer.invoke('ask_cat_assistant', value)
        if (reply.error) {
            status.textContent = reply.error
            login.hidden = !reply.needsLogin
        } else {
            showAnswer(reply)
            status.textContent = '回答已生成。'
        }
    } catch {
        status.textContent = '暂时无法获取回答，请稍后重试。'
    } finally {
        submit.disabled = false
        example.disabled = false
        question.readOnly = false
    }
})
