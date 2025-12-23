#!/usr/bin/env python3
"""
Script de déploiement TokenFactory sur Casper Testnet
"""
import json
import time
import requests
from pathlib import Path

# Configuration
RPC_URL = "https://rpc.testnet.casperlabs.io/rpc"
CHAIN_NAME = "casper-test"
WASM_PATH = "./wasm/TokenFactory.wasm"
SECRET_KEY_PATH = Path.home() / ".casper" / "keys" / "secret_key.pem"
PAYMENT_AMOUNT = 300_000_000_000  # 300 CSPR en motes

def deploy_contract():
    """Déploie le contrat sur Casper testnet"""
    
    print("🚀 Déploiement de TokenFactory sur Casper Testnet")
    print(f"📁 WASM: {WASM_PATH}")
    print(f"🔑 Secret Key: {SECRET_KEY_PATH}")
    print(f"💰 Payment: {PAYMENT_AMOUNT / 1e9} CSPR")
    print(f"🌐 RPC: {RPC_URL}")
    print("-" * 60)
    
    # Vérifie que le WASM existe
    wasm_file = Path(WASM_PATH)
    if not wasm_file.exists():
        print(f"❌ Erreur: Le fichier WASM n'existe pas: {WASM_PATH}")
        return
    
    print(f"✅ WASM trouvé: {wasm_file.stat().st_size / 1024:.1f} KB")
    
    # Vérifie que la clé privée existe
    if not SECRET_KEY_PATH.exists():
        print(f"❌ Erreur: La clé privée n'existe pas: {SECRET_KEY_PATH}")
        return
    
    print(f"✅ Clé privée trouvée")
    
    # Test de connectivité RPC
    print("\n🔄 Test de connectivité au RPC...")
    try:
        response = requests.post(
            RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "chain_get_state_root_hash"
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        if "result" in data:
            state_root = data["result"]["state_root_hash"]
            print(f"✅ RPC accessible (state_root: {state_root[:16]}...)")
        else:
            print(f"⚠️  RPC répond mais avec erreur: {data.get('error', 'Unknown error')}")
            return
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur de connexion au RPC: {e}")
        print("\n💡 Solutions:")
        print("1. Utilise CasperDash: https://app.casperdash.io/")
        print("2. Essaie depuis WSL avec un DNS alternatif")
        print("3. Utilise un VPN si bloqué géographiquement")
        return
    
    print("\n" + "=" * 60)
    print("⚠️  Note: Le déploiement via Python nécessite casper-client")
    print("=" * 60)
    print("\n📋 Commande casper-client à exécuter dans WSL :")
    print()
    print("casper-client put-transaction session \\")
    print(f"  --node-address {RPC_URL.replace('/rpc', '')} \\")
    print(f"  --wasm-path {WASM_PATH} \\")
    print(f"  --chain-name {CHAIN_NAME} \\")
    print(f"  --payment-amount {PAYMENT_AMOUNT} \\")
    print("  --gas-price-tolerance 1 \\")
    print("  --standard-payment true \\")
    print("  --install-upgrade \\")
    print(f"  --secret-key {SECRET_KEY_PATH}")
    print()
    print("=" * 60)
    print("\n💡 Alternative: Utilise CasperDash Web App")
    print("   https://app.casperdash.io/")
    print()

if __name__ == "__main__":
    deploy_contract()
