const STORAGE_KEY = "products";

const emitChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("products:changed"));
  }
};

export const getProducts = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const setProducts = (products) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  emitChange();
};

export const saveProduct = (product) => {
  const products = getProducts();
  const next = [...products, product];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
  return product;
};

export const updateProduct = (id, updates) => {
  const products = getProducts();
  const next = products.map((product) =>
    product.id === id ? { ...product, ...updates } : product
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
};

export const deleteProduct = (id) => {
  const products = getProducts();
  const next = products.filter((product) => product.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
};
