const CATEGORY_STORAGE_KEY = "productCategories";

const DEFAULT_CATEGORIES = [
  "Networking",
  "Hardware",
  "Software",
  "Electrical",
  "Consumables",
  "Services",
];

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("categories:changed"));
  }
};

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const getCategories = () => {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CATEGORY_STORAGE_KEY) || "[]"
    );
    const merged = [
      ...DEFAULT_CATEGORIES,
      ...(Array.isArray(stored) ? stored : []),
    ]
      .map((value) => String(value).trim())
      .filter(Boolean);

    return dedupe(merged);
  } catch {
    return DEFAULT_CATEGORIES;
  }
};

export const addCategory = (name) => {
  const value = (name || "").trim();
  if (!value) {
    return getCategories();
  }

  const categories = getCategories();
  const exists = categories.some(
    (category) => category.toLowerCase() === value.toLowerCase()
  );
  if (exists) {
    return categories;
  }

  const stored = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY) || "[]");
  const nextCustom = Array.isArray(stored) ? [...stored, value] : [value];
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(nextCustom));
  emitChange();

  return dedupe([...categories, value]);
};

export const resetCategories = () => {
  localStorage.removeItem(CATEGORY_STORAGE_KEY);
  emitChange();
  return DEFAULT_CATEGORIES;
};
