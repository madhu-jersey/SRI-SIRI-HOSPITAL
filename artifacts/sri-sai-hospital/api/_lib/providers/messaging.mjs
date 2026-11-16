import { waLink } from '../../../shared/messages.mjs';

// Messaging providers. Today there is only the manual one: it never sends
// anything, it returns a wa.me link that a person taps and sends themselves.
//
// To plug in an official WhatsApp API later, add a provider with the same
// prepare() signature that sends the message and returns
// { delivery: 'sent', providerMessageId }. The dashboard already handles both:
// for 'link' it shows a WhatsApp button, for 'sent' it shows "Sent".
//
//   prepare({ to, text }) -> { delivery: 'link', url, text } | { delivery: 'sent', providerMessageId, text }

export function createMessagingProvider() {
  return manualWhatsApp;
}

export const manualWhatsApp = Object.freeze({
  mode: 'manual-wa.me',
  async prepare({ to, text }) {
    return { delivery: 'link', url: waLink(to, text), text };
  },
});
