const STORAGE_KEY = "items";

const getLocalItems = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const setLocalItems = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const fetchItems = async () => {
  return getLocalItems();
};

export const createItem = async (item) => {
  const items = getLocalItems();
  const payload = { id: Date.now(), ...item };
  const next = [...items, payload];
  setLocalItems(next);
  return payload;
};

export const deleteItemApi = async (id) => {
  const items = getLocalItems();
  const next = items.filter((item) => item.id !== id);
  setLocalItems(next);
};

export const updateQuantityApi = async (id, quantity) => {
  const items = getLocalItems();
  const next = items.map((item) =>
    item.id === id ? { ...item, stock: quantity } : item
  );
  setLocalItems(next);
  return next.find((item) => item.id === id);
};

export const itemInfoApi = async (id, name, quantity) => {
  return { id, name, quantity };
};
