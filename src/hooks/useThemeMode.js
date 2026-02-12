import { useEffect } from "react";
import useSettings from "./useSettings";

const useThemeMode = () => {
  const theme = useSettings()?.preferences?.theme || "Light";

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyMode = (isDark) => {
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };

    if (theme === "System") {
      applyMode(media.matches);
      const handler = (event) => applyMode(event.matches);

      if (media.addEventListener) {
        media.addEventListener("change", handler);
        return () => media.removeEventListener("change", handler);
      }

      media.addListener(handler);
      return () => media.removeListener(handler);
    }

    applyMode(theme === "Dark");
    return undefined;
  }, [theme]);
};

export default useThemeMode;
