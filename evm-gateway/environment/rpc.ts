import * as dotenv from "dotenv";

dotenv.config();

if (process.env.BASE_RPC_URL === undefined)
    throw new Error('BASE_RPC_URL is undefined');
export const baseRpcUrl = process.env.BASE_RPC_URL;