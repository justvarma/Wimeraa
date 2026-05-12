"use client"

import { useEffect } from "react"

const RECOVERY_KEY = "wimera:chunk-load-recovered"

function isChunkLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const name = error instanceof Error ? error.name : ""
  return (
    name === "ChunkLoadError" ||
    /ChunkLoadError/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /Loading chunk .+ failed/i.test(message) ||
    /_next\/static\/chunks\//i.test(message)
  )
}

function reloadOnceForFreshChunks() {
  if (sessionStorage.getItem(RECOVERY_KEY) === "1") return
  sessionStorage.setItem(RECOVERY_KEY, "1")
  window.location.reload()
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    sessionStorage.removeItem(RECOVERY_KEY)

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
        event.preventDefault()
        reloadOnceForFreshChunks()
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        event.preventDefault()
        reloadOnceForFreshChunks()
      }
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}