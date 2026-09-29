/**
 * Account lifecycle B4 — self-serve "Delete my account" copy and helpers.
 * Node-safe (no server-only). Wipe body is wipeOrganizationAccount only.
 */

export const DELETE_MY_ACCOUNT_MENU_LABEL = "Delete my account";

export const DELETE_MY_ACCOUNT_CONFIRM_BODY =
  "This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.";

/** Seekers must type this exactly before the delete button enables. */
export const DELETE_MY_ACCOUNT_CONFIRM_PHRASE = "DELETE";

export const DELETE_MY_ACCOUNT_BUTTON_LABEL = "Permanently delete my account";

/** Login page banner after a successful self-serve wipe + sign-out. */
export const ACCOUNT_DELETED_LOGIN_MESSAGE =
  "Your account has been permanently deleted.";

/** Query flag on /login after self-serve delete. */
export const ACCOUNT_DELETED_LOGIN_QUERY = "accountDeleted";

/**
 * Shown when wipe refuses or fails. Nothing is deleted; seeker stays signed in.
 * Includes the existing Support path.
 */
export const DELETE_MY_ACCOUNT_FAILURE_MESSAGE =
  "We couldn't delete your account. Nothing was deleted. Contact support at /support if you need help.";

export const DELETE_MY_ACCOUNT_OWNER_ONLY_MESSAGE =
  "Only the workspace owner can delete this account.";

export const DELETE_MY_ACCOUNT_NO_ORG_MESSAGE =
  "No active workspace to delete.";

export const DELETE_MY_ACCOUNT_CONFIRM_MISMATCH_MESSAGE =
  "Type DELETE to confirm.";
