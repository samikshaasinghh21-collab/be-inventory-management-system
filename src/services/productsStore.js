import { hydrateWorkspaceData, persistWorkspaceData } from "./workspaceDataApi";

const STORAGE_KEY = "products";
const SERVER_KEY = "products";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("products:changed"));
  }
};

export const getProducts = () => {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    hydrateWorkspaceData(SERVER_KEY, records, (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(value) ? value : []));
      emitChange();
    });
    return records;
  } catch {
    return [];
  }
};

export const setProducts = (products) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  persistWorkspaceData(SERVER_KEY, products);
  emitChange();
};

export const saveProduct = (product) => {
  const products = getProducts();
  const next = [...products, product];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
  return product;
};

export const updateProduct = (id, updates) => {
  const products = getProducts();
  const next = products.map((product) =>
    product.id === id ? { ...product, ...updates } : product
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
};

export const deleteProduct = (id) => {
  const products = getProducts();
  const next = products.filter((product) => product.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  persistWorkspaceData(SERVER_KEY, next);
  emitChange();
};
