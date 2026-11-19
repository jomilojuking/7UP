import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { request } from "./api";
import Datasets from "./pages/Datasets";
import Experiments from "./pages/Experiments";
import ModelHub from "./pages/ModelHub";
import Monitoring from "./pages/Monitoring";
import TuningStudio from "./pages/TuningStudio";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
    {d}
  </svg>
);

// The order follows the workflow: data -> model -> runs -> tuning -> monitoring.
const links = [
  { to: "/datasets", label: "Datasets",
    icon: icon(<><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" /><path d="M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></>) },
  { to: "/", label: "Models",
    icon: icon(<><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z" /><path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" /></>) },
  { to: "/experiments", label: "Experiments",
    icon: icon(<><path d="M7.5 2.5h5M8.5 2.5v5L4 15.5a1.4 1.4 0 0 0 1.2 2h9.6a1.4 1.4 0 0 0 1.2-2L11.5 7.5v-5" /><path d="M6 12.5h8" /></>) },
  { to: "/tuning", label: "Tuning Studio",
    icon: icon(<><path d="M4 3v14M10 3v14M16 3v14" /><circle cx="4" cy="12" r="1.8" fill="white" /><circle cx="10" cy="6" r="1.8" fill="white" /><circle cx="16" cy="10" r="1.8" fill="white" /></>) },
  { to: "/monitoring", label: "Monitoring",
    icon: icon(<path d="M2.5 10h3.5l2-5 4 10 2-5h3.5" />) },
];

function BackendDot() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => request("/health").then(() => setUp(true)).catch(() => setUp(false));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);
  const text = up === null ? "Connecting" : up ? "Backend online" : "Backend offline";
  const color = up === null ? "bg-mist" : up ? "bg-spruce" : "bg-brick";
  return (
    <span className="flex items-center gap-2 text-[13px] text-graphite" role="status">
      <span className={"h-2 w-2 rounded-full " + color} />
      {text}
    </span>
  );
}

function Mark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#1e5b4b" />
        <rect x="7" y="14" width="3.2" height="7" rx="1.2" fill="#dde9e4" />
        <rect x="12.4" y="10" width="3.2" height="11" rx="1.2" fill="#dde9e4" />
        <rect x="17.8" y="6.5" width="3.2" height="14.5" rx="1.2" fill="#d2b47a" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight text-ink">HFAIO</span>
    </span>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
        <aside className="sticky top-0 z-20 border-b border-rule bg-canvas/90 backdrop-blur lg:h-screen lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-5 lg:py-6">
            <Mark />
            <p className="mt-2 hidden text-[13px] leading-snug text-graphite lg:block">
              Fine-tune, tune and track Hugging Face classifiers.
            </p>
            <div className="lg:hidden"><BackendDot /></div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end
                className={({ isActive }) =>
                  "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] transition-colors " +
                  (isActive
                    ? "bg-surface font-medium text-ink shadow-panel"
                    : "text-graphite hover:bg-surface/60 hover:text-ink")
                }>
                {({ isActive }) => (
                  <>
                    <span className={isActive ? "text-spruce" : "text-mist"}>{l.icon}</span>
                    {l.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="absolute bottom-0 hidden w-full border-t border-rule px-5 py-4 lg:block">
            <BackendDot />
          </div>
        </aside>

        <main className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <Routes>
            <Route path="/" element={<ModelHub />} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/tuning" element={<TuningStudio />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/monitoring" element={<Monitoring />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
