import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../lib/errors.js';
import { analyzeCsv } from './csv-import.js';

const HEADER = 'name,website,email,phone,industry,country,city,status,notes';

describe('analyzeCsv', () => {
  it('parses valid rows into candidates with normalized domains', () => {
    const csv = [
      HEADER,
      'Acme,https://www.Acme.com/about,info@acme.com,+1 555,SaaS,USA,NYC,new,Great fit',
      'Beta,,contact@beta.io,,,,,,',
    ].join('\n');

    const result = analyzeCsv(csv);

    expect(result.totalRows).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.data).toMatchObject({
      name: 'Acme',
      domain: 'acme.com',
      email: 'info@acme.com',
      status: 'NEW',
      notes: 'Great fit',
    });
    expect(result.candidates[1]?.data.domain).toBeNull();
  });

  it('accepts case-insensitive headers and quoted values with commas', () => {
    const csv = [
      'Name,Website,Notes',
      '"Smith, Sons & Co",smith.com,"Family business, est. 1901"',
    ].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.data.name).toBe('Smith, Sons & Co');
    expect(result.candidates[0]?.data.notes).toBe('Family business, est. 1901');
  });

  it('normalizes status values with spaces or hyphens and any case', () => {
    const csv = ['name,status', 'A,meeting booked', 'B,email-sent', 'C,Client'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates.map((c) => c.data.status)).toEqual([
      'MEETING_BOOKED',
      'EMAIL_SENT',
      'CLIENT',
    ]);
  });

  it('rejects rows with a missing name', () => {
    const csv = [HEADER, ',acme.com,,,,,,,'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, field: 'name', message: 'name is required' }]);
  });

  it('rejects rows with an invalid email or website', () => {
    const csv = [HEADER, 'Bad Email,,not-an-email,,,,,,', 'Bad Site,not a url,,,,,,,'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, field: 'email', message: 'Invalid email' },
      { row: 3, field: 'website', message: 'Invalid website URL: "not a url"' },
    ]);
  });

  it('rejects rows with an unknown status', () => {
    const csv = ['name,status', 'A,imaginary'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe('status');
  });

  it('flags in-file duplicate domains and keeps the first occurrence', () => {
    const csv = [HEADER, 'First,acme.com,,,,,,,', 'Second,https://www.acme.com/x,,,,,,,'].join(
      '\n',
    );

    const result = analyzeCsv(csv);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.data.name).toBe('First');
    expect(result.duplicates).toEqual([
      { row: 3, domain: 'acme.com', reason: 'duplicate_in_file' },
    ]);
  });

  it('allows multiple rows without any website', () => {
    const csv = ['name', 'A', 'B', 'C'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toHaveLength(3);
    expect(result.duplicates).toEqual([]);
  });

  it('ignores unknown columns', () => {
    const csv = ['name,website,linkedin', 'Acme,acme.com,https://linkedin.com/acme'].join('\n');

    const result = analyzeCsv(csv);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.data).not.toHaveProperty('linkedin');
  });

  it('throws for an empty body, header-only input, and a missing name column', () => {
    expect(() => analyzeCsv('')).toThrow(ValidationError);
    expect(() => analyzeCsv('   ')).toThrow('CSV body is empty');
    expect(() => analyzeCsv(HEADER)).toThrow('CSV contains no data rows');
    expect(() => analyzeCsv('website\nacme.com')).toThrow(
      'CSV is missing the required "name" column',
    );
  });
});
