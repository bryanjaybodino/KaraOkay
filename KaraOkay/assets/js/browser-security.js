let triggered = !1; function blockAction(message) { if (triggered) return; triggered = !0; alert(message); window.location.href = "about:blank" }
document.addEventListener('contextmenu', function (e) { e.preventDefault() }); document.addEventListener('keydown', function (e) {
    if (e.keyCode === 123) { e.preventDefault(); blockAction("Developer tools blocked") }
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) { e.preventDefault(); blockAction("Developer tools blocked") }
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) { e.preventDefault(); blockAction("Console blocked") }
    if (e.ctrlKey && e.shiftKey && e.keyCode === 67) { e.preventDefault(); blockAction("Inspect Element blocked") }
    if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); blockAction("View source blocked") }
}); setInterval(() => { const widthDiff = window.outerWidth - window.innerWidth; const heightDiff = window.outerHeight - window.innerHeight; const suspiciousResize = widthDiff > 200 || heightDiff > 200; const start = performance.now(); debugger; const slowExecution = performance.now() - start > 50; if (suspiciousResize && slowExecution) { blockAction("DevTools suspected") } }, 10)