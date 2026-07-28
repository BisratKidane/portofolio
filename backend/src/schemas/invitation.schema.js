export const invitationTypeDefs = `#graphql
  enum InvitationStatus {
    Pending
    Registered
    Approved
    Rejected
    Expired
  }

  type Invitation {
    id: ID!
    invitedName: String
    invitedEmail: String!
    relationshipToFamily: String
    invitationNote: String
    expiresAt: String!
    registeredAt: String
    approvedAt: String
    rejectedAt: String
    rejectionReason: String
    status: InvitationStatus!
    createdAt: String!
    inviter: User
  }

  input CreateInvitationInput {
    invitedName: String
    invitedEmail: String!
    relationshipToFamily: String
    invitationNote: String
  }

  # The raw registration URL is returned ONCE here at creation — the token
  # behind it is never stored or returned again.
  type CreateInvitationResult {
    invitation: Invitation!
    registrationUrl: String!
  }

  extend type Query {
    myInvitations: [Invitation!]!
    invitations: [Invitation!]!
  }

  extend type Mutation {
    createInvitation(input: CreateInvitationInput!): CreateInvitationResult!
  }
`;
