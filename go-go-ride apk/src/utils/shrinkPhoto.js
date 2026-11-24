/**
 * Shrinks a phone photo to at most `max` pixels on its long side, as a JPEG, so it uploads quickly
 * on mobile data (a 12-megapixel ticket photo becomes about 300 KB). Anything that can't be read
 * as an image is returned unchanged.
 */
export async function shrinkPhoto(file, { max = 1600, quality = 0.82, name = 'photo.jpg' } = {}) {
  if (!file?.type?.startsWith('image/')) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && file.size < 900_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob ? new File([blob], name, { type: 'image/jpeg' }) : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
