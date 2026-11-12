// Checks that run inside the program's main window, injected by the
// debug-only MAGNOLIA_AUTOMATION hook (src-tauri/src/automation.rs).
// ui-check.mjs prepends OUT (where photos go) and reads the log lines:
// "ISSUE …" is a failed check, "OK …" a passed one, "CHECK …" one line of
// Program diagnostics, "DIAGNOSTICS {json}" its full data.
;(async () => {
  if (window.top !== window || window.__labiiaChecks) return
  window.__labiiaChecks = true
  await new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r)))
  const call = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args)
  const log = (m) => call('automation_log', { message: String(m) })
  addEventListener('error', (e) => log('JSERROR ' + e.message))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const visible = (el) => !!el && el.offsetParent !== null

  async function waitFor(fn, what, timeout = 20000) {
    const end = Date.now() + timeout
    for (;;) {
      const v = fn()
      if (v) return v
      if (Date.now() > end) throw new Error('timed out waiting for ' + what)
      await sleep(250)
    }
  }
  function press(el) {
    for (const t of ['mousedown', 'mouseup']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }))
    el.click()
  }
  /** A photo of the window (only on a Mac; elsewhere the check goes on without it). */
  async function shot(name) {
    await sleep(800)
    try {
      await call('automation_capture', { path: `${OUT}/${name}.png` })
    } catch (e) {
      await log(`INFO no photo ${name}: ${e}`)
    }
  }
  const buttonWithText = (text, root = document) =>
    [...root.querySelectorAll('button')].find((b) => visible(b) && b.textContent.trim().includes(text))

  async function diagnostics() {
    press(await waitFor(() => document.querySelector('.start-button'), 'the Start button'))
    await sleep(500)
    const item = await waitFor(() => [...document.querySelectorAll('.start-menu-action')].find((b) => b.textContent.includes('Diagnóstico do programa')), 'Diagnóstico do programa in Start')
    press(item)
    // R and its packages are checked too: a first run on a fresh Mac is slow.
    await waitFor(() => document.querySelector('.labiia-diag-list'), 'the diagnostics list', 6 * 60 * 1000)
    let bad = 0
    for (const li of document.querySelectorAll('.labiia-diag-item')) {
      const state = li.dataset.state
      if (state === 'bad' && !(MODE === 'no-r' && li.dataset.check === 'r')) bad++
      await log(`CHECK ${li.dataset.check} ${state} ${li.innerText.replace(/\s+/g, ' ').trim()}`)
    }
    await log(bad ? `ISSUE diagnostics: ${bad} part(s) marked ✗` : 'OK diagnostics: no part marked ✗')
    if (MODE === 'no-r') {
      const r = document.querySelector('.labiia-diag-item[data-check="r"]')
      await log(r && r.dataset.state === 'bad' ? 'OK diagnostics marks R as missing' : 'ISSUE diagnostics does not mark R as missing')
    }
    await shot('02-diagnostico')
    // The full data, for whoever reads the run's results.
    try {
      const all = await call('labiia_diagnostics', { packages: ['ggplot2'] })
      await log('DIAGNOSTICS ' + JSON.stringify(all))
    } catch (e) {
      await log('ISSUE diagnostics data: ' + e)
    }
    press(buttonWithText('Fechar', document.querySelector('.labiia-diag')))
    await sleep(500)
  }

  /** Opens a lexical analysis from the ribbon, runs it and waits for its result. */
  async function lexical(id, name, timeout) {
    if (ONLY.length && !ONLY.includes(id)) return
    let button = document.querySelector(`.ribbon-btn[data-ribbon-id="${id}"]`)
    for (const tab of document.querySelectorAll('.ribbon-tab')) {
      if (visible(button)) break
      press(tab)
      await sleep(400)
      button = document.querySelector(`.ribbon-btn[data-ribbon-id="${id}"]`)
    }
    if (!visible(button)) throw new Error(`no ribbon button for ${id}`)
    // The analysis opens in a tab of its own; every check below looks only
    // inside it, never at the tabs opened before.
    const before = new Set(document.querySelectorAll('.lex-tab'))
    press(button)
    const tab = await waitFor(() => [...document.querySelectorAll('.lex-tab')].find((t) => !before.has(t) && visible(t)), `the tab of ${id}`)
    const runButton = () => [...tab.querySelectorAll('.lex-run')].find(visible)
    const inTab = (sel) => [...tab.querySelectorAll(sel)].find(visible)
    // Run turns on once the documents and R's packages have been checked.
    await waitFor(() => { const b = runButton(); return b && !b.disabled }, `the Run button of ${id}`, 3 * 60 * 1000)
      .catch(() => {
        const note = [...tab.querySelectorAll('.lex-run-note, .lex-r-panel')].filter(visible).map((n) => n.innerText).join(' | ')
        throw new Error(`${id} cannot run: ${note || 'Run stays disabled'}`)
      })
    // A click while the tab is still settling can be lost: click again until
    // the run starts (Run turns off while an analysis runs).
    for (let attempt = 0; attempt < 5; attempt++) {
      press(runButton())
      const started = await waitFor(() => runButton()?.disabled || inTab('.lex-run-error, .lex-result-head'), `${id} to start`, 8000).catch(() => false)
      if (started) break
      await log(`INFO ${id} did not start on click ${attempt + 1}; clicking again`)
    }
    const end = await waitFor(() => {
      const err = inTab('.lex-run-error')
      if (err) return { error: err.innerText.replace(/\s+/g, ' ') }
      return inTab('.lex-result-head') && !runButton()?.disabled ? { ok: true } : null
    }, `the result of ${id}`, timeout).catch(async (e) => {
      // What the analysis tab showed when time ran out.
      const seen = [...tab.querySelectorAll('.lex-run-row, .lex-section, .lex-progress, .lex-run-progress')]
        .filter(visible).map((n) => n.innerText.replace(/\s+/g, ' ').slice(0, 300))
      await log(`INFO ${id} screen: ${JSON.stringify(seen)}`)
      throw e
    })
    await shot(name)
    await log(end.ok ? `OK ${id} ran and shows its result` : `ISSUE ${id} failed: ${end.error}`)
  }

  /** Without R, an analysis that needs it offers to download R for Mac. */
  async function noR() {
    let button = document.querySelector('.ribbon-btn[data-ribbon-id="wordcloud"]')
    for (const tab of document.querySelectorAll('.ribbon-tab')) {
      if (visible(button)) break
      press(tab)
      await sleep(400)
      button = document.querySelector('.ribbon-btn[data-ribbon-id="wordcloud"]')
    }
    press(button)
    const offer = await waitFor(() => buttonWithText('Baixar o R'), 'the offer to download R', 60000).catch(() => null)
    await shot('03-nuvem-sem-r')
    await log(offer ? `OK without R the analysis offers "${offer.textContent.trim()}"` : 'ISSUE without R there is no offer to download it')
  }

  try {
    await call('automation_set_size', { width: 1400, height: 900 })
    await sleep(6000)
    await shot('01-janela')
    await log('OK main window open: ' + document.title)
    await diagnostics()
    if (MODE === 'no-r') {
      await noR()
      // Analyses without R keep working.
      await lexical('bigrams', '04-bigramas-sem-r', 5 * 60 * 1000)
    } else {
      await lexical('wordcloud', '03-nuvem', 5 * 60 * 1000)
      await lexical('chd', '04-chd', 10 * 60 * 1000)
      await lexical('network-text', '05-rede-textual', 5 * 60 * 1000)
    }
  } catch (e) {
    await log('ISSUE ' + (e && e.message ? e.message : e))
    await shot('99-erro')
  }
  await log('DONE')
  await call('automation_quit')
})()
