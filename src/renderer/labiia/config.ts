/**
 * Settings that make this build the labiia_quali distribution of Magnolia.
 *
 * Kept in one file of our own so a new Magnolia release merges with as few
 * conflicts as possible: Magnolia's files only import these constants.
 */

/** Automatic updates stay off until labiia_quali publishes signed update
 *  manifests of its own; otherwise the program would look for Magnolia's
 *  releases and offer to replace itself with Magnolia. The Rust side has the
 *  same switch in `src-tauri/src/updater.rs`. */
export const UPDATES_ENABLED = false

/** The user manual, published from the `manuais/` folder. */
export const MANUAL_URL = 'https://cardososampaio.github.io/labiia_quali_magnolia/'

export const PRODUCT_NAME = 'labiia_quali'
