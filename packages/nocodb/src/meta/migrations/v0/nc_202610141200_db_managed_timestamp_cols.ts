import { UITypes } from 'nocodb-sdk';
import type { Knex } from 'knex';
import { resolveDbManagedTimestampUidt } from '~/helpers/dbManagedColumns';
import { CacheScope, MetaTable } from '~/utils/globals';
import NocoCache from '~/cache/NocoCache';

/**
 * Backfill for DB-managed `created_at` / `updated_at` columns on
 * externally-managed sources.
 *
 * `populateMeta` only remapped these to `CreatedTime` / `LastModifiedTime` when
 * a table carried the full six-column NocoDB system signature. An external
 * schema (e.g. Truva's Prisma-generated one) carries only the two timestamps,
 * so they were imported as plain `DateTime` — fully editable, even though the
 * database owns the value via `DEFAULT CURRENT_TIMESTAMP`.
 *
 * `dbManagedColumns` now applies the remap on import and on meta-sync; this
 * covers the columns imported before that change. Meta-sync can't do it for us
 * because its diff deliberately ignores `uidt` (a user is allowed to retype a
 * field), so the convergence has to happen once, here.
 *
 * Only `DateTime` rows are touched, so a field somebody deliberately retyped to
 * something else is left alone.
 */

type ColumnRow = {
  id: string;
  base_id: string;
  fk_workspace_id: string;
  column_name: string | null;
  dt: string | null;
  cdf: string | null;
};

const up = async (knex: Knex) => {
  const rows: ColumnRow[] = await knex(MetaTable.COLUMNS)
    .select('id', 'base_id', 'fk_workspace_id', 'column_name', 'dt', 'cdf')
    .where('uidt', UITypes.DateTime)
    .whereNotNull('cdf');

  for (const row of rows) {
    const uidt = resolveDbManagedTimestampUidt(row);

    if (!uidt) continue;

    await knex(MetaTable.COLUMNS).where('id', row.id).update({ uidt });

    // Knex migrations don't flush the cache; drop the item key so the column
    // list self-heals on the next read.
    await NocoCache.del(
      { workspace_id: row.fk_workspace_id, base_id: row.base_id },
      `${CacheScope.COLUMN}:${row.id}`,
    );
  }
};

const down = async () => {
  // Data heal — these columns are DB-generated and must not be user-writable.
  // Reverting would hand editing back to the UI, so there is nothing to undo.
};

export { up, down };
