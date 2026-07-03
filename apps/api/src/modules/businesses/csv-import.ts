import { parse } from 'csv-parse/sync';
import { UnprocessableError, ValidationError } from '../../lib/errors.js';
import { csvRowSchema } from './businesses.schemas.js';
import type { BusinessRecord } from './businesses.repository.js';
import { normalizeDomain } from './domain.js';

export const MAX_IMPORT_ROWS = 5000;

export interface CsvRowError {
  /** 1-based CSV line number (header is line 1). */
  row: number;
  field?: string;
  message: string;
}

export interface CsvDuplicate {
  row: number;
  domain: string;
  reason: 'duplicate_in_file' | 'already_exists';
}

export interface CsvCandidate {
  row: number;
  domain: string | null;
  data: BusinessRecord;
}

export interface CsvAnalysis {
  totalRows: number;
  candidates: CsvCandidate[];
  errors: CsvRowError[];
  duplicates: CsvDuplicate[];
}

/**
 * Parses and validates a business CSV (pure — no I/O). Expected header:
 * name,website,email,phone,industry,country,city,status,notes
 * (any order, case-insensitive, unknown columns ignored, all but name optional).
 *
 * Performs per-row validation, domain normalization, and in-file duplicate
 * detection. Database duplicate detection happens in the service, which owns
 * the round-trip for existing domains.
 */
export function analyzeCsv(csvText: string): CsvAnalysis {
  if (!csvText || csvText.trim() === '') {
    throw new ValidationError('CSV body is empty');
  }

  let records: Record<string, string>[];
  try {
    records = parse(csvText, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown parse error';
    throw new ValidationError(`CSV could not be parsed: ${message}`);
  }

  if (records.length === 0) {
    throw new ValidationError('CSV contains no data rows');
  }
  if (records.length > MAX_IMPORT_ROWS) {
    throw new UnprocessableError(
      `CSV has ${records.length} rows; the maximum per import is ${MAX_IMPORT_ROWS}`,
    );
  }
  if (!('name' in (records[0] ?? {}))) {
    throw new ValidationError('CSV is missing the required "name" column');
  }

  const candidates: CsvCandidate[] = [];
  const errors: CsvRowError[] = [];
  const duplicates: CsvDuplicate[] = [];
  const seenDomains = new Set<string>();

  records.forEach((record, index) => {
    const row = index + 2; // 1-based, accounting for the header line

    const parsed = csvRowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row, field: issue.path.join('.') || undefined, message: issue.message });
      }
      return;
    }

    const { website, ...fields } = parsed.data;
    let domain: string | null = null;
    if (website) {
      domain = normalizeDomain(website);
      if (!domain) {
        errors.push({ row, field: 'website', message: `Invalid website URL: "${website}"` });
        return;
      }
      if (seenDomains.has(domain)) {
        duplicates.push({ row, domain, reason: 'duplicate_in_file' });
        return;
      }
      seenDomains.add(domain);
    }

    candidates.push({
      row,
      domain,
      data: { ...fields, website: website ?? null, domain },
    });
  });

  return { totalRows: records.length, candidates, errors, duplicates };
}
