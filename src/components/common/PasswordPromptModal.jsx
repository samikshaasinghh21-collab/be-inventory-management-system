const PasswordPromptModal = ({
  isOpen,
  title,
  description,
  password,
  error,
  confirmLabel = "Confirm",
  onPasswordChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    onConfirm();
  };

  const passwordInputId = "admin-password";
  const usernameInputId = "admin-username";

  return (
    <div className="modal-overlay">
      <form onSubmit={handleSubmit} className="modal-content w-full max-w-md">
        <div className="modal-header">
          <div>
            <h2 className="display-font text-lg font-bold text-slate-900">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>

        <div className="modal-body space-y-3">
          <div className="sr-only">
            <label htmlFor={usernameInputId}>Username</label>
            <input
              id={usernameInputId}
              type="text"
              name="username"
              autoComplete="username"
              value="admin"
              readOnly
              tabIndex={-1}
            />
          </div>

          <label
            htmlFor={passwordInputId}
            className="block text-sm font-medium text-slate-700"
          >
            Admin Password
          </label>
          <input
            id={passwordInputId}
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="input w-full text-sm"
            name="adminPassword"
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "admin-password-error" : undefined}
            autoFocus
          />
          {error ? (
            <p id="admin-password-error" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="modal-footer justify-end border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="app-btn app-btn-outline text-sm"
          >
            Cancel
          </button>
          <button type="submit" className="app-btn app-btn-primary text-sm">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PasswordPromptModal;
