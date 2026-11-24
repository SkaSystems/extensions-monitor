import globals from "globals";

export default [
    {
        ignores: ["AppsScript.js", "node_modules/**", ".vscode-test/**"],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
            },

            ecmaVersion: 2022,
            sourceType: "module",
        },

        rules: {
            "no-const-assign": "error",
            "no-this-before-super": "error",
            "no-undef": "error",
            "no-unreachable": "warn",
            "no-unused-vars": "warn",
            "no-empty": "error",
            "constructor-super": "error",
            "valid-typeof": "error",
        },
    },
];
