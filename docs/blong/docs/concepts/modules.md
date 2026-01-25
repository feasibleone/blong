# Modules

Blong is entirely based on TypeScript and ECMAScript modules, because more and
more open source packages and tools are focused on this official format,
while CommonJS starts to fall out of favour.

Blong will try to support CommonJS when possible, but it is recommended for
projects to also use the ECMAScript module format. The recommended way to
do this is to put "type": "module" in the package.json.

An example TypeScript configuration is available in the blong/test
project: [tsconfig.json](https://github.com/feasibleone/blong/blob/main/core/test/tsconfig.json).

:::tip
If you have trouble with ESM, check
[Pure ESM package](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)
for some tips
:::
