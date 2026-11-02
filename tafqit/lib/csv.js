// Minimal RFC 4180 CSV helpers for bulk conversion. Zero dependencies.
/** Parse CSV text into rows of cells. Handles quotes, CRLF, BOM, and `,` `;` or tab delimiters. */
export function parseCsv(text, delimiter) {
    text = text.replace(/^﻿/, "");
    const delim = delimiter ?? detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else
                    quoted = false;
            }
            else
                cell += ch;
        }
        else if (ch === '"' && cell === "")
            quoted = true;
        else if (ch === delim) {
            row.push(cell);
            cell = "";
        }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n")
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        }
        else
            cell += ch;
    }
    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    // A comma inside a single number ("1,500") is common, so prefer ; and tab when present.
    if (firstLine.includes("\t"))
        return "\t";
    if (firstLine.includes(";"))
        return ";";
    return ",";
}
/**
 * Extract the values of a one-column CSV. A first row that holds no digit is treated as a header.
 * When rows have several cells (e.g. unquoted "1,500"), the cells are re-joined with ",".
 */
export function csvColumnValues(text) {
    const delim = detectDelimiter(text);
    // With "," as delimiter, an unquoted "1,500" splits into cells: rejoin them.
    const rows = parseCsv(text, delim === "," ? "\u0000" : delim)
        .map((r) => (r[0] ?? "").trim())
        .filter((v) => v !== "");
    if (rows.length && !/[0-9٠-٩۰-۹]/.test(rows[0]))
        rows.shift();
    return rows;
}
function escapeCell(v) {
    return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
/** Serialize rows to CSV with a UTF-8 BOM so Excel opens Arabic correctly. */
export function toCsv(rows, { bom = true } = {}) {
    return (bom ? "﻿" : "") + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
