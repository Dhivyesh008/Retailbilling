/**
 * BarcodeScannerModal.jsx
 *
 * Camera-based Barcode Scanner for Point-of-Sale Billing:
 * - Uses laptop/webcam camera via Html5Qrcode to scan physical product barcodes.
 * - Audio feedback (crisp POS beep via Web Audio API).
 * - Visual scanning laser line and green flash indicator on successful detection.
 * - Automatic matching against Supabase PostgreSQL database products.
 * - Renders 3 sample database product barcodes (Milk, Bread, Rice 5kg) for instant scanning & testing.
 */

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import JsBarcode from 'jsbarcode';
import {
  Camera, X, Volume2, VolumeX, CheckCircle, AlertTriangle,
  RotateCcw, Sparkles, ShoppingCart, HelpCircle, ExternalLink, RefreshCw
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
    osc.frequency.setValueAtTime(950, ctx.currentTime); // 950Hz retail beep
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (err) {
    // AudioContext might be blocked until user gesture
  }
}

/** Component to render real SVG barcodes using JsBarcode */
function ProductBarcodeSvg({ barcode, label }) {
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

  return (
    <div className="flex flex-col items-center bg-white rounded-lg p-2 border border-slate-200 shadow-xs">
      <svg ref={svgRef} className="max-w-full" />
      <span className="text-[11px] font-bold text-slate-600 mt-1 truncate max-w-[140px]">{label}</span>
    </div>
  );
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  products = [],
  onProductScanned,
}) {
  const [cameras, setCameras]           = useState([]);
  const [selectedCam, setSelectedCam]   = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError]   = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScanned, setLastScanned]   = useState(null); // { product, code, time }
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [manualCode, setManualCode]     = useState('');
  const [showExamples, setShowExamples] = useState(true);

  const scannerRef     = useRef(null);
  const lastScanTimeRef = useRef(0);
  const lastCodeRef    = useRef('');

  // 3 sample products from database (Milk, Bread, Rice 5kg or first 3 with barcodes)
  const sampleProducts = products
    .filter((p) => p.barcode && p.barcode.trim())
    .slice(0, 3);

  // Initialize camera list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMounted) return;
        if (devices && devices.length) {
          setCameras(devices);
          // Prefer environment (back) camera or first camera
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

  // Start / Stop camera when selectedCam changes or modal opens/closes
  useEffect(() => {
    if (!isOpen || !selectedCam) return;

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
    });
    scannerRef.current = html5QrCode;

    const config = {
      fps: 12,
      qrbox: { width: 280, height: 180 },
      aspectRatio: 1.333,
    };

    html5QrCode
      .start(
        selectedCam,
        config,
        (decodedText) => {
          handleDecodedBarcode(decodedText);
        },
        () => {
          // ignore frame decode misses
        }
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
  }, [isOpen, selectedCam]);

  // Process detected barcode
  const handleDecodedBarcode = (code) => {
    const cleanCode = String(code).trim();
    if (!cleanCode) return;

    const now = Date.now();
    // 1.8s debounce for the exact same barcode to avoid duplicate rapid additions
    if (cleanCode === lastCodeRef.current && (now - lastScanTimeRef.current) < 1800) {
      return;
    }

    lastCodeRef.current = cleanCode;
    lastScanTimeRef.current = now;

    // Search in database products (match barcode or sku)
    const matched = products.find(
      (p) => String(p.barcode).trim() === cleanCode || String(p.sku).trim() === cleanCode || String(p.id) === cleanCode
    );

    if (soundEnabled) {
      playPosBeep();
    }

    // Trigger visual success flash
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

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-brand">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-800">Barcode Scanner (Laptop Camera)</h3>
              <p className="text-xs text-slate-500">Scan product barcodes with your webcam to instantly add items to the cart</p>
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

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Camera Selection & Status */}
          {cameras.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">Camera:</span>
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
          )}

          {/* Live Camera Viewport with Scanner Laser Animation */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-950 border-2 transition-all duration-300"
            style={{
              borderColor: flashSuccess ? '#10b981' : '#3b82f6',
              boxShadow: flashSuccess ? '0 0 25px rgba(16,185,129,0.5)' : 'none',
            }}
          >
            {/* Html5Qrcode video container */}
            <div id="barcode-reader-viewport" className="w-full min-h-[260px] max-h-[340px]" />

            {/* Target Reticle & Laser overlay when camera is running */}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* Aiming Reticle */}
                <div className="relative w-64 h-36 border-2 border-dashed border-blue-400/80 rounded-xl flex items-center justify-center">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />

                  {/* Animated Scanning Laser Line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-bounce" />
                </div>
              </div>
            )}

            {/* Camera Loading / Error Banner */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900/90">
                {cameraError ? (
                  <>
                    <AlertTriangle size={32} className="text-amber-400 mb-2" />
                    <p className="text-sm font-bold text-amber-200">{cameraError}</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Check your browser camera permissions or try the test barcodes and manual entry below.
                    </p>
                  </>
                ) : (
                  <>
                    <RefreshCw size={28} className="animate-spin text-brand mb-2" />
                    <p className="text-sm font-bold">Accessing camera...</p>
                    <p className="text-xs text-slate-400 mt-1">Please allow camera permissions if prompted.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Scanned Result Banner */}
          {lastScanned && (
            <div className={`flex items-center justify-between rounded-xl p-3.5 border transition-all animate-in slide-in-from-top-2 ${
              lastScanned.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-amber-50 border-amber-300 text-amber-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${lastScanned.success ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                  {lastScanned.success ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
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
                        Price: ₹{lastScanned.product.price} · Barcode: {lastScanned.code} · Stock left: {lastScanned.product.stock}
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

          {/* Quick Manual Code Input */}
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

          {/* 3 Real Database Products with Scannable Barcodes */}
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
                  Point your laptop camera at any of the barcodes below (or click <b>"Simulate Scan"</b> to test immediately):
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
            Barcode scanning works with printed packaging, mobile screens, or sample cards.
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
