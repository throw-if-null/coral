import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (import.meta.env.SSR) return
    setupMermaidZoom()
  },
}

// Click a Mermaid diagram to pop it open in a full-screen lightbox.
// Delegated on `document` so it survives SPA route changes and covers
// diagrams rendered later. Clones the rendered SVG (keeps its theme).
function setupMermaidZoom() {
  if (window.__coralMermaidZoom) return
  window.__coralMermaidZoom = true

  const overlay = document.createElement('div')
  overlay.className = 'coral-zoom-overlay'
  const inner = document.createElement('div')
  inner.className = 'coral-zoom-inner'
  overlay.appendChild(inner)
  document.body.appendChild(overlay)

  const close = () => {
    overlay.classList.remove('active')
    inner.innerHTML = ''
  }
  overlay.addEventListener('click', close)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })

  document.addEventListener('click', (e) => {
    const t = e.target
    if (!(t instanceof Element) || t.closest('.coral-zoom-overlay')) return
    const box = t.closest('.mermaid')
    const svg = box && box.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true)
    clone.removeAttribute('width')
    clone.removeAttribute('height')
    inner.innerHTML = ''
    inner.appendChild(clone)
    overlay.classList.add('active')
  })
}
