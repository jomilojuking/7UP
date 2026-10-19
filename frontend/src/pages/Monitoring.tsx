import { useEffect, useState } from "react";
import { request } from "../api";
export default function Monitoring() {
const [up, setUp] = useState<boolean | null>(null);
const [checked, setChecked] = useState("");
useEffect(() => {
const check = async () => {
try { await request("/health"); setUp(true); } catch { setUp(false); }
setChecked(new Date().toLocaleTimeString());
};
check();
const id = setInterval(check, 5000);
return () => clearInterval(id);
}, []);
return (
<div>
<h2 className="mb-4 text-2xl font-bold">Monitoring</h2>
<div className="flex items-center gap-3">
<span className={"h-4 w-4 rounded-full " + (up === null ? "bg-slate-300" : up
? "bg-green-500" : "bg-red-500")} />
<span>{up === null ? "Checking..." : up ? "Backend is healthy" :
"Backend is down"}</span>
</div>
<p className="mt-2 text-sm text-slate-500">Last checked: {checked}</p>
</div>
);
}