// Pure, framework-free view-frame reducer for /detail descendant navigation.
// State shape: { topId, topExpanded, expandedChildId, history: [] }
// See .planning/phases/27-descendant-navigation-performance/27-RESEARCH.md
// (Pattern 1) and 27-CONTEXT.md (D-01..D-04) for the locked behavior.

export function initial(topId) {
  return { topId, topExpanded: false, expandedChildId: null, history: [] };
}

export function navReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initial(action.id);

    case 'EXPAND_TOP':
      if (state.topExpanded) {
        if (state.history.length > 0) {
          const poppedFrame = state.history[state.history.length - 1];
          return { ...poppedFrame, history: state.history.slice(0, -1) };
        }
        return { ...state, topExpanded: false, expandedChildId: null };
      }
      return { ...state, topExpanded: true };

    case 'EXPAND_CHILD':
      if (state.expandedChildId === action.id) {
        return { ...state, expandedChildId: null };
      }
      return { ...state, expandedChildId: action.id };

    case 'EXPAND_GRANDCHILD':
      return {
        topId: state.expandedChildId,
        topExpanded: true,
        expandedChildId: action.id,
        history: [...state.history, state]
      };

    case 'REFRESH':
      return { ...state };

    default:
      return state;
  }
}
