import { describe, it, expect } from 'vitest';
import { buildSchema, parse, validate } from 'graphql';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { graphql } from '../../test/helpers.js';
import { env } from '../config/env.js';

const ME_QUERY = `
  query {
    me {
      id
      email
    }
  }
`;

// env.maxQueryDepth is 12 (CR-03); 110 ofType nestings comfortably exceeds
// it regardless of how the leading __schema { types { fields { type { ... } } } }
// levels are counted.
function buildDeepIntrospectionQuery(ofTypeDepth) {
  let inner = 'kind';
  for (let i = 0; i < ofTypeDepth; i++) {
    inner = `ofType { ${inner} }`;
  }
  return `
    query {
      __schema {
        types {
          fields {
            type {
              ${inner}
            }
          }
        }
      }
    }
  `;
}

describe('GraphQL query depth validation (D-08)', () => {
  it('allows a shallow, legitimate query through the shared graphql() helper (regression proof)', async () => {
    const { data, errors } = await graphql(ME_QUERY, {}, null);
    expect(errors).toBeUndefined();
    expect(data).toEqual({ me: null });
  });

  it('rejects a hand-crafted over-depth introspection query as a validation error before any resolver executes', async () => {
    const deepQuery = buildDeepIntrospectionQuery(110);
    const { data, errors } = await graphql(deepQuery, {}, null);

    expect(errors).toBeDefined();
    expect(errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(data == null).toBe(true);
  });

  it('depends on this plan explicit ignoreIntrospection: false setting, not the library default', () => {
    // Directly exercises graphql-js's validate() (same `graphql` package
    // instance used everywhere in this codebase -- __schema/__type are
    // automatic meta-fields on any schema's root Query type per the GraphQL
    // spec, so a minimal schema is sufficient here) to prove the rejection
    // above is caused by this plan's explicit ignoreIntrospection: false
    // setting -- not merely something the library would reject anyway under
    // its own default (ignoreIntrospection: true).
    const schema = buildSchema('type Query { ping: String }');
    const document = parse(buildDeepIntrospectionQuery(110));

    // MaxDepthVisitor's default `propagateOnRejection: true` throws
    // synchronously from inside the visitor rather than returning an error
    // in validate()'s returned array, so the rejection/acceptance is
    // observed here as throws/no-throw rather than a non-empty/empty array.
    expect(() =>
      validate(schema, document, [maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: false })])
    ).toThrow(/Query depth limit/);

    expect(() =>
      validate(schema, document, [maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: true })])
    ).not.toThrow();
  });
});
