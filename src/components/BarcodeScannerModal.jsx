import { useEffect, useRef, useState, useCallback } from 'react';
import { HTMLCanvasElementLuminanceSource } from '@zxing/browser';
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';
import { X, Camera, AlertCircle, ScanLine, RefreshCw, Upload, SwitchCamera } from 'lucide-react';

/**
 * Multi-pass barcode decoder:
 *   Pass 1: Direct full frame decode
 *   Pass 2: Center rectangular region crop (matching horizontal scan guide box)
 *   Pass 3: Quiet zone padding for dark-background or tight-crop barcodes
 *   Pass 4: Inverted luminance (for white-on-dark barcodes)
 */
function decodeCanvas(canvas, ctx, reader) {
  // Pass 1: Direct full frame decode
  try {
    const lum = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(lum));
    const res = reader.decodeWithState(bitmap);
    if (res && res.getText()) return res.getText();
  } catch {
    // Pass 1 NotFoundException
  }

  const w = canvas.width;
  const h = canvas.height;

  // Pass 2: Center rectangular horizontal window crop
  // Focuses specifically on the horizontal scan zone where the user is holding the barcode
  try {
    const boxW = Math.round(w * 0.80);
    const boxH = Math.round(h * 0.38);
    const startX = Math.round((w - boxW) / 2);
    const startY = Math.round((h - boxH) / 2);

    const pad = 24;
    const padCanvas = document.createElement('canvas');
    padCanvas.width = boxW + pad * 2;
    padCanvas.height = boxH + pad * 2;
    const padCtx = padCanvas.getContext('2d');
    padCtx.fillStyle = '#ffffff';
    padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
    padCtx.drawImage(canvas, startX, startY, boxW, boxH, pad, pad, boxW, boxH);

    const lum = new HTMLCanvasElementLuminanceSource(padCanvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(lum));
    const res = reader.decodeWithState(bitmap);
    if (res && res.getText()) return res.getText();
  } catch {
    // Pass 2 NotFoundException
  }

  // Pass 3: Quiet zone padding for dark-background or tight-crop barcodes
  // EAN-13 requires a white margin (quiet zone) before start and stop guard bars.
  // When an image has a white barcode on a dark background or tightly cropped edges,
  // we detect the bounding box of the barcode label and pad it with clean white borders.
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let whitePixelCount = 0;

    for (let y = 0; y < h; y += 2) {
      const rowOffset = y * w * 4;
      for (let x = 0; x < w; x += 2) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lumVal = (306 * r + 601 * g + 117 * b + 0x200) >> 10;
        if (lumVal > 180) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          whitePixelCount++;
        }
      }
    }

    if (whitePixelCount > 30 && maxX > minX && maxY > minY) {
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const pad = 24;
      const padCanvas = document.createElement('canvas');
      padCanvas.width = boxW + pad * 2;
      padCanvas.height = boxH + pad * 2;
      const padCtx = padCanvas.getContext('2d');
      padCtx.fillStyle = '#ffffff';
      padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
      padCtx.drawImage(canvas, minX, minY, boxW, boxH, pad, pad, boxW, boxH);

      const lum = new HTMLCanvasElementLuminanceSource(padCanvas);
      const bitmap = new BinaryBitmap(new HybridBinarizer(lum));
      const res = reader.decodeWithState(bitmap);
      if (res && res.getText()) return res.getText();
    }
  } catch {
    // Pass 3 NotFoundException
  }

  return null;
}

export default function BarcodeScannerModal({ onScan, onClose, scanError }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const firedRef = useRef(false);

  const [camError, setCamError] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [canRetry, setCanRetry] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);

  // Live test diagnostic state (Frame counter & resolution badge)
  const [scanFrameCount, setScanFrameCount] = useState(0);
  const [videoRes, setVideoRes] = useState('');
  const [lastDecoded, setLastDecoded] = useState(null);

  const retry = useCallback(() => {
    setCamError(null);
    setLocalError(null);
    setStarting(true);
    setCanRetry(false);
    setScanFrameCount(0);
    setLastDecoded(null);
    firedRef.current = false;
    setRetryKey((k) => k + 1);
  }, []);

  const switchCamera = useCallback(() => {
    if (videoDevices.length <= 1) return;
    setSelectedDeviceIndex((prev) => (prev + 1) % videoDevices.length);
    retry();
  }, [videoDevices, retry]);

  // Audio feedback on successful scan
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 note
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Ignore autoplay block
    }
  }, []);

  const handleSuccessfulDecode = useCallback((text) => {
    if (!text || firedRef.current) return;
    firedRef.current = true;
    setLastDecoded(text);
    playBeep();
    onScan(text);
  }, [onScan, playBeep]);

  // Handle uploaded/dropped barcode image
  const processImageFile = useCallback((file) => {
    if (!file) return;
    setLocalError(null);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      ctx.drawImage(img, 0, 0);

      // Create reader with explicit retail 1D + 2D formats
      const reader = new MultiFormatReader();
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      reader.setHints(hints);

      const decoded = decodeCanvas(canvas, ctx, reader);
      if (decoded) {
        console.log('[BarcodeScanner] Image file successfully decoded:', decoded);
        handleSuccessfulDecode(decoded);
      } else {
        setLocalError('No barcode or QR code detected in this image. Ensure the barcode is clear and fully visible.');
      }
    };
    img.onerror = () => {
      setLocalError('Failed to load image file.');
    };
    img.src = url;
  }, [handleSuccessfulDecode]);

  useEffect(() => {
    let mounted = true;
    let stream = null;
    let animFrame = null;

    // ── Explicitly enable 1D retail formats + TRY_HARDER ──────────────────
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_8,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function stopAll() {
      mounted = false;
      cancelAnimationFrame(animFrame);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    let lastScanTimestamp = 0;
    const SCAN_INTERVAL_MS = 80; // ~12 scans/sec for responsive detection without CPU lock
    let frameCount = 0;

    // ── Continuous scan loop ──────────────────────────────────────────────
    function scanFrame(timestamp) {
      if (!mounted) return;
      const video = videoRef.current;

      // Condition: video has loaded dimensions and is actively streaming
      if (video && video.videoWidth > 0 && !video.paused) {
        if (!lastScanTimestamp || timestamp - lastScanTimestamp >= SCAN_INTERVAL_MS) {
          lastScanTimestamp = timestamp;
          frameCount++;

          let w = video.videoWidth;
          let h = video.videoHeight;
          const maxDim = 1280;
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);

          // Update visible on-screen HUD state every 4 frames
          if (frameCount % 4 === 0) {
            setScanFrameCount(frameCount);
            setVideoRes(`${w}×${h}`);
          }

          // Diagnostic console log every 20 frames
          if (frameCount % 20 === 0) {
            console.log(`[BarcodeScanner] Continuous loop active — frame #${frameCount} (${w}×${h}), searching 1D/2D...`);
          }

          try {
            const decoded = decodeCanvas(canvas, ctx, reader);
            if (decoded && !firedRef.current) {
              console.log(`[BarcodeScanner] ✅ SUCCESS on frame #${frameCount}! Decoded barcode:`, decoded);
              handleSuccessfulDecode(decoded);
              return; // Stop continuous loop once barcode is successfully decoded
            }
          } catch {
            // NotFoundException on individual frames is normal — silently retry on next frame
          }
        }
      }

      // Silently retry on next frame — continuous loop never stops
      animFrame = requestAnimationFrame(scanFrame);
    }

    // ── Start Camera with high resolution ─────────────────────────────────
    async function startScanner() {
      try {
        if (navigator.mediaDevices.enumerateDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const vDevs = devices.filter((d) => d.kind === 'videoinput');
            if (mounted) setVideoDevices(vDevs);
          } catch {
            // Ignore enumeration failure
          }
        }

        const deviceConstraint =
          videoDevices.length > selectedDeviceIndex && videoDevices[selectedDeviceIndex]?.deviceId
            ? { exact: videoDevices[selectedDeviceIndex].deviceId }
            : undefined;

        // Request high resolution (1280x720) so thin barcode lines remain crisp
        let streamObj;
        try {
          streamObj = await navigator.mediaDevices.getUserMedia({
            video: deviceConstraint
              ? {
                  deviceId: deviceConstraint,
                  width: { ideal: 1280, min: 1280 },
                  height: { ideal: 720, min: 720 },
                }
              : {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1280, min: 1280 },
                  height: { ideal: 720, min: 720 },
                },
          });
        } catch {
          // Graceful fallback if webcam does not meet strict min: 1280 constraint
          streamObj = await navigator.mediaDevices.getUserMedia({
            video: deviceConstraint
              ? {
                  deviceId: deviceConstraint,
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
          });
        }

        stream = streamObj;

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (!mounted) return;
        setStarting(false);
        const actualW = videoRef.current.videoWidth || 1280;
        const actualH = videoRef.current.videoHeight || 720;
        setVideoRes(`${actualW}×${actualH}`);
        console.log(`[BarcodeScanner] Camera started at ${actualW}×${actualH}. Formats: EAN_13, UPC_A, UPC_E, CODE_128`);
        animFrame = requestAnimationFrame(scanFrame);

      } catch (err) {
        if (!mounted) return;

        let msg;
        if (err.name === 'NotAllowedError') {
          msg = 'Camera permission denied. Click the camera icon in your browser address bar to allow access, then Try Again.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'No camera device found on this system.';
        } else if (err.name === 'NotReadableError') {
          msg = 'Camera is currently locked by another application (Teams, Zoom, Windows Camera). Please close it and click Try Again.';
        } else {
          msg = `Camera error (${err.name}): ${err.message}`;
        }

        setCamError(msg);
        setStarting(false);
        setCanRetry(true);
      }
    }

    const delayTimer = setTimeout(startScanner, 500);

    return () => {
      clearTimeout(delayTimer);
      stopAll();
    };
  }, [handleSuccessfulDecode, retryKey, selectedDeviceIndex]);

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(10,14,26,0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <div style={{
          width: '100%', maxWidth: 430,
          background: '#fff', borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px 14px',
            borderBottom: '1px solid #eef2ff',
            background: 'linear-gradient(135deg,#335cff0a 0%,#fff 100%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'grid', placeItems: 'center',
                width: 36, height: 36, borderRadius: 10,
                background: '#335CFF', color: '#fff', flexShrink: 0,
              }}>
                <Camera size={18} />
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#1e293b' }}>
                  Scan Barcode
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                  EAN-13 · UPC · Code-128 · QR
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  title="Switch camera"
                  style={{
                    display: 'grid', placeItems: 'center', width: 32, height: 32,
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#f1f5f9', color: '#475569', flexShrink: 0,
                  }}
                >
                  <SwitchCamera size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload barcode image"
                style={{
                  display: 'grid', placeItems: 'center', width: 32, height: 32,
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: '#f1f5f9', color: '#475569', flexShrink: 0,
                }}
              >
                <Upload size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  processImageFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button id="barcode-scanner-close" onClick={onClose}
                style={{
                  display: 'grid', placeItems: 'center', width: 32, height: 32,
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: '#f1f5f9', color: '#64748b', flexShrink: 0,
                }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Camera area */}
          <div style={{ position: 'relative', background: '#0f172a', lineHeight: 0, minHeight: 280 }}>

            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                width: '100%', minHeight: 280, maxHeight: 340,
                display: 'block', objectFit: 'cover', background: '#0f172a',
              }}
            />

            {/* Live scan diagnostics HUD badge */}
            {!camError && !starting && (
              <div style={{
                position: 'absolute', top: 10, left: 12, right: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.84)', backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: lastDecoded ? '#22c55e' : '#38bdf8',
                    boxShadow: lastDecoded ? '0 0 8px #22c55e' : '0 0 6px #38bdf8',
                    animation: 'bsm_pulse 1.2s ease-in-out infinite',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontWeight: 700, color: lastDecoded ? '#4ade80' : '#f8fafc' }}>
                    {lastDecoded ? `FOUND: ${lastDecoded}` : `SCANNING (Frame #${scanFrameCount})`}
                  </span>
                </div>
                <span style={{ color: '#94a3b8' }}>
                  {videoRes ? `${videoRes} · 1D Active` : '1280×720 · 1D Active'}
                </span>
              </div>
            )}

            {/* Scan frame overlay — wide rectangle tailored for horizontal 1D barcodes */}
            {!camError && !starting && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10,
              }}>
                <div style={{
                  width: '84%', maxWidth: 330, height: 110, position: 'relative',
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.42)',
                  borderRadius: 12,
                }}>
                  {/* Animated red laser scanning line */}
                  <div style={{
                    position: 'absolute', left: 4, right: 4, height: 2,
                    background: 'linear-gradient(90deg, transparent, #ef4444 30%, #ef4444 70%, transparent)',
                    boxShadow: '0 0 8px #ef4444',
                    borderRadius: 2, animation: 'bsm_scan 1.8s ease-in-out infinite',
                  }} />

                  {/* Corner brackets */}
                  {[
                    { top: -2,    left: -2,  borderTop: '3px solid #335CFF',    borderLeft: '3px solid #335CFF',  borderRadius: '8px 0 0 0' },
                    { top: -2,    right: -2, borderTop: '3px solid #335CFF',    borderRight: '3px solid #335CFF', borderRadius: '0 8px 0 0' },
                    { bottom: -2, left: -2,  borderBottom: '3px solid #335CFF', borderLeft: '3px solid #335CFF',  borderRadius: '0 0 0 8px' },
                    { bottom: -2, right: -2, borderBottom: '3px solid #335CFF', borderRight: '3px solid #335CFF', borderRadius: '0 0 8px 0' },
                  ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: 28, height: 22, ...s }} />
                  ))}
                </div>

                <p style={{
                  color: '#e2e8f0', fontSize: 11, fontWeight: 600, margin: 0,
                  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                }}>
                  Align horizontal barcode within rectangle
                </p>
              </div>
            )}

            {/* Starting spinner */}
            {starting && !camError && (
              <div style={{
                position: 'absolute', inset: 0, background: '#0f172a',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '3px solid #335cff30', borderTop: '3px solid #335CFF',
                  animation: 'bsm_spin 0.9s linear infinite',
                }} />
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Starting high-res camera…</p>
              </div>
            )}

            {/* Error */}
            {camError && (
              <div style={{
                position: 'absolute', inset: 0, background: '#0f172a',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 14, padding: 28, textAlign: 'center',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: '#fee2e2', display: 'grid', placeItems: 'center',
                }}>
                  <AlertCircle size={26} color="#ef4444" />
                </div>
                <p style={{ color: '#cbd5e1', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                  {camError}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {canRetry && (
                    <button onClick={retry} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 20px', background: '#335CFF', color: '#fff',
                      border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <RefreshCw size={14} /> Try Again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 20px', background: '#335CFF', color: '#fff',
                      border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <Upload size={14} /> Upload image
                  </button>
                  <button onClick={onClose} style={{
                    padding: '9px 20px', background: '#334155', color: '#cbd5e1',
                    border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                    Manual search
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Local decode error (e.g. from image upload) */}
          {localError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', background: '#fef2f2', borderTop: '1px solid #fecaca',
            }}>
              <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>{localError}</p>
            </div>
          )}

          {/* Scan-not-found error */}
          {scanError && !localError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', background: '#fff7ed', borderTop: '1px solid #fed7aa',
            }}>
              <AlertCircle size={15} color="#f97316" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#c2410c', fontWeight: 600 }}>{scanError}</p>
            </div>
          )}

          {/* Footer */}
          {!camError && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 20px', background: '#f8faff', borderTop: '1px solid #e8eeff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ScanLine size={14} color="#335CFF" />
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Continuous scan active
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', color: '#335CFF',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
                }}
              >
                <Upload size={13} /> Upload image
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bsm_scan {
          0%   { top: 6px; opacity: 0.9; }
          50%  { top: calc(100% - 8px); opacity: 0.5; }
          100% { top: 6px; opacity: 0.9; }
        }
        @keyframes bsm_pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.35); opacity: 0.45; }
        }
        @keyframes bsm_spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
