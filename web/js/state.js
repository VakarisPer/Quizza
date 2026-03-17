'use strict';

/**
 * AppState — single source of truth for identity / role flags.
 * All modules read/write through this object instead of scattered globals.
 */
const AppState = {
  /** Unique player ID assigned by the server. */
  myPid: null,

  /** Display name entered by this player. */
  myName: '',

  /** True when this client created the room. */
  isHost: false,
};
