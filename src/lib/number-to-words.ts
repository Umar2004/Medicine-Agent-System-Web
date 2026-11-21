const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

export function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const chunks: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) chunks.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    n = Math.floor(n / 1000);
    scale++;
  }
  return chunks.join(" ");
}

/** 1295.02 → "One Thousand Two Hundred Ninety-Five and Cents Two Only" */
export function usdAmountInWords(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${integerToWords(dollars)}${rest ? ` and Cents ${integerToWords(rest)}` : ""} Only`;
}
