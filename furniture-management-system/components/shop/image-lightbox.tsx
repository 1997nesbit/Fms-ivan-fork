"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

interface ImageLightboxProps {
  images: { id: number; image: string }[]
  initialIndex?: number
  open: boolean
  onClose: () => void
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex)

  useEffect(() => {
    setCurrent(initialIndex)
  }, [initialIndex, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") setCurrent((c) => (c + 1) % images.length)
      if (e.key === "ArrowLeft") setCurrent((c) => (c - 1 + images.length) % images.length)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, images.length, onClose])

  if (!open || images.length === 0) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      {/* Stop propagation so clicks on image/arrows don't close */}
      <div
        className="relative flex max-h-[90vh] max-w-3xl items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[current].image}
          alt={`Image ${current + 1} of ${images.length}`}
          className="max-h-[85vh] max-w-full rounded-lg object-contain"
        />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        {/* Prev / Next */}
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((c) => (c - 1 + images.length) % images.length)}
              className="absolute left-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Previous image"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setCurrent((c) => (c + 1) % images.length)}
              className="absolute right-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Next image"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {current + 1} / {images.length}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
