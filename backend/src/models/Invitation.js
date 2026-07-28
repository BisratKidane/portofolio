import { DataTypes, Model } from 'sequelize';

export class Invitation extends Model {}

// An invitation to join the family platform. The raw token is NEVER stored —
// only its sha256 hash (tokenHash), exactly like password-reset/verification
// tokens. inviterId / approvedBy / registeredUserId are added by the
// associations in models/index.js.
export function initInvitation(sequelize) {
  Invitation.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
      invitedName: { type: DataTypes.STRING, allowNull: true },
      invitedEmail: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
      invitedPhone: { type: DataTypes.STRING, allowNull: true },
      invitationMethod: {
        type: DataTypes.ENUM('email', 'whatsapp'),
        allowNull: false,
        validate: { isIn: [['email', 'whatsapp']] }
      },
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
      tableName: 'invitations',
      validate: {
        contactPresent() {
          if (!this.invitedEmail && !this.invitedPhone) {
            throw new Error('An invitation needs an email or a phone number.');
          }
        },
        methodHasContact() {
          if (this.invitationMethod === 'email' && !this.invitedEmail) {
            throw new Error('An email invitation needs an email address.');
          }
          if (this.invitationMethod === 'whatsapp' && !this.invitedPhone) {
            throw new Error('A WhatsApp invitation needs a phone number.');
          }
        }
      }
    }
  );

  return Invitation;
}
