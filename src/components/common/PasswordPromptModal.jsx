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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
        <div className="space-y-3 px-6 py-5">
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
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PasswordPromptModal;
