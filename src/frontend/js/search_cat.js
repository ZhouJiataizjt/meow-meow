async function search_cat() {
    await ipcRenderer.invoke('search_cat_newpage')
}

async function area_search() {
    await ipcRenderer.invoke('area_search')
}

async function name_search() {
    await ipcRenderer.invoke('name_search')
}
