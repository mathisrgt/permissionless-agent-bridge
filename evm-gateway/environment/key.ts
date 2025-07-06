import * as dotenv from "dotenv";

dotenv.config();

if (process.env.PRIVATE_KEY === undefined)
    throw new Error('PRIVATE_KEY is undefined');
export const privateKey = process.env.PRIVATE_KEY;

if (process.env.BASESCAN_API_KEY === undefined)
    throw new Error('BASESCAN_API_KEY is undefined');
export const baseScanApiKey = process.env.BASESCAN_API_KEY;

// if (process.env.ARBISCAN_API_KEY === undefined)
//     throw new Error('ARBISCAN_API_KEY is undefined');
// export const arbiScanApiKey = process.env.ARBISCAN_API_KEY;
