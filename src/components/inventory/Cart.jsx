import React, { useState } from "react";
 
const loadCart = () => {
  try {
    const stored = localStorage.getItem("inventoryCart");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};
 
export default function Cart() {
  const [cartItems, setCartItems] = useState(loadCart);
 
  const persist = (next) => {
    setCartItems(next);
    localStorage.setItem("inventoryCart", JSON.stringify(next));
  };
 
  const increaseQty = (id) => {
    const next = cartItems.map((item) =>
      item.id === id ? { ...item, qty: item.qty + 1 } : item
    );
    persist(next);
  };
 
  const decreaseQty = (id) => {
    const next = cartItems
      .map((item) =>
        item.id === id ? { ...item, qty: item.qty - 1 } : item
      )
      .filter((item) => item.qty > 0);
    persist(next);
  };
 
  const total = cartItems.reduce(
    (sum, item) => sum + item.qty * item.rate,
    0
  );
 
  return (
    <div className="bg-gray-100 min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-semibold">Cart</h2>
        <div className="text-sm text-slate-600">
          Total:{" "}
          <span className="font-semibold text-slate-800">
            ₹ {total.toLocaleString("en-IN")}
          </span>
        </div>
      </div>
 
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {cartItems.length === 0 ? (
          <div className="p-6 text-slate-600">
            No items added to cart.
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-4 border text-left">Item</th>
                <th className="p-4 border text-left">Description</th>
                <th className="p-4 border text-center">HSN / SAC</th>
                <th className="p-4 border text-center">Qty</th>
                <th className="p-4 border text-right">Rate (₹)</th>
                <th className="p-4 border text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map((item) => (
                <tr key={item.id}>
                  <td className="p-4 border">
                    <div className="font-semibold">{item.name}</div>
                  </td>
                  <td className="p-4 border text-slate-600">
                    {item.description}
                  </td>
                  <td className="p-4 border text-center">{item.hsn}</td>
                  <td className="p-4 border text-center">
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={() => decreaseQty(item.id)}
                        className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <span className="font-semibold">{item.qty}</span>
                      <button
                        onClick={() => increaseQty(item.id)}
                        className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-4 border text-right">
                    {item.rate.toLocaleString("en-IN")}
                  </td>
                  <td className="p-4 border text-right font-semibold">
                    {(item.qty * item.rate).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
 
 