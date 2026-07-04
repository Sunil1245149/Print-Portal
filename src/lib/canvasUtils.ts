/**
 * Canvas Utilities for Image Processing, Filtering,
 * Background Color Swapping, and Layout Tiling.
 */

// Interface for passport settings
export interface PhotoSettings {
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  saturation: number;   // -100 to 100
  backgroundColor: string; // Hex color
  borderColor: string;  // 'none' | 'black' | 'white'
  fuzziness: number;    // 0 to 100 for background keying
  cropX: number;        // Percentage
  cropY: number;
  cropScale: number;    // 0.5 to 2.0
}

export interface DocSettings {
  brightness: number;
  contrast: number;
  grayscale: boolean;
  sharpen: boolean;
  threshold: boolean;
  padding: number;      // margin on A4
}

/**
 * Apply standard brightness/contrast/saturation filters to an image data object
 */
export function applyFilters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
  saturation: number
) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Convert settings
  const bVal = brightness; // -100 to 100
  const cVal = (contrast + 100) / 100; // 0 to 2
  const sVal = (saturation + 100) / 100; // 0 to 2

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Brightness
    r += bVal;
    g += bVal;
    b += bVal;

    // 2. Contrast
    r = (r - 128) * cVal + 128;
    g = (g - 128) * cVal + 128;
    b = (b - 128) * cVal + 128;

    // 3. Saturation (HSL-like logic)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sVal;
    g = gray + (g - gray) * sVal;
    b = gray + (b - gray) * sVal;

    // Clamp values
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Chroma-key style background replacement.
 * Uses the top-left corner pixel (usually background) as the reference color.
 */
export function replaceBackgroundColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  targetBgColorHex: string,
  fuzziness: number
) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Parse target color
  const targetR = parseInt(targetBgColorHex.slice(1, 3), 16);
  const targetG = parseInt(targetBgColorHex.slice(3, 5), 16);
  const targetB = parseInt(targetBgColorHex.slice(5, 7), 16);

  // Sample reference background color from the edges (average of top-left, top-right, and a few edge pixels)
  const refColors = [
    [data[0], data[1], data[2]],
    [data[(width - 1) * 4], data[(width - 1) * 4 + 1], data[(width - 1) * 4 + 2]],
    [data[4], data[5], data[6]],
    [data[8], data[9], data[10]],
  ];

  // Average reference background color
  const refR = refColors.reduce((sum, c) => sum + c[0], 0) / refColors.length;
  const refG = refColors.reduce((sum, c) => sum + c[1], 0) / refColors.length;
  const refB = refColors.reduce((sum, c) => sum + c[2], 0) / refColors.length;

  const threshold = fuzziness * 1.5; // Scale fuzziness slider

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate color distance
    const dist = Math.sqrt(
      Math.pow(r - refR, 2) + Math.pow(g - refG, 2) + Math.pow(b - refB, 2)
    );

    if (dist < threshold) {
      // Direct replacement for background pixels
      data[i] = targetR;
      data[i + 1] = targetG;
      data[i + 2] = targetB;
    } else if (dist < threshold + 15) {
      // Blend edge pixels slightly to prevent jagged boundaries
      const ratio = (dist - threshold) / 15;
      data[i] = Math.round(targetR * (1 - ratio) + r * ratio);
      data[i + 1] = Math.round(targetG * (1 - ratio) + g * ratio);
      data[i + 2] = Math.round(targetB * (1 - ratio) + b * ratio);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Creates 8 passport-size photos structured cleanly on a 4x6 photo paper sheet.
 * Standard 4x6 aspect ratio is 1.5 (Landscape: 1800x1200 px).
 * Each individual passport image is standard ratio 3.5 : 4.5.
 */
export function create8CopySheet(
  passportImgUrl: string,
  callback: (dataUrl: string) => void
) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    // Set high-res 4x6 dimensions (e.g., 1800 x 1200)
    canvas.width = 1800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white glossy photography paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw safety margins / cut-lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
    ctx.setLineDash([]);

    // Grid details: 2 rows, 4 columns
    // Calculated cell proportions for perfect fit with gaps
    const cols = 4;
    const rows = 2;
    const totalWidthAvailable = canvas.width - 120; // 60px padding on left/right
    const totalHeightAvailable = canvas.height - 120; // 60px padding on top/bottom

    const gapX = 40; // Horizontal gap between photos
    const gapY = 50; // Vertical gap

    // Calculate width & height of each passport card based on 3.5:4.5 aspect ratio
    // Target height per row = (totalHeightAvailable - (rows - 1)*gapY) / rows
    const cardHeight = (totalHeightAvailable - (rows - 1) * gapY) / rows; // ~495px
    const cardWidth = cardHeight * (3.5 / 4.5); // ~385px

    // Shift whole grid to center of sheet
    const gridWidth = cols * cardWidth + (cols - 1) * gapX;
    const gridHeight = rows * cardHeight + (rows - 1) * gapY;
    const startX = (canvas.width - gridWidth) / 2;
    const startY = (canvas.height - gridHeight) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (cardWidth + gapX);
        const y = startY + r * (cardHeight + gapY);

        // Draw shadow/border container for alignment
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, cardWidth, cardHeight);

        // Draw the processed passport image
        ctx.drawImage(img, x, y, cardWidth, cardHeight);

        // Draw a ultra-fine guide border around each passport photo for easy cutting
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cardWidth, cardHeight);

        // Tiny indicator texts for cutting
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('✂', x - 12, y - 5);
      }
    }

    // Add watermark or metadata at the extremely thin border
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 14px monospace';
    ctx.fillText('SMART PRINT UTILITY • 4x6 GLOSSY PAPER LAYOUT (8 PASSPORTS)', 60, canvas.height - 20);
    ctx.fillText('DATE: JULY 2026', canvas.width - 220, canvas.height - 20);

    callback(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = passportImgUrl;
}

/**
 * Places a Document or ID Card on a simulated vertical A4 page (width: 1200, height: 1697)
 * with perfect sizing and print borders. Supports Front & Back of ID cards.
 */
export function createA4DocumentSheet(
  sourceImgUrl: string,
  isIDCard: boolean,
  callback: (dataUrl: string) => void,
  backImgUrl?: string,
  idSettings?: {
    idFrontCropX?: number;
    idFrontCropY?: number;
    idFrontScale?: number;
    idBackCropX?: number;
    idBackCropY?: number;
    idBackScale?: number;
    idFrontYOffset?: number;
    idBackYOffset?: number;
  }
) {
  const canvas = document.createElement('canvas');
  // Standard A4 aspect ratio at screen/print resolution: 1200 x 1697
  canvas.width = 1200;
  canvas.height = 1697;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fill white paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imgFront = new Image();
  imgFront.crossOrigin = 'anonymous';
  
  imgFront.onload = () => {
    if (isIDCard && backImgUrl) {
      const imgBack = new Image();
      imgBack.crossOrigin = 'anonymous';
      imgBack.onload = () => {
        drawA4Sheet(imgFront, imgBack);
      };
      imgBack.onerror = () => {
        drawA4Sheet(imgFront, null);
      };
      imgBack.src = backImgUrl;
    } else {
      drawA4Sheet(imgFront, null);
    }
  };
  
  imgFront.onerror = () => {
    callback(canvas.toDataURL('image/jpeg', 0.85));
  };
  imgFront.src = sourceImgUrl;

  function drawAutoCroppedIDCard(
    c: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    cropX: number = 0,
    cropY: number = 0,
    scale: number = 1
  ) {
    const targetRatio = w / h;
    let sWidth = img.width;
    let sHeight = img.width / targetRatio;
    
    if (sHeight > img.height) {
      sHeight = img.height;
      sWidth = img.height * targetRatio;
    }
    
    // Apply zoom scale
    const finalSWidth = sWidth / scale;
    const finalSHeight = sHeight / scale;

    // Shift crop offset based on sliders (centered by default)
    const sx = (img.width - finalSWidth) / 2 + (cropX / 100) * img.width;
    const sy = (img.height - finalSHeight) / 2 + (cropY / 100) * img.height;
    
    c.drawImage(
      img,
      Math.max(0, Math.min(img.width - finalSWidth, sx)),
      Math.max(0, Math.min(img.height - finalSHeight, sy)),
      finalSWidth,
      finalSHeight,
      x,
      y,
      w,
      h
    );
  }

  function drawA4Sheet(front: HTMLImageElement, back: HTMLImageElement | null) {
    if (isIDCard) {
      // 1. FRONT CARD SIZE (standard ID card proportion: 85.6mm x 53.98mm -> 1.58 ratio)
      const idWidth = canvas.width * 0.45; // 540px
      const idHeight = idWidth * (53.98 / 85.6); // ~340px
      const idX = (canvas.width - idWidth) / 2;
      
      // Place Front at top center (default offset is 260px from top, adjustable)
      const frontY = 260 + (idSettings?.idFrontYOffset ?? 0); 

      // Draw center-cropped front card with sliders
      drawAutoCroppedIDCard(
        ctx, 
        front, 
        idX, 
        frontY, 
        idWidth, 
        idHeight, 
        idSettings?.idFrontCropX ?? 0, 
        idSettings?.idFrontCropY ?? 0, 
        idSettings?.idFrontScale ?? 1
      );

      // Fine border frame around Front side
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(idX, frontY, idWidth, idHeight);

      // 2. BACK CARD SIZE
      // Place Back at bottom center (default: 180px gap below Front, adjustable)
      const backY = frontY + idHeight + 180 + (idSettings?.idBackYOffset ?? 0);
      
      if (back) {
        // Draw center-cropped back card with sliders
        drawAutoCroppedIDCard(
          ctx, 
          back, 
          idX, 
          backY, 
          idWidth, 
          idHeight, 
          idSettings?.idBackCropX ?? 0, 
          idSettings?.idBackCropY ?? 0, 
          idSettings?.idBackScale ?? 1
        );
        
        // Fine border frame around Back side
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(idX, backY, idWidth, idHeight);
      } else {
        // Fallback placeholder container if Back is not supplied
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(idX, backY, idWidth, idHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(idX, backY, idWidth, idHeight);
      }
    } else {
      // Standard A4 full document scan fitting (no margins, full clean print layout)
      const docMargin = 40;
      const docWidth = canvas.width - (docMargin * 2);
      const docHeight = canvas.height - (docMargin * 2);

      // Draw the document stretched/fitted perfectly on the A4 page
      ctx.drawImage(front, docMargin, docMargin, docWidth, docHeight);
    }

    callback(canvas.toDataURL('image/jpeg', 0.85));
  }
}

/**
 * Creates 4 passport-size photos structured cleanly on the top half of a 4x6 photo paper sheet.
 * Standard portrait 4x6 aspect ratio is 1.5 (Portrait: 1200x1800 px).
 */
export function create4CopySheet(
  passportImgUrl: string,
  callback: (dataUrl: string) => void
) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2 rows, 2 columns of passport photos in the top half
    const cols = 2;
    const rows = 2;
    const cardWidth = 385;  // Matches 8-copy size
    const cardHeight = 495; // 3.5:4.5 proportion

    const gapX = 80;
    const gapY = 80;

    // Center horizontally
    const gridWidth = cols * cardWidth + (cols - 1) * gapX;
    const startX = (canvas.width - gridWidth) / 2;
    const startY = 100; // Top margin

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (cardWidth + gapX);
        const y = startY + r * (cardHeight + gapY);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, cardWidth, cardHeight);

        // Draw image
        ctx.drawImage(img, x, y, cardWidth, cardHeight);

        // Thin guide border around each passport photo
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cardWidth, cardHeight);

        // Scissors guide indicator
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('✂', x - 12, y - 5);
      }
    }

    callback(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = passportImgUrl;
}

/**
 * Scans an ID card image to automatically calculate optimal scale and crop offsets to center and isolate the card.
 */
export function autoDetectIDCardSettings(imgUrl: string): Promise<{ cropX: number; cropY: number; scale: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 120; // Fast downscaled analysis
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ cropX: 0, cropY: 0, scale: 1.15 });
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      
      let imgData;
      try {
        imgData = ctx.getImageData(0, 0, size, size);
      } catch (e) {
        resolve({ cropX: 0, cropY: 0, scale: 1.15 });
        return;
      }

      const data = imgData.data;

      // Sample background color from 4 corners
      const corners = [
        [0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]
      ];
      let bgR = 0, bgG = 0, bgB = 0;
      corners.forEach(([x, y]) => {
        const idx = (y * size + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
      });
      bgR /= 4; bgG /= 4; bgB /= 4;

      // Scan and find bounding box of pixels deviating from corners
      let minX = size, maxX = 0, minY = size, maxY = 0;
      let foregroundCount = 0;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const dist = Math.sqrt(
            Math.pow(r - bgR, 2) + 
            Math.pow(g - bgG, 2) + 
            Math.pow(b - bgB, 2)
          );

          if (dist > 25) { 
            foregroundCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (foregroundCount < (size * size * 0.04)) {
        resolve({ cropX: 0, cropY: 0, scale: 1.15 });
        return;
      }

      // No padding for edge-to-edge look
      const padding = 0; 
      minX = Math.max(0, minX - padding);
      maxX = Math.min(size - 1, maxX + padding);
      minY = Math.max(0, minY - padding);
      maxY = Math.min(size - 1, maxY + padding);

      const boxW = maxX - minX;
      const boxH = maxY - minY;

      if (boxW < size * 0.1 || boxH < size * 0.1) {
        resolve({ cropX: 0, cropY: 0, scale: 1.15 });
        return;
      }

      const centerXPercent = ((minX + maxX) / 2) / size;
      const centerYPercent = ((minY + maxY) / 2) / size;

      const cropXVal = Math.round((centerXPercent - 0.5) * 100);
      const cropYVal = Math.round((centerYPercent - 0.5) * 100);

      const scaleX = size / boxW;
      const scaleY = size / boxH;
      let detectedScale = Math.min(scaleX, scaleY);

      // Scale to exact fit
      detectedScale = Math.max(1.0, Math.min(2.5, Number(detectedScale.toFixed(2))));

      resolve({
        cropX: cropXVal,
        cropY: cropYVal,
        scale: detectedScale
      });
    };

    img.onerror = () => {
      resolve({ cropX: 0, cropY: 0, scale: 1.15 });
    };

    img.src = imgUrl;
  });
}
