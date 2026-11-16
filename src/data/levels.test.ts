import { describe, expect, it } from 'vitest';
import { TREE_KEYS, loadRepertoire } from './levels';

describe('repertoire data', () => {
  it('has all 8 level/color trees', () => {
    const data = loadRepertoire();
    expect(TREE_KEYS).toHaveLength(8);
    for (const key of TREE_KEYS) {
      const tree = data.trees[key];
      expect(tree, key).toBeDefined();
      expect(tree.games, key).toBeGreaterThan(0);
      expect(Object.keys(tree.tree).length, key).toBeGreaterThan(0);
    }
  });
});
