import { z } from 'zod';
import { GAME_CONSTANTS } from './constants.js';

/**
 * Username validation schema (3-16 alphanumeric, safe characters)
 */
export const UsernameSchema = z
  .string({ required_error: 'Username is required' })
  .trim()
  .min(GAME_CONSTANTS.MIN_USERNAME_LENGTH, {
    message: `Username must be at least ${GAME_CONSTANTS.MIN_USERNAME_LENGTH} characters.`
  })
  .max(GAME_CONSTANTS.MAX_USERNAME_LENGTH, {
    message: `Username cannot exceed ${GAME_CONSTANTS.MAX_USERNAME_LENGTH} characters.`
  })
  .regex(/^[a-zA-Z0-9_\- ]+$/, {
    message: 'Username can only contain letters, numbers, spaces, underscores, and hyphens.'
  });

/**
 * Preset avatar selection schema
 */
export const AvatarSchema = z.enum(
  /** @type {[string, ...string[]]} */ (GAME_CONSTANTS.PRESET_AVATARS),
  {
    errorMap: () => ({ message: 'Please select a valid preset avatar.' })
  }
);


/**
 * Room settings configuration schema
 */
export const RoomSettingsSchema = z.object({
  capacity: z
    .number()
    .int()
    .min(GAME_CONSTANTS.MIN_PLAYERS)
    .max(GAME_CONSTANTS.MAX_PLAYERS)
    .default(GAME_CONSTANTS.MAX_PLAYERS),
  rounds: z
    .number()
    .int()
    .min(GAME_CONSTANTS.MIN_ROUNDS)
    .max(GAME_CONSTANTS.MAX_ROUNDS)
    .default(GAME_CONSTANTS.DEFAULT_ROUNDS),
  drawDuration: z
    .number()
    .int()
    .refine((val) => GAME_CONSTANTS.ALLOWED_TURN_DURATIONS.includes(val), {
      message: `Draw duration must be one of: ${GAME_CONSTANTS.ALLOWED_TURN_DURATIONS.join(', ')} seconds.`
    })
    .default(GAME_CONSTANTS.DEFAULT_TURN_DURATION),
  hintsEnabled: z.boolean().default(true),
  categories: z
    .array(z.enum(/** @type {[string, ...string[]]} */ (GAME_CONSTANTS.BUILTIN_CATEGORIES)))
    .refine((cats) => cats.length > 0, {
      message: 'At least one category must be enabled.'
    })
    .refine((cats) => new Set(cats).size === cats.length, {
      message: 'Word categories cannot contain duplicates.'
    })
    .default(GAME_CONSTANTS.BUILTIN_CATEGORIES)
});

/**
 * Join room payload schema
 */
export const JoinRoomSchema = z.object({
  username: UsernameSchema,
  avatar: AvatarSchema,
  roomCode: z.string().trim().toUpperCase().optional(),
  reconnectToken: z.string().optional()
});

/**
 * Create private room payload schema
 */
export const CreateRoomSchema = z.object({
  username: UsernameSchema,
  avatar: AvatarSchema,
  settings: RoomSettingsSchema.partial().optional()
});

/**
 * Drawer word selection payload schema
 */
export const SelectWordSchema = z.object({
  wordIndex: z.number().int().min(0).max(2).optional(),
  word: z.string().trim().min(1).optional()
}).refine((value) => value.wordIndex !== undefined || value.word !== undefined, {
  message: 'Select one of the offered words.'
});

/**
 * Guess submission payload schema (rate-limited on server)
 */
export const GuessSubmissionSchema = z.object({
  text: z
    .string({ required_error: 'Guess cannot be empty' })
    .trim()
    .min(1, { message: 'Guess cannot be empty' })
    .max(GAME_CONSTANTS.MAX_GUESS_LENGTH, {
      message: `Guess cannot exceed ${GAME_CONSTANTS.MAX_GUESS_LENGTH} characters.`
    })
});

/**
 * General chat message schema
 */
export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(200)
});

/**
 * Canvas stroke point schema in logical 1000x600 coordinates
 */
export const StrokePointSchema = z.object({
  x: z.number().min(0).max(GAME_CONSTANTS.CANVAS_WIDTH),
  y: z.number().min(0).max(GAME_CONSTANTS.CANVAS_HEIGHT),
  pressure: z.number().min(0).max(1).optional()
});

/**
 * Canvas drawing stroke payload schema
 */
export const StrokeSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative().optional(),
  tool: z.enum(['pen', 'eraser']).default('pen'),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: 'Color must be a valid hex color string.'
  }).default('#000000'),
  size: z.number().min(GAME_CONSTANTS.MIN_BRUSH_SIZE).max(GAME_CONSTANTS.MAX_BRUSH_SIZE).default(GAME_CONSTANTS.DEFAULT_BRUSH_SIZE),
  points: z
    .array(StrokePointSchema)
    .min(1)
    .max(GAME_CONSTANTS.MAX_STROKE_POINTS),
  isComplete: z.boolean().optional().default(false)
});

/**
 * Undo canvas stroke schema
 */
export const UndoStrokeSchema = z.object({
  strokeId: z.string().optional()
});

/**
 * Clear canvas schema
 */
export const ClearCanvasSchema = z.object({
  reason: z.string().optional()
});

/**
 * Standard Socket.IO response acknowledgement schema
 */
export const SocketAckSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional()
});

/**
 * Environment variables validation schema
 */
export const EnvSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/doodlr')
});
