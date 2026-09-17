import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import AuthShell from "../components/auth/AuthShell";
import Button from "../components/common/Button";
import { completePasswordMfa, login, loginWithPasskey } from "../services/authService";
const validateEmail = (value) => /.+@.+\..+/.test(value);

const Login = () => {
  const navigate = useNavigate();
  const timersRef = useRef([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);
  const [mfaTransaction, setMfaTransaction] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [authStep, setAuthStep] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const loadingText = authStep || "Sign in";

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (totpRequired) {
      if (!totpCode.trim()) {
        setFormError("Enter your authenticator or recovery code.");
        return;
      }
      setIsSubmitting(true);
      setAuthStep("Verifying...");
      try {
        await completePasswordMfa({ ...mfaTransaction, code: totpCode });
        navigate("/", { replace: true });
      } catch (error) {
        setFormError(error?.response?.data?.error || "Unable to verify sign-in");
        setIsSubmitting(false);
        setAuthStep("");
      }
      return;
    }
    const nextErrors = {
      email: email.trim() ? (validateEmail(email) ? "" : "Enter a valid email") : "Email is required",
      password: password ? "" : "Password is required",
    };

    setErrors(nextErrors);
    setFormError("");
    if (Object.values(nextErrors).some(Boolean)) return;

    setIsSubmitting(true);
    setAuthStep("Authenticating...");
    try {
      const result = await login(email, password);
      if (result.code === "MFA_REQUIRED") {
        setMfaTransaction({
          transactionId: result.transactionId,
          transactionToken: result.transactionToken,
        });
        setTotpRequired(true);
        setFormError("Enter your authenticator or recovery code.");
        setAuthStep("");
        setIsSubmitting(false);
        return;
      }
      setIsSuccess(true);
      setAuthStep("Welcome back");
      timersRef.current = [
        setTimeout(() => navigate("/"), 700),
      ];
    } catch (error) {
      setFormError(error?.response?.data?.error || error?.message || "Sign in failed");
      setAuthStep("");
      setIsSubmitting(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setFormError("");
    setIsSubmitting(true);
    setAuthStep("Waiting for passkey...");
    try {
      await loginWithPasskey();
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(error?.response?.data?.error || error?.message || "Passkey sign-in was not completed");
      setIsSubmitting(false);
      setAuthStep("");
    }
  };

  return (
    <AuthShell title={totpRequired ? "Verify your identity" : "Welcome back"} subtitle={totpRequired ? "Enter a code from your authenticator or a saved recovery code." : "Sign in to your Bangalore Electronics workspace."} helper={<p>New to the workspace? <strong>Ask your administrator for an invitation.</strong></p>}>
      <form className="be-signin" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
        {formError && <p className="people-notice people-notice-warning" role="alert">{formError}</p>}
        {!totpRequired ? <>
          <label htmlFor="email">Work email<input id="email" className="people-input" type="email" autoComplete="email" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />{errors.email && <small id="email-error" className="people-field-error">{errors.email}</small>}</label>
          <label htmlFor="password">Password<div className="be-password-field"><input id="password" className="people-input" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.password && <small id="password-error" className="people-field-error">{errors.password}</small>}</label>
          <Link className="be-forgot-link" to="/forgot-password">Forgot password?</Link>
        </> : <label htmlFor="totpCode">Authenticator or recovery code<input id="totpCode" className="people-input" type="text" autoComplete="one-time-code" autoFocus required value={totpCode} onChange={(event) => setTotpCode(event.target.value)} placeholder="Enter your verification code" /></label>}
        <Button type="submit" disabled={isSubmitting} className="be-auth-primary">{isSubmitting ? <Loader2 size={17} className="animate-spin" /> : isSuccess ? <Check size={17} /> : null}{loadingText}<ArrowRight size={17} /></Button>
        {!totpRequired && <><div className="be-auth-divider"><span />or continue securely with<span /></div><Button type="button" variant="secondary" disabled={isSubmitting} onClick={handlePasskeyLogin} className="be-auth-primary"><Fingerprint size={18} />Sign in with a passkey</Button></>}
      </form>
    </AuthShell>
  );
};

export default Login;
