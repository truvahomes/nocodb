import type { Knex } from 'knex';
import { MetaTable } from '~/utils/globals';

/*
  This migration adds a new column to the MODELS and COLUMNS tables called disabled_actions.
  This column will be a CSV of the format "INSERT,UPDATE,DELETE" and will be used to disable actions on the model and columns.
*/

const up = async (knex: Knex) => {
  await knex.schema.alterTable(MetaTable.MODELS, (table) => {
    table.string('disabled_actions', 255);
  });

  await knex.schema.alterTable(MetaTable.COLUMNS, (table) => {
    table.string('disabled_actions', 255);
  });
};

const down = async (knex: Knex) => {
  await knex.schema.alterTable(MetaTable.MODELS, (table) => {
    table.dropColumn('disabled_actions');
  });

  await knex.schema.alterTable(MetaTable.COLUMNS, (table) => {
    table.dropColumn('disabled_actions');
  });
};

export { up, down };
