import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

function createSuiClient() {
  console.log("dAppKit CLIENT: mainnet");
  return new SuiJsonRpcClient({ 
    url: getJsonRpcFullnodeUrl('mainnet'),
    network: 'mainnet' 
  });
}

export const dAppKit = createDAppKit({
  networks: ['mainnet'],
  defaultNetwork: 'mainnet',
  createClient: createSuiClient,
  slushWalletConfig: { appName: 'Walform — Walrus Feedback Platform' },
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
