import { useEffect, useRef, useState } from 'react'

/**
 * Laat de terugknop van de telefoon (of de veeg vanaf de rand) één stap terug
 * doen binnen een pagina die haar stappen in state bijhoudt, in plaats van de
 * hele pagina te verlaten. Zolang `active` waar is staat er één extra regel in
 * de browsergeschiedenis; "terug" haalt die weg en roept `onBack` aan.
 */
export function useInAppBack(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack)
  const held = useRef(false)
  const ignoreNext = useRef(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (active && !held.current) {
      held.current = true
      window.history.pushState({ ...(window.history.state ?? {}), inApp: true }, '')
    } else if (!active && held.current) {
      // Met de knop in het scherm bij het begin uitgekomen: onze regel opruimen
      held.current = false
      ignoreNext.current = true
      window.history.back()
    }
  }, [active, round])

  useEffect(() => {
    const onPop = () => {
      if (ignoreNext.current) {
        ignoreNext.current = false
        return
      }
      if (!held.current) return
      held.current = false
      onBackRef.current()
      // Nog niet bij het begin: de regel opnieuw neerleggen
      setRound((r) => r + 1)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
}
