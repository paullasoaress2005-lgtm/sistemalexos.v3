"use client";

import { useEffect, useState } from "react";
import {
  applyLexosVisualPreference,
  getVisualPreferenceTheme,
  LEXOS_VISUAL_PREFERENCE_EVENT,
  loadSettings,
  type VisualPreferenceOption,
} from "@/lib/data/settings";

export function WorkspaceTheme({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(() => getVisualPreferenceTheme("Navy premium"));

  useEffect(() => {
    let active = true;

    async function hydrateTheme() {
      const settings = await loadSettings();
      if (!active) return;
      const nextTheme = getVisualPreferenceTheme(settings.workspace.visualPreference);
      setTheme(nextTheme);
      applyLexosVisualPreference(settings.workspace.visualPreference);
    }

    function handlePreference(event: Event) {
      const preference = (event as CustomEvent<{ preference?: VisualPreferenceOption }>).detail?.preference ?? "Navy premium";
      const nextTheme = getVisualPreferenceTheme(preference);
      setTheme(nextTheme);
      applyLexosVisualPreference(preference);
    }

    void hydrateTheme();
    window.addEventListener(LEXOS_VISUAL_PREFERENCE_EVENT, handlePreference as EventListener);
    window.addEventListener("storage", hydrateTheme);

    return () => {
      active = false;
      window.removeEventListener(LEXOS_VISUAL_PREFERENCE_EVENT, handlePreference as EventListener);
      window.removeEventListener("storage", hydrateTheme);
    };
  }, []);

  return (
    <div className="lexos-theme-shell lexos-density-compact relative min-h-screen overflow-x-hidden bg-lexos-ink bg-premium-radial transition-colors duration-300" data-lexos-theme={theme}>
      {children}
    </div>
  );
}
