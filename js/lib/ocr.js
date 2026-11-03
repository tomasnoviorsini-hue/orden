// Lectura de texto en imágenes (OCR) 100 % local, con Tesseract.js.
// Los archivos están en vendor/tesseract/ (≈ 6 MB) y se descargan recién al primer uso;
// el service worker los guarda en un caché propio para usarlos sin conexión.

const BASE = new URL('../../vendor/tesseract/', import.meta.url).href;

const STATUS_LABELS = {
  'recognizing text': 'Leyendo el texto',
  'loading language traineddata': 'Cargando el idioma',
};

let workerPromise = null;
let onProgress = null;

async function createWorker() {
  const { default: Tesseract } = await import(`${BASE}tesseract.esm.min.js`);
  const worker = await Tesseract.createWorker('spa', Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE, // elige la variante con o sin SIMD según el dispositivo
    langPath: `${BASE}lang`,
    workerBlobURL: false, // así el worker queda bajo el service worker y funciona offline
    cacheMethod: 'none', // el service worker ya guarda los archivos
    logger: ({ status, progress }) =>
      onProgress?.({ label: STATUS_LABELS[status] ?? 'Preparando el lector', progress: progress ?? 0 }),
  });
  // Modo "una columna de texto": mantiene en la misma línea la descripción y el monto alineado a la derecha.
  await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
  return worker;
}

function getWorker() {
  workerPromise ??= createWorker().catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

const MIN_WIDTH = 1000;
const MAX_WIDTH = 2400;

/** Escala de grises, tamaño adecuado y texto oscuro sobre fondo claro (invierte capturas en modo oscuro). */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(MAX_WIDTH / bitmap.width, Math.max(1, MIN_WIDTH / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
    sum += gray;
  }
  if (sum / (data.length / 4) < 128) {
    for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 255 - data[i];
  }
  ctx.putImageData(image, 0, 0);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))), 'image/png')
  );
}

/**
 * Devuelve el texto de la imagen, línea por línea.
 * progress recibe { label, progress (0–1) }.
 */
export async function recognizeImage(file, progress) {
  onProgress = progress;
  try {
    const [worker, image] = await Promise.all([getWorker(), prepareImage(file)]);
    const { data } = await worker.recognize(image);
    return data.text;
  } catch (error) {
    if (!navigator.onLine && !workerPromise) {
      throw new Error('La primera vez se necesita conexión para descargar el lector de capturas.');
    }
    throw error;
  } finally {
    onProgress = null;
  }
}

/** Libera la memoria del lector (se vuelve a crear en el próximo uso). */
export async function releaseOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) (await pending.catch(() => null))?.terminate();
}
