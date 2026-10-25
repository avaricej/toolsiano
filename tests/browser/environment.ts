// Observed Windows antivirus injection, outside the application's code and CSP.
// Keep exact host names so genuine unexpected application requests still fail tests.
export function isApplicationRequest(url: string) {
  return (
    /^https?:/.test(url) &&
    !['gc.kis.v2.scr.kaspersky-labs.com', 'ff.kis.v2.scr.kaspersky-labs.com'].includes(
      new URL(url).hostname,
    )
  );
}
