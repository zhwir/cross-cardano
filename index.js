const NamiWallet = require("./src/wallet/nami");
const tool = require("./src/tool");
const wasm = require("@emurgo/cardano-serialization-lib-browser");

module.exports = {
  getChains: () => ["Cardano"],
  getSymbols: () => ["ADA"],
  NamiWallet,
  tool,
  wasm,
};