import mongoose from 'mongoose';
import { TURN_OUTCOMES } from '@doodlr/shared';

const participantSummarySchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    username: { type: String, required: true, trim: true },
    avatar: { type: String, required: true },
    finalScore: { type: Number, required: true, min: 0, default: 0 },
    rank: { type: Number, required: true, min: 1 },
    isHost: { type: Boolean, default: false }
  },
  { _id: false }
);

const turnOutcomeSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true, min: 1 },
    turnIndex: { type: Number, required: true, min: 0 },
    drawerId: { type: String, required: true },
    drawerUsername: { type: String, required: true },
    secretWord: { type: String, required: true },
    outcome: {
      type: String,
      enum: Object.values(TURN_OUTCOMES),
      required: true
    },
    correctGuesserCount: { type: Number, required: true, min: 0, default: 0 },
    drawerBonus: { type: Number, required: true, min: 0, default: 0 },
    durationSeconds: { type: Number, required: true, min: 0, default: 0 }
  },
  { _id: false }
);

const gameSummarySchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    roomCode: {
      type: String,
      required: true,
      index: true
    },
    startedAt: {
      type: Date,
      required: true
    },
    endedAt: {
      type: Date,
      required: true
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0
    },
    completedRounds: {
      type: Number,
      required: true,
      min: 0
    },
    totalRounds: {
      type: Number,
      required: true,
      min: 1
    },
    endingStatus: {
      type: String,
      enum: [
        'completed',
        'early_end_abandoned',
        'early_end_recovery_timeout',
        'cancelled'
      ],
      default: 'completed'
    },
    settings: {
      capacity: { type: Number, min: 2, max: 8 },
      duration: { type: Number, min: 30, max: 90 },
      hintsEnabled: { type: Boolean, default: true },
      categories: [{ type: String }]
    },
    participants: {
      type: [participantSummarySchema],
      required: true,
      validate: [
        (val) => Array.isArray(val) && val.length > 0,
        'Game must have at least one participant.'
      ]
    },
    turnOutcomes: {
      type: [turnOutcomeSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Fast historical lookups by room or creation date
gameSummarySchema.index({ roomCode: 1, createdAt: -1 });
gameSummarySchema.index({ createdAt: -1 });

export const GameSummary = mongoose.model('GameSummary', gameSummarySchema);
