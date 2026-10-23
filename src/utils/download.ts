/** Saves text as a file in the browser. A no-op outside a browser. */
export function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
