import { Renderer } from '@fluentui/react-bindings';
import { createRenderer as createFelaRenderer } from 'fela';
import felaPluginEmbedded from 'fela-plugin-embedded';
import felaPluginFallbackValue from 'fela-plugin-fallback-value';
import felaPluginPlaceholderPrefixer from 'fela-plugin-placeholder-prefixer';
import felaPluginRtl from 'fela-plugin-rtl';

import felaDisableAnimationsPlugin from './felaDisableAnimationsPlugin';
// import felaExpandCssShorthandsPlugin from './felaExpandCssShorthandsPlugin';
import felaFocusVisibleEnhancer from './felaFocusVisibleEnhancer';
import felaInvokeKeyframesPlugin from './felaInvokeKeyframesPlugin';
import felaSanitizeCss from './felaSanitizeCssPlugin';
import felaStylisEnhancer from './felaStylisEnhancer';

import cssifyDeclaration from 'css-in-js-utils/lib/cssifyDeclaration';
import {
  // @ts-ignore
  generateCombinedMediaQuery,
  // @ts-ignore
  generateCSSSelector,
  // @ts-ignore
  isMediaQuery,
  // @ts-ignore
  isNestedSelector,
  // @ts-ignore
  isSupport,
  // @ts-ignore
  isUndefinedValue,
  // @ts-ignore
  normalizeNestedProperty,
  RULE_TYPE,
} from 'fela-utils';

function isPlainObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

function camelCasePropertyNonRegex(property) {
  const a = property
    .split('-')
    .map(function(v) {
      return v.substr(0, 1).toUpperCase() + v.substr(1);
    })
    .join('');
  return a.substr(0, 1).toLowerCase() + a.substr(1);
}

function generateDeclarationReference(
  property: string,
  value: any,
  pseudo: string = '',
  media: string = '',
  support: string = '',
): string {
  return support + media + pseudo + camelCasePropertyNonRegex(property) + value;
}

let felaDevMode = false;

try {
  // eslint-disable-next-line no-undef
  felaDevMode = !!window.localStorage.felaDevMode;
} catch {}

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  if (felaDevMode) {
    /* eslint-disable-next-line no-console */
    console.warn(
      [
        '@fluentui/react-northstar:',
        'You are running Fela in development mode and this can cause performance degrades.',
        'To disable it please paste `delete window.localStorage.felaDevMode` to your browsers console and reload current page.',
      ].join(' '),
    );
  } else {
    /* eslint-disable-next-line no-console */
    console.warn(
      [
        '@fluentui/react-northstar:',
        'You are running Fela in production mode.',
        'This limits your ability to edit styles in browsers development tools.',
        'To enable development mode please paste `window.localStorage.felaDevMode = true` to your browsers console and reload the page.',
      ].join(' '),
    );
  }
}

const chars = 'abcdefghijklmnopqrstuvwxyz';
const charLength = chars.length;

function generateUniqueClassName(id: number, className: string = ''): string {
  if (id <= charLength) {
    return chars[id - 1] + className;
  }

  // Bitwise floor as safari performs much faster
  // https://jsperf.com/math-floor-vs-math-round-vs-parseint/55
  return generateUniqueClassName((id / charLength) | 0, chars[id % charLength] + className);
}

export default function generateClassName(getId: Function, filterClassName: Function = () => true): string {
  const startId = getId();
  const generatedClassName = generateUniqueClassName(startId);

  if (!filterClassName(generatedClassName)) {
    return generateClassName(getId, filterClassName);
  }

  return generatedClassName;
}

const dumbEnhancer = renderer => {
  function _renderStyleToClassNames(
    { _className, ...style }: any,
    pseudo: string = '',
    media: string = '',
    support: string = '',
  ): string {
    let classNames = _className ? ` ${_className}` : '';

    for (const property in style) {
      const value = style[property];

      if (isPlainObject(value)) {
        if (isNestedSelector(property)) {
          classNames += _renderStyleToClassNames(value, pseudo + normalizeNestedProperty(property), media, support);
        } else if (isMediaQuery(property)) {
          const combinedMediaQuery = generateCombinedMediaQuery(media, property.slice(6).trim());
          classNames += _renderStyleToClassNames(value, pseudo, combinedMediaQuery, support);
        } else if (isSupport(property)) {
          const combinedSupport = generateCombinedMediaQuery(support, property.slice(9).trim());
          classNames += _renderStyleToClassNames(value, pseudo, media, combinedSupport);
        } else {
          console.warn(`The object key "${property}" is not a valid nested key in Fela.
Maybe you forgot to add a plugin to resolve it?
Check http://fela.js.org/docs/basics/Rules.html#styleobject for more information.`);
        }
      } else {
        const declarationReference = generateDeclarationReference(property, value, pseudo, media, support);

        if (!renderer.cache.hasOwnProperty(declarationReference)) {
          // we remove undefined values to enable
          // usage of optional props without side-effects
          if (isUndefinedValue(value)) {
            renderer.cache[declarationReference] = {
              className: '',
            };
            /* eslint-disable no-continue */
            continue;
            /* eslint-enable */
          }

          const className =
            renderer.selectorPrefix + generateClassName(renderer.getNextRuleIdentifier, renderer.filterClassName);

          const declaration = cssifyDeclaration(property, value);
          const selector = generateCSSSelector(className, pseudo);

          const change = {
            type: RULE_TYPE,
            className,
            selector,
            declaration,
            pseudo,
            media,
            support,
          };

          renderer.cache[declarationReference] = change;
          renderer._emitChange(change);
        }

        const cachedClassName = renderer.cache[declarationReference].className;

        // only append if we got a class cached
        if (cachedClassName) {
          classNames += ` ${cachedClassName}`;
        }
      }
    }

    return classNames;
  }

  renderer._renderStyleToClassNames = _renderStyleToClassNames.bind(renderer);

  return renderer;
};

// Blacklist contains a list of classNames that are used by FontAwesome
// https://fontawesome.com/how-to-use/on-the-web/referencing-icons/basic-use
const blacklistedClassNames = ['fa', 'fas', 'far', 'fal', 'fab'];

const filterClassName = (className: string): boolean =>
  className.indexOf('ad') === -1 && blacklistedClassNames.indexOf(className) === -1;

const rendererConfig = {
  devMode: felaDevMode,
  filterClassName,
  enhancers: [dumbEnhancer, felaFocusVisibleEnhancer, felaStylisEnhancer],
  plugins: [
    felaDisableAnimationsPlugin(),

    // is necessary to prevent accidental style typos
    // from breaking ALL the styles on the page
    felaSanitizeCss({
      skip: ['content', 'keyframe'],
    }),

    felaPluginPlaceholderPrefixer(),
    felaInvokeKeyframesPlugin(),
    felaPluginEmbedded(),

    // felaExpandCssShorthandsPlugin(),

    // Heads up!
    // This is required after fela-plugin-prefixer to resolve the array of fallback values prefixer produces.
    felaPluginFallbackValue(),

    felaPluginRtl(),
  ],
};

export const createRenderer = (): Renderer => createFelaRenderer(rendererConfig) as Renderer;

export const felaRenderer = createRenderer();
