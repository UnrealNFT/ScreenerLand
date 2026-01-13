-- Fix CTO payment amount from 10 CSPR to 1000 CSPR
-- This script updates all CTO records that have paid_amount = 10
-- and changes them to the correct amount: 1000 CSPR

-- First, check which records will be updated
SELECT 
  token_hash, 
  wallet_address, 
  paid_amount as old_amount,
  1000 as new_amount,
  transaction_hash,
  network,
  granted_at
FROM cto_access
WHERE paid_amount = 10;

-- Update all records with paid_amount = 10 to 1000
UPDATE cto_access
SET paid_amount = 1000
WHERE paid_amount = 10;

-- Verify the update
SELECT 
  token_hash, 
  wallet_address, 
  paid_amount,
  transaction_hash,
  network,
  granted_at
FROM cto_access
ORDER BY granted_at DESC;
