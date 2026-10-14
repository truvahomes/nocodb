import { UITypes } from 'nocodb-sdk';

/**
 * Detection for columns whose value the *database* owns — the ones a user must
 * never be able to type into.
 *
 * Truva's application schema (Prisma-generated) gives every table the same
 * three DB-managed columns:
 *
 * ```sql
 * `_id`        varchar(191) NOT NULL DEFAULT (uuid())                    -- PRIMARY KEY
 * `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
 * `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
 * ```
 *
 * `_id` is handled by the driver (see `MysqlClient#columnList`, which tags a
 * DB-generated PK with `meta.ag`). The two timestamps are handled here.
 *
 * NocoDB already knows how to treat `created_at`/`updated_at` as read-only, but
 * only for tables *it* created: `populateMeta` remaps them to `CreatedTime`/
 * `LastModifiedTime` only when all six NocoDB system columns (`created_at`,
 * `updated_at`, `created_by`, `updated_by`, `nc_order`, the meta column) are
 * present together. An externally-managed schema like Truva's carries only the
 * first two, so the remap never fired and both columns landed as plain, fully
 * editable `DateTime` fields.
 *
 * This re-applies the same remap from the DB's own evidence (a
 * `CURRENT_TIMESTAMP` default) instead of the six-column signature.
 *
 * ## Why the remap alone is enough
 *
 * `isCreatedOrLastModifiedTimeCol` is checked *without* a `system` guard by
 * every gate that matters, so flipping `uidt` is sufficient:
 *
 *   - `isReadOnlyVirtualCell` / `isReadonlyVirtualColumn` (nocodb-sdk) — the
 *     grid, canvas and expanded-form cells all mount read-only.
 *   - `BaseModelSqlv2.validate` — rejects an API payload that carries the
 *     column with `"… is auto generated and cannot be updated"`.
 *
 * ## Why these are deliberately NOT marked `system`
 *
 * Two reasons, both load-bearing:
 *
 *  1. **Visibility.** `getAst`'s view strategy drops a system column from the
 *     response unless the view has `show_system_fields` on, so marking these
 *     `system` would make `created_at`/`updated_at` disappear from every
 *     existing grid. They should be locked, not hidden.
 *
 *  2. **The database already fills them, correctly.** `prepareNocoData` only
 *     stamps a timestamp when `column.system` is set, and for
 *     `LastModifiedTime` it writes `null` on insert — which a `NOT NULL`
 *     column like Truva's `updated_at` rejects outright under MySQL 8's
 *     `explicit_defaults_for_timestamp=ON`. Leaving the columns out of the
 *     write lets `DEFAULT CURRENT_TIMESTAMP(3)` and
 *     `ON UPDATE CURRENT_TIMESTAMP(3)` do the work, which also keeps rows
 *     written through NocoDB byte-identical to rows written by the Truva app
 *     itself (same clock, same timezone) instead of mixing in NocoDB's
 *     UTC-normalised `now()`.
 *
 * The UI already knows to re-read a row after saving it when a column's default
 * carries an `on update` clause (see `useData`/`useInfiniteData`), so the
 * refreshed `updated_at` shows up without any extra work.
 */

/** Column shape as returned by `SqlClient#columnList()`. */
export interface IntrospectedColumn {
  /** Name as reported by the driver; `column_name` once aliased by the caller. */
  cn?: string;
  column_name?: string;
  /** Physical data type, e.g. `timestamp`, `datetime`. */
  dt?: string;
  /**
   * Column default. For MySQL timestamps `columnList` folds the `EXTRA` clause
   * in, so this reads e.g. `CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3)`.
   */
  cdf?: string | null;
}

/**
 * Physical types that can carry a `CURRENT_TIMESTAMP` default. Kept wide enough
 * to cover the other drivers so the behaviour is not MySQL-only.
 */
const TIMESTAMP_DATA_TYPES = new Set([
  'timestamp',
  'timestamptz',
  'timestamp with time zone',
  'timestamp without time zone',
  'datetime',
  'datetime2',
  'smalldatetime',
  'datetimeoffset',
]);

/**
 * A default that resolves to "now" at write time: `CURRENT_TIMESTAMP`,
 * `CURRENT_TIMESTAMP(3)`, `now()`, `GETDATE()`, `SYSDATETIME()`, `LOCALTIMESTAMP`.
 */
const NOW_DEFAULT_RE =
  /\b(current_timestamp|localtimestamp|now\s*\(|getdate\s*\(|sysdatetime\s*\()/i;

/** Column names conventionally owned by the insert. */
const CREATED_AT_NAMES = new Set(['created_at', 'createdat', 'created_on']);

/** Column names conventionally owned by every write. */
const UPDATED_AT_NAMES = new Set([
  'updated_at',
  'updatedat',
  'updated_on',
  'modified_at',
]);

const columnName = (column: IntrospectedColumn): string =>
  (column.cn ?? column.column_name ?? '').toLowerCase();

/** True when the DB fills this column with the current time on write. */
const hasNowDefault = (column: IntrospectedColumn): boolean =>
  TIMESTAMP_DATA_TYPES.has((column.dt ?? '').toLowerCase()) &&
  NOW_DEFAULT_RE.test(String(column.cdf ?? ''));

/**
 * The `uidt` a DB-managed timestamp column should be stored as, or `undefined`
 * when the column is an ordinary (user-owned) date/time field.
 *
 * Both halves of the test matter: the *name* states the intent and the
 * *default* is the DB confirming it owns the value. A hand-rolled
 * `start_date DATETIME DEFAULT CURRENT_TIMESTAMP` that a user is meant to edit
 * keeps its `DateTime` type, and a bare `created_at DATETIME NULL` that nothing
 * populates stays editable too.
 *
 * `updated_at` resolves to `LastModifiedTime` whether or not the DB spells out
 * `ON UPDATE CURRENT_TIMESTAMP` — a handful of Truva tables omit the clause,
 * and the column is still not something a user should be typing into.
 */
export function resolveDbManagedTimestampUidt(
  column: IntrospectedColumn,
): UITypes | undefined {
  if (!hasNowDefault(column)) return undefined;

  const name = columnName(column);

  if (CREATED_AT_NAMES.has(name)) return UITypes.CreatedTime;
  if (UPDATED_AT_NAMES.has(name)) return UITypes.LastModifiedTime;

  return undefined;
}

/**
 * Applies the remap in place, returning `true` when the column was rewritten.
 *
 * Call this *after* the caller has resolved `uidt` (via `getColumnUiType` or the
 * NocoDB system-column signature) so it can override a plain `DateTime`.
 */
export function applyDbManagedTimestampUidt(
  column: IntrospectedColumn & { uidt?: UITypes | string },
): boolean {
  const uidt = resolveDbManagedTimestampUidt(column);

  if (!uidt || column.uidt === uidt) return false;

  column.uidt = uidt;

  return true;
}
