import dotenv from 'dotenv';

dotenv.config();

if (process.env.XRPL_MASTER_ACCOUNT_SEED === undefined)
    throw new Error('XRPL_MASTER_ACCOUNT_SEED is undefined');
export const XRPL_MASTER_ACCOUNT_SEED = process.env.XRPL_MASTER_ACCOUNT_SEED;