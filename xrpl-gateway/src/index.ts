import { AccountSet, Client, SetRegularKey, Wallet } from "xrpl";
import { XRPL_MASTER_ACCOUNT_SEED } from "./environment";

async function addAgent(agentXrplAddress: string) {
    const xrpl_master_wallet = Wallet.fromSeed(XRPL_MASTER_ACCOUNT_SEED);

    const client = new Client("wss://s.altnet.rippletest.net:51233/");
    await client.connect();

    // TODO: verify the deposit and registration on all supported contracts - deployed evm-chains

    const setRegularKeyTx: SetRegularKey = {
        Account: xrpl_master_wallet.classicAddress,
        TransactionType: "SetRegularKey",
        RegularKey: agentXrplAddress
    }

    const setRegularKeyTxResult = await client.submitAndWait(setRegularKeyTx, { autofill: true, wallet: xrpl_master_wallet });

    if (setRegularKeyTxResult.result.validated)
        console.log(`✅ Regular key set! Transaction hash: ${setRegularKeyTxResult.result.hash}`);
    else
        console.log(`❌ Regular key set! Error: ${setRegularKeyTxResult.result.meta}`);

    await client.disconnect();
}

async function main() {
    
}

main()