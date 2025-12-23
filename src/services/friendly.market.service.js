/**
 * Service pour Friendly Market DEX (API publique)
 * Récupère les holders et transactions RÉELLES sans clé API
 */

class FriendlyMarketService {
  constructor() {
    this.baseUrl = 'https://friendly.market/api/v1';
  }

  /**
   * Récupère les stats d'un token depuis Friendly Market
   * @param {string} contractHash - Hash du contract package
   * @returns {Promise<Object>} Stats réelles du token
   */
  async getTokenStats(contractHash) {
    try {
      const cleanHash = contractHash
        .replace('contract-package-wasm', '')
        .replace('contract-package-', '')
        .replace('hash-', '')
        .toLowerCase();

      console.log(`🔍 Fetching from Friendly Market: ${cleanHash.substring(0, 8)}...`);

      // Essaye l'endpoint token info
      const tokenUrl = `${this.baseUrl}/tokens/${cleanHash}`;
      const response = await fetch(tokenUrl);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Friendly Market data:', data);

        return {
          holders: data.holders_count || 0,
          transfers: data.transfers_count || 0,
          volume24h: data.volume_24h || 0,
          price: data.price || 0,
          marketCap: data.market_cap || 0,
          liquidity: data.liquidity || 0,
          fromBlockchain: true
        };
      }

      console.warn(`⚠️ Friendly Market: ${response.status}`);
      return null;

    } catch (error) {
      console.warn('⚠️ Friendly Market API failed:', error.message);
      return null;
    }
  }

  /**
   * Récupère l'historique des prix
   * @param {string} contractHash - Hash du contract package
   * @param {number} days - Nombre de jours
   * @returns {Promise<Array>} Historique des prix
   */
  async getPriceHistory(contractHash, days = 30) {
    try {
      const cleanHash = contractHash
        .replace('contract-package-wasm', '')
        .toLowerCase();

      const url = `${this.baseUrl}/tokens/${cleanHash}/prices?days=${days}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        return data.prices || [];
      }

      return [];
    } catch (error) {
      console.warn('⚠️ Price history failed:', error.message);
      return [];
    }
  }
}

// Export singleton
export default new FriendlyMarketService();

console.log('✅ Friendly Market Service loaded');
