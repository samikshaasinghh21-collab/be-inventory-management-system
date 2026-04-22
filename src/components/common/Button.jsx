import React from 'react';

export default function Button({
  children,
  className,
  onClick,
  variant = 'primary',
  ...props
}) {
  return (
    <button 
      className={`app-btn app-btn-${variant} ${className || ''}`.trim()} 
      onClick={onClick} 
      {...props}
    >
      {children}
    </button>
  );
}
