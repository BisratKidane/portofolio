import { DataTypes, Model } from 'sequelize';

export class Invitation extends Model {}

// An email invitation to join the family platform. The raw token is NEVER
// stored — only its sha256 hash (tokenHash), exactly like password-reset/
// verification tokens. inviterId / approvedBy / registeredUserId are added by
// the associations in models/index.js.
export function initInvitation(sequelize) {
  Invitation.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
      invitedName: { type: DataTypes.STRING, allowNull: true },
      invitedEmail: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
      relationshipToFamily: { type: DataTypes.STRING, allowNull: true },
      invitationNote: { type: DataTypes.TEXT, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      registeredAt: { type: DataTypes.DATE, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('Pending', 'Registered', 'Approved', 'Rejected', 'Expired'),
        allowNull: false,
        defaultValue: 'Pending'
      }
    },
    {
      sequelize,
      modelName: 'Invitation',
      tableName: 'invitations'
    }
  );

  return Invitation;
}
