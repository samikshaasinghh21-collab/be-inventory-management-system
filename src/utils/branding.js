import defaultBrandLogo from "../assets/images/bangalore-electronics-logo.png";

const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

export const resolveBrandLogo = (logoUrl = "") => {
  const value = String(logoUrl || "").trim();
  if (!value) {
    return defaultBrandLogo;
  }
  if (WINDOWS_PATH_PATTERN.test(value) || value.includes("\\")) {
    return defaultBrandLogo;
  }
  return value;
};

export const resolveBrandName = (brandName = "") => {
  const value = String(brandName || "").trim();
  return value.toLowerCase() === "be inventory"
    ? "BANGALORE ELECTRONICS"
    : value || "BANGALORE ELECTRONICS";
};

export const defaultBrandLogoUrl = defaultBrandLogo;
