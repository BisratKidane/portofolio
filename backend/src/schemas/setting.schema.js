export const settingTypeDefs = `#graphql
  type PublicRegistrationSetting {
    enabled: Boolean!
    # null means "never changed since setup" -- the migration-021-seeded row
    # carries updatedById IS NULL, which is the third of UI-SPEC's three
    # attribution variants.
    updatedAt: String
    updatedByName: String
  }

  extend type Query {
    # Deliberately PUBLIC and unauthenticated: D-07 requires the /register
    # page to choose its surface (form vs. invite-only message) before anyone
    # is logged in. Name is locked verbatim by D-07 -- do not rename.
    publicRegistrationEnabled: Boolean!
    # requireAdmin. Kept as a SEPARATE root field from the public query above
    # so an admin's name and the flip timestamp are never published to an
    # anonymous caller (D-06 attribution, Pattern 5).
    publicRegistrationSetting: PublicRegistrationSetting!
  }

  extend type Mutation {
    # requireAdmin.
    setPublicRegistrationEnabled(enabled: Boolean!): PublicRegistrationSetting!
  }
`;
