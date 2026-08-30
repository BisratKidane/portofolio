import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';

export class User extends Model {
  async validatePassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }
}

export function initUser(sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('ADMIN', 'USER'),
        allowNull: false,
        defaultValue: 'USER'
      },
      resetPasswordToken: {
        type: DataTypes.STRING,
        allowNull: true
      },
      resetPasswordExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      passwordChangedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null
      },
      emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      emailVerificationToken: { type: DataTypes.STRING, allowNull: true },
      emailVerificationExpiresAt: { type: DataTypes.DATE, allowNull: true },
      // Account lifecycle for invitation-based access. Only 'Active' users may
      // authenticate. New registrations start 'Pending' (awaiting admin
      // approval); existing users are backfilled 'Active' by migration 015.
      status: {
        type: DataTypes.ENUM('Pending', 'Active', 'Rejected', 'Disabled'),
        allowNull: false,
        defaultValue: 'Pending'
      },
      // Mirrors Invitation.js's four decision fields (approvedAt/approvedBy/
      // rejectedAt/rejectionReason). A self-registrant (Phase 32+) has no
      // invitation row, so the account itself must be able to carry its own
      // approval/rejection decision. Storage only here -- Plan 30-02's
      // approveUser/rejectUser resolvers are what actually write these
      // fields (D-04). Unlike Invitation.js's approvedBy (association-
      // derived), approvedBy here is a plain unassociated INTEGER.UNSIGNED
      // column -- no FK, matching the ALTER-TABLE-on-an-existing-table
      // precedent (015/018) rather than invitations.approvedBy's
      // CREATE-TABLE-time FK.
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      // A self-registrant's free-text note describing how they relate to the
      // family (D-03/D-04/REG-03) -- the only context an admin has to judge
      // a stranger on. Optional per D-06. Length-capped at 500 chars,
      // matching migration 020's VARCHAR(500).
      relationshipNote: { type: DataTypes.STRING(500), allowNull: true }
      // familyMemberId is added by the User.belongsTo(FamilyMember) association in
      // models/index.js (Phase 13, D-07) -- not redeclared here.
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      hooks: {
        beforeValidate(user) {
          if (user.email) user.email = user.email.toLowerCase().trim();
        },
        // options.passwordAlreadyHashed (boolean true) is the ONLY signal that
        // skips hashing -- never derived from passwordHash's shape or content.
        // Plan 32-03's D-09 precomputes the bcrypt hash before the
        // existing-user lookup on the tokenless registration path, then calls
        // models.User.create(values, { passwordAlreadyHashed: true }) to avoid
        // double-hashing (which would silently lock the self-registrant out
        // of their own account at first login). The invited path calls
        // models.User.create with no such option, so options.passwordAlreadyHashed
        // is undefined and hashing proceeds exactly as before -- unaffected.
        // A content-sniffing guard (regex-matching passwordHash against a
        // bcrypt-format pattern) is deliberately rejected: a self-registrant
        // who chooses a real password shaped like a bcrypt hash (e.g.
        // starting with $2a$04$) would have that password persisted verbatim
        // in cleartext, silently -- worse than the double-hash bug this fixes.
        async beforeCreate(user, options) {
          if (user.passwordHash && !(options && options.passwordAlreadyHashed)) {
            user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
          }
        },
        async beforeUpdate(user) {
          if (user.changed('passwordHash')) {
            user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
            user.passwordChangedAt = new Date();
          }
        }
      }
    }
  );

  return User;
}
