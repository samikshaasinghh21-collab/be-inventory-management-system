import { useEffect, useState } from "react";
import { getSettings } from "../services/settingsStore";

const useSettings = () => {
  const [settings, setSettings] = useState(() => getSettings());

  useEffect(() => {
    const handleChange = () => {
      setSettings(getSettings());
    };

    if (typeof window !== "undefined") {
      window.addEventListener("settings:changed", handleChange);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("settings:changed", handleChange);
      }
    };
  }, []);

  return settings;
};

export default useSettings;
