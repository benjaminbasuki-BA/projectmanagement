import { NavLink } from "react-router-dom";
import { cn } from "@trellis/ui";

const TABS = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/security", label: "Security" },
  { to: "/settings/organization", label: "Organization" },
];

/** Shared tab strip across the settings screens (doc01 §2.8 admin console). */
export function SettingsNav() {
  return (
    <nav className="mb-8 flex gap-1 border-b border-rule">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "border-b-2 px-3 pb-3 text-sm font-medium transition-colors",
              isActive
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
