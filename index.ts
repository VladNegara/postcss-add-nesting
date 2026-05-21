import { AtRule, Container, Declaration, PluginCreator, Rule } from 'postcss';

import parser from 'postcss-selector-parser';
import type { Node, Root, Selector } from 'postcss-selector-parser';

const processor = parser()

function parseSelector(selector: string | Rule): Root {
  return processor.astSync(selector);
}

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

function onlyChild(containerNode: Container): AtRule | Declaration | Rule | undefined {
  if (!containerNode.nodes) {
    return undefined;
  }

  let result: AtRule | Declaration | Rule | undefined = undefined
  for (let child of containerNode.nodes) {
    if (child.type != "comment") {
      if (result) {
        return undefined;
      }
      result = child;
    }
  }
  return result;
}

interface NoNestingDecision {
  type: "none";
}

interface NestFirstDecision {
  type: "first";
  parentSelector: Selector;
  childSelector: Selector;
}

interface NestSecondDecision {
  type: "second";
  parentSelector: Selector;
  childSelector: Selector;
}

interface NestBothDecision {
  type: "both";
  parentSelector: Selector;
  firstChildSelector: Selector;
  secondChildSelector: Selector;
}

interface CollapseDecision {
  type: "collapse";
}

type NestingDecision =
  | NoNestingDecision
  | NestFirstDecision
  | NestSecondDecision
  | NestBothDecision
  | CollapseDecision

function decideNesting(first: string | Rule, second: string | Rule): NestingDecision {
  let firstAst = parseSelector(first);
  let secondAst = parseSelector(second);

  // If the two rules have the same selector, simply collapse their declaration
  // blocks.
  if (equivalent(firstAst, secondAst)) {
    return { type: "collapse" }
  }

  // Only single-selector rules can be nested.
  if (firstAst.length != 1 || secondAst.length != 1) {
    return { type: "none" };
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
    return {
      type: "second",
      parentSelector: prefix,
      childSelector: secondRemainder,
    }
  }

  // Treat nesting the first rule inside the second analogously.
  if (secondRemainder.length == 0) {
    return {
      type: "first",
      parentSelector: prefix,
      childSelector: firstRemainder,
    }
  }

  // If there is a common prefix between the two selectors, but it's shorter
  // than either of them, they could still be nested.
  if (prefix.length > 0) {
    return {
      type: "both",
      parentSelector: prefix,
      firstChildSelector: firstRemainder,
      secondChildSelector: secondRemainder,
    }
  }

  return { type: "none" }
}

function shiftDown(atRule: AtRule): boolean {
  let rule = onlyChild(atRule);

  if (!rule || rule.type != "rule") {
    return false;
  }

  // Remove the rule from the tree, leaving its children as direct children of
  // the at-rule.
  rule.replaceWith(rule.nodes);

  // Insert a copy of the rule as the parent of the at-rule.
  let clonedRule = rule.clone();
  atRule.after(clonedRule);
  clonedRule.append(atRule);
  
  // Fix the formatting.
  clonedRule.cleanRaws();
  atRule.raws.semicolon = rule.raws.semicolon;
  atRule.raws.before = rule.raws.before;

  return true;
}

function collapseAtRules(firstAtRule: AtRule, secondAtRule: AtRule): boolean {
  if (firstAtRule.name != secondAtRule.name) {
    return false;
  }
  if (firstAtRule.params != secondAtRule.params) {
    return false;
  }
  secondAtRule.prepend(firstAtRule.clone().nodes);
  firstAtRule.remove();
  return true;
}

function nestRules(firstRule: Rule, secondRule: Rule): boolean {
  let nestingDecision = decideNesting(firstRule, secondRule)

  let parentRule: Rule
  let childRule: Rule
  let childSelector: Selector

  switch (nestingDecision.type) {
    case 'none':
      // The rules cannot be nested; stop here.
      return false;
    case 'second':
      // Create the parent rule as a copy of the first rule.
      parentRule = firstRule.clone();

      // Create the child rule as a copy of the second rule.
      childRule = secondRule.clone();
      // Construct the selector of the child rule from the remainder.
      childSelector = nestingDecision.childSelector;
      childSelector.prepend(parser.nesting());
      childRule.selector = childSelector.toString();
      childRule.cleanRaws();

      // Nest the child rule inside the parent rule.
      parentRule.append(childRule);
      // Add the parent rule to the tree.
      secondRule.after(parentRule);

      // Remove the original rules.
      firstRule.remove();
      secondRule.remove();

      return true;
    case 'first':
      // Create the parent rule as a copy of the second rule.
      parentRule = secondRule.clone();

      // Create the child rule as a copy of the first rule.
      childRule = firstRule.clone();
      // Construct the selector of the child rule from the remainder.
      childSelector = nestingDecision.childSelector;
      childSelector.prepend(parser.nesting());
      childRule.selector = childSelector.toString();
      childRule.cleanRaws();

      // Nest the child rule inside the parent rule.
      parentRule.prepend(childRule);
      // Add the parent rule to the tree.
      secondRule.after(parentRule);

      // Remove the original rules.
      firstRule.remove();
      secondRule.remove();

      return true;
    case 'both':
      // The rules can both be nested inside a selector that is their common
      // prefix; ignore this.
      return false;
    case 'collapse':
      firstRule.append(secondRule.nodes);
      secondRule.remove();
      return true;
  }
}

function nestWithPrevious(node: AtRule | Rule): boolean {
  // Check the rule or at-rule against the previous one for nesting.
  let previous = node.prev();
  while (previous && previous.type == "comment") {
    previous = previous.prev();
  }
  if (previous) {
    if (previous.type == "atrule" && node.type == "atrule") {
      return collapseAtRules(previous, node);
    }
    if (previous.type == "rule" && node.type == "rule") {
      return nestRules(previous, node);
    }
  }
  return false;
}

function nestWithNext(node: AtRule | Rule): boolean {
  // Check the rule or at-rule against the next one for nesting.
  let next = node.next();
  while (next && next.type == "comment") {
    next = next.next();
  }
  if (next) {
    if (next.type == "atrule" && node.type == "atrule") {
      return collapseAtRules(node, next);
    }
    if (next.type == "rule" && node.type == "rule") {
      return nestRules(node, next);
    }
  }
  return false;
}

export type PluginOptions = {};

const creator: PluginCreator<PluginOptions> = (opts?: PluginOptions) => {
  const options = Object.assign(
    // Default options
    {},
    // Provided options
    opts,
  );

  return {
    postcssPlugin: 'postcss-add-nesting',
    AtRule(atRule) {
      nestWithNext(atRule) || nestWithPrevious(atRule) || shiftDown(atRule);
    },
    Rule(rule) {
      nestWithNext(rule) || nestWithPrevious(rule);
    }
  };
}

creator.postcss = true;

export default creator;
