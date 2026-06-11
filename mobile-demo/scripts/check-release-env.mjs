import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const releaseMode = process.argv.includes('--release') || process.env.EAS_BUILD_PROFILE === 'production';

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((values, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return values;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      return values;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    values[key] = value;
    return values;
  }, {});
}

const envFileValues = readDotEnv(envPath);
const apiUrl = process.env.EXPO_PUBLIC_API_URL || envFileValues.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  console.error('EXPO_PUBLIC_API_URL is required. Example: https://api.example.com/api/v1');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(apiUrl);
} catch {
  console.error(`EXPO_PUBLIC_API_URL is not a valid URL: ${apiUrl}`);
  process.exit(1);
}

if (releaseMode) {
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (localHosts.has(parsedUrl.hostname)) {
    console.error('Release builds cannot use localhost for EXPO_PUBLIC_API_URL.');
    process.exit(1);
  }

  if (parsedUrl.protocol !== 'https:') {
    console.error('Release builds must use an HTTPS EXPO_PUBLIC_API_URL for App Store review.');
    process.exit(1);
  }
}

console.log(`EXPO_PUBLIC_API_URL ok: ${apiUrl}`);
