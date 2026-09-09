import { DataTypes, Model } from 'sequelize';

export class AppSetting extends Model {}

// Generic key/value application-settings table (Phase 34 / ADMIN-01, D-01).
// Rows are mutable (unlike AuditLog's append-only rows), so this is the
// inverse of AuditLog's `updatedAt: false` -- here we keep `updatedAt` and
// drop `createdAt`, since a setting's "when was it created" is meaningless
// once the migration seeds it and nothing ever re-creates the row.
export function initAppSetting(sequelize) {
  AppSetting.init(
    {
      // VARCHAR(64) must match migration 021's settingKey column exactly --
      // a bare DataTypes.STRING is VARCHAR(255) and would silently diverge
      // from production (E-8/Pitfall 6). Named settingKey, not key: KEY is
      // a reserved word in the MySQL 8.4 keyword table (E-7).
      settingKey: { type: DataTypes.STRING(64), primaryKey: true },
      value: { type: DataTypes.STRING(255), allowNull: false },
      // Plain unassociated column, no FK -- same call as User.approvedBy
      // (models/User.js). Keeps app_settings out of resetTables' FK dance.
      updatedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }
    },
    {
      sequelize,
      modelName: 'AppSetting',
      tableName: 'app_settings',
      createdAt: false
    }
  );

  return AppSetting;
}
