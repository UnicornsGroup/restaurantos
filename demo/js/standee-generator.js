// QR Standee Generator controller for standee-generator.html
import { initAuthGuard } from './auth.js';
import { subscribeTables, subscribeSettings } from './realtime.js';
import { firebaseConfig } from './config.js';

let activeUser = null;
let activeRestaurant = null;
let tablesCount = 10;
let restaurantName = "Dev Cafe";
let restaurantLogoBase64 = ""; // Stored logo or uploaded logo
let currentPreviewTable = 1;

// DOM references
const qrTablesCountInput = document.getElementById('qr-tables-count');
const qrLogoUploadInput = document.getElementById('qr-logo-upload');
const qrLogoPreviewImg = document.getElementById('qr-logo-preview-img');
const qrLogoPreviewFallback = document.getElementById('qr-logo-preview-fallback');
const qrGenerateBtn = document.getElementById('qr-generate-btn');

const qrDownloadPdfBtn = document.getElementById('qr-download-pdf-btn');
const qrDownloadZipBtn = document.getElementById('qr-download-zip-btn');
const qrPrintBtn = document.getElementById('qr-print-btn');

const tmplLogoImg = document.getElementById('tmpl-logo-img');
const tmplLogoFallback = document.getElementById('tmpl-logo-fallback');
const tmplRestName = document.getElementById('tmpl-rest-name');
const tmplQrCanvas = document.getElementById('tmpl-qr-canvas');
const tmplTableNumberText = document.getElementById('tmpl-table-number-text');
const qrThumbnailsGrid = document.getElementById('qr-thumbnails-grid');

const printStandeesContainer = document.getElementById('print-standees-container');
const standeeCardTemplate = document.getElementById('standee-card-template');

// Initialize page
const initGenerator = () => {
  // Bind simple actions
  if (qrLogoUploadInput) {
    qrLogoUploadInput.addEventListener('change', handleLogoUpload);
  }
  if (qrGenerateBtn) {
    qrGenerateBtn.addEventListener('click', handleGenerateAction);
  }
  if (qrDownloadPdfBtn) {
    qrDownloadPdfBtn.addEventListener('click', exportToPDF);
  }
  if (qrDownloadZipBtn) {
    qrDownloadZipBtn.addEventListener('click', exportToZIP);
  }
  if (qrPrintBtn) {
    qrPrintBtn.addEventListener('click', triggerPrintPreview);
  }

  // Subscribe to real-time restaurant settings
  subscribeSettings((settings) => {
    if (settings) {
      restaurantName = settings.name || "Dev Cafe";
      if (tmplRestName) tmplRestName.innerText = restaurantName;
      
      // Load current logo if we haven't overridden it manually
      if (settings.logoUrl && !restaurantLogoBase64) {
        setLogoSrc(settings.logoUrl);
      }
    }
  });

  // Subscribe to tables to get the default table count
  subscribeTables((tables) => {
    if (tables && tables.length > 0) {
      // Find the highest table number or count
      const count = tables.length;
      if (qrTablesCountInput && !qrTablesCountInput.dataset.userEdited) {
        qrTablesCountInput.value = count;
        tablesCount = count;
      }
    }
    // Generate initial standees
    generateStandeesUI();
  });

  // Track if user manually edits table count
  if (qrTablesCountInput) {
    qrTablesCountInput.addEventListener('input', () => {
      qrTablesCountInput.dataset.userEdited = "true";
      tablesCount = parseInt(qrTablesCountInput.value) || 10;
    });
  }
};

// Handle Logo Upload Preview
const handleLogoUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 256000) {
    alert("Image is too large! Please choose an image smaller than 250KB.");
    qrLogoUploadInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const base64Src = event.target.result;
    restaurantLogoBase64 = base64Src;
    
    // Update config previews
    if (qrLogoPreviewImg) {
      qrLogoPreviewImg.src = base64Src;
      qrLogoPreviewImg.classList.remove('hidden');
    }
    if (qrLogoPreviewFallback) {
      qrLogoPreviewFallback.classList.add('hidden');
    }

    // Update template preview
    setLogoSrc(base64Src);
    
    // Regenerate current preview
    updatePreviewCard(currentPreviewTable);
  };
  reader.readAsDataURL(file);
};

// Set logo source in template preview
const setLogoSrc = (src) => {
  if (src) {
    if (tmplLogoImg) {
      tmplLogoImg.src = src;
      tmplLogoImg.classList.remove('hidden');
    }
    if (tmplLogoFallback) {
      tmplLogoFallback.classList.add('hidden');
    }
  } else {
    if (tmplLogoImg) {
      tmplLogoImg.src = "";
      tmplLogoImg.classList.add('hidden');
    }
    if (tmplLogoFallback) {
      tmplLogoFallback.classList.remove('hidden');
    }
  }
};

// Generate button action
const handleGenerateAction = () => {
  tablesCount = parseInt(qrTablesCountInput.value) || 10;
  if (tablesCount <= 0) {
    alert("Please enter a valid number of tables.");
    return;
  }
  generateStandeesUI();
  // Show toast notification using simple alert or UI notification
  alert(`Successfully generated standees for ${tablesCount} tables! Check previews below.`);
};

// Render previews list & initialize first preview
const generateStandeesUI = async () => {
  if (!qrThumbnailsGrid) return;
  qrThumbnailsGrid.innerHTML = '';

  for (let i = 1; i <= tablesCount; i++) {
    const thumb = document.createElement('div');
    thumb.className = `standee-thumbnail-item ${i === currentPreviewTable ? 'active' : ''}`;
    thumb.dataset.table = i;
    thumb.innerHTML = `
      <div style="font-size: 11px; margin-bottom: 2px;">Table</div>
      <div style="font-size: 16px; font-weight: 800;">${i}</div>
    `;
    thumb.addEventListener('click', () => {
      // Toggle active class
      document.querySelectorAll('.standee-thumbnail-item').forEach(el => el.classList.remove('active'));
      thumb.classList.add('active');
      currentPreviewTable = i;
      updatePreviewCard(i);
    });
    qrThumbnailsGrid.appendChild(thumb);
  }

  // Update current preview
  if (currentPreviewTable > tablesCount) {
    currentPreviewTable = 1;
  }
  await updatePreviewCard(currentPreviewTable);

  // Enable buttons
  if (qrDownloadPdfBtn) qrDownloadPdfBtn.disabled = false;
  if (qrDownloadZipBtn) qrDownloadZipBtn.disabled = false;
  if (qrPrintBtn) qrPrintBtn.disabled = false;
};

// Update active template card values
const updatePreviewCard = async (tableNo) => {
  if (tmplTableNumberText) tmplTableNumberText.innerText = tableNo;
  if (tmplRestName) tmplRestName.innerText = restaurantName;

  // Generate QR URL redirect target
  const projectId = firebaseConfig.projectId || 'restaurantos-9ab2a';
  const qrUrl = `https://restaurantos.in/t/${projectId}/${tableNo}`;

  // Draw on Canvas
  if (tmplQrCanvas && window.QRCode) {
    try {
      await window.QRCode.toCanvas(tmplQrCanvas, qrUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: '#2D2D2D',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error("QR drawing failed:", err);
    }
  }
};

// Export to PDF
const exportToPDF = async () => {
  const { jsPDF } = window.jspdf;
  if (!jsPDF || !window.html2canvas) {
    alert("Required libraries are still loading. Please try again in a moment.");
    return;
  }

  // Save original preview state
  const prevTableNum = currentPreviewTable;

  // Disable button and show status
  qrDownloadPdfBtn.disabled = true;
  const originalText = qrDownloadPdfBtn.innerText;
  qrDownloadPdfBtn.innerText = "Exporting PDF...";

  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    for (let i = 1; i <= tablesCount; i++) {
      // 1. Update card template
      await updatePreviewCard(i);
      // Wait briefly for canvas/image rendering to settle
      await new Promise(r => setTimeout(r, 50));
      
      // 2. Render to high-DPI canvas
      const canvas = await window.html2canvas(standeeCardTemplate, {
        scale: 3, // 3x scale makes it ~300 DPI for high quality prints
        useCORS: true
      });
      const imgData = canvas.toDataURL('image/png');
      
      if (i > 1) {
        pdf.addPage();
      }
      
      // A4 is 210mm x 297mm. Standee is 100mm x 150mm. Centering offsets:
      const x = (210 - 100) / 2;
      const y = (297 - 150) / 2;
      
      pdf.addImage(imgData, 'PNG', x, y, 100, 150);
    }
    
    pdf.save(`${restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-standees.pdf`);
    alert("PDF downloaded successfully!");
  } catch (err) {
    console.error("PDF generation failed:", err);
    alert("Export failed: " + err.message);
  } finally {
    // Restore state
    currentPreviewTable = prevTableNum;
    await updatePreviewCard(prevTableNum);
    qrDownloadPdfBtn.disabled = false;
    qrDownloadPdfBtn.innerText = originalText;
  }
};

// Export to ZIP (individual PNGs)
const exportToZIP = async () => {
  if (!window.JSZip || !window.html2canvas) {
    alert("ZIP libraries are loading. Please try again.");
    return;
  }

  const prevTableNum = currentPreviewTable;
  qrDownloadZipBtn.disabled = true;
  const originalText = qrDownloadZipBtn.innerText;
  qrDownloadZipBtn.innerText = "Bundling ZIP...";

  try {
    const zip = new window.JSZip();
    
    for (let i = 1; i <= tablesCount; i++) {
      await updatePreviewCard(i);
      await new Promise(r => setTimeout(r, 50));

      const canvas = await window.html2canvas(standeeCardTemplate, {
        scale: 3,
        useCORS: true
      });
      // Extract clean base64 data URL string
      const imgData = canvas.toDataURL('image/png').split(',')[1];
      zip.file(`table-${i}.png`, imgData, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-standees.zip`;
    link.click();
    alert("PNG ZIP package downloaded successfully!");
  } catch (err) {
    console.error("ZIP packaging failed:", err);
    alert("Packaging failed: " + err.message);
  } finally {
    currentPreviewTable = prevTableNum;
    await updatePreviewCard(prevTableNum);
    qrDownloadZipBtn.disabled = false;
    qrDownloadZipBtn.innerText = originalText;
  }
};

// Print Preview Action
const triggerPrintPreview = async () => {
  if (!printStandeesContainer || !window.QRCode) return;

  // Clear previous print nodes
  printStandeesContainer.innerHTML = '';
  
  // Show spinner / loading status
  qrPrintBtn.disabled = true;
  const originalText = qrPrintBtn.innerText;
  qrPrintBtn.innerText = "Preparing Print...";

  try {
    const projectId = firebaseConfig.projectId || 'restaurantos-9ab2a';

    for (let i = 1; i <= tablesCount; i++) {
      const pageBreak = document.createElement('div');
      pageBreak.className = 'print-page-break';

      // Clone template card structure
      const cardClone = standeeCardTemplate.cloneNode(true);
      
      // Ensure IDs in clone do not clash and match state
      const cloneCanvas = cardClone.querySelector('#tmpl-qr-canvas');
      if (cloneCanvas) {
        cloneCanvas.id = `tmpl-qr-canvas-print-${i}`;
        // Redraw QR code for clone canvas
        const qrUrl = `https://restaurantos.in/t/${projectId}/${i}`;
        await window.QRCode.toCanvas(cloneCanvas, qrUrl, {
          width: 240,
          margin: 2,
          color: {
            dark: '#2D2D2D',
            light: '#FFFFFF'
          }
        });
      }

      const cloneLogoFallback = cardClone.querySelector('#tmpl-logo-fallback');
      const cloneLogoImg = cardClone.querySelector('#tmpl-logo-img');
      // If we have custom logo override or stored logo, ensure it's visible in print clone
      if (restaurantLogoBase64 || (activeRestaurant && activeRestaurant.logoUrl)) {
        const logoSrc = restaurantLogoBase64 || activeRestaurant.logoUrl;
        if (cloneLogoImg) {
          cloneLogoImg.src = logoSrc;
          cloneLogoImg.classList.remove('hidden');
        }
        if (cloneLogoFallback) {
          cloneLogoFallback.classList.add('hidden');
        }
      }

      pageBreak.appendChild(cardClone);
      printStandeesContainer.appendChild(pageBreak);
    }

    // Call print window
    window.print();
  } catch (err) {
    console.error("Print prep failed:", err);
    alert("Printing failed: " + err.message);
  } finally {
    qrPrintBtn.disabled = false;
    qrPrintBtn.innerText = originalText;
  }
};

// Route Auth Guard
window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('table-setup', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initGenerator();
  });
});
