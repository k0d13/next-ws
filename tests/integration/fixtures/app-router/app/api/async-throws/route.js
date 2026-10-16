export async function UPGRADE() {
  await Promise.resolve();
  throw new Error('Rejected from UPGRADE');
}
