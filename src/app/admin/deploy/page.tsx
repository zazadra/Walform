'use client';
import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

export default function DeployPage() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  
  const [buildJson, setBuildJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleDeploy = () => {
    if (!account) {
      setError('Please connect your wallet first.');
      return;
    }
    setError('');
    setResult(null);

    try {
      const parsed = JSON.parse(buildJson);
      if (!parsed.modules || !parsed.dependencies) {
        throw new Error('Invalid build.json format. Needs modules and dependencies.');
      }

      setLoading(true);
      const tx = new Transaction();

      // Ensure gas budget is enough
      tx.setGasBudget(100000000); // 0.1 SUI

      const upgradeCap = tx.publish({
        modules: parsed.modules,
        dependencies: parsed.dependencies,
      });

      // Transfer the UpgradeCap to the publisher
      tx.transferObjects([upgradeCap], tx.pure.address(account.address));

      signAndExecuteTransaction(
        {
          transaction: tx,
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        },
        {
          onSuccess: (txRes) => {
            console.log('Publish Tx Success:', txRes);
            const publishEvent = txRes.objectChanges?.find(
              (change) => change.type === 'published'
            ) as any;
            
            if (publishEvent) {
              setResult({
                digest: txRes.digest,
                packageId: publishEvent.packageId,
              });
            } else {
              setResult({ digest: txRes.digest, warning: 'Package ID not found in object changes.' });
            }
            setLoading(false);
          },
          onError: (err) => {
            console.error('Publish Tx Error:', err);
            setError(err.message || 'Failed to publish');
            setLoading(false);
          },
        }
      );
    } catch (err: any) {
      setError(err.message || 'Invalid JSON');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <h1>Deploy Smart Contract Manually</h1>
      <p>Since ChainIDE is bugged, you can deploy your `build.json` directly from here using your connected wallet.</p>
      
      {!account && <p style={{ color: 'red', fontWeight: 'bold' }}>⚠️ Please connect your wallet in the navigation bar first.</p>}

      <textarea
        placeholder="Paste the contents of build.json here..."
        style={{ width: '100%', height: '300px', marginTop: '20px', fontFamily: 'monospace', padding: '12px' }}
        value={buildJson}
        onChange={(e) => setBuildJson(e.target.value)}
      />

      <button
        onClick={handleDeploy}
        disabled={loading || !account || !buildJson.trim()}
        style={{
          marginTop: '20px',
          padding: '12px 24px',
          background: '#7C3AED',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: (loading || !account || !buildJson.trim()) ? 'not-allowed' : 'pointer',
          opacity: (loading || !account || !buildJson.trim()) ? 0.5 : 1
        }}
      >
        {loading ? 'Check your wallet for approval...' : 'Deploy to Sui Mainnet'}
      </button>

      {error && (
        <div style={{ marginTop: '20px', padding: '16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px', padding: '20px', background: '#dcfce7', color: '#166534', borderRadius: '8px' }}>
          <h3>✅ Deployment Successful!</h3>
          <p><strong>Package ID:</strong> {result.packageId}</p>
          <p><strong>Transaction Digest:</strong> {result.digest}</p>
          <p style={{ marginTop: '10px' }}>Please copy this Package ID and send it to me!</p>
        </div>
      )}
    </div>
  );
}
