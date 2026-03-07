module.exports = {
    plugins: [require.resolve('./common/autoinstallers/rush-prettier/node_modules/prettier-plugin-packagejson')],
    arrowParens: 'avoid',
    bracketSameLine: false,
    bracketSpacing: false,
    endOfLine: 'lf',
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    singleAttributePerLine: true
}
