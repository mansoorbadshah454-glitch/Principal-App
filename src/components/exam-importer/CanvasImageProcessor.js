/**
 * CanvasImageProcessor.js
 * High-performance client-side image processing for offline handwritten broadsheet registers.
 * Zero external libraries (Pure HTML5 Canvas).
 */

/**
 * Resizes an image to optimal OCR dimensions (max dimension ~1600px)
 * and compresses it to high-quality JPEG (~250KB-350KB) for sub-second upload to Gemini.
 */
export async function optimizeAndCompressImage(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve({
                    base64: compressedBase64,
                    width,
                    height,
                    previewUrl: e.target.result
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Blur Detection using Laplacian Variance on an offscreen Canvas.
 * Computes the variance of the Laplacian convolution operator.
 * Motion blur or out-of-focus broadsheets have a significantly lower variance.
 * Threshold: Typically values < 100 indicate high error risk / blurry document.
 */
export async function detectImageBlur(base64Image, threshold = 110) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Downsample slightly for ultra-fast 20ms computation
            const sampleWidth = Math.min(600, img.width);
            const sampleHeight = Math.round((img.height * sampleWidth) / img.width);

            const canvas = document.createElement('canvas');
            canvas.width = sampleWidth;
            canvas.height = sampleHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

            const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
            const data = imgData.data;

            // Convert to grayscale luminance
            const gray = new Float32Array(sampleWidth * sampleHeight);
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }

            // Apply 3x3 Laplacian Kernel:
            // [ 0,  1,  0 ]
            // [ 1, -4,  1 ]
            // [ 0,  1,  0 ]
            let sum = 0;
            let sumSq = 0;
            let count = 0;

            for (let y = 1; y < sampleHeight - 1; y++) {
                const row = y * sampleWidth;
                for (let x = 1; x < sampleWidth - 1; x++) {
                    const idx = row + x;
                    const lap =
                        gray[idx - sampleWidth] +
                        gray[idx + sampleWidth] +
                        gray[idx - 1] +
                        gray[idx + 1] -
                        4 * gray[idx];

                    sum += lap;
                    sumSq += lap * lap;
                    count++;
                }
            }

            const mean = sum / count;
            const variance = (sumSq / count) - (mean * mean);
            const isBlurry = variance < threshold;

            resolve({
                isBlurry,
                variance: Math.round(variance),
                threshold
            });
        };
        img.onerror = () => resolve({ isBlurry: false, variance: 999, threshold });
        img.src = base64Image;
    });
}

/**
 * High-Contrast Document Filter:
 * Enhances faint handwritten pencil/pen ink against broadsheet grid paper
 * using adaptive contrast stretching and luminance normalization.
 */
export async function applyHighContrastFilter(base64Image) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            // Find min/max luminance for dynamic range stretching
            let minLum = 255;
            let maxLum = 0;

            for (let i = 0; i < data.length; i += 16) { // step by 16 for speed
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                if (lum < minLum) minLum = lum;
                if (lum > maxLum) maxLum = lum;
            }

            const range = Math.max(1, maxLum - minLum);

            // Apply contrast stretch + slight gamma curve to make ink pop
            for (let i = 0; i < data.length; i += 4) {
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Stretched luminance
                let norm = (lum - minLum) / range;
                // Boost ink contrast (darker darks, cleaner whites)
                norm = norm < 0.5 ? Math.pow(norm * 2, 1.4) / 2 : 1 - Math.pow((1 - norm) * 2, 1.4) / 2;
                const finalVal = Math.min(255, Math.max(0, Math.round(norm * 255)));

                data[i] = finalVal;
                data[i + 1] = finalVal;
                data[i + 2] = finalVal;
            }

            ctx.putImageData(imgData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = base64Image;
    });
}
