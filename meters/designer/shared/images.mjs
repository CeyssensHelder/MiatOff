// SPDX-License-Identifier: GPL-3.0-or-later
export async function normalizeImage(
  file,
  {
    types = ["image/png", "image/jpeg"],
    maxBytes = 10 * 1024 * 1024,
    maxPixels = 16000000,
    width: boundW = 800,
    height: boundH = 480,
  } = {},
) {
  if (!types.includes(file.type) || file.size > maxBytes)
    throw Error("Choose PNG/JPEG up to 10 MiB");
  const b = new Uint8Array(await file.arrayBuffer());
  let width = 0,
    height = 0;
  if (file.type === "image/png" && b.length >= 24) {
    const v = new DataView(b.buffer);
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else
    for (let i = 2; i + 8 < b.length; ) {
      if (b[i] !== 255) {
        i++;
        continue;
      }
      const mark = b[i + 1],
        len = b[i + 2] * 256 + b[i + 3];
      if ([192, 193, 194].includes(mark)) {
        height = b[i + 5] * 256 + b[i + 6];
        width = b[i + 7] * 256 + b[i + 8];
        break;
      }
      if (len < 2) break;
      i += len + 2;
    }
  if (
    file.type !== "image/webp" &&
    (!width || !height || width * height > maxPixels)
  )
    throw Error("Invalid image or more than 16 megapixels");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > maxPixels)
      throw Error("More than 16 megapixels");
    const scale = Math.min(1, boundW / bitmap.width, boundH / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 2097152) throw Error("Normalized image exceeds 1.5 MiB");
    return { data, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
