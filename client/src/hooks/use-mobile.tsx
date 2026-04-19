import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

function getInitialWidth() {
  if (typeof window === "undefined") return 1280
  return window.innerWidth
}

export function useIsMobile() {
  const [width, setWidth] = React.useState<number>(getInitialWidth)

  React.useEffect(() => {
    const onChange = () => setWidth(window.innerWidth)
    window.addEventListener("resize", onChange)
    onChange()
    return () => window.removeEventListener("resize", onChange)
  }, [])

  return width < MOBILE_BREAKPOINT
}

export function useDeviceType(): "mobile" | "tablet" | "desktop" {
  const [width, setWidth] = React.useState<number>(getInitialWidth)

  React.useEffect(() => {
    const onChange = () => setWidth(window.innerWidth)
    window.addEventListener("resize", onChange)
    onChange()
    return () => window.removeEventListener("resize", onChange)
  }, [])

  if (width < MOBILE_BREAKPOINT) return "mobile"
  if (width < TABLET_BREAKPOINT) return "tablet"
  return "desktop"
}
