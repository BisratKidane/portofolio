export const approvalTypeDefs = `#graphql
  extend type Mutation {
    approveUser(userId: ID!): User!
    rejectUser(userId: ID!, reason: String): User!
  }
`;
