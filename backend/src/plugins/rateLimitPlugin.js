import { GraphQLError } from 'graphql';
import { RATE_LIMITS } from '../config/rateLimits.js';
import { checkAndIncrement } from '../utils/rateLimitStore.js';

export function enforceRateLimit(clientIp, fieldNames) {
  for (const field of fieldNames) {
    const limit = RATE_LIMITS[field];
    if (!limit) continue;

    const key = `${clientIp}:${field}`;
    const allowed = checkAndIncrement(key, limit.max, limit.windowMs);

    if (!allowed) {
      throw new GraphQLError('Too many requests. Please try again later.', {
        extensions: { code: 'TOO_MANY_REQUESTS' }
      });
    }
  }
}

function collectRootFieldNames(selections, fragments, visited = new Set()) {
  const fieldNames = [];

  for (const selection of selections) {
    if (selection.kind === 'Field') {
      // A root field of the operation — do NOT recurse into its sub-selections
      // (those are response fields, not rate-limited operations).
      fieldNames.push(selection.name.value);
    } else if (selection.kind === 'InlineFragment') {
      fieldNames.push(...collectRootFieldNames(selection.selectionSet.selections, fragments, visited));
    } else if (selection.kind === 'FragmentSpread') {
      const fragmentName = selection.name.value;
      if (visited.has(fragmentName)) continue;
      visited.add(fragmentName);
      const fragment = fragments[fragmentName];
      if (fragment) {
        fieldNames.push(...collectRootFieldNames(fragment.selectionSet.selections, fragments, visited));
      }
    }
  }

  return fieldNames;
}

export const rateLimitPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ contextValue, document, operation }) {
        const fragments = {};
        for (const definition of document.definitions) {
          if (definition.kind === 'FragmentDefinition') {
            fragments[definition.name.value] = definition;
          }
        }

        const fieldNames = collectRootFieldNames(operation.selectionSet.selections, fragments);

        enforceRateLimit(contextValue.clientIp, fieldNames);
      }
    };
  }
};
