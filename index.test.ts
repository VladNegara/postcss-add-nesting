import postcss from 'postcss';
import { describe, expect, it } from '@jest/globals';

import plugin from './';

async function run(input: string, output: string, opts = {}) {
  let result = await postcss([plugin(opts)]).process(input, { from: undefined });
  expect(result.css).toEqual(output);
  expect(result.warnings().length).toEqual(0);
}


describe('The postcss-add-nesting plugin', () => {
  describe('for rules that cannot be nested', () => {
    describe('if the selectors are not similar', () => {
      it('leaves the rules unchanged', async () => {
        await run(
          'p.note {color: blue;} q:lang(ru) {font-size: 2em;}',
          'p.note {color: blue;} q:lang(ru) {font-size: 2em;}',
        );
      });

      it('leaves whitespace unchanged', async () => {
        await run (
          'pre    code  {\n\t\tfont-family: Courier;\t\n}aside.sidebar\n\n{font-weight:\t \n200  \t ;}\t ',
          'pre    code  {\n\t\tfont-family: Courier;\t\n}aside.sidebar\n\n{font-weight:\t \n200  \t ;}\t ',
        );
      });
    });

    describe('if one selector is a prefix of the other', () => {
      describe('if the selectors end in similar classes', () => {
        it('leaves the rules unchanged', async () => {
          await run(
            '.card {padding: 1em;} .card-wrapper {border-radius: 2em;}',
            '.card {padding: 1em;} .card-wrapper {border-radius: 2em;}',
          );
        });
      });

      describe('if the selectors end in similar IDs', () => {
        it('leaves the rules unchanged', async() => {
          await run(
            '#my-container {background-color: black;} #my-container-contents {color: white;}',
            '#my-container {background-color: black;} #my-container-contents {color: white;}',
          );
        });
      });

      describe('if the selectors have a similar class and the second has more simple selectors following it', () => {
        it('leaves the rules unchanged', async() => {
          await run(
            '.confirm-button {margin: 15px;} .confirm-button-label::after {content: "Confirm?";}',
            '.confirm-button {margin: 15px;} .confirm-button-label::after {content: "Confirm?";}',
          );
        });
      });
    });
  });

  describe('for two rules that can be nested', () => {
    describe('if the rules are consecutive', () => {
      describe('if the rules are inside identical at-rules', () => {
        it('collapses @media at-rules', async () => {
          await run(
            '@media (hover: hover) {a:hover {border: 1px solid red;}} @media (hover: hover) {p q:hover {font-style: italic;}}',
            '@media (hover: hover) {a:hover {border: 1px solid red;} p q:hover {font-style: italic;}}',
          );
        });
      });

      describe('if both rules are inside at-rules and the second at-rule can be nested inside the first', () => {
        it('nests @media at-rules', async () => {
          await run(
            '@media (orientation: portrait) {body {max-width: 90%;}} @media (hover: none) and (orientation: portrait) {button {padding: 1em;}}',
            '@media (orientation: portrait) {body {max-width: 90%;} @media (hover: none) {button {padding: 1em;}}}',
          );
        });

        it('nests @container at-rules', async () => {
          await run(
            '@container (scrollable: block-end) {heading::after {content: "scroll down";}} @container (scrollable: block-end) and (block-size > 600px) {p em {color: blue;}}',
            '@container (scrollable: block-end) {heading::after {content: "scroll down";} @container (block-size > 600px) {p em {color: blue;}}',
          );
        });
      });

      describe('if the rules have identical selectors', () => {
        it('collapses the declaration blocks', async () => {
          await run(
            'p.warning.important {color: green;} p.warning.important {font-size: 13px;}',
            'p.warning.important {color: green;font-size: 13px;}',
          );
        });

        it.skip('removes a redundant declaration', async () => {
          await run(
            'a.external {background-color: blue; font-style: italic;} a.external {background-color: yellow;}',
            'a.external {font-style: italic; background-color: yellow;}',
          )
        });

        describe('if the first rule is inside an at-rule', () => {
          it('nests a rule in an @media rule', async () => {
            await run(
              '@media (width > 1000px) {h1 {font-size: 1.5rem;}} h1 {color: rebeccapurple;}',
              'h1 {@media (width > 1000px) {font-size: 1.5rem;} color: rebeccapurple;}',
            );
          });

          it('nests a rule in an @supports rule', async () => {
            await run(
              '@supports (transform-origin: 5% 5%) {div.crooked {transform-origin: 5% 5%; transform: rotate(5deg;);}} div.crooked {font-size: 14px;}',
              'div.crooked {@supports (transform-origin: 5% 5%) {transform-origin: 5% 5%; transform: rotate(5deg;);} font-size: 14px;}',
            );
          });

          it('nests a rule in an @layer rule', async () => {
            await run(
              '@layer utilities {p {padding: 15px;}} p {padding-top: 1em;}',
              'p {@layer utilities {padding: 15px;} padding-top: 1em;}',
            );
          });

          it('nests a rule in an @container rule', async () => {
            await run(
              '@container (min-width 400px;) {h2 {white-space: nowrap;}} h2 {font-size: 3em;}',
              'h2 {@container (min-width 400px;) {white-space: nowrap;} font-size: 3em;}',
            );
          });

          it('nests a rule in an @starting-style rule', async () => {
            // Note: this is useless CSS.
            await run(
              '@starting-style {#target {background-color: transparent;}} #target {background-color: goldenrod;}',
              '#target {@starting-style {background-color: transparent;} background-color: goldenrod;}',
            );
          });
        });

        describe('if the second rule is inside an at-rule', () => {
          it('nests a rule in an @media rule', async () => {
            await run(
              'main {display: flex;} @media (orientation: portrait) {main {flex-direction: column;}}',
              'main {display: flex; @media (orientation: portrait) {flex-direction: column;}}',
            );
          });

          it('nests a rule in an @supports rule', async () => {
            await run(
              'aside {font-style: italic;} @supports font-tech(variations) {aside {font-variation-settings: "ital" 0.5;}}',
              'aside {font-style: italic; @supports font-tech(variations) {font-variation-settings: "ital" 0.5;}}',
            );
          });

          it('nests a rule in an @layer rule', async () => {
            await run(
              'h1, h2, h3 {font-family: Calibri;} @layer {h1, h2, h3 {font-size: 20px;}}',
              'h1, h2, h3 {font-family: Calibri; @layer {font-size: 20px;}}',
            );
          });

          it('nests a rule in an @container rule', async () => {
            await run(
              'div {display: flex; flex-direction: row;} @container (width < 600px) {div {flex-direction: column;}}',
              'div {display: flex; flex-direction: row; @container (width < 600px) {flex-direction: column;}}',
            )
          });

          it('nests a rule in an @starting-style rule', async () => {
            await run(
              '[popover]:popover-open {opacity: 1;} @starting-style {[popover]:popover-open {opacity: 0;}}',
              '[popover]:popover-open {opacity: 1; @starting-style {opacity: 0;}}',
            )
          });
        });

        describe('if both rules are inside identical at-rules', () => {
          it('collapses the at-rules and the rules', async () => {
            await run(
              '@media (hover: hover) {button:hover {border-radius: 4px;}} @media (hover: hover) {button:hover {border-color: white;}}',
              '@media (hover: hover) {button:hover {border-radius: 4px; border-color: white;}}',
            );
          });
        });
      });

      describe.skip('if the rules have equivalent selectors', () => {
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

      describe('if the first selector is a prefix of the second', () => {
        it('nests a rule with a compound selector', async () => {
          await run(
            'p.note {font-style: italic;} p.note.important {color: red;}',
            'p.note {font-style: italic; &.important {color: red;}}',
          );
        });

        it('nests a rule with a descendant combinator', async () => {
          await run(
            '.card {border-radius: 5px;} .card h1 {font-size: 3rem;}',
            '.card {border-radius: 5px; & h1 {font-size: 3rem;}}',
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
            'h3 {font-weight: 900; & ~ p {font-weight: 300;}}',
          );
        });

        it('nests a rule with a next-sibling combinator', async () => {
          await run(
            'section {padding: 1em;} section + section {border-top: 1px solid black;}',
            'section {padding: 1em; & + section {border-top: 1px solid black;}}',
          );
        });
      });

      describe('if the second selector is a prefix of the first', () => {
        it('nests a rule with a compound selector', async () => {
          await run(
            'div#main {display: flex; justify-contents: center;} div {border-radius: 10px;}',
            'div {&#main {display: flex; justify-contents: center;}border-radius: 10px;}',
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
          'section {& > header {padding: 0em 4em;}margin: 1em; &:first-child {border: 1em solid yellow;}}',
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
          'aside {& :is(h1, h2, h3, h4, h5, h6) {font-weight: bold;} &:first-of-type {font-size: 1.2em;}font-style: italic;}',
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
          'span.grow {transition: transform 100ms ease-in-out; &:hover {transform: scale(2);}text-decoration: underline;}',
        );
      });
    });
  });
});
