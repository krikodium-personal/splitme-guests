/**
 * Argentine peso formatting. Output uses "." thousands and "," decimals (es-AR).
 * Strips rare unicode spaces Intl may emit on some runtimes.
 */
export const formatPrice = (price: number): string => {
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return formatted.replace(/[\u00A0\u202F\u2009]/g, '');
};

/**
 * Use on elements that render `$` + formatPrice().
 * Do NOT use tabular-nums on formatted currency strings — DM Sans gives `.` and `,`
 * full digit width, which looks like "$24 . 600 , 00".
 */
export const priceAmountClass = 'price-amount';
