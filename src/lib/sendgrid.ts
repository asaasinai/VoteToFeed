// SendGrid has been replaced with Resend.
// This file is kept for backwards compatibility but all functions now delegate to resend.ts.
// See src/lib/resend.ts for the active email implementation.

export {
  sendPurchaseConfirmationEmail as sendPurchaseConfirmation,
  sendVoteReceivedEmail as sendVoteAlert,
  sendFreeVotesAddedEmail as sendFreeVoteReminder,
  sendContestResultEmail as sendWinnerNotification,
} from "./resend";
