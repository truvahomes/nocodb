import * as nc_001_add_disabled_actions from '~/meta/migrations/truva/nc_001_add_disabled_actions';

// Create a custom migration source class
export default class XcMigrationSourceTruva {
  // Must return a Promise containing a list of migrations.
  // Migrations can be whatever you want, they will be passed as
  // arguments to getMigrationName and getMigration
  public getMigrations(): Promise<any> {
    // In this run we are just returning migration names
    return Promise.resolve([
      'nc_001_add_disabled_actions',
    ]);
  }

  public getMigrationName(migration): string {
    return migration;
  }

  public getMigration(migration): any {
    switch (migration) {
      case 'nc_001_add_disabled_actions':
        return nc_001_add_disabled_actions;
    }
  }
}
