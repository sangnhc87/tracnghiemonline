module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "max-len": "off",
    "arrow-parens": "off",
    "require-jsdoc": "off",
    "no-trailing-spaces": "off",
    "prefer-const": "off",
    "no-undef": "error",
    "new-cap": "error",
    "eol-last": ["error", "always"],
    "quotes": ["error", "double"],
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "object-curly-spacing": ["error", "always"],
    "comma-dangle": ["error", "always-multiline"],
    "no-unused-vars": ["warn"],
    "no-empty": ["error", { "allowEmptyCatch": true }],
    "padded-blocks": "off",
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
};
