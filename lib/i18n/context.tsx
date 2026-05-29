"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { translations, type Language, type TranslationKey } from "./translations"

interface LanguageContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "zh",
  setLang: () => {},
  t: (key) => translations.zh[key] ?? key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("zh")

  useEffect(() => {
    const saved = localStorage.getItem("artifacta_lang")
    if (saved === "zh" || saved === "en") setLangState(saved)
  }, [])

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem("artifacta_lang", newLang)
  }

  const t = useCallback((key: TranslationKey): string => translations[lang][key] ?? translations.zh[key] ?? key, [lang])

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
