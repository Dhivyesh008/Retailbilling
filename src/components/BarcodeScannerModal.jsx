/**
 * BarcodeScannerModal.jsx
 *
 * Full-featured Barcode Scanner for Point-of-Sale Billing:
 * 1. Live Laptop / Webcam Camera Scanning (with native BarcodeDetector acceleration, reticle, and laser guide).
 * 2. Barcode Image Upload (Drag-and-drop or select an image / screenshot of a barcode).
 * 3. Audio & Visual POS feedback (authentic beep and green border pulse).
 * 4. 3 Sample Database Products (Milk, Bread, Rice 5kg) with live scannable SVG barcodes, instant scan simulation, and one-click image download for testing.
 * 5. Automatic matching with Supabase PostgreSQL products database.
 */

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import JsBarcode from 'jsbarcode';
import {
  Camera, UploadCloud, X, Volume2, VolumeX, CheckCircle2, AlertTriangle,
  Sparkles, ShoppingCart, HelpCircle, Image as ImageIcon, Download,
  RefreshCw, Info, Check, FileCheck
} from 'lucide-react';

/** Web Audio API Beep Generator */
function playPosBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // AudioContext blocked before user interaction
  }
}

/** Component to render real SVG barcodes using JsBarcode */
function ProductBarcodeSvg({ barcode, label, onDownload }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, String(barcode), {
        format: String(barcode).length === 13 ? 'EAN13' : 'CODE128',
        width: 1.4,
        height: 38,
        displayValue: true,
        fontSize: 11,
        margin: 4,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
    } catch {
      try {
        JsBarcode(svgRef.current, String(barcode), {
          format: 'CODE128',
          width: 1.4,
          height: 38,
          displayValue: true,
          fontSize: 11,
          margin: 4,
          background: '#ffffff',
          lineColor: '#0f172a',
        });
      } catch (e) {
        console.warn('Barcode render error:', e);
      }
    }
  }, [barcode]);

  const handleSave = () => {
    if (!svgRef.current) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgRef.current);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.href = svgUrl;
      link.download = `barcode_${label.replace(/\s+/g, '_')}_${barcode}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(svgUrl);
    } catch (err) {
      console.warn('Failed to download barcode:', err);
    }
  };

  return (
    <div className="flex flex-col items-center bg-white rounded-lg p-2 border border-slate-200 shadow-xs relative group">
      <svg ref={svgRef} className="max-w-full" />
      <div className="flex items-center justify-between w-full mt-1 px-1">
        <span className="text-[11px] font-bold text-slate-700 truncate max-w-[110px]">{label}</span>
        <button
          type="button"
          onClick={handleSave}
          title="Download barcode image"
          className="text-slate-400 hover:text-brand p-0.5 rounded transition"
        >
          <Download size={12} />
        </button>
      </div>
    </div>
  );
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  products = [],
  onProductScanned,
  initialTab = 'camera', // 'camera' or 'upload'
}) {
  const [activeTab, setActiveTab]       = useState(initialTab); // 'camera' | 'upload'
  const [cameras, setCameras]           = useState([]);
  const [selectedCam, setSelectedCam]   = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError]   = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScanned, setLastScanned]   = useState(null); // { success, product, code, time }
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [manualCode, setManualCode]     = useState('');
  const [showExamples, setShowExamples] = useState(true);

  // Upload image state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [isDragging, setIsDragging]       = useState(false);

  const scannerRef      = useRef(null);
  const lastScanTimeRef = useRef(0);
  const lastCodeRef     = useRef('');
  const fileInputRef    = useRef(null);

  // 3 sample products from database (Milk, Bread, Rice 5kg)
  const sampleProducts = products
    .filter((p) => p.barcode && p.barcode.trim())
    .slice(0, 3);

  // Discover webcams when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMounted) return;
        if (devices && devices.length) {
          setCameras(devices);
          const envCam = devices.find((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          setSelectedCam(envCam ? envCam.id : devices[0].id);
        } else {
          setCameraError('No webcam or camera detected on your device.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[BarcodeScanner] getCameras error:', err);
        setCameraError('Please allow camera permissions in your browser to scan barcodes.');
      });

    return () => { isMounted = false; };
  }, [isOpen]);

  // Start / Stop camera when in camera tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera' || !selectedCam) return;

    const html5QrCode = new Html5Qrcode('barcode-reader-viewport', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
      verbose: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
    });
    scannerRef.current = html5QrCode;

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.min(320, Math.floor(viewfinderWidth * 0.85)),
        height: Math.min(200, Math.floor(viewfinderHeight * 0.7)),
      }),
      aspectRatio: 1.333,
    };

    html5QrCode
      .start(
        selectedCam,
        config,
        (decodedText) => {
          handleDecodedBarcode(decodedText);
        },
        () => {}
      )
      .then(() => {
        setCameraActive(true);
        setCameraError('');
      })
      .catch((err) => {
        console.error('[BarcodeScanner] Camera start error:', err);
        setCameraActive(false);
        setCameraError(err.message || 'Could not start camera video stream.');
      });

    return () => {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {}).finally(() => {
            scannerRef.current?.clear();
          });
        } else {
          scannerRef.current.clear();
        }
      }
      setCameraActive(false);
    };
  }, [isOpen, activeTab, selectedCam]);

  // Process detected or entered barcode
  const handleDecodedBarcode = (code) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;

    const now = Date.now();
    // 1.8s debounce for the exact same barcode
    if (cleanCode === lastCodeRef.current && (now - lastScanTimeRef.current) < 1800) {
      return;
    }

    lastCodeRef.current = cleanCode;
    lastScanTimeRef.current = now;

    // Search in database products (match barcode, sku, or id)
    const matched = products.find(
      (p) => String(p.barcode).trim() === cleanCode || String(p.sku).trim() === cleanCode || String(p.id) === cleanCode
    );

    if (soundEnabled) {
      playPosBeep();
    }

    setFlashSuccess(true);
    setTimeout(() => setFlashSuccess(false), 500);

    if (matched) {
      setLastScanned({
        success: true,
        product: matched,
        code: cleanCode,
        time: new Date().toLocaleTimeString(),
      });
      onProductScanned(matched);
    } else {
      setLastScanned({
        success: false,
        product: null,
        code: cleanCode,
        time: new Date().toLocaleTimeString(),
      });
    }
  };

  // Decode barcode from image file
  const processImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    setUploadLoading(true);
    setUploadError('');

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => setUploadedPreview(e.target.result);
    reader.readAsDataURL(file);

    let decodedText = null;

    // 1. First try native BarcodeDetector API if supported
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.() || [
          'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'
        ];
        const detector = new window.BarcodeDetector({ formats });
        const imageBitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(imageBitmap);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          decodedText = barcodes[0].rawValue;
        }
      } catch (detErr) {
        console.warn('BarcodeDetector error:', detErr);
      }
    }

    // 2. Fallback to Html5Qrcode.scanFile
    if (!decodedText) {
      try {
        const fileScanner = new Html5Qrcode('barcode-file-scan-temp', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });

        decodedText = await fileScanner.scanFile(file, false);
        fileScanner.clear();
      } catch (scanErr) {
        console.warn('Html5Qrcode.scanFile error:', scanErr);
      }
    }

    setUploadLoading(false);

    if (decodedText) {
      setUploadError('');
      handleDecodedBarcode(decodedText);
    } else {
      setUploadError('Could not detect a barcode in this image. Please ensure the barcode is clear, centered, and well-lit.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processImageFile(file);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleDecodedBarcode(manualCode.trim());
      setManualCode('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-4 border border-slate-200">

        {/* Hidden container for temp file decoding */}
        <div id="barcode-file-scan-temp" className="hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-brand">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-800">Barcode Scanner & Image Reader</h3>
              <p className="text-xs text-slate-500">Scan with your webcam or upload a barcode image to add items to the cart</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? 'Mute beep' : 'Enable beep'}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              {soundEnabled ? <Volume2 size={18} className="text-brand" /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs (Camera vs Upload Image) */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-colors border-t border-x ${
              activeTab === 'camera'
                ? 'bg-white text-brand border-slate-200 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Camera size={15} />
            Live Laptop Camera
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-colors border-t border-x ${
              activeTab === 'upload'
                ? 'bg-white text-brand border-slate-200 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <UploadCloud size={15} />
            Upload Barcode Image
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* TAB 1: LIVE CAMERA */}
          {activeTab === 'camera' && (
            <div className="space-y-3">
              {cameras.length > 1 && (
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-600">Camera Device:</span>
                    <select
                      className="field text-xs py-1"
                      value={selectedCam}
                      onChange={(e) => setSelectedCam(e.target.value)}
                    >
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label || `Camera ${c.id.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Viewport with Animated Laser and Reticle */}
              <div
                className="relative overflow-hidden rounded-2xl bg-slate-950 border-2 transition-all duration-300"
                style={{
                  borderColor: flashSuccess ? '#10b981' : '#3b82f6',
                  boxShadow: flashSuccess ? '0 0 25px rgba(16,185,129,0.5)' : 'none',
                }}
              >
                <div id="barcode-reader-viewport" className="w-full min-h-[250px] max-h-[320px]" />

                {cameraActive && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative w-64 h-36 border-2 border-dashed border-blue-400/80 rounded-xl flex items-center justify-center">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />
                      <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-bounce" />
                    </div>
                  </div>
                )}

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900/90">
                    {cameraError ? (
                      <>
                        <AlertTriangle size={32} className="text-amber-400 mb-2" />
                        <p className="text-sm font-bold text-amber-200">{cameraError}</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">
                          Switch to the <b>Upload Barcode Image</b> tab or use the test barcodes below.
                        </p>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={28} className="animate-spin text-brand mb-2" />
                        <p className="text-sm font-bold">Connecting to camera...</p>
                        <p className="text-xs text-slate-400 mt-1">Please allow camera permissions if prompted.</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Phone Screen Scanning Tips */}
              <div className="flex items-start gap-2 rounded-xl bg-blue-50/80 p-3 text-xs text-slate-600 border border-blue-100">
                <Info size={16} className="text-brand shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-brand">💡 Tips when scanning barcodes from a mobile phone screen:</p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-slate-600">
                    <li>Hold your phone <b>15–25 cm (6–10 inches)</b> away from the laptop webcam so the camera can focus sharply.</li>
                    <li>Avoid holding too close (laptop webcams have fixed focus and blur at close distances).</li>
                    <li>Set your phone brightness to medium to prevent screen glare.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD BARCODE IMAGE */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                  isDragging
                    ? 'border-brand bg-blue-50/70 scale-[0.99]'
                    : 'border-slate-300 bg-slate-50/80 hover:bg-slate-100 hover:border-brand/70'
                }`}
              >
                {uploadLoading ? (
                  <div className="flex flex-col items-center py-4">
                    <RefreshCw size={36} className="animate-spin text-brand mb-3" />
                    <p className="font-bold text-sm text-slate-700">Analyzing image for barcodes…</p>
                    <p className="text-xs text-slate-400 mt-1">Detecting EAN-13, CODE-128, UPC, and QR barcodes</p>
                  </div>
                ) : uploadedPreview ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={uploadedPreview}
                      alt="Uploaded barcode"
                      className="max-h-40 rounded-lg border border-slate-200 shadow-sm object-contain mb-3"
                    />
                    <p className="text-xs font-bold text-brand flex items-center gap-1.5">
                      <ImageIcon size={14} /> Click to upload a different image
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-brand mb-3">
                      <UploadCloud size={28} />
                    </div>
                    <p className="font-extrabold text-sm text-slate-800">
                      Click to choose an image, or drag & drop here
                    </p>
                    <p className="text-xs text-slate-500 mt-1 text-center">
                      Upload any photo, packaging picture, or screenshot of a barcode (PNG, JPG, WEBP)
                    </p>
                    <span className="mt-3 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-brand border border-slate-200 shadow-2xs">
                      Browse Files
                    </span>
                  </>
                )}
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-200">
                  <AlertTriangle size={15} className="shrink-0" />
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Scanned Result Card */}
          {lastScanned && (
            <div className={`flex items-center justify-between rounded-xl p-3.5 border transition-all animate-in slide-in-from-top-2 ${
              lastScanned.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-amber-50 border-amber-300 text-amber-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${lastScanned.success ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                  {lastScanned.success ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                </div>
                <div>
                  {lastScanned.success ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{lastScanned.product.name}</span>
                        <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          + Added to cart
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Price: ₹{lastScanned.product.price} · Barcode: {lastScanned.code} · In Stock: {lastScanned.product.stock}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-sm">Unknown Barcode: {lastScanned.code}</p>
                      <p className="text-xs text-amber-700">This barcode does not match any product in your database.</p>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 shrink-0">{lastScanned.time}</span>
            </div>
          )}

          {/* Manual Barcode Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Or enter barcode / SKU manually (e.g. 8901030826825)…"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="field flex-1 text-xs"
            />
            <button type="submit" className="btn-primary text-xs px-4 py-2 shrink-0">
              Add Item
            </button>
          </form>

          {/* 3 Real Database Products with Scannable Barcodes & Instant Tests */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Sparkles size={15} className="text-amber-500" />
                <span className="font-bold text-xs text-slate-700 uppercase tracking-wide">
                  Test Barcodes from Your Database (3 Sample Products)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowExamples((v) => !v)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {showExamples ? 'Hide' : 'Show'}
              </button>
            </div>

            {showExamples && (
              <>
                <p className="text-xs text-slate-500 mb-3">
                  Click <b>"Simulate Scan"</b> to test immediately, or download the barcode image and upload it in the Upload tab:
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  {sampleProducts.map((prod) => (
                    <div
                      key={prod.id}
                      className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs hover:border-blue-300 transition-all"
                    >
                      <div className="text-center">
                        <p className="font-extrabold text-sm text-slate-800">{prod.name}</p>
                        <p className="text-xs font-bold text-brand">₹{prod.price}</p>
                      </div>

                      <div className="my-2 flex justify-center">
                        <ProductBarcodeSvg barcode={prod.barcode} label={prod.name} />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDecodedBarcode(prod.barcode)}
                        className="mt-1 w-full rounded-lg bg-blue-50 py-1.5 text-xs font-bold text-brand hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center gap-1"
                      >
                        <ShoppingCart size={13} />
                        Simulate Scan
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3.5">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <HelpCircle size={13} className="text-slate-400" />
            Supports physical packaging, mobile screens, or uploaded barcode photos.
          </p>
          <button
            onClick={onClose}
            className="btn-secondary px-5 py-2 text-xs font-bold"
          >
            Done Scanning
          </button>
        </div>

      </div>
    </div>
  );
}
