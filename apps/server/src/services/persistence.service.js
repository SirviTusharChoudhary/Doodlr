import { GameSummary } from '../models/gameSummary.model.js';
import { getDBStatus } from '../config/db.js';
import { logger } from '../utils/logger.js';

export class PersistenceService {
  /**
   * Idempotently persist a completed game summary to MongoDB
   * Safe, non-blocking, and reports status honestly without logging secrets.
   * @param {Object} summaryData
   * @returns {Promise<{ success: boolean, persisted: boolean, reason?: string, id?: string, error?: string }>}
   */
  async saveGameSummary(summaryData) {
    const dbStatus = getDBStatus();

    // 1. Honesty check: if MongoDB is disconnected or unavailable, report without pretending
    if (!dbStatus.isConnected) {
      logger.warn(
        {
          gameId: summaryData.gameId,
          roomCode: summaryData.roomCode,
          dbState: dbStatus.state
        },
        'MongoDB is not connected. Completed game summary will not be persisted.'
      );
      return {
        success: false,
        persisted: false,
        reason: 'database_unavailable'
      };
    }

    try {
      // 2. Idempotent upsert by gameId: duplicate completion signals never create duplicate records
      const doc = await GameSummary.findOneAndUpdate(
        { gameId: summaryData.gameId },
        { $setOnInsert: summaryData },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      logger.info(
        {
          gameId: summaryData.gameId,
          roomCode: summaryData.roomCode,
          summaryId: doc._id
        },
        'Durable game summary persisted to MongoDB successfully'
      );

      return {
        success: true,
        persisted: true,
        id: doc._id.toString()
      };
    } catch (err) {
      // 3. Diagnose errors honestly without exposing any secrets
      logger.error(
        {
          errorMessage: err.message,
          gameId: summaryData.gameId,
          roomCode: summaryData.roomCode
        },
        'Failed to persist completed game summary to MongoDB'
      );

      return {
        success: false,
        persisted: false,
        error: err.message
      };
    }
  }

  /**
   * Retrieve a game summary by unique game ID
   * @param {string} gameId
   * @returns {Promise<Object|null>}
   */
  async getGameSummary(gameId) {
    const dbStatus = getDBStatus();
    if (!dbStatus.isConnected) return null;

    try {
      return await GameSummary.findOne({ gameId }).lean();
    } catch (err) {
      logger.error({ err: err.message, gameId }, 'Failed to query game summary');
      return null;
    }
  }

  /**
   * Retrieve recent completed game summaries
   * @param {number} [limit=10]
   * @returns {Promise<Array<Object>>}
   */
  async getRecentSummaries(limit = 10) {
    const dbStatus = getDBStatus();
    if (!dbStatus.isConnected) return [];

    try {
      return await GameSummary.find()
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 50))
        .lean();
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to query recent game summaries');
      return [];
    }
  }
}

export const persistenceService = new PersistenceService();
