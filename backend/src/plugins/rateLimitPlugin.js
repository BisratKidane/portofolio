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

export const rateLimitPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ contextValue, operation }) {
        const fieldNames = operation.selectionSet.selections
          .filter((selection) => selection.kind === 'Field')
          .map((selection) => selection.name.value);

        enforceRateLimit(contextValue.clientIp, fieldNames);
      }
    };
  }
};
