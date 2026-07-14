export async function postApi(path, body, signal) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const message = payload?.error?.message || `请求失败（${response.status}）`
        throw new Error(message)
    }
    return payload
}
