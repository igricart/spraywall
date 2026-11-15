// Phone photos are 3-12 MB; the wall only needs ~2400 px to tell holds apart on a zoomed phone.
export const MAX_SIDE = 2400;

export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export async function shrinkPhoto(file) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { w, h } = fitSize(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode photo'))),
      'image/jpeg',
      0.85,
    ),
  );
}
