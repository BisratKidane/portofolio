export const userTypeDefs = `#graphql
  enum Role {
    ADMIN
    USER
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: Role!
    createdAt: String!
    updatedAt: String!
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
  }

  type Mutation {
    register(name: String!, email: String!, password: String!): RegisterPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    requestPasswordReset(email: String!): PasswordResetPayload!
    resetPassword(token: String!, password: String!): Boolean!
    verifyEmail(token: String!): AuthPayload!
    resendVerificationEmail(email: String!): PasswordResetPayload!
  }
`;
