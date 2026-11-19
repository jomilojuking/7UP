// Plotly theme matching the design tokens in index.css.
export const C = {
  ink: "#15201c",
  graphite: "#56635e",
  mist: "#8a9792",
  rule: "#d6ddd9",
  hairline: "#e6ebe8",
  spruce: "#1e5b4b",
  brass: "#b08535",
  slateblue: "#4f6d8a",
};

// Class colors: calm, distinguishable, colour-blind friendly order.
export const CLASS_COLORS = ["#1e5b4b", "#b08535", "#4f6d8a", "#8a5a7a", "#7f9c8e", "#c2a372", "#9aaec2", "#5a4a3a"];
export const classColor = (i: number) => CLASS_COLORS[i % CLASS_COLORS.length];

export function baseLayout(extra: Record<string, unknown> = {}) {
  return {
    autosize: true,
    font: { family: "Instrument Sans Variable, Instrument Sans, system-ui, sans-serif", size: 13, color: C.graphite },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 16, r: 16, b: 44, l: 52 },
    hoverlabel: { bgcolor: "#ffffff", bordercolor: C.rule, font: { color: C.ink, family: "Instrument Sans Variable" } },
    xaxis: { gridcolor: C.hairline, linecolor: C.rule, zeroline: false, tickfont: { color: C.mist } },
    yaxis: { gridcolor: C.hairline, linecolor: C.rule, zeroline: false, tickfont: { color: C.mist } },
    legend: { orientation: "h", y: -0.22, font: { color: C.graphite } },
    ...extra,
  };
}

export const plotConfig = { displayModeBar: false, responsive: true };
