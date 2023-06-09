const wasm = require("./lib/@emurgo/cardano-serialization-lib-browser");
const CoinSelection = require("./coinSelection");

function getWasm() {
  return wasm;
}

function bytesAddressToBinary(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(2).padStart(8, '0'), '');
}

// WAValidator can not valid testnet address
function validateAddress(address, network, chain) {
  const networkId = (network === "testnet")? 0 : 1;
  try {
    let addr = wasm.ByronAddress.from_base58(address);
    console.debug("%s is ADA Byron base58 address", address);
    return (addr.network_id() === networkId);
  } catch (e) {
    console.debug("%s is not ADA Byron base58 address: %O", address, e);
  }
  try {
    let addr = wasm.Address.from_bech32(address);
    try {
      let byronAddr = wasm.ByronAddress.from_address(addr);
      if (byronAddr) {
        console.debug("%s is ADA Byron bech32 address", address);
      }
      return (byronAddr.network_id() === networkId); // byronAddr is undefined to throw error
    } catch (e) {
      let prefix = bytesAddressToBinary(addr.to_bytes()).slice(0, 4);
      console.log("%s is Shelly type %s address", address, prefix);
      if (parseInt(prefix, 2) > 7) {
        return false;
      }
      return (addr.network_id() === networkId);
    }
  } catch (e) {
    console.debug("%s is not ADA bech32 address: %O", address, e);
  }
  return false;
}

function assetsToValue(assets) {
  let multiAsset = wasm.MultiAsset.new();
  let lovelace = assets.find((asset) => asset.unit === 'lovelace');
  let policies = [
    ...new Set(
      assets
        .filter((asset) => asset.unit !== 'lovelace')
        .map((asset) => asset.unit.slice(0, 56))
    ),
  ];
  policies.forEach((policy) => {
    let policyAssets = assets.filter(
      (asset) => asset.unit.slice(0, 56) === policy
    );
    let assetsValue = wasm.Assets.new();
    policyAssets.forEach((asset) => {
      assetsValue.insert(
        wasm.AssetName.new(Buffer.from(asset.unit.slice(56), 'hex')),
        wasm.BigNum.from_str(asset.quantity)
      );
    });
    multiAsset.insert(
      wasm.ScriptHash.from_bytes(Buffer.from(policy, 'hex')),
      assetsValue
    );
  });
  let value = wasm.Value.new(
    wasm.BigNum.from_str(lovelace ? lovelace.quantity : '0')
  );
  if (assets.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
}

// Neither min_ada_required nor min_ada_for_output can calculate correct value
function minAdaRequired(output, coinsPerUtxoByte) {
  return ((160 + output.to_bytes().byteLength) * coinsPerUtxoByte).toString();
}

function multiAssetCount(multiAsset) {
  if (!multiAsset) return 0;
  let count = 0;
  const policies = multiAsset.keys();
  for (let j = 0; j < policies.len(); j++) {
    const policy = policies.get(j);
    const policyAssets = multiAsset.get(policy);
    const assetNames = policyAssets.keys();
    count += assetNames.len();
  }
  return count;
}

function getAssetBalance(multiAsset, policyId, name) {
  if (multiAsset && multiAsset.len()) {
    let ma = multiAsset.to_js_value();
    let policy = ma.get(policyId);
    if (policy) {
      let value = policy.get(name);
      return value || "0";
    }
  }
  return "0";
}

async function selectUtxos(utxos, output, protocolParameters) {
  const totalAssets = multiAssetCount(output.amount().multiasset());
  CoinSelection.setProtocolParameters(
    protocolParameters.coinsPerUtxoWord,
    protocolParameters.linearFee.minFeeA,
    protocolParameters.linearFee.minFeeB,
    protocolParameters.maxTxSize.toString()
  );
  const outputs = wasm.TransactionOutputs.new();
  outputs.add(output); // adapt to CoinSelection api
  const selection = await CoinSelection.randomImprove(
    utxos,
    outputs,
    20 + totalAssets
  );
  return selection.input;
}

function genPlutusData() { // just dummy data
  let ls = wasm.PlutusList.new();
  ls.add(wasm.PlutusData.new_integer(wasm.BigInt.from_str('1')));
  return wasm.PlutusData.new_constr_plutus_data(
      wasm.ConstrPlutusData.new(
          wasm.BigNum.from_str('0'),
          ls
      )
  )
}

function showUtxos(utxos, title = "") {
  utxos.map((utxo, i) => {
    if (typeof(utxo) === "string") {
      utxo = wasm.TransactionUnspentOutput.from_hex(utxo);
    }
    let amount = utxo.output().amount();
    console.debug("%s utxo %d amount: %O", title, i, amount.to_js_value());
  });
}

module.exports = {
  getWasm,
  validateAddress,
  assetsToValue,
  minAdaRequired,
  multiAssetCount,
  getAssetBalance,
  selectUtxos,
  genPlutusData,
  showUtxos
}