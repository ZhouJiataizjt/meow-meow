// 地图观察和普通观察共用同一份猫咪档案，关联使用固定 ID 而非昵称。
function createCatPicker(container, ipcRenderer) {
    container.innerHTML = `
        <label>这次遇见的猫咪</label>
        <label style="display:block">搜索已有猫咪
            <input data-cat-search type="search" maxlength="170" placeholder="输入猫咪名字或完整 ID" style="width:100%;box-sizing:border-box;">
        </label>
        <p style="font-size:12px;margin:6px 0;">先搜索已有档案，核对花色、特征和 ID。保存观察后，这只猫会自动进入你的猫咪档案。</p>
        <select aria-label="选择遇见的猫咪" data-cat-select style="width:100%;margin-bottom:8px;"></select>
        <button type="button" data-cat-more hidden>加载更多搜索结果</button>
        <div data-cat-id style="font-size:12px;color:#77665c;overflow-wrap:anywhere;"></div>
        <button type="button" data-cat-new>＋ 没见过这只猫，新建档案</button>
        <div data-cat-form hidden style="padding:12px;background:#fff4e8;border-radius:10px;margin-top:8px;">
            <label>昵称（必填）<input data-cat-name type="text" maxlength="80" placeholder="例如：大橘"></label>
            <label>品种/花色<input data-cat-species type="text" placeholder="例如：橘白猫"></label>
            <label>识别特征<input data-cat-features type="text" placeholder="例如：左耳缺角、鼻尖有黑点"></label>
            <p style="font-size:12px;">创建后会分配固定 ID，并自动选中。其他用户也能搜索并记录这只猫，请先确认搜索结果中没有它。</p>
            <button type="button" data-cat-create>创建并选中</button>
            <button type="button" data-cat-cancel>取消新建</button>
        </div>
        <div data-cat-status role="status" style="font-size:12px;color:#91613e;"></div>`
    const get = name => container.querySelector(`[data-cat-${name}]`)
    let cats = []
    let desiredId = ''
    let selectedCat = null
    let nextOffset = null
    let searchTimer
    let loading = false
    let revision = 0
    function describe() {
        const cat = cats.find(c => String(c.id) === get('select').value)
        get('id').textContent = cat ? `固定 ID：${cat.id} · ${cat.species || '花色未填写'} · ${cat.features || '特征未填写'}` : ''
    }
    function render() {
        const select = get('select')
        select.replaceChildren()
        const option = (value, label) => {
            const node = container.ownerDocument.createElement('option')
            node.value = value
            node.textContent = label
            select.appendChild(node)
        }
        option('', '未确认猫咪（可稍后关联）')
        for (const cat of cats) option(String(cat.id), `${cat.name} · ${cat.species || '未知花色'} · ${cat.features || '暂无特征'} · ID: ${cat.id}`)
        if (desiredId && !cats.some(c => String(c.id) === desiredId)) option(desiredId, `原关联档案 · ID: ${desiredId}`)
        select.value = desiredId
        describe()
    }
    async function reload(id = desiredId) {
        const current = ++revision
        desiredId = String(id ?? '')
        loading = true
        try {
            const result = await ipcRenderer.invoke('get_cats') || []
            if (current !== revision) return
            cats = result
            selectedCat = cats.find(cat => String(cat.id) === desiredId) || null
            nextOffset = null
            get('more').hidden = true
            render()
        } finally { if (current === revision) loading = false }
    }
    async function search(append = false) {
        const term = get('search').value.trim()
        if (!term) { await reload(); get('status').textContent = ''; return }
        const current = ++revision
        loading = true
        get('more').disabled = true
        get('status').textContent = '正在搜索猫咪…'
        try {
            const page = await ipcRenderer.invoke('search_cats', term, append ? nextOffset : 0)
            if (current !== revision) return
            const results = append ? [...cats, ...page.items] : page.items
            if (selectedCat) results.unshift(selectedCat)
            cats = [...new Map(results.map(cat => [String(cat.id), cat])).values()]
            nextOffset = page.nextOffset
            get('more').hidden = nextOffset === null
            render()
            get('status').textContent = page.items.length ? `已找到猫咪，请核对特征后选择。${nextOffset !== null ? '还有更多结果，可继续加载或输入更完整的名字。' : ''}` : '没有找到匹配的猫咪。换个名字或 ID 试试，确认没有后再新建档案。'
        } catch (error) {
            if (current === revision) get('status').textContent = '搜索失败，请重试：' + error.message
        } finally {
            if (current === revision) { loading = false; get('more').disabled = false }
        }
    }
    get('search').addEventListener('input', () => {
        clearTimeout(searchTimer)
        revision++
        // Invalidate in-flight responses immediately, before the debounce expires.
        searchTimer = setTimeout(() => { search().catch(error => { get('status').textContent = error.message }) }, 250)
    })
    get('more').addEventListener('click', () => search(true))
    get('select').addEventListener('change', () => {
        desiredId = get('select').value
        selectedCat = cats.find(cat => String(cat.id) === desiredId) || null
        describe()
    })
    get('new').addEventListener('click', () => { get('form').hidden = false; get('name').focus() })
    get('cancel').addEventListener('click', () => { get('form').hidden = true; get('select').focus() })
    get('create').addEventListener('click', async () => {
        const name = get('name').value.trim()
        if (!name) { get('status').textContent = '请先输入猫咪昵称。'; get('name').focus(); return }
        get('create').disabled = true
        get('status').textContent = '正在创建档案…'
        try {
            const cat = await ipcRenderer.invoke('add_cat', {
                name, species: get('species').value.trim(), features: get('features').value.trim(), notes: ''
            })
            if (!cat?.id) throw new Error('未取得猫咪 ID')
            revision++
            loading = false
            cats.push(cat)
            selectedCat = cat
            desiredId = String(cat.id)
            render()
            clearTimeout(searchTimer)
            get('search').value = ''
            get('form').hidden = true
            for (const field of ['name', 'species', 'features']) get(field).value = ''
            get('select').focus()
            get('status').textContent = `已创建并选中「${cat.name}」，请继续保存观察记录。`
        } catch (error) {
            get('status').textContent = `创建失败：${error.message}`
        } finally { get('create').disabled = false }
    })
    return {
        get value() { return get('select').value || null },
        validate() {
            if (loading || get('create').disabled) throw new Error('猫咪档案正在加载或创建，请稍候')
            if (!get('form').hidden) throw new Error('请先点击“创建并选中”，或取消新建猫咪档案')
        },
        async setValue(id = '') {
            clearTimeout(searchTimer)
            get('search').value = ''
            get('form').hidden = true
            for (const field of ['name', 'species', 'features']) get(field).value = ''
            get('status').textContent = ''
            try { await reload(id) } catch (error) { get('status').textContent = `档案加载失败：${error.message}` }
        }
    }
}

module.exports = { createCatPicker }
