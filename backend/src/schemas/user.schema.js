export const userTypeDefs = `#graphql
  enum Role {
    ADMIN
    USER
  }

  enum AccountStatus {
    Pending
    Active
    Rejected
    Disabled
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: Role!
    emailVerified: Boolean!
    status: AccountStatus!
    familyMemberId: ID
    createdAt: String!
    updatedAt: String!
  }

  input UpdateUserInput {
    name: String
    email: String
    role: Role
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type PasswordResetPayload {
    message: String!
  }

  type RegisterPayload {
    message: String!
  }

  type Dashboard {
    message: String!
    user: User!
    users: [User!]
  }

  type Query {
    me: User
    dashboard: Dashboard!
    users: [User!]!
    unlinkedUsers: [User!]!
  }

  type Mutation {
    register(token: String!, name: String!, password: String!): RegisterPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    requestPasswordReset(email: String!): PasswordResetPayload!
    resetPassword(token: String!, password: String!): Boolean!
    verifyEmail(token: String!): AuthPayload!
    resendVerificationEmail(email: String!): PasswordResetPayload!
    linkUserToMember(userId: ID!, memberId: ID, newMember: NewFamilyMemberInput): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    changePassword(currentPassword: String!, newPassword: String!): AuthPayload!
    setUserPassword(userId: ID!, newPassword: String!): Boolean!
  }
`;
