// Number formatting for UI text: en-GB digit grouping, fixed decimals.
export const fmt = (n: number, d = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
