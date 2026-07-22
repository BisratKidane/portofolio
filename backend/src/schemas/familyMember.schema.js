export const familyMemberTypeDefs = `#graphql
  enum Gender {
    Male
    Female
    Other
  }

  type FamilyMember {
    id: ID!
    firstname: String!
    lastname: String!
    fullname: String!
    gender: Gender!
    mothersname: String
    email: String
    birthdate: String
    deathdate: String
    phone: String
    address: String
    mother: FamilyMember
    father: FamilyMember
    spouses: [FamilyMember!]!
    children: [FamilyMember!]!
    siblings: [FamilyMember!]!
    linkedUser: User
  }

  input NewFamilyMemberInput {
    firstname: String!
    lastname: String!
    gender: Gender!
    mothersname: String
    email: String
    birthdate: String
    deathdate: String
    phone: String
    address: String
  }

  extend type Query {
    familyMembers: [FamilyMember!]!
    familyMember(id: ID!): FamilyMember
  }
`;
