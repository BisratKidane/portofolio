import { describe, it, expect, vi } from 'vitest';
import { assertRequiredColumns } from './assertRequiredColumns.js';

describe('assertRequiredColumns', () => {
  it('resolves without throwing when the relationshipNote column is present', async () => {
    const fakeSequelize = {
      query: vi.fn().mockResolvedValue([{ COLUMN_NAME: 'relationshipNote' }]),
      QueryTypes: { SELECT: 'SELECT' }
    };

    await expect(assertRequiredColumns(fakeSequelize)).resolves.toBeUndefined();
    expect(fakeSequelize.query).toHaveBeenCalledTimes(1);
  });

  it('rejects with a message naming migration 020 when the relationshipNote column is missing', async () => {
    const fakeSequelize = {
      query: vi.fn().mockResolvedValue([]),
      QueryTypes: { SELECT: 'SELECT' }
    };

    await expect(assertRequiredColumns(fakeSequelize)).rejects.toThrow(
      /020-add-users-relationship-note\.sql/
    );
  });
});
