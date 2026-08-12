export function mountNativeLoadingSurface(root: HTMLElement): void {
  root.innerHTML = `
    <main class="native-loading" data-testid="native-loading" aria-live="polite">
      <div class="native-loading__mark" aria-hidden="true">✦</div>
      <p class="eyebrow">STARHAVEN / LOCAL RUNTIME</p>
      <h1>Preparing the frontier</h1>
      <p class="native-loading__copy">The native host is connecting to the local match runtime.</p>
      <div class="loading-bar" aria-hidden="true"><span></span></div>
    </main>
  `;
}
