"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraIcon, CameraOffIcon, ImageIcon, QrCodeIcon, ScanLineIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { detectCode, getBarcodeDetector, type DetectedCode } from "@/modules/documents/utils/barcode-reader";
import { parseReceiptCode } from "@/modules/documents/utils/parse-receipt-code";

type ComposerDict = Dictionary["inbox"]["composer"];
type CameraState = "off" | "starting" | "on" | "unavailable";

/** How often the live preview is checked for a code. */
const DETECT_INTERVAL_MS = 350;

/**
 * Scan mode: a live camera viewfinder that picks up the receipt's QR code or
 * barcode, then takes the whole receipt as a photo. The code and the photo go
 * up together — the code cross-checks the header, the photo supplies the items.
 * Without a camera (or permission) the user picks a photo and the code is read
 * from the still image instead.
 */
export function ReceiptScanner({
  dict,
  file,
  code,
  onCapture,
  onClear,
}: {
  dict: ComposerDict;
  file: File | null;
  code: DetectedCode | null;
  onCapture: (file: File, code: DetectedCode | null) => void;
  onClear: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<CameraState>("off");
  const [liveCode, setLiveCode] = useState<DetectedCode | null>(null);
  const [searched, setSearched] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera((state) => (state === "unavailable" ? state : "off"));
  }, []);

  // Release the camera when the mode closes.
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    setLiveCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamera("on");
      // Warm the reader (and its .wasm) while the user frames the receipt.
      void getBarcodeDetector().catch(() => undefined);
    } catch {
      streamRef.current = null;
      setCamera("unavailable");
    }
  }

  // Look for a code in the live preview until one is found.
  useEffect(() => {
    if (camera !== "on" || liveCode) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const found = await detectCode(video);
        if (cancelled) return;
        if (found) {
          setLiveCode(found);
          navigator.vibrate?.(60);
          return;
        }
      }
      if (!cancelled) timer = setTimeout(tick, DETECT_INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [camera, liveCode]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    // A code missed in the preview may still be readable in the full frame.
    const found = liveCode ?? (await detectCode(canvas));
    stopCamera();
    setSearched(true);
    onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }), found);
  }

  async function pickPhoto(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    stopCamera();
    const found = await readCodeFromImage(picked);
    setSearched(true);
    onCapture(picked, found);
  }

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const shownCode = file ? code : liveCode;
  const shownKind = shownCode ? parseReceiptCode(shownCode.raw, shownCode.format)?.kind ?? null : null;

  return (
    <div className="rounded-(--neu-radius-md) border border-border-soft bg-surface-sunken p-4">
      <h2 className="text-sm font-semibold text-text-primary">{dict.scanTitle}</h2>
      <p className="mt-1 text-xs text-text-muted">{dict.scanDescription}</p>

      {!file && (
        <>
          <div className={camera === "on" || camera === "starting" ? "relative mt-3 overflow-hidden rounded-(--neu-radius-md) bg-black" : "hidden"}>
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover md:aspect-video" />
            {/* Framing guide; purely visual. */}
            <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/70" />
            <p aria-live="polite" className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-center text-xs font-medium text-white">
              {liveCode ? dict.codeFound.replace("{kind}", shownKind ? dict.codeKinds[shownKind] : "") : dict.scanLooking}
            </p>
          </div>

          {camera === "unavailable" && (
            <p role="alert" className="mt-3 text-xs font-medium text-accent-yellow">
              {dict.cameraUnavailable}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {camera === "on" ? (
              <>
                <Button type="button" className="min-h-11 flex-1" onClick={takePhoto}>
                  <CameraIcon size={17} aria-hidden /> {dict.scanCapture}
                </Button>
                <Button type="button" variant="secondary" className="min-h-11" onClick={stopCamera} aria-label={dict.scanStop}>
                  <CameraOffIcon size={17} aria-hidden />
                  <span className="sm:sr-only">{dict.scanStop}</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 flex-1"
                onClick={startCamera}
                isLoading={camera === "starting"}
                disabled={camera === "unavailable"}
              >
                <ScanLineIcon size={17} aria-hidden /> {dict.scanStart}
              </Button>
            )}
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => pickerRef.current?.click()}>
              <ImageIcon size={17} aria-hidden /> {dict.scanFromImage}
            </Button>
            <input
              ref={pickerRef}
              className="sr-only"
              type="file"
              accept="image/*"
              tabIndex={-1}
              onChange={(event) => {
                void pickPhoto(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </>
      )}

      {file && previewUrl && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-(--neu-radius-md) bg-surface p-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-(--neu-radius-sm) bg-surface-sunken">
              <Image src={previewUrl} alt="" width={56} height={56} unoptimized className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                {shownKind ? (
                  <>
                    <QrCodeIcon size={13} className="text-accent-green" aria-hidden />
                    {dict.codeFound.replace("{kind}", dict.codeKinds[shownKind])}
                  </>
                ) : searched ? (
                  dict.scanNoCode
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearched(false);
                setLiveCode(null);
                onClear();
              }}
              aria-label={`${dict.removeLabel} ${file.name}`}
              className="cursor-pointer rounded-(--neu-radius-sm) p-2 text-text-muted hover:bg-surface-sunken hover:text-danger"
            >
              <Trash2Icon size={17} aria-hidden />
            </button>
          </div>
          {shownKind === "product_code" && <p className="text-xs font-medium text-accent-yellow">{dict.productCodeHint}</p>}
        </div>
      )}
    </div>
  );
}

async function readCodeFromImage(file: File): Promise<DetectedCode | null> {
  if (typeof createImageBitmap !== "function") return detectCode(file);
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return await detectCode(bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return detectCode(file);
  }
}
