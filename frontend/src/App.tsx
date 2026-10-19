import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import ModelHub from "./pages/ModelHub";
import TuningStudio from "./pages/TuningStudio";
import Experiments from "./pages/Experiments";
import Monitoring from "./pages/Monitoring";

const links = [
  { to: "/", label: "Model Hub" },
  { to: "/tuning", label: "Tuning Studio" },
  { to: "/experiments", label: "Experiments" },
  { to: "/monitoring", label: "Monitoring" },
  ];

export default function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-6 bg-slate-900 px-6 py-3 text-white">
        <span className="font-bold">HFAIO</span>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end
            className={({ isActive }) => (isActive ? "text-indigo-300" : "hover:text-indigo-200")}>
            {l.label}
          </NavLink>
))}
</nav>
<main className="mx-auto max-w-5xl p-6">
  <Routes>
    <Route path="/" element={<ModelHub />} />
    <Route path="/tuning" element={<TuningStudio />} />
    <Route path="/experiments" element={<Experiments />} />
    <Route path="/monitoring" element={<Monitoring />} />
  </Routes>
</main>
</BrowserRouter>
  );
}