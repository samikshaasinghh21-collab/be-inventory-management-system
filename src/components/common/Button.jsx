export default function Button({ children, className = "", variant = "primary", size = "md", type = "button", ...props }) {
  return <button type={type} className={`app-btn app-btn-${variant} app-btn-${size} ${className}`} {...props}>{children}</button>;
}
