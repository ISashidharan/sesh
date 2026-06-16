import {
  RedirectToSignIn,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/clerk-react";
import { NavLink, Outlet } from "react-router-dom";
import { CLERK_ENABLED } from "../lib/clerk";

const NAV = [
  { to: "/calendars", label: "Calendars" },
  { to: "/sesh-types", label: "Sesh Types" },
  { to: "/seshes", label: "Bookings" },
];

function Shell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold tracking-tight text-indigo-600">
              sesh
            </span>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {CLERK_ENABLED ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <span className="text-xs text-slate-400">dev auth</span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminLayout() {
  // Dev-auth mode: no Clerk context, render the admin shell directly.
  if (!CLERK_ENABLED) return <Shell />;

  // Clerk mode: require a signed-in session for the admin app.
  return (
    <>
      <SignedIn>
        <Shell />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
