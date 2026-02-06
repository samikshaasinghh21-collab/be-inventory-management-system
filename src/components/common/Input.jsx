import React from 'react';

export default function Input({ label, placeholder, type = 'text', className, ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <input 
        type={type} 
        placeholder={placeholder} 
        className={`input ${className || ''}`} 
        {...props}
      />
    </div>
  );
}
