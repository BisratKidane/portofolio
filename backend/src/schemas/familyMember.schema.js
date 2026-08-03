export const familyMemberTypeDefs = `#graphql
  enum Gender {
    Male
    Female
    Other
  }

  enum ParentRole {
    MOTHER
    FATHER
  }

  type FamilyMember {
    id: ID!
    firstname: String!
    lastname: String!
    fullname: String!
    gender: Gender!
    mothersname: String
    geezFirstname: String
    geezLastname: String
    geezMothersname: String
    geezFullname: String
    email: String
    birthdate: String
    isAlive: Boolean!
    phone: String
    address: String
    photoUrl: String
    mother: FamilyMember
    father: FamilyMember
    spouses: [FamilyMember!]!
    children: [FamilyMember!]!
    siblings: [FamilyMember!]!
    linkedUser: User
    # Provenance — resolved to the user only for an ADMIN viewer, else null.
    createdBy: User
    updatedBy: User
    createdAt: String
    updatedAt: String
    # D-07/D-08: reuses the existing admin check verbatim (no new scope
    # logic) -- true only for an ADMIN viewer, false for a non-admin or
    # anonymous viewer (rejected upstream by requireFamilyAccess).
    canEdit: Boolean!
  }

  input NewFamilyMemberInput {
    firstname: String!
    lastname: String!
    gender: Gender!
    mothersname: String
    geezFirstname: String
    geezLastname: String
    geezMothersname: String
    email: String
    birthdate: String
    isAlive: Boolean
    phone: String
    address: String
  }

  # D-05, structural: deliberately no id/edge-mutating field (no motherId,
  # fatherId, or spouse reference) -- editMember can only ever touch plain
  # fields, never rewire or remove an existing parent/spouse edge.
  input EditFamilyMemberInput {
    firstname: String
    lastname: String
    gender: Gender
    mothersname: String
    geezFirstname: String
    geezLastname: String
    geezMothersname: String
    email: String
    birthdate: String
    isAlive: Boolean
    phone: String
    address: String
  }

  extend type Query {
    familyMembers: [FamilyMember!]!
    familyMember(id: ID!): FamilyMember
    myEditableMembers: [FamilyMember!]!
    familyHead: FamilyMember
    searchFamilyMembers(term: String!, limit: Int): [FamilyMember!]!
  }

  extend type Mutation {
    addParent(memberId: ID!, role: ParentRole!, newMember: NewFamilyMemberInput!): FamilyMember!
    addSpouse(memberId: ID!, newMember: NewFamilyMemberInput!): FamilyMember!
    addChild(memberId: ID!, role: ParentRole!, newMember: NewFamilyMemberInput!, otherParentId: ID): FamilyMember!
    addSibling(memberId: ID!, newMember: NewFamilyMemberInput!): FamilyMember!
    editMember(id: ID!, fields: EditFamilyMemberInput!): FamilyMember!
    deleteMember(id: ID!): Boolean!
  }
`;
