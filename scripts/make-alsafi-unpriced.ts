import "./_env";
import * as XLSX from "xlsx";

// Produce the pipeline INPUT for the AlSafi golden case: a copy of the human-priced
// AlSafi_Civil.xlsx with the price columns removed, so runPipeline never sees the
// answers. The priced original stays the golden-truth source (column E). Committed
// so the golden case is reproducible. See the golden-set-truth-files memory.
const SRC = "reference-docs/test-boqs/AlSafi_Civil.xlsx";
const OUT = "reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx";

const wb = XLSX.readFile(SRC);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

// Header row is "Descriptions | Unit | Qty | Unit Price | Total price" — drop the
// two price columns (0-based indices 4 and 5) from every row.
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
const stripped = rows.map((r) => r.filter((_, i) => i !== 4 && i !== 5));

const outWs = XLSX.utils.aoa_to_sheet(stripped as unknown[][]);
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, outWs, sheetName);
XLSX.writeFile(outWb, OUT);
console.log(`wrote ${OUT} (${stripped.length} rows, price columns dropped)`);
