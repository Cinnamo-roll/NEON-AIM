export type PasswordChangeIssue = "missing" | "mismatch" | "length" | "weak" | "unchanged" | null;

export function getPasswordChangeIssue(currentPassword: string, newPassword: string, confirmPassword: string): PasswordChangeIssue {
  if (!currentPassword || !newPassword || !confirmPassword) return "missing";
  if (newPassword !== confirmPassword) return "mismatch";
  if (newPassword.length < 8 || newPassword.length > 64) return "length";
  if (!/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) return "weak";
  if (newPassword === currentPassword) return "unchanged";
  return null;
}
