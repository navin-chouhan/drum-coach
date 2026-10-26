/** Saves data to a file the student picks (the browser's download): nothing leaves the laptop otherwise. */
export function saveFile(name: string, data: Blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(data), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
