export default [
  {
    files: ["**/*.ts"],
    languageOptions: { parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    rules: {
      "no-console": "off",
      "prefer-const": "error"
    }
  }
];