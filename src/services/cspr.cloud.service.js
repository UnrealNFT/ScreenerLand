/**
 * Service pour interagir avec l'API cspr.cloud
 * Utilisé pour récupérer les prix historiques et les données DEX
 * après qu'un token ait gradué vers un AMM
 */

import { API_URL } from '../config'

class CsprCloudService {
  constructor() {
    this.baseUrl = `${API_URL}/api/cspr-cloud`;
    // Backend proxy handles API key
    this.apiKey = import.meta.env.VITE_CSPR_CLOUD_API_KEY || '';
    
    // Currency IDs
    this.currencies = {
      CSPR: 1,
      USD: 2,
      EUR: 3
    };
    
    // DEX IDs
    this.dexes = {
      CASPER_DEX: 1,
      FRIENDLY_MARKET: 2
    };
  }

  /**
   * Récupère les taux quotidiens historiques pour un token
   * @param {string} contractPackageHash - Hash du contract package (sans préfixe)
   * @param {Object} options - Options de requête
   * @returns {Promise<Object>} Données paginées avec historique des prix
   */
  async getDailyRates(contractPackageHash, options = {}) {
    const {
      currencyId = this.currencies.CSPR,
      dexId = this.dexes.FRIENDLY_MARKET,
      from = null,
      to = null,
      sort = 'date',
      order = 'DESC',
      page = 1,
      limit = 100
    } = options;

    // Enlève le préfixe 'contract-package-wasm' si présent
    const cleanHash = contractPackageHash.replace('contract-package-wasm', '').toUpperCase();

    const params = new URLSearchParams({
      currency_id: currencyId,
      page,
      limit
    });

    if (dexId) params.append('dex_id', dexId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (sort) params.append('sort', `${sort} ${order}`);

    try {
      console.log(`🔍 Fetching daily rates for ${cleanHash.substring(0, 8)}...`);
      
      const response = await fetch(
        `${this.baseUrl}/ft/${cleanHash}/daily-rates?${params}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ cspr.cloud API returned ${response.status}: ${errorText}`);
        return { data: [], message: 'Token not listed on DEX' };
      }

      const data = await response.json();
      console.log(`✅ Got ${data.data?.length || 0} price records`);
      return data;
      
    } catch (error) {
      console.error('❌ Error fetching daily rates:', error);
      return { data: [], message: 'No DEX data available' };
    }
  }

  /**
   * Récupère le prix actuel d'un token sur un DEX
   * @param {string} contractPackageHash - Hash du contract package
   * @param {number} currencyId - ID de la devise (1=CSPR, 2=USD)
   * @returns {Promise<number>} Prix actuel
   */
  async getCurrentPrice(contractPackageHash, currencyId = this.currencies.CSPR) {
    const data = await this.getDailyRates(contractPackageHash, {
      currencyId,
      limit: 1
    });

    if (data.data && data.data.length > 0) {
      return parseFloat(data.data[0].amount);
    }

    return 0;
  }

  /**
   * Récupère l'historique des prix pour un graphique
   * @param {string} contractPackageHash - Hash du contract package
   * @param {number} days - Nombre de jours d'historique
   * @returns {Promise<Array>} Tableau de {date, price}
   */
  async getPriceHistory(contractPackageHash, days = 30) {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await this.getDailyRates(contractPackageHash, {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: days
    });

    return data.data.map(item => ({
      date: new Date(item.date),
      price: parseFloat(item.amount),
      dexId: item.dex_id
    }));
  }

  /**
   * Calcule le market cap à partir du prix DEX
   * @param {string} contractPackageHash - Hash du contract package
   * @param {string} totalSupply - Supply total (en motes)
   * @returns {Promise<number>} Market cap en CSPR
   */
  async getMarketCap(contractPackageHash, totalSupply) {
    const price = await this.getCurrentPrice(contractPackageHash);
    const supply = parseFloat(totalSupply) / 1e9; // Convertit motes en CSPR
    return price * supply;
  }

  /**
   * Vérifie si un token est disponible sur l'API (= gradué vers DEX)
   * @param {string} contractPackageHash - Hash du contract package
   * @returns {Promise<boolean>} True si le token est sur un DEX
   */
  async isTokenOnDex(contractPackageHash) {
    try {
      const data = await this.getDailyRates(contractPackageHash, { limit: 1 });
      return data.data && data.data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Récupère les prix dans plusieurs devises simultanément
   * @param {string} contractPackageHash - Hash du contract package
   * @returns {Promise<Object>} {cspr, usd, eur}
   */
  async getPricesMultiCurrency(contractPackageHash) {
    const [cspr, usd, eur] = await Promise.all([
      this.getCurrentPrice(contractPackageHash, this.currencies.CSPR).catch(() => 0),
      this.getCurrentPrice(contractPackageHash, this.currencies.USD).catch(() => 0),
      this.getCurrentPrice(contractPackageHash, this.currencies.EUR).catch(() => 0)
    ]);

    return { cspr, usd, eur };
  }

  /**
   * Récupère les actions d'un token (transfers, mints, burns)
   * @param {string} contractPackageHash - Hash du contract package
   * @param {Object} options - Options de requête
   * @returns {Promise<Object>} Données paginées avec les actions
   */
  async getTokenActions(contractPackageHash, options = {}) {
    const {
      page = 1,
      limit = 100,
      actionTypeId = null
    } = options;

    const cleanHash = contractPackageHash.replace('contract-package-wasm', '').toUpperCase();
    const params = new URLSearchParams({ page, limit });
    
    if (actionTypeId) params.append('ft_action_type_id', actionTypeId);

    try {
      const response = await fetch(
        `${this.baseUrl}/ft/${cleanHash}/actions?${params}`
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching token actions:', error);
      return { data: [], item_count: 0, page_count: 0 };
    }
  }

  /**
   * Récupère les holders d'un token
   * @param {string} contractPackageHash - Hash du contract package
   * @param {Object} options - Options de requête
   * @returns {Promise<Object>} Données paginées avec les holders
   */
  async getTokenOwners(contractPackageHash, options = {}) {
    const {
      page = 1,
      limit = 100
    } = options;

    const cleanHash = contractPackageHash.replace('contract-package-wasm', '').toUpperCase();
    const params = new URLSearchParams({ page, limit });

    try {
      const response = await fetch(
        `${this.baseUrl}/ft/${cleanHash}/owners?${params}`
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching token owners:', error);
      return { data: [], item_count: 0, page_count: 0 };
    }
  }

  /**
   * Récupère le nombre de transfers d'un token (USING CORRECT ENDPOINT)
   * @param {string} contractPackageHash - Hash du contract package
   * @returns {Promise<number>} Nombre total de transfers
   */
  async getTransferCount(contractPackageHash) {
    try {
      const cleanHash = contractPackageHash.replace('contract-package-wasm', '').replace('hash-', '').toUpperCase();
      
      console.log(`📊 Fetching transfers for ${cleanHash.substring(0, 20)}...`);
      
      // USE CORRECT ENDPOINT: /contract-packages/:hash/ft-token-actions
      const response = await fetch(
        `${this.baseUrl}/contract-packages/${cleanHash}/ft-token-actions`
      );

      if (!response.ok) {
        console.warn(`⚠️ Transfers API (cspr.cloud): ${response.status}, trying cspr.live...`);
        // Fallback to cspr.live
        try {
          const liveResponse = await fetch(
            `https://api.cspr.live/contract-packages/${cleanHash}/ft-token-actions`
          );
          if (liveResponse.ok) {
            const liveData = await liveResponse.json();
            console.log(`✅ Transfers from cspr.live: ${liveData.item_count}`);
            return liveData.item_count || 0;
          }
        } catch (liveErr) {
          console.warn('⚠️ cspr.live also failed:', liveErr.message);
        }
        return 0;
      }

      const data = await response.json();
      console.log(`✅ Transfers: ${data.item_count}`);
      return data.item_count || 0;
    } catch (error) {
      console.error('❌ Error fetching transfers:', error);
      return 0;
    }
  }

  /**
   * Récupère le nombre de holders d'un token (USING CORRECT ENDPOINT)
   * Returns FULL data including balances for market cap calculation
   * @param {string} contractPackageHash - Hash du contract package
   * @returns {Promise<{count: number, data: Array, circulatingSupply: string}>}
   */
  async getHoldersCount(contractPackageHash) {
    try {
      const cleanHash = contractPackageHash.replace('contract-package-wasm', '').replace('hash-', '').toUpperCase();
      
      console.log(`👥 Fetching holders for ${cleanHash.substring(0, 20)}...`);
      
      // USE CORRECT ENDPOINT: /contract-packages/:hash/ft-token-ownership
      const response = await fetch(
        `${this.baseUrl}/contract-packages/${cleanHash}/ft-token-ownership`
      );

      if (!response.ok) {
        console.warn(`⚠️ Holders API (cspr.cloud): ${response.status}, trying cspr.live...`);
        // Fallback to cspr.live
        try {
          const liveResponse = await fetch(
            `https://api.cspr.live/contract-packages/${cleanHash}/ft-token-ownership`
          );
          if (liveResponse.ok) {
            const liveResult = await liveResponse.json();
            let circulatingSupply = '0';
            if (liveResult.data && liveResult.data.length > 0) {
              circulatingSupply = liveResult.data.reduce((sum, holder) => {
                return sum + BigInt(holder.balance || 0);
              }, BigInt(0)).toString();
            }
            console.log(`✅ Holders from cspr.live: ${liveResult.item_count}`);
            return {
              count: liveResult.item_count || 0,
              data: liveResult.data || [],
              circulatingSupply
            };
          }
        } catch (liveErr) {
          console.warn('⚠️ cspr.live also failed:', liveErr.message);
        }
        return { count: 0, data: [], circulatingSupply: '0' };
      }

      const result = await response.json();
      
      // Calculate total circulating supply from all balances
      let circulatingSupply = '0';
      if (result.data && result.data.length > 0) {
        circulatingSupply = result.data.reduce((sum, holder) => {
          return sum + BigInt(holder.balance || 0);
        }, BigInt(0)).toString();
      }
      
      console.log(`✅ Holders: ${result.item_count}, Circulating: ${circulatingSupply}`);
      
      return {
        count: result.item_count || 0,
        data: result.data || [],
        circulatingSupply
      };
    } catch (error) {
      console.error('❌ Error fetching holders:', error);
      return { count: 0, data: [], circulatingSupply: '0' };
    }
  }

  /**
   * Récupère toutes les stats d'un token en une fois (USING CORRECT ENDPOINTS)
   * @param {string} contractPackageHash - Hash du contract package (pour holders/transfers)
   * @param {string} contractHash - Hash du contract réel (pour price/DEX data)
   * @returns {Promise<Object>} {holders, transfers, volume24h, price, onDex, fromBlockchain, circulatingSupply}
   */
  async getTokenStats(contractPackageHash, contractHash = null) {
    try {
      console.log('📊 Fetching ALL REAL stats from cspr.cloud...');
      
      // Use contract hash for DEX data if available, otherwise use package hash
      const hashForDex = contractHash || contractPackageHash;
      console.log('💰 Using hash for DEX data:', hashForDex.substring(0, 12) + '...');
      
      // Fetch holders and transfers in parallel using CORRECT endpoints
      const [holdersResult, transfers, priceHistory] = await Promise.all([
        this.getHoldersCount(contractPackageHash),
        this.getTransferCount(contractPackageHash),
        this.getPriceHistory(hashForDex, 1).catch(() => [])
      ]);

      const currentPrice = priceHistory.length > 0 ? priceHistory[0].price : 0;
      const onDex = priceHistory.length > 0;

      console.log('✅ REAL STATS:', { 
        holders: holdersResult.count, 
        transfers, 
        currentPrice, 
        onDex,
        circulatingSupply: holdersResult.circulatingSupply
      });

      return {
        holders: holdersResult.count,
        transfers,
        volume24h: 0, // TODO: calculate from recent transfers
        currentPrice,
        onDex,
        circulatingSupply: holdersResult.circulatingSupply, // REAL circulating supply from blockchain
        fromBlockchain: true // Flag indicating REAL data from blockchain
      };
    } catch (error) {
      console.error('❌ Error fetching token stats:', error);
      return {
        holders: 0,
        transfers: 0,
        volume24h: 0,
        currentPrice: 0,
        onDex: false,
        circulatingSupply: '0',
        fromBlockchain: false
      };
    }
  }
}

export default new CsprCloudService();
