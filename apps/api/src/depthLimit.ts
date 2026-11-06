import { GraphQLError, Kind, type ASTVisitor, type ValidationContext, type SelectionSetNode, type FragmentDefinitionNode } from "graphql";

/**
 * Rejects queries nested deeper than `maxDepth`. The schema has no
 * recursive types today, so this is cheap insurance: if one is ever added,
 * nobody can send `a { b { a { b ... } } }` to burn CPU.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    function depthOf(set: SelectionSetNode, depth: number, seen: Set<string>): number {
      let max = depth;
      for (const sel of set.selections) {
        if (sel.kind === Kind.FIELD) {
          // Introspection meta-fields don't count.
          if (sel.name.value.startsWith("__")) continue;
          max = Math.max(max, sel.selectionSet ? depthOf(sel.selectionSet, depth + 1, seen) : depth + 1);
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, depthOf(sel.selectionSet, depth, seen));
        } else {
          const name = sel.name.value;
          const fragment = fragments.get(name);
          if (!fragment || seen.has(name)) continue;
          max = Math.max(max, depthOf(fragment.selectionSet, depth, new Set(seen).add(name)));
        }
      }
      return max;
    }

    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query is too deep: ${depth} levels (limit ${maxDepth}).`, {
              nodes: [node],
              extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
            }),
          );
        }
      },
    };
  };
}
