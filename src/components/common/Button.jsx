import React from 'react';

export default function Button({ children, onClick, className, ...props }) {
  return (
    <button 
      className={`btn ${className || ''}`} 
      onClick={onClick} 
      {...props}
    >
      {children}
    </button>
  );
}
