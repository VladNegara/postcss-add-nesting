import type { PluginCreator } from 'postcss';

// import parser from 'postcss-selector-parser';
// const processor = parser();

export type pluginOptions = {};

const creator: PluginCreator<pluginOptions> = (opts?: pluginOptions) => {
  const options = Object.assign(
    // Default options
    {},
    // Provided options
    opts,
  );

  return {
    postcssPlugin: 'postcss-add-nesting',
  };
}

creator.postcss = true;

export default creator;
