/**
 * Procedural sample generators to create fully offline, high-quality document and photo assets
 * for testing the Scanner and Merchant portals immediately without requiring external uploads.
 */

// Generate a sample document (Standard A4 Letter size)
export function generateSampleDoc(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Header / Letterhead
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('GLOBAL TECHNOLOGIES INC.', 50, 80);

  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.fillText('120 Business Park Circle, Suite 400, Silicon Valley, CA', 50, 105);
  ctx.fillText('Tel: +1 (555) 019-2834 | Email: contact@globaltech.io', 50, 122);

  // Line separator
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 140);
  ctx.lineTo(550, 140);
  ctx.stroke();

  // Document Title
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('OFFICIAL CERTIFICATE OF COMPLETION', 50, 190);

  // Date
  ctx.fillStyle = '#64748b';
  ctx.font = '12px monospace';
  ctx.fillText('Date: July 01, 2026', 450, 190);

  // Paragraph Text
  ctx.fillStyle = '#334155';
  ctx.font = '14px sans-serif';
  const lines = [
    'This document serves to verify and certify that the bearer has completed the comprehensive',
    'advanced system operations and business processing workflows course. Throughout the duration',
    'of this program, the participant has demonstrated exceptional skill and meticulous attention',
    'to detail in executing multi-portal digital transformations and smart print layouts.',
    '',
    'Furthermore, the bearer is authorized to utilize all automated print channels, merchant tools,',
    'and secure system integration nodes as part of their authorized operational responsibilities.',
    'This certification is valid for a period of three (3) years from the date of issuance.'
  ];

  let y = 240;
  lines.forEach(line => {
    ctx.fillText(line, 50, y);
    y += 24;
  });

  // Table
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(50, y + 20, 500, 120);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(50, y + 20, 500, 120);

  // Table Header
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(50, y + 20, 500, 30);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('MODULE CODE', 70, y + 40);
  ctx.fillText('DESCRIPTION', 220, y + 40);
  ctx.fillText('STATUS', 470, y + 40);

  // Table Rows
  ctx.fillStyle = '#475569';
  ctx.font = '12px monospace';
  ctx.fillText('SYS-OPT-401', 70, y + 75);
  ctx.fillText('IMG-PROC-202', 70, y + 105);

  ctx.fillStyle = '#334155';
  ctx.font = '12px sans-serif';
  ctx.fillText('Full-Stack Digital Archiving Integration', 220, y + 75);
  ctx.fillText('Auto-Enhancement & Tiling Matrices', 220, y + 105);

  ctx.fillStyle = '#16a34a';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('PASSED', 470, y + 75);
  ctx.fillText('EXCELLENT', 470, y + 105);

  // Signature Block
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 16px Courier';
  ctx.fillText('Alexander Mercer', 380, y + 220);
  
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(350, y + 230);
  ctx.lineTo(520, y + 230);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('Authorized Signature', 385, y + 245);

  // Seal Logo
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.arc(120, y + 210, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('OFFICIAL', 98, y + 205);
  ctx.fillText('SEAL', 108, y + 218);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(120, y + 210, 36, 0, Math.PI * 2);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

// Generate a sample National ID Card (standard card proportions)
export function generateSampleID(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 315;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background card base (elegant gradient)
  const grad = ctx.createLinearGradient(0, 0, 500, 315);
  grad.addColorStop(0, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative abstract line art for "security background"
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 40);
    ctx.bezierCurveTo(150, i * 20 + 100, 350, 100 - i * 10, 500, i * 35);
    ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(0, 0, canvas.width, 50);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('IDENTITY CARD • REPUBLIC OF INDIA', 20, 30);

  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('SECURE DOCUMENT • NATIONAL REGISTRY', 330, 30);

  // Golden Chip
  ctx.fillStyle = '#eab308';
  ctx.fillRect(40, 80, 45, 35);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 80, 45, 35);
  // Grid lines on chip
  ctx.beginPath();
  ctx.moveTo(55, 80); ctx.lineTo(55, 115);
  ctx.moveTo(70, 80); ctx.lineTo(70, 115);
  ctx.moveTo(40, 97); ctx.lineTo(85, 97);
  ctx.stroke();

  // Photo Box Placeholder (User's Face)
  ctx.fillStyle = '#334155';
  ctx.fillRect(40, 135, 110, 135);
  ctx.strokeStyle = '#475569';
  ctx.strokeRect(40, 135, 110, 135);

  // Drawing a vector selfie avatar in ID card
  // Background inside photo box
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(42, 137, 106, 131);

  // Face circle
  ctx.fillStyle = '#fbcfe8'; // Skin tone
  ctx.beginPath();
  ctx.arc(95, 195, 25, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillRect(90, 215, 10, 20);

  // Hair
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(95, 190, 26, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(70, 190, 50, 10);

  // Eyes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(87, 195, 3, 0, Math.PI * 2);
  ctx.arc(103, 195, 3, 0, Math.PI * 2);
  ctx.fill();

  // Clothes (Suit)
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.moveTo(55, 268);
  ctx.lineTo(75, 230);
  ctx.lineTo(115, 230);
  ctx.lineTo(135, 268);
  ctx.fill();

  // Tie
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(92, 230);
  ctx.lineTo(98, 230);
  ctx.lineTo(98, 255);
  ctx.lineTo(95, 260);
  ctx.lineTo(92, 255);
  ctx.fill();

  // Information details (Right side)
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  
  ctx.fillText('FULL NAME', 180, 85);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('AMIT KUMAR SHARMA', 180, 100);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('IDENTITY NUMBER', 180, 125);
  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('ID-9843-1102-4759', 180, 140);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('DATE OF BIRTH', 180, 165);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('14/08/1997', 180, 177);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('PLACE OF ISSUE', 310, 165);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('NEW DELHI', 310, 177);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('DATE OF EXPIRY', 180, 205);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('28/11/2034', 180, 217);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('GENDER', 310, 205);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('MALE', 310, 217);

  // Barcode decoration at bottom-right
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(180, 245, 200, 30);
  ctx.fillStyle = '#000000';
  for (let b = 185; b < 370; ) {
    const width = Math.random() > 0.4 ? (Math.random() > 0.5 ? 4 : 2) : 1;
    ctx.fillRect(b, 247, width, 26);
    b += width + (Math.random() > 0.3 ? 2 : 1);
  }

  // Hologram Emblem overlay (semi transparent circle)
  ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
  ctx.beginPath();
  ctx.arc(430, 130, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

// Generate a sample high-quality raw portrait selfie (neutral background) for the passport photo creator
export function generateSamplePortrait(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background: A gradient simulating a standard home wall with slight shadowing
  const bgGrad = ctx.createRadialGradient(200, 200, 10, 200, 250, 300);
  bgGrad.addColorStop(0, '#e2e8f0');
  bgGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft shoulder/clothing
  ctx.fillStyle = '#1e293b'; // Slate shirt
  ctx.beginPath();
  ctx.moveTo(60, 500);
  ctx.bezierCurveTo(100, 370, 300, 370, 340, 500);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = '#fbcfe8'; // Skin tone
  ctx.fillRect(175, 290, 50, 100);

  // Shadow under chin
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.ellipse(200, 305, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head/Face shape
  ctx.fillStyle = '#fbcfe8'; // Skin tone
  ctx.beginPath();
  ctx.ellipse(200, 200, 75, 100, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.arc(122, 200, 15, 0, Math.PI * 2); // Left ear
  ctx.arc(278, 200, 15, 0, Math.PI * 2); // Right ear
  ctx.fill();

  // Hair style (black, detailed silhouette)
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(200, 140, 80, Math.PI, 0); // Top dome hair
  ctx.fill();
  // Hair sideburns and spikes
  ctx.beginPath();
  ctx.moveTo(125, 180);
  ctx.lineTo(120, 210);
  ctx.lineTo(135, 200);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(275, 180);
  ctx.lineTo(280, 210);
  ctx.lineTo(265, 200);
  ctx.closePath();
  ctx.fill();

  // Fringe/Hair sweep
  ctx.beginPath();
  ctx.moveTo(130, 140);
  ctx.quadraticCurveTo(200, 120, 270, 150);
  ctx.quadraticCurveTo(200, 160, 130, 140);
  ctx.fill();

  // Eyebrows
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(155, 175); ctx.quadraticCurveTo(170, 168, 185, 172); // Left
  ctx.moveTo(215, 172); ctx.quadraticCurveTo(230, 168, 245, 175); // Right
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(170, 195, 12, 8, 0, 0, Math.PI * 2); // Left eye
  ctx.ellipse(230, 195, 12, 8, 0, 0, Math.PI * 2); // Right eye
  ctx.fill();

  // Pupils (Dark Brown/Black)
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(170, 195, 6, 0, Math.PI * 2);
  ctx.arc(230, 195, 6, 0, Math.PI * 2);
  ctx.fill();

  // Catch lights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(168, 193, 2, 0, Math.PI * 2);
  ctx.arc(228, 193, 2, 0, Math.PI * 2);
  ctx.fill();

  // Nose (simple dynamic lines)
  ctx.strokeStyle = '#f472b6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(200, 190);
  ctx.lineTo(200, 235);
  ctx.lineTo(208, 235);
  ctx.stroke();

  // Smile / Lips
  ctx.strokeStyle = '#e11d48'; // Rosy red
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(180, 260);
  ctx.quadraticCurveTo(200, 275, 220, 260); // Smile line
  ctx.stroke();

  // Collar line (v-neck detail)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 420);
  ctx.lineTo(200, 450);
  ctx.lineTo(220, 420);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

// Generate a sample National ID Card Back side (standard card proportions)
export function generateSampleIDBack(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 315;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background card base (matching elegant gradient)
  const grad = ctx.createLinearGradient(0, 0, 500, 315);
  grad.addColorStop(0, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Security background patterns
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 60, 0);
    ctx.quadraticCurveTo(250, 150 + i * 15, 500 - i * 60, 315);
    ctx.stroke();
  }

  // Header banner matching Front
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, 45);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 44, canvas.width, 1);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ADDRESS & OFFICIAL PARTICULARS • भारत सरकार', 20, 26);

  // Address details lines
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('RESIDENTIAL ADDRESS (स्थायी पता)', 30, 75);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('H-402, STREET NO. 12, METRO RESIDENCY,', 30, 95);
  ctx.fillText('DWARKA SECTOR-9, NEW DELHI, INDIA', 30, 115);
  ctx.fillText('PIN CODE: 110075', 30, 135);

  // Parentage/Spouse Info
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('FATHER\'S NAME (पिता का नाम)', 30, 170);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('RAMESH KUMAR SHARMA', 30, 188);

  // Left stamp / barcode layout
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.arc(410, 110, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(410, 110, 31, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('REGISTRAR', 386, 108);
  ctx.fillText('APPROVED', 388, 118);

  // Micro qr code mockup
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(380, 180, 60, 60);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (Math.random() > 0.45 || (r === 0 && c === 0) || (r === 0 && c === 5) || (r === 5 && c === 0)) {
        ctx.fillRect(380 + c * 10, 180 + r * 10, 10, 10);
      }
    }
  }

  // Official fineprint instructions
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 8px sans-serif';
  ctx.fillText('This is a digitally generated identity document. Finder please return to nearest police station.', 30, 275);
  ctx.fillText('यह एक प्रमाणित राष्ट्रीय पहचान पत्र है। खो जाने पर निकटतम पुलिस थाने में जमा कराएं।', 30, 290);

  return canvas.toDataURL('image/png');
}
