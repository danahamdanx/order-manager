// بنصغّر الصورة (أطول ضلع 900px) ونحولها JPEG، فصور الموبايل الكبيرة بتصير خفيفة
export async function resizeImage(file: File, maxSide = 900): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported in this browser');
  ctx.fillStyle = '#ffffff'; // الصور الشفافة (PNG) بتصير على خلفية بيضا مش سودا
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // إذا طلعت كبيرة، بنقلل الجودة لحد ما تصير تحت 700KB
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 700_000) return blob;
  }
  throw new Error('The image is too large. Try a smaller one.');
}