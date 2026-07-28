import { DataTypes, Model } from 'sequelize';

export class AuditLog extends Model {}

// Append-only audit trail for invitation lifecycle events (create / register /
// approve / reject). Rows are immutable, so only createdAt is tracked.
// actorUserId / invitationId / targetUserId are added by the associations in
// models/index.js.
export function initAuditLog(sequelize) {
  AuditLog.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      action: { type: DataTypes.STRING, allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true }
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      updatedAt: false
    }
  );

  return AuditLog;
}
