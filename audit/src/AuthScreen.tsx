import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import {
  ArrowRight,
  Check,
  Leaf,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
export const authClient = createAuthClient();
export default function AuthScreen() {
  const token = new URLSearchParams(location.search).get("token");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    token ? "reset" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result =
        mode === "register"
          ? await authClient.signUp.email({
              name,
              email,
              password,
              callbackURL: location.origin,
            })
          : mode === "login"
            ? await authClient.signIn.email({ email, password })
            : mode === "forgot"
              ? await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${location.origin}/reset-password`,
                })
              : await authClient.resetPassword({
                  newPassword: password,
                  token: token ?? "",
                });
      if (result.error)
        throw new Error(
          result.error.message ?? "Please check your details and try again.",
        );
      if (mode === "register")
        setMessage(
          "Your account is created. If email verification is required, check your inbox to finish signing up.",
        );
      if (mode === "forgot")
        setMessage(
          "If an account exists for this email, a password reset link will be sent.",
        );
      if (mode === "reset") {
        setMode("login");
        history.replaceState(null, "", "/");
        setMessage("Password updated. You can now sign in.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <span />
          </span>
          <span>
            audit<span className="brand-dot">.</span>
            <small>by zoomi</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">A CLEARER WAY TO GROW</span>
          <h1>
            Your website has
            <br />
            more to give.
          </h1>
          <p>
            Connect your data. Find your next opportunity.
            <br />
            Build a website that works harder for your business.
          </p>
          <ul>
            <li>
              <ShieldCheck />
              Continuous website monitoring
            </li>
            <li>
              <Leaf />
              Rankings, backlinks and competitor pages
            </li>
            <li>
              <Check />
              Changes and priorities in one workspace
            </li>
          </ul>
        </div>
        <small>Built with care by Zoomi.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <span className="eyebrow">YOUR AUDIT WORKSPACE</span>
          <h2>
            {mode === "login"
              ? "Good to have you back."
              : mode === "register"
                ? "Let’s get you growing."
                : mode === "forgot"
                  ? "Let’s get you back in."
                  : "Choose a new password."}
          </h2>
          <p>
            {mode === "register"
              ? "Create your private account, then add your website and choose a subscription."
              : "Sign in to your website’s next chapter."}
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                />
                {mode !== "login" && <small>At least 12 characters.</small>}
              </label>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="success-banner" role="status">
                {message}
              </div>
            )}
            <button disabled={busy} className="button primary full">
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <>
                  {mode === "login"
                    ? "Sign in"
                    : mode === "register"
                      ? "Create account"
                      : mode === "forgot"
                        ? "Send reset link"
                        : "Save password"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
            {mode === "login" && (
              <button onClick={() => setMode("forgot")}>
                Forgot your password?
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
