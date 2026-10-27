import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UsernameSchema, AvatarSchema } from '@doodlr/shared';

/**
 * Generate a new random guest identifier
 * @returns {string}
 */
export function generateGuestId() {
  return crypto.randomUUID();
}

/**
 * Sign a bearer reconnect token for a guest ID
 * Valid for 24 hours. Does not contain sensitive user passwords or PII.
 * @param {string} guestId
 * @returns {string} Signed JWT
 */
export function signReconnectToken(guestId) {
  if (!guestId) throw new Error('Guest ID is required to sign reconnect token');
  return jwt.sign(
    { guestId },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Verify a bearer reconnect token
 * Returns the decoded payload or null if invalid or expired.
 * Never throws.
 * @param {string} token
 * @returns {{ guestId: string } | null}
 */
export function verifyReconnectToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded && typeof decoded.guestId === 'string') {
      return { guestId: decoded.guestId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate guest credentials and profile input
 * @param {Object} input
 * @param {string} input.username
 * @param {string} input.avatar
 * @returns {{ valid: boolean, username?: string, avatar?: string, error?: string }}
 */
export function validateGuestProfile(input) {
  const usernameResult = UsernameSchema.safeParse(input?.username);
  if (!usernameResult.success) {
    return {
      valid: false,
      error: usernameResult.error.issues[0]?.message || 'Invalid username'
    };
  }

  const avatarResult = AvatarSchema.safeParse(input?.avatar);
  if (!avatarResult.success) {
    return {
      valid: false,
      error: avatarResult.error.issues[0]?.message || 'Invalid avatar'
    };
  }

  return {
    valid: true,
    username: usernameResult.data,
    avatar: avatarResult.data
  };
}
