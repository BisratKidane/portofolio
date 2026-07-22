import { typeDefs } from '../schemas/index.js';
import { resolvers } from '../resolvers/index.js';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { env } from '../config/env.js';

export const validationRules = [
  // ignoreIntrospection: false closes the documented introspection-bypass
  // advisory (GHSA-hmfr-rx46-4jx2, fixed upstream in 2.4.2) belt-and-suspenders.
  //
  // propagateOnRejection: false + an onReject handler that calls
  // context.reportError(...) is required here: the library's own default
  // (propagateOnRejection: true) throws the GraphQLError synchronously from
  // inside the visitor, which Apollo Server's request pipeline does not
  // catch around its validate() call -- an over-depth query would surface as
  // an uncaught "Internal server error" (extensions.code
  // INTERNAL_SERVER_ERROR), not the intended clean validation-error response
  // (extensions.code GRAPHQL_VALIDATION_FAILED). Reporting the error through
  // the standard graphql-js ValidationContext#reportError API instead lets
  // validate() collect it into its returned errors array exactly like any
  // other validation rule, which is what Apollo Server's request pipeline
  // expects and translates into the documented GRAPHQL_VALIDATION_FAILED
  // response shape (verified empirically against the installed
  // @escape.tech/graphql-armor-max-depth@2.4.2 + @apollo/server@4.13.0).
  maxDepthRule({
    n: env.maxQueryDepth,
    ignoreIntrospection: false,
    propagateOnRejection: false,
    onReject: [(context, error) => context.reportError(error)]
  })
];

export { typeDefs, resolvers };
