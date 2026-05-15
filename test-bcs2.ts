import { bcs } from '@mysten/sui/bcs';

function blobIdToDecimal(blobId: string) {
    // blobId is base64url
    const b64 = blobId.replace(/-/g, '+').replace(/_/g, '/');
    
    // In @mysten/sui/bcs, we can use bcs.u256().fromBase64 ?
    try {
        const parsed = bcs.u256().fromBase64(b64);
        console.log("Parsed from bcs:", parsed);
        return BigInt(parsed).toString();
    } catch (e) {
        // if fromBase64 is not on u256() (maybe bcs changed in latest sui sdk)
        console.log("bcs.u256().fromBase64 failed:", e);
        // Fallback: manually parse base64 to bytes, then to BigInt (little-endian)
        const bytes = Buffer.from(b64, 'base64');
        let result = BigInt(0);
        for (let i = bytes.length - 1; i >= 0; i--) {
            result = (result * BigInt(256)) + BigInt(bytes[i]);
        }
        return result.toString();
    }
}

console.log("Testing with blobId: QykMOB6hldTFl-_a74eba2f1b2175e34b5dca02211b940d995685ed"); // Fake
const testBlob = "QykMOB6hldTFl-_a74eba2f1b2175e34b5dca02211b940d995685ed".substring(0, 43); // Base64 is usually 43 chars for 32 bytes
console.log("Decimal:", blobIdToDecimal(testBlob));
