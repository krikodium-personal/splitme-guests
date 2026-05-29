/** Short deploy label for verifying which Vercel build is live. */
export function getBuildLabel(): string {
  const sha = import.meta.env.VITE_BUILD_SHA?.trim() ?? '';
  const deployId = import.meta.env.VITE_DEPLOYMENT_ID?.trim() ?? '';
  const vercelEnv = import.meta.env.VITE_VERCEL_ENV?.trim() ?? '';

  if (!sha && !deployId) return 'local';

  const shortSha = sha ? sha.slice(0, 7) : '???????';
  const deploySuffix = deployId ? deployId.slice(-6) : '';
  const envSuffix = vercelEnv && vercelEnv !== 'production' ? ` ${vercelEnv}` : '';

  return deploySuffix ? `${shortSha} · ${deploySuffix}${envSuffix}` : `${shortSha}${envSuffix}`;
}
