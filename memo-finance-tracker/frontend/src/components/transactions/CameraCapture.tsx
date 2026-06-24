import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw, Check } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface CameraCaptureProps {
  open: boolean
  onCapture: (file: File) => void
  onClose: () => void
}

/**
 * Full-screen in-app camera using getUserMedia. Unlike a native
 * `<input capture>` (which the Home Assistant Companion webview routes to the
 * gallery), this opens a live preview so the user can take a photo without
 * leaving the app. Requires an HTTPS context (HA ingress provides one) and a
 * webview camera permission grant. On any failure it shows a hint to fall back
 * to the file/gallery picker.
 */
export default function CameraCapture({ open, onCapture, onClose }: CameraCaptureProps) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<File | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState(false)

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startStream() {
    setStarting(true)
    setError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStarting(false)
    } catch {
      setError(true)
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fileRef.current = null
    setSnapshot(null)
    void (async () => {
      await startStream()
      if (cancelled) stopStream()
    })()
    return () => {
      cancelled = true
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleCapture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        fileRef.current = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setSnapshot(URL.createObjectURL(blob))
        stopStream()
      },
      'image/jpeg',
      0.9,
    )
  }

  function handleRetake() {
    if (snapshot) URL.revokeObjectURL(snapshot)
    setSnapshot(null)
    fileRef.current = null
    void startStream()
  }

  function cleanup() {
    if (snapshot) URL.revokeObjectURL(snapshot)
    setSnapshot(null)
    fileRef.current = null
    stopStream()
  }

  function handleUse() {
    const file = fileRef.current
    cleanup()
    onClose()
    if (file) onCapture(file)
  }

  function handleClose() {
    cleanup()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">{t('receipt.cameraTitle')}</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('action.cancel')}
          className="rounded-full p-1.5 hover:bg-white/10"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-6 text-center text-sm text-white/90">{t('receipt.cameraError')}</p>
        ) : snapshot ? (
          <img src={snapshot} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                {t('receipt.cameraStarting')}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-10 px-6 py-6">
        {error ? (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-white/15 px-5 py-2.5 text-sm font-medium text-white"
          >
            {t('action.cancel')}
          </button>
        ) : snapshot ? (
          <>
            <button type="button" onClick={handleRetake} className="flex flex-col items-center gap-1 text-white">
              <span className="rounded-full bg-white/15 p-3">
                <RotateCcw size={22} />
              </span>
              <span className="text-xs">{t('receipt.retake')}</span>
            </button>
            <button type="button" onClick={handleUse} className="flex flex-col items-center gap-1 text-white">
              <span className="rounded-full bg-primary-600 p-3">
                <Check size={22} />
              </span>
              <span className="text-xs">{t('receipt.usePhoto')}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCapture}
            disabled={starting}
            aria-label={t('receipt.capture')}
            className="h-16 w-16 rounded-full bg-white ring-4 ring-white/30 disabled:opacity-40"
          />
        )}
      </div>
    </div>
  )
}
