export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

export function parseCsvText(text: string): ParsedCsv {
  const input = stripBom(text);
  const rows: string[][] = [];

  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === '\r') {
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((header) => header.trim());

  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};

      headers.forEach((header, index) => {
        record[header] = (row[index] ?? "").trim();
      });

      return record;
    });

  return {
    headers,
    rows: dataRows,
  };
}
