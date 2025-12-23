import WebSocket from 'ws';
import { query } from './db.js';

// Configuration
const CTO_RECEIVER_WALLET = process.env.CTO_RECEIVER_WALLET || '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8';
const CTO_RECEIVER_ACCOUNT_HASH = process.env.CTO_RECEIVER_ACCOUNT_HASH || 'b0ffce605fec444f624757ec3548af878ce20bce704e92602b55ba7aaae27792';
const CTO_PRICE_MOTES = 1_000_000_000_000; // 1000 CSPR = 1000 * 10^9 motes
const CSPR_CLOUD_STREAMING_URL = 'wss://streaming.testnet.cspr.cloud'; // Using testnet for now
const CSPR_CLOUD_ACCESS_KEY = process.env.CSPR_CLOUD_KEY_GENERAL;

let ws = null;
let reconnectTimeout = null;
let lastPingTimestamp = new Date();

// Normaliser les hashes et clés publiques
function normalizeHash(hash) {
  if (!hash) return '';
  return hash.toLowerCase().replace(/^(hash-|account-hash-|deploy-|0x)/, '');
}

// Granter CTO access dans la DB
async function grantCTOAccessFromTransfer(transfer) {
  try {
    const deployHash = normalizeHash(transfer.deploy_hash);
    const amount = parseInt(transfer.amount);
    
    console.log(`[CTO] Processing payment: ${amount / 1e9} CSPR - Deploy: ${deployHash.substring(0, 20)}...`);
    
    // Vérifier si déjà enregistré
    const checkQuery = `
      SELECT * FROM cto_access 
      WHERE transaction_hash = $1
      LIMIT 1
    `;
    const existing = await query(checkQuery, [deployHash]);
    
    if (existing.rows.length > 0) {
      console.log(`[CTO] ✅ Transaction ${deployHash.substring(0, 20)}... already processed, skipping`);
      return existing.rows[0].wallet_address;
    }
    
    // Fetch deploy from RPC to get sender's public key (in header.account)
    console.log(`[CTO] 🔍 Fetching deploy info to extract sender public key...`);
    const rpcUrl = 'https://node.testnet.casper.network/rpc';
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'info_get_deploy',
        params: { deploy_hash: deployHash },
        id: 1
      })
    });
    
    const rpcData = await rpcResponse.json();
    
    if (!rpcData.result?.deploy?.header?.account) {
      console.log(`[CTO] ⚠️ Could not extract public key from deploy`);
      return null;
    }
    
    const senderPublicKey = rpcData.result.deploy.header.account;
    console.log(`[CTO] ✅ Sender public key: ${senderPublicKey}`);
    
    // PROBLEM: Streaming listener doesn't know which TOKEN the payment is for!
    // SOLUTION: Store payment as "pending" and let /link-cto-payment endpoint grant access
    console.log(`[CTO] ⚠️ Payment detected but token unknown - waiting for frontend to link it`);
    console.log(`[CTO] Deploy ${deployHash.substring(0, 20)}... will be linked via /link-cto-payment endpoint`);
    
    return senderPublicKey;
    
  } catch (error) {
    console.error(`[CTO] Error granting access:`, error);
    return null;
  }
}

// Démarrer le listener WebSocket
function startCTOListener() {
  if (!CSPR_CLOUD_ACCESS_KEY) {
    console.error('[CTO] ❌ CSPR_CLOUD_ACCESS_KEY not set in environment variables!');
    console.error('[CTO] Add CSPR_CLOUD_ACCESS_KEY to your .env file');
    return;
  }
  
  console.log('[CTO] 🚀 Starting CTO payment listener...');
  console.log(`[CTO] Listening for transfers to: ${CTO_RECEIVER_WALLET}`);
  console.log(`[CTO] Minimum amount: ${CTO_PRICE_MOTES / 1e9} CSPR`);
  
  try {
    ws = new WebSocket(`${CSPR_CLOUD_STREAMING_URL}/transfers`, {
      headers: {
        authorization: CSPR_CLOUD_ACCESS_KEY,
      },
    });
    
    ws.on('open', () => {
      console.log('[CTO] ✅ Connected to CSPR.cloud streaming API');
      lastPingTimestamp = new Date();
    });
    
    // Vérifier les pings régulièrement
    const pingCheckInterval = setInterval(() => {
      const now = new Date();
      const timeSinceLastPing = now.getTime() - lastPingTimestamp.getTime();
      
      if (timeSinceLastPing > 60000) { // 60 secondes sans ping
        console.log('[CTO] ⚠️ No ping for 60s, reconnecting...');
        clearInterval(pingCheckInterval);
        ws.close();
      }
    }, 30000); // Vérifier toutes les 30s
    
    ws.on('message', async (data) => {
      const rawData = data.toString();
      
      console.log('[CTO] 📨 Raw message received:', rawData.substring(0, 100) + '...');
      
      // Gérer les pings
      if (rawData === 'Ping') {
        lastPingTimestamp = new Date();
        console.log('[CTO] 💓 Ping received');
        return;
      }
      
      try {
        const message = JSON.parse(rawData);
        
        console.log('[CTO] 📦 Parsed message:', JSON.stringify(message, null, 2));
        
        // L'API streaming envoie { data: {...}, action: "created", ... }
        if (!message.data || message.action !== 'created') {
          console.log('[CTO] ⚠️ Not a transfer creation event, ignoring');
          return;
        }
        
        const transfer = message.data;
        
        // Normaliser les champs
        const toAccountHash = normalizeHash(transfer.to_account_hash);
        const expectedAccountHash = normalizeHash(CTO_RECEIVER_ACCOUNT_HASH); // Utilise le hash directement
        const amount = parseInt(transfer.amount);
        const deployHash = normalizeHash(transfer.deploy_hash);
        
        // Log tous les transferts pour debug
        console.log(`[CTO] Transfer detected: ${amount / 1e9} CSPR to account ${toAccountHash.substring(0, 20)}...`);
        console.log(`[CTO] Expected account hash: ${expectedAccountHash.substring(0, 20)}...`);
        console.log(`[CTO] Match: ${toAccountHash === expectedAccountHash}`);
        console.log(`[CTO] Deploy: ${deployHash.substring(0, 20)}...`);
        
        // Vérifier si c'est un paiement CTO valide
        if (toAccountHash === expectedAccountHash && amount >= CTO_PRICE_MOTES) {
          console.log('[CTO] 🎉 Valid CTO payment detected!');
          // Créer l'objet transfer avec les bons champs pour grantCTOAccessFromTransfer
          const normalizedTransfer = {
            from_account: transfer.initiator_account_hash,
            to_account: toAccountHash,
            amount: transfer.amount,
            deploy_hash: transfer.deploy_hash
          };
          await grantCTOAccessFromTransfer(normalizedTransfer);
        } else {
          if (toAccountHash !== expectedAccountHash) {
            console.log('[CTO] ⚠️ Wrong recipient, ignoring');
          }
          if (amount < CTO_PRICE_MOTES) {
            console.log(`[CTO] ⚠️ Amount too low (${amount / 1e9} < ${CTO_PRICE_MOTES / 1e9} CSPR), ignoring`);
          }
        }
        
      } catch (error) {
        console.error('[CTO] Error processing transfer event:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('[CTO] ❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('[CTO] Disconnected from streaming API');
      
      // Auto-reconnect après 5 secondes
      console.log('[CTO] Reconnecting in 5 seconds...');
      reconnectTimeout = setTimeout(() => {
        startCTOListener();
      }, 5000);
    });
    
  } catch (error) {
    console.error('[CTO] Failed to start listener:', error);
    
    // Retry après 10 secondes
    reconnectTimeout = setTimeout(() => {
      startCTOListener();
    }, 10000);
  }
}

// Fonction pour arrêter proprement le listener
function stopCTOListener() {
  console.log('[CTO] Stopping listener...');
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
}

export { startCTOListener, stopCTOListener };
