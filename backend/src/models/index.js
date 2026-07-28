import { sequelize } from '../config/database.js';
import { initUser } from './User.js';
import { initFamilyMember, FamilyMember } from './FamilyMember.js';
import { initSpouse, Spouse } from './Spouse.js';
import { initInvitation, Invitation } from './Invitation.js';
import { initAuditLog, AuditLog } from './AuditLog.js';

const User = initUser(sequelize);
initFamilyMember(sequelize);
initSpouse(sequelize);
initInvitation(sequelize);
initAuditLog(sequelize);

// --- Associations (first use of Sequelize associations in this codebase) ---

// Parent links: declare onDelete/onUpdate ONLY on the belongsTo side.
FamilyMember.belongsTo(FamilyMember, {
  as: 'mother',
  foreignKey: { name: 'motherId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsMother', foreignKey: 'motherId' });

FamilyMember.belongsTo(FamilyMember, {
  as: 'father',
  foreignKey: { name: 'fatherId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsFather', foreignKey: 'fatherId' });

// Spouse join model — plain belongsTo pair, no onDelete override needed here
// (spouse-row deletion is handled explicitly by the deleteMember() helper in
// Plan 12-04, not by DB-level cascade).
Spouse.belongsTo(FamilyMember, { as: 'memberA', foreignKey: { name: 'memberAId', allowNull: false } });
Spouse.belongsTo(FamilyMember, { as: 'memberB', foreignKey: { name: 'memberBId', allowNull: false } });

// User <-> FamilyMember link (Phase 13, D-06/D-07) -- the first association
// touching the pre-existing `users` table. hasOne (not hasMany) because the
// UNIQUE constraint on familyMemberId makes this a true one-to-one.
User.belongsTo(FamilyMember, {
  as: 'familyMember',
  foreignKey: { name: 'familyMemberId', allowNull: true, unique: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasOne(User, { as: 'linkedUser', foreignKey: 'familyMemberId' });

// Provenance (admin-visible): who created / last updated each member. SET NULL
// on delete so removing a user never cascades into deleting members they
// created or edited.
FamilyMember.belongsTo(User, {
  as: 'createdByUser',
  foreignKey: { name: 'createdByUserId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.belongsTo(User, {
  as: 'updatedByUser',
  foreignKey: { name: 'updatedByUserId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

// --- Invitation associations (Phase 1, invitation-based registration) ---
// inviter is required; deleting the inviter cascades their invitations away.
// approver/registeredUser are optional back-references filled during the
// approval / registration flows.
Invitation.belongsTo(User, {
  as: 'inviter',
  foreignKey: { name: 'inviterId', allowNull: false },
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});
User.hasMany(Invitation, { as: 'sentInvitations', foreignKey: 'inviterId' });
Invitation.belongsTo(User, {
  as: 'approver',
  foreignKey: { name: 'approvedBy', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
Invitation.belongsTo(User, {
  as: 'registeredUser',
  foreignKey: { name: 'registeredUserId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

// --- Audit log associations ---
AuditLog.belongsTo(User, {
  as: 'actor',
  foreignKey: { name: 'actorUserId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
AuditLog.belongsTo(Invitation, {
  as: 'invitation',
  foreignKey: { name: 'invitationId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
AuditLog.belongsTo(User, {
  as: 'targetUser',
  foreignKey: { name: 'targetUserId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

export const models = {
  User,
  FamilyMember,
  Spouse,
  Invitation,
  AuditLog
};

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
