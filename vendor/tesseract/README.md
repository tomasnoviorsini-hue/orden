# Tesseract.js (copia local para el OCR offline)

- `tesseract.esm.min.js`, `worker.min.js`: tesseract.js 6.0.1 (Apache-2.0)
- `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js`: tesseract.js-core 6.0.0 (Apache-2.0)
- `lang/spa.traineddata.gz`: @tesseract.js-data/spa 1.0.0, variante `4.0.0_best_int` (Apache-2.0)

Se descargan con `npm pack` y se copian tal cual (sin la línea `sourceMappingURL`).
El service worker los guarda en un caché propio la primera vez que se usa el lector de capturas.
