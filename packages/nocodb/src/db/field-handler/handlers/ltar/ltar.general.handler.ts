import { isMMOrMMLike, RelationTypes } from 'nocodb-sdk';
import { LookupGeneralHandler } from '../lookup/lookup.general.handler';
import type CustomKnex from '~/db/CustomKnex';
import type { Column, LinkToAnotherRecordColumn } from '~/models';
import type {
  FilterOptions,
  SortOptions,
} from '~/db/field-handler/field-handler.interface';
import type { Knex } from '~/db/CustomKnex';
import { Filter, Model } from '~/models';
import {
  getAlias,
  negatedMapping,
} from '~/db/field-handler/utils/handlerUtils';
import { GenericFieldHandler } from '~/db/field-handler/handlers/generic';
import { getAliasedSoftDeleteFilter } from '~/helpers/dbHelpers';
import { getRefTableColumnForFilter } from '~/db/generateLookupSelectQuery';

/**
 * Upper bound on how many ids a link filter's subquery may resolve to before
 * we stop inlining them and fall back to `IN (subquery)`. 0 disables inlining.
 */
const LTAR_FILTER_INLINE_ID_LIMIT = (() => {
  const v = parseInt(process.env.NC_LTAR_FILTER_INLINE_ID_LIMIT ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 1000;
})();

/**
 * A link filter becomes `fk IN (SELECT id FROM related WHERE <cond>)`. Several
 * of those OR-ed together (e.g. "development OR complex OR project name like X")
 * can't use the fk indexes in MySQL: index_merge needs constant ranges and the
 * IN-subquery -> semi-join rewrite only applies to top-level AND conditions, so
 * the optimizer scans the whole table and evaluates the subqueries per row.
 *
 * The related-side subquery is usually tiny, so we run it once up front and
 * inline the ids as a literal list (`fk IN ('a','b')`), which lets MySQL
 * index-merge the fk indexes. Same result set. Falls back to the subquery when
 * the filter needs a root CTE, the list is too large, or the prefetch fails.
 */
async function resolveIdsIfSmall(
  selectQb: Knex.QueryBuilder,
  needsRootApply: boolean,
): Promise<any[] | null> {
  if (!LTAR_FILTER_INLINE_ID_LIMIT || needsRootApply) return null;
  try {
    const rows: Record<string, unknown>[] = await selectQb
      .clone()
      .limit(LTAR_FILTER_INLINE_ID_LIMIT + 1);
    if (rows.length > LTAR_FILTER_INLINE_ID_LIMIT) return null;
    const ids = new Set<any>();
    for (const row of rows) {
      const id = Object.values(row)[0];
      // `x IN (subquery)` never matches on NULL, so dropping them is equivalent
      if (id !== null && id !== undefined) ids.add(id);
    }
    return [...ids];
  } catch {
    return null;
  }
}

export class LtarGeneralHandler extends GenericFieldHandler {
  /**
   * Sort by the linked record's display value — delegates to
   * `LookupGeneralHandler.applySort` since both produce SQL via
   * `generateLookupSelectQuery`. Keeps the lookup-chain logic in one place.
   */
  override async applySort(
    qb: Knex.QueryBuilder,
    column: Column,
    direction: 'asc' | 'desc',
    options: SortOptions,
  ): Promise<void> {
    return new LookupGeneralHandler().applySort(qb, column, direction, options);
  }

  override async filter(
    knex: CustomKnex,
    filter: Filter,
    column: Column,
    options: FilterOptions,
  ) {
    const {
      context,
      alias,
      baseModel: baseModelSqlv2,
      depth: aliasCount,
      throwErrorIfInvalid,
      conditionParser: parseConditionV2,
    } = options;
    const isMMLike = isMMOrMMLike(column);
    const colOptions =
      (await column.getColOptions()) as LinkToAnotherRecordColumn;
    let rootApply: ((qb: Knex.QueryBuilder) => void) | undefined = undefined;

    const { parentContext, childContext, mmContext } =
      await colOptions.getParentChildContext(column);

    const childColumn = await colOptions.getChildColumn();
    const parentColumn = await colOptions.getParentColumn();
    const childModel = await childColumn.getModel();
    await childModel.getColumns();
    const parentModel = await parentColumn.getModel();
    await parentModel.getColumns();

    let relationType = isMMLike ? RelationTypes.MANY_TO_MANY : colOptions.type;

    if (relationType === RelationTypes.ONE_TO_ONE) {
      relationType = column.meta?.bt
        ? RelationTypes.BELONGS_TO
        : RelationTypes.HAS_MANY;
    }

    if (relationType === RelationTypes.HAS_MANY) {
      const childTableAlias = getAlias(aliasCount);

      const childBaseModel = await Model.getBaseModelSQL(childContext, {
        model: childModel,
        dbDriver: baseModelSqlv2.dbDriver,
      });

      // Knex's TypeScript definitions do not correctly infer knex.raw() or knex.ref()
      // as valid column references. This causes type errors when used in query builders
      // like `whereIn()`, `where()`, and `select()`. Casting to `any` ensures proper
      // SQL generation while avoiding TypeScript issues.
      const childColumnRef = knex.raw('??.??', [
        childTableAlias,
        childColumn.column_name,
      ]) as any;
      const parentColumnRef = knex.raw('??.??', [
        alias || baseModelSqlv2.getTnPath(parentModel.table_name),
        parentColumn.column_name,
      ]) as any;

      if (
        ['blank', 'notblank', 'checked', 'notchecked'].includes(
          filter.comparison_op,
        )
      ) {
        const selectHmCount = knex(
          childBaseModel.getTnPath(childModel.table_name, childTableAlias),
        )
          .count(childColumn.column_name)
          .whereRaw('?? = ??', [childColumnRef, parentColumnRef]);

        const hmCountSoftDeleteFilter = await getAliasedSoftDeleteFilter(
          childBaseModel,
          childTableAlias,
        );
        if (hmCountSoftDeleteFilter) {
          selectHmCount.where(hmCountSoftDeleteFilter);
        }

        return {
          rootApply,
          clause: (qb) => {
            if (filter.comparison_op === 'blank') {
              qb.where(knex.raw('0'), selectHmCount);
            } else {
              qb.whereNot(knex.raw('0'), selectHmCount);
            }
          },
        };
      }
      const selectQb = knex(
        childBaseModel.getTnPath(childModel.table_name, childTableAlias),
      ).select(childColumnRef);

      const hmSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        childBaseModel,
        childTableAlias,
      );
      if (hmSoftDeleteFilter) {
        selectQb.where(hmSoftDeleteFilter);
      }

      const parseOperationResult = await parseConditionV2(
        childBaseModel,
        new Filter({
          ...filter,
          ...(filter.comparison_op in negatedMapping
            ? negatedMapping[filter.comparison_op]
            : {}),
          fk_model_id: childModel.id,
          fk_column_id: (
            await getRefTableColumnForFilter(
              context,
              column,
              filter.meta?.ltarSubField,
            )
          )?.id,
        }),
        aliasCount,
        childTableAlias,
        undefined,
        throwErrorIfInvalid,
      );
      parseOperationResult.clause(selectQb);
      rootApply = (qb: Knex.QueryBuilder) => {
        parseOperationResult.rootApply?.(qb);
      };

      const hmIds =
        filter.comparison_op in negatedMapping
          ? null
          : await resolveIdsIfSmall(selectQb, !!parseOperationResult.rootApply);

      return {
        rootApply,
        clause: (qbP: Knex.QueryBuilder) => {
          if (filter.comparison_op in negatedMapping)
            qbP.whereNotIn(parentColumnRef, selectQb);
          else if (hmIds) qbP.whereIn(parentColumnRef, hmIds);
          else qbP.whereIn(parentColumnRef, selectQb);
        },
      };
    } else if (relationType === RelationTypes.BELONGS_TO) {
      const parentTableAlias = getAlias(aliasCount);
      const childTableAlias =
        alias || baseModelSqlv2.getTnPath(childModel.table_name);

      const parentBaseModel = await Model.getBaseModelSQL(parentContext, {
        model: parentModel,
        dbDriver: baseModelSqlv2.dbDriver,
      });

      // Knex's TypeScript definitions do not correctly infer knex.raw() or knex.ref()
      // as valid column references. This causes type errors when used in query builders
      // like `whereIn()`, `where()`, and `select()`. Casting to `any` ensures proper
      // SQL generation while avoiding TypeScript issues.
      const parentColumnRef = knex.raw('??.??', [
        parentTableAlias,
        parentColumn.column_name,
      ]) as any;
      const childColumnRef = knex.raw('??.??', [
        childTableAlias,
        childColumn.column_name,
      ]) as any;
      if (
        ['blank', 'notblank', 'checked', 'notchecked'].includes(
          filter.comparison_op,
        )
      ) {
        const selectBtCount = knex(
          parentBaseModel.getTnPath(parentModel.table_name, parentTableAlias),
        )
          .count(parentColumnRef)
          .where(parentColumnRef, childColumnRef);

        const btCountSoftDeleteFilter = await getAliasedSoftDeleteFilter(
          parentBaseModel,
          parentTableAlias,
        );
        if (btCountSoftDeleteFilter) {
          selectBtCount.where(btCountSoftDeleteFilter);
        }

        return {
          rootApply,
          clause: (qb) => {
            if (filter.comparison_op === 'blank') {
              qb.where(knex.raw('0'), selectBtCount);
            } else {
              qb.whereNot(knex.raw('0'), selectBtCount);
            }
          },
        };
      }

      const selectQb = knex(
        parentBaseModel.getTnPath(parentModel.table_name, parentTableAlias),
      ).select(parentColumn.column_name);

      const btSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        parentBaseModel,
        parentTableAlias,
      );
      if (btSoftDeleteFilter) {
        selectQb.where(btSoftDeleteFilter);
      }

      const parseOperationResult = await parseConditionV2(
        parentBaseModel,
        new Filter({
          ...filter,
          ...(filter.comparison_op in negatedMapping
            ? negatedMapping[filter.comparison_op]
            : {}),
          fk_model_id: parentModel.id,
          fk_column_id: (
            await getRefTableColumnForFilter(
              context,
              column,
              filter.meta?.ltarSubField,
            )
          )?.id,
        }),
        aliasCount,
        parentTableAlias,
        undefined,
        throwErrorIfInvalid,
      );
      parseOperationResult.clause(selectQb);

      rootApply = (qb: Knex.QueryBuilder) => {
        parseOperationResult.rootApply?.(qb);
      };

      const btIds =
        filter.comparison_op in negatedMapping
          ? null
          : await resolveIdsIfSmall(selectQb, !!parseOperationResult.rootApply);

      return {
        rootApply,
        clause: (qbP: Knex.QueryBuilder) => {
          if (filter.comparison_op in negatedMapping) {
            qbP.where((qb) =>
              qb
                .whereNotIn(childColumnRef, selectQb)
                .orWhereNull(childColumnRef),
            );
          } else if (btIds) qbP.whereIn(childColumnRef, btIds);
          else qbP.whereIn(childColumnRef, selectQb);
        },
      };
    } else if (relationType === RelationTypes.MANY_TO_MANY) {
      const childTableAliasOrRef =
        alias || baseModelSqlv2.getTnPath(childModel.table_name);
      const parentTableAlias = getAlias(aliasCount);
      const mmTableAlias = getAlias(aliasCount);

      const parentBaseModel = await Model.getBaseModelSQL(parentContext, {
        model: parentModel,
        dbDriver: baseModelSqlv2.dbDriver,
      });

      const mmModel = await colOptions.getMMModel();
      const mmParentColumn = await colOptions.getMMParentColumn();
      const mmChildColumn = await colOptions.getMMChildColumn();

      const assocBaseModel = await Model.getBaseModelSQL(mmContext, {
        model: mmModel,
        dbDriver: baseModelSqlv2.dbDriver,
      });

      // Knex's TypeScript definitions do not correctly infer knex.raw() or knex.ref()
      // as valid column references. This causes type errors when used in query builders
      // like `whereIn()`, `where()`, and `select()`. Casting to `any` ensures proper
      // SQL generation while avoiding TypeScript issues.
      const childColumnRef = knex.raw('??.??', [
        childTableAliasOrRef,
        childColumn.column_name,
      ]) as any;
      const parentColumnRef = knex.raw('??.??', [
        parentTableAlias,
        parentColumn.column_name,
      ]) as any;
      const mmParentColumnRef = knex.raw('??.??', [
        mmTableAlias,
        mmParentColumn.column_name,
      ]) as any;
      const mmChildColumnRef = knex.raw('??.??', [
        mmTableAlias,
        mmChildColumn.column_name,
      ]) as any;
      if (
        ['blank', 'notblank', 'checked', 'notchecked'].includes(
          filter.comparison_op,
        )
      ) {
        // handle self reference
        if (mmModel.id === childModel.id) {
          if (filter.comparison_op === 'blank') {
            return {
              rootApply,
              clause: (qb) => {
                qb.whereNull(childColumnRef);
              },
            };
          } else {
            return {
              rootApply,
              clause: (qb) => {
                qb.whereNotNull(childColumnRef);
              },
            };
          }
        }

        const selectMmCount = knex(
          assocBaseModel.getTnPath(mmModel.table_name, mmTableAlias),
        )
          .count(mmChildColumnRef)
          .where(mmChildColumnRef, childColumnRef);

        // For MM blank/notblank, also check that the referenced parent records aren't deleted
        // We need a join to the parent table to check soft delete
        const mmCountSoftDeleteFilter = await getAliasedSoftDeleteFilter(
          parentBaseModel,
          parentTableAlias,
        );
        if (mmCountSoftDeleteFilter) {
          selectMmCount
            .join(
              parentBaseModel.getTnPath(
                parentModel.table_name,
                parentTableAlias,
              ),
              mmParentColumnRef,
              parentColumnRef,
            )
            .where(mmCountSoftDeleteFilter);
        }

        return {
          rootApply,
          clause: (qb) => {
            if (filter.comparison_op === 'blank') {
              qb.where(knex.raw('0'), selectMmCount);
            } else {
              qb.whereNot(knex.raw('0'), selectMmCount);
            }
          },
        };
      }

      const selectQb = knex(
        assocBaseModel.getTnPath(mmModel.table_name, mmTableAlias),
      )
        .select(mmChildColumnRef)
        .join(
          parentBaseModel.getTnPath(parentModel.table_name, parentTableAlias),
          mmParentColumnRef,
          parentColumnRef,
        );

      const mmSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        parentBaseModel,
        parentTableAlias,
      );
      if (mmSoftDeleteFilter) {
        selectQb.where(mmSoftDeleteFilter);
      }

      const parseOperationResult = await parseConditionV2(
        parentBaseModel,
        new Filter({
          ...filter,
          ...(filter.comparison_op in negatedMapping
            ? negatedMapping[filter.comparison_op]
            : {}),
          fk_model_id: parentModel.id,
          fk_column_id: (
            await getRefTableColumnForFilter(
              context,
              column,
              filter.meta?.ltarSubField,
            )
          )?.id,
        }),
        aliasCount,
        parentTableAlias,
        undefined,
        throwErrorIfInvalid,
      );
      parseOperationResult.clause(selectQb);

      rootApply = (qb: Knex.QueryBuilder) => {
        parseOperationResult.rootApply?.(qb);
      };

      const mmIds =
        filter.comparison_op in negatedMapping
          ? null
          : await resolveIdsIfSmall(selectQb, !!parseOperationResult.rootApply);

      return {
        rootApply,
        clause: (qbP: Knex.QueryBuilder) => {
          if (filter.comparison_op in negatedMapping)
            qbP.where((qb) =>
              qb
                .whereNotIn(childColumnRef, selectQb)
                .orWhereNull(childColumnRef),
            );
          else if (mmIds) qbP.whereIn(childColumnRef, mmIds);
          else qbP.whereIn(childColumnRef, selectQb);
        },
      };
    }

    return {
      rootApply,
      clause: (_qb) => {},
    };
  }
}
