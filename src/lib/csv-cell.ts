// Quote every cell and neutralize formula-like text before spreadsheet import.
// Numeric database columns are trusted decimals and retain negative signs exactly.
export function csvCell(value: string | null, text = true) {
  let result = value ?? "";
  if (text && (/^[\s\u0000-\u001f]*[=+@-]/u.test(result) || /^[\t\r\n]/.test(result))) result = "'" + result;
  return `"${result.replace(/"/g, '""')}"`;
}
