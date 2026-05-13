import postcss from 'postcss';
import { describe, expect, it } from '@jest/globals';

import plugin from './';

async function run(input: string, output: string, opts = {}) {
  let result = await postcss([plugin(opts)]).process(input, { from: undefined });
  expect(result.css).toEqual(output);
  expect(result.warnings().length).toEqual(0);
}


describe('The nesting plugin', () => {
  describe('for rules with unrelated selectors', () => {
    it('leaves the rules unchanged', async () => {
      await run(
        'p.note {color: blue;} q:lang(ru) {font-size: 2em;}',
        'p.note {color: blue;} q:lang(ru) {font-size: 2em;}',
      );
    });
  });

  describe('for two rules with related selectors', () => {
    describe('if the rules are consecutive', () => {
      describe('if the rules have identical selectors', () => {
        it('collapses the declaration blocks', async () => {
          await run(
            'p.warning.important {color: green;} p.warning.important {font-size: 13px;}',
            'p.warning.important {color: green; font-size: 13px;}',
          );
        });

        it.skip('removes a redundant declaration', async () => {
          await run(
            'a.external {background-color: blue; font-style: italic;} a.external {background-color: yellow;}',
            'a.external {font-style: italic; background-color: yellow;}',
          )
        });
      });

      describe('if the rules have equivalent selectors', () => {
        it('collapses the rules', async () => {
          await run(
            '.tall.wide {ratio: 1/1;} .wide.tall {width: 100%;}',
            '.tall.wide {ratio: 1/1; width: 100%;}',
          );
        });

        it.skip('removes a redundant declaration', async () => {
          await run(
            '.note.important {color: red; font-size: 13px; font-weight: bold;} .important.note {font-size: 14px;}',
            '.note.important {font-weight: bold; color: red; font-size: 14px;}',
          )
        });
      });

      describe('if the first selector is a parent of the second', () => {
        it('nests a rule with a compound selector', async () => {
          await run(
            'p.note {font-style: italic;} p.note.important {color: red;}',
            'p.note {font-style: italic; &.important {color: red;}}',
          );
        });

        it('nests a rule with a descendant combinator', async () => {
          await run(
            '.card {border-radius: 5px;} .card h1 {font-size: 3rem;}',
            '.card {border-radius: 5px; & .h1 {font-size: 3rem;}}',
          );
        });

        it('nests a rule with a child combinator', async () => {
          await run(
            'ol#courses {display: flex;} ol#courses > li {list-style: none;}',
            'ol#courses {display: flex; & > li {list-style: none;}}',
          );
        });

        it('nests a rule with a subsequent-sibling combinator', async () => {
          await run(
            'h3 {font-weight: 900;} h3 ~ p {font-weight: 300;}',
            'h3 {font-weight: 900; & ~ p {font-weight: 300;}',
          );
        });

        it('nests a rule with a next-sibling combinator', async () => {
          await run(
            'section {padding: 1em;} section + section {border-top: 1px solid black;}',
            'section {padding: 1em; & + section {border-top: 1px solid black;}',
          );
        });
      });

      describe('if the first selector is a child of the second', () => {
        it('nests a rule with a compound selector', async () => {
          await run(
            'div#main {display: flex; justify-contents: center;} div {border-radius: 10px;}',
            'div {&#main {display: flex; justify-contents: center;} border-radius: 10px;}',
          );
        });

        // TODO: make test cases analogous to the describe block above
      });
    });

    describe('if a potentially interfering rule is between them', () => {
      it('does not collapse the rules', async () => {
        await run(
          '.first {margin: 1.5em;} .second {margin-right: 3em;} .first {margin-right: 2em;}',
          '.first {margin: 1.5em;} .second {margin-right: 3em;} .first {margin-right: 2em;}',
        );
      });

      it('does not nest the rules', async () => {
        await run(
          '.warning {border: 2px dashed red;} .important {color: orange;} .warning p {color: red;}',
          '.warning {border: 2px dashed red;} .important {color: orange;} .warning p {color: red;}',
        );
      });
    });

    describe.skip('if an uninterfering rule is between them', () => {
      it('collapses the rules', async () => {
        await run(
          'q {font-style: italic;} blockquote: {margin: 2rem;} q {font-weight: 100;}',
          'q {font-style: italic; font-weight: 100;} blockquote: {margin: 2rem;}',
        )
      });

      it('nests the rules', async () => {
        await run(
          'button {background-color: chocolate;} img {width: 90%;} button:hover {background-color: orange;}',
          'button {background-color: chocolate; &:hover {background-color: orange;}} img {width: 90%;}',
        );
      });
    })
  });

  describe('for three rules with related selectors', () => {
    describe('if the first selector is a parent of the other two', () => {
      it('nests the rules', async () => {
        await run(
          'button {border-radius: 0.5em;} button:hover {background-color: orange;} button ~ p {font-size: 2em;}',
          'button {border-radius: 0.5em; &:hover {background-color: orange;} & ~ p {font-size: 2em;}}',
        );
      });
    });

    describe('if the second selector is a parent of the other two', () => {
      it('nests the rules', async() => {
        await run(
          'section > header {padding: 0em 4em;} section {margin: 1em;} section:first-child {border: 1em solid yellow;}',
          'section {& > header {padding: 0em 4em;} margin: 1em; &:first-child {border: 1em solid yellow;}}',
        );
      });

      it.skip('removes a redundant declaration', async() => {
        await run(
          'footer.hello::after {content: "Hello!";} footer {background-color: brown;} footer::after {content: "Bye!";}',
          'footer {background-color: brown; &::after {content: "Bye!";}}',
        )
      });
    });

    describe('if the third selector is a parent of the other two', () => {
      it('nests the rules', async () => {
        await run(
          'aside :is(h1, h2, h3, h4, h5, h6) {font-weight: bold;} aside:first-of-type {font-size: 1.2em;} aside {font-style: italic;}',
          'aside {& :is(h1, h2, h3, h4, h5, h6) {font-weight: bold;} &:first-of-type {font-size: 1.2em;} font-style: italic;}',
        )
      });
    });

    describe('if the first selector is a parent of the second, and the second is a parent of the third', () => {
      it('nests the rules', async () => {
        await run(
          'p {font-weight: 700;} p:nth-child(2) {font-size: 1.2em;} p:nth-child(2)::first-line {font-size: 1.5em;}',
          'p {font-weight: 700; &:nth-child(2) {font-size: 1.2em; &::first-line {font-size: 1.5em;}}}',
        );
      });
    });

    describe('if the first and third selectors are identical, and a parent of the second', () => {
      it('nests the rules', async () => {
        await run(
          'span.grow {transition: transform 100ms ease-in-out;} span.grow:hover {transform: scale(2);} span.grow {text-decoration: underline;}',
          'span.grow {transition: transform 100ms ease-in-out; &:hover {transform: scale(2);} text-decoration: underline;}',
        );
      });
    });
  });
});
