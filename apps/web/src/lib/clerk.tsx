import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { useEffect, type ReactNode } from "react";
import { setAuthTokenGetter } from "./api";

/**
 * Clerk is enabled only when a publishable key is provided. Without it the app
 * runs in dev-auth mode: no ClerkProvider is mounted and admin requests fall
 * back to the `x-dev-clerk-user` header (see api.ts).
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export const CLERK_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);

/** Registers Clerk's session-token getter with the api module. Renders nothing. */
function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

/** Wraps the app in ClerkProvider when configured; otherwise a passthrough. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!}>
      <AuthTokenBridge />
      {children}
    </ClerkProvider>
  );
}
