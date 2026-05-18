import type { PluginCreator, Rule } from 'postcss';

import parser from 'postcss-selector-parser';
import type { Node, Selector } from 'postcss-selector-parser';

const processor = parser()

export type PluginOptions = {};

function equivalent(firstNode: Node, secondNode: Node): boolean {
  switch(firstNode.type) {
    case 'string':
      if (secondNode.type != 'string') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'tag':
      if (secondNode.type != 'tag') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'selector':
      if (secondNode.type != 'selector') {
        return false;
      }
      return allEquivalent(firstNode.nodes, secondNode.nodes);
    case 'root':
      if (secondNode.type != 'root') {
        return false;
      }
      return allEquivalent(firstNode.nodes, secondNode.nodes);
    case 'pseudo':
      if (secondNode.type != 'pseudo') {
        return false;
      }
      if (firstNode.value != secondNode.value) {
        return false;
      }
      return allEquivalent(firstNode.nodes, secondNode.nodes);
    case 'nesting':
      return secondNode.type == 'nesting';
    case 'id':
      if (secondNode.type != 'id') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'comment':
      if (secondNode.type != 'comment') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'combinator':
      if (secondNode.type != 'combinator') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'class':
      if (secondNode.type != 'class') {
        return false;
      }
      return firstNode.value == secondNode.value;
    case 'attribute':
      if (secondNode.type != 'attribute') {
        return false;
      }
      return firstNode.attribute == secondNode.attribute && firstNode.value == secondNode.value;
    case 'universal':
      return secondNode.type == 'universal';
  }
}

function allEquivalent(firstNodes: Node[], secondNodes: Node[]): boolean {
  if (firstNodes.length != secondNodes.length) {
    return false;
  }
  let result = true;
  firstNodes.forEach((firstNode, index) => {
    let secondNode = secondNodes[index];
    if(!equivalent(firstNode, secondNode)) {
      result = false;
    }
  });
  return result;
}

function longestSelectorPrefix(
  firstSelector: Selector,
  secondSelector: Selector
): { prefix: Selector, firstRemainder: Selector, secondRemainder: Selector } {
  let firstRemainder = firstSelector.clone()
  let secondRemainder = secondSelector.clone()
  let prefix = parser.selector({value: ""});

  while (
    firstRemainder.length > 0
    && secondRemainder.length > 0
    && equivalent(firstRemainder.first, secondRemainder.first)
  ) {
    let commonNode = firstRemainder.first;
    firstRemainder.first.remove();
    secondRemainder.first.remove();
    prefix.append(commonNode);
  }

  return { prefix, firstRemainder, secondRemainder };
}

function nest(firstRule: Rule, secondRule: Rule): void {
  let firstAst = processor.astSync(firstRule)
  let secondAst = processor.astSync(secondRule)

  // If the two rules have the same selector, simply merge their declaration
  // blocks.
  if (equivalent(firstAst, secondAst)) {
    firstRule.append(secondRule.nodes);
    secondRule.remove();
    return;
  }

  // Only single-selector rules can be nested.
  if (firstAst.length != 1 || secondAst.length != 1) {
    return;
  }

  let firstSelector = firstAst.first
  let secondSelector = secondAst.first
  let {
    prefix,
    firstRemainder,
    secondRemainder,
  } = longestSelectorPrefix(firstSelector, secondSelector);

  // If the common prefix is the entire first selector, nest the second rule
  // inside the first.
  if (firstRemainder.length == 0) {
    // Create the parent rule as a copy of the first rule.
    let parentRule = firstRule.clone();

    // Create the child rule as a copy of the second rule.
    let childRule = secondRule.clone();
    // Construct the selector of the child rule from the remainder.
    let childSelector = secondRemainder.clone();
    childSelector.prepend(parser.nesting());
    childRule.selector = childSelector.toString();

    // Nest the child rule inside the parent rule.
    parentRule.append(childRule);
    // Add the parent rule to the tree.
    secondRule.after(parentRule);

    // Remove the original rules.
    firstRule.remove();
    secondRule.remove();
    return;
  }
  // Treat nesting the first rule inside the second analogously.
  if (secondRemainder.length == 0) {
    // Create the parent rule as a copy of the second rule.
    let parentRule = secondRule.clone();

    // Create the child rule as a copy of the first rule.
    let childRule = firstRule.clone();
    // Construct the selector of the child rule from the remainder.
    let childSelector = firstRemainder.clone();
    childSelector.prepend(parser.nesting());
    childRule.selector = childSelector.toString();

    // Nest the child rule inside the parent rule.
    parentRule.prepend(childRule);
    // Add the parent rule to the tree.
    secondRule.after(parentRule);

    // Remove the original rules.
    firstRule.remove();
    secondRule.remove();
    return;
  }
}

const creator: PluginCreator<PluginOptions> = (opts?: PluginOptions) => {
  const options = Object.assign(
    // Default options
    {},
    // Provided options
    opts,
  );

  return {
    postcssPlugin: 'postcss-add-nesting',
    Rule(rule, helper) {
      // Check every rule against the previous one for nesting.
      let previous = rule.prev();
      if (previous && previous.type == "rule") {
        nest(previous, rule)
      }
    }
  };
}

creator.postcss = true;

export default creator;
